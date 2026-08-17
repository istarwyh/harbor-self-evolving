from __future__ import annotations

import json
from pathlib import Path
from typing import override

from harbor.job import Job
from harbor.models.job.plugin import BaseJobPlugin
from harbor.models.job.result import JobResult
from harbor.trial.hooks import TrialHookEvent

from harbor_dsh_evolution.candidate import CandidateManifest
from harbor_dsh_evolution.context import CONTEXT_NAME, build_evaluation_context
from harbor_dsh_evolution.summary import summarize_payloads, write_summary


class EvolutionPlugin(BaseJobPlugin):
    """Persist Candidate identity and stable evaluation evidence for one Job."""

    def __init__(self, *, candidate_manifest: str, dataset_path: str | None = None):
        super().__init__()
        self._source_manifest = Path(candidate_manifest).expanduser().resolve(strict=True)
        self._manifest = CandidateManifest.from_dict(
            json.loads(self._source_manifest.read_text())
        )
        self._requested_dataset_path = Path(dataset_path) if dataset_path else None
        self._context = None
        self._job_dir: Path | None = None
        self._events_path: Path | None = None

    @override
    async def on_job_start(self, job: Job) -> None:
        configured_paths = {
            item.path.expanduser().resolve(strict=True)
            for item in [*job.config.tasks, *job.config.datasets]
            if item.path is not None
        }
        if self._requested_dataset_path is not None:
            dataset_path = self._requested_dataset_path.expanduser().resolve(strict=True)
            if dataset_path not in configured_paths:
                raise ValueError(
                    "dataset_path must exactly match a local path configured on the "
                    f"Harbor Job; configured={sorted(map(str, configured_paths))}"
                )
        elif len(configured_paths) == 1:
            dataset_path = next(iter(configured_paths))
        else:
            raise ValueError(
                "EvolutionPlugin requires exactly one local Harbor dataset/task path "
                "or an explicit matching dataset_path"
            )
        self._context = build_evaluation_context(dataset_path)
        self._job_dir = job.job_dir
        self._job_dir.mkdir(parents=True, exist_ok=True)
        (self._job_dir / "candidate-manifest.json").write_text(
            json.dumps(self._manifest.to_dict(), ensure_ascii=False, indent=2) + "\n"
        )
        (self._job_dir / CONTEXT_NAME).write_text(
            json.dumps(self._context.to_dict(), ensure_ascii=False, indent=2) + "\n"
        )
        self._events_path = self._job_dir / "candidate-events.jsonl"
        job.on_trial_ended(self._on_trial_ended)

    async def _on_trial_ended(self, event: TrialHookEvent) -> None:
        if self._events_path is None:
            return
        result = event.result
        rewards = (
            result.verifier_result.rewards
            if result.verifier_result is not None
            else None
        )
        record = {
            "event": "trial_ended",
            "trial_id": str(result.id),
            "trial_name": result.trial_name,
            "candidate_digest": self._manifest.digest,
            "rewards": rewards,
            "exception": (
                result.exception_info.exception_type
                if result.exception_info is not None
                else None
            ),
        }
        with self._events_path.open("a") as output:
            output.write(json.dumps(record, ensure_ascii=False) + "\n")

    @override
    async def on_job_end(self, job_result: JobResult) -> None:
        if self._job_dir is None or self._context is None:
            return
        payloads = [
            result.model_dump(mode="json") for result in job_result.trial_results
        ]
        summary = summarize_payloads(
            payloads,
            job_name=self._job_dir.name,
            candidate=self._manifest.to_dict(),
            evaluation_context=self._context.to_dict(),
        )
        write_summary(self._job_dir, summary)
