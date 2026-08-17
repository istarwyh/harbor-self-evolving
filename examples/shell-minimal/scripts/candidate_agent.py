from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import override

from harbor.agents.base import BaseAgent
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext


class CandidateAgent(BaseAgent):
    """Run one immutable local candidate artifact inside a Harbor environment."""

    def __init__(
        self,
        logs_dir: Path,
        candidate_path: str,
        candidate_version: str,
        candidate_digest: str,
        **kwargs,
    ) -> None:
        super().__init__(logs_dir=logs_dir, **kwargs)
        self.candidate_path = Path(candidate_path).expanduser().resolve(strict=True)
        self.candidate_version = candidate_version
        self.candidate_digest = candidate_digest

        actual_digest = "sha256:" + hashlib.sha256(
            self.candidate_path.read_bytes()
        ).hexdigest()
        if actual_digest != self.candidate_digest:
            raise ValueError(
                "Candidate digest mismatch: "
                f"expected {self.candidate_digest}, got {actual_digest}"
            )

    @staticmethod
    @override
    def name() -> str:
        return "demo-candidate"

    @override
    def version(self) -> str:
        return self.candidate_version

    @override
    async def setup(self, environment: BaseEnvironment) -> None:
        return

    @override
    async def run(
        self,
        instruction: str,
        environment: BaseEnvironment,
        context: AgentContext,
    ) -> None:
        container_path = "/tmp/harbor-demo-candidate.sh"
        await environment.upload_file(self.candidate_path, container_path)

        chmod_result = await environment.exec(
            f"chmod +x {container_path}",
            user="root",
        )
        if chmod_result.return_code != 0:
            raise RuntimeError(
                f"Failed to make candidate executable: {chmod_result.stderr}"
            )

        result = await environment.exec(
            container_path,
            cwd="/app",
            env={"HARBOR_TASK_INSTRUCTION": instruction},
        )

        record = {
            "candidate_version": self.candidate_version,
            "candidate_digest": self.candidate_digest,
            "candidate_path": str(self.candidate_path),
            "return_code": result.return_code,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        (self.logs_dir / "candidate.json").write_text(
            json.dumps(record, ensure_ascii=False, indent=2) + "\n"
        )
        context.metadata = record

        if result.return_code != 0:
            raise RuntimeError(
                f"Candidate exited with code {result.return_code}: {result.stderr}"
            )
