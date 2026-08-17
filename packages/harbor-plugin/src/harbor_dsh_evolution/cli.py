from __future__ import annotations

import argparse
import json
from pathlib import Path

from harbor_dsh_evolution.candidate import snapshot_candidate, verify_candidate
from harbor_dsh_evolution.context import build_evaluation_context
from harbor_dsh_evolution.promotion import compare_jobs, write_report
from harbor_dsh_evolution.summary import load_or_create_summary


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="harbor-dsh")
    commands = parser.add_subparsers(dest="command", required=True)

    snapshot = commands.add_parser("snapshot", help="Freeze a Candidate directory")
    snapshot.add_argument("candidate_dir", type=Path)
    snapshot.add_argument("--id", dest="candidate_id")
    snapshot.add_argument("--version")
    snapshot.add_argument("--runtime-version", default="0.1.0-rc.6")

    verify = commands.add_parser("verify", help="Verify a Candidate digest")
    verify.add_argument("candidate_dir", type=Path)
    verify.add_argument("--digest")

    summary = commands.add_parser("summarize", help="Summarize a Harbor Job")
    summary.add_argument("job_dir", type=Path)

    context = commands.add_parser("context", help="Fingerprint a Harbor dataset")
    context.add_argument("dataset_dir", type=Path)

    promote = commands.add_parser("promote", help="Apply a Promotion Gate")
    promote.add_argument("baseline_job", type=Path)
    promote.add_argument("candidate_job", type=Path)
    promote.add_argument("--policy", required=True, type=Path)
    promote.add_argument("--output", type=Path)
    return parser


def main() -> int:
    args = _parser().parse_args()
    if args.command == "snapshot":
        result = snapshot_candidate(
            args.candidate_dir,
            candidate_id=args.candidate_id,
            version=args.version,
            runtime_version=args.runtime_version,
        ).to_dict()
    elif args.command == "verify":
        result = verify_candidate(
            args.candidate_dir, expected_digest=args.digest
        ).to_dict()
    elif args.command == "summarize":
        result = load_or_create_summary(args.job_dir)
    elif args.command == "context":
        result = build_evaluation_context(args.dataset_dir).to_dict()
    else:
        report = compare_jobs(args.baseline_job, args.candidate_job, args.policy)
        output = args.output or args.candidate_job / "promotion-report.json"
        write_report(report, output)
        result = report

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("decision") != "REJECT" else 1


if __name__ == "__main__":
    raise SystemExit(main())
