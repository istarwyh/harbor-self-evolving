---
title: Troubleshooting
weight: 80
description: Diagnose installation, profile, Dataset, Context, Historical and execution-environment failures without overstating success.
verified_against_version: 0.9.6
source_refs: [docs/dsh-web-quickstart.md, docs/troubleshooting.md]
---

## Harbor page is missing {#missing-page}

Confirm setup changed the profile DSH actually runs, restart using the printed command, and verify the dependency is an exact registry version rather than `link:`. Check that both Harbor plugins and the bundled Skill are present.

## Plugin loads but evaluation commands fail {#entrypoints}

Check the managed Python environment and `harbor plugins list`. Normal installation must include both `dsh-evolution` and `dsh-historical-evaluation`; adding the npm source directory alone is incomplete.

## Dataset validation fails {#dataset}

Inspect the Dataset manifest, duplicate Task ids, instruction files, paths, sensitive metadata and immutable source digest. Do not “fix” a digest mismatch by silently overwriting the recorded identity.

## No comparable baseline {#baseline}

Compare Candidate, Dataset, Evaluation Stack, Context, model/Judge and execution-environment identities. A Host result is not silently comparable with Docker. Run a fresh baseline when the relevant identity changes.

## Historical preview is empty {#historical}

Web only sees recently completed top-level Sessions available to current DSH. Agent preview additionally requires exact cwd. Running, nested, out-of-scope or feedback-excluded Sessions can be omitted; inspect the preview reason counts rather than treating zero results as a crash.

## Job completed without a score {#unscored}

`completed-unscored` can mean no applicable valid criteria, insufficient evidence or abstention. Read Trial and criterion reason codes. Never convert execution completion into a zero or passing quality score.

## Apple Silicon and Docker {#apple-silicon}

0.9.6 is Host-first, so Docker is not a default prerequisite. If you explicitly use Docker, verify image architecture and runtime availability separately. Do not mix the resulting evidence with Host baselines.

## Web Compare/Gate is disabled {#context-v3}

Candidate Context v3 is a known 0.9.6 Web contract issue. The Adapter output may be valid while Dashboard marks it unsupported/invalid. Use Agent/tool evidence and wait for a fixed release; do not rewrite or downgrade the Context artifact.
