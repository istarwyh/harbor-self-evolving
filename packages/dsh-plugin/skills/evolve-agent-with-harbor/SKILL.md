---
name: evolve-agent-with-harbor
description: Initialize, evaluate, compare, and safely improve a DeepSeek Harness Agent with Harbor. Use when the user asks to set up Harbor evaluation or Agent self-evolution, clarify an evaluation contract, create a Candidate, Dataset, or Promotion Policy, investigate a failed Job, or decide whether a Candidate should replace a baseline.
---

# Evolve Agent With Harbor

Turn a vague improvement request into a reproducible evaluation contract, immutable Candidates, comparable Harbor Jobs, and an auditable promotion recommendation. Treat Harbor as the experiment boundary; deployment remains outside this workflow.

## Choose the operating mode

Infer the narrowest mode that satisfies the request:

- **Clarify**: define what progress means and what may change.
- **Initialize**: create the missing Candidate, Dataset, and Promotion Policy structure.
- **Evaluate**: snapshot and run one Candidate.
- **Compare**: compare an existing baseline Job with a new Candidate Job.
- **Evolve**: run the complete baseline, diagnosis, controlled change, regression, and gate loop.
- **Meta-evaluate**: optimize a Verifier or Judge against human ground truth rather than optimizing the business Agent.

Do not expand an evaluate-only request into code mutation or deployment.

## Clarify the evaluation contract

Inspect the workspace and existing configuration before asking questions. Summarize known values, then resolve only material gaps. Prefer no more than three grouped questions in one turn.

Establish these fields:

1. Business behavior and the failure being improved.
2. Candidate path and stable Agent product identity.
3. Harbor Dataset path, test population, and environment constraints.
4. Primary metric, minimum metrics, non-regression metrics, and tolerances.
5. Baseline Candidate or baseline Job.
6. Allowed mutation surface, forbidden files, and side-effect boundaries.
7. Run budget, repeat policy for stochastic Agents, and stopping condition.
8. Promotion owner and external CI/CD boundary.

Candidate and Dataset paths are hard blockers for a run. Baseline and promotion criteria are hard blockers for a comparison. Do not invent ground truth, metrics, or deployment authority. Offer explicit draft defaults when helpful, but obtain acceptance before using them as the evaluation contract.

## Initialize safely

When required files are missing, read `references/initialization.md` before creating them. Initialize only inside the configured `projectRoot` and preserve existing files.

- Keep the baseline immutable; create a new versioned Candidate directory for every optimization attempt.
- Keep secrets out of Candidate files. Inject equal credentials and permissions at runtime.
- Pin direct and transitive dependencies with a lockfile.
- Make the Verifier emit a primary reward plus diagnostic metrics and failure evidence.
- Version the Promotion Policy. A policy or Verifier change requires a fresh baseline.
- Use test accounts, mocks, or sandboxes for business side effects.

If file-editing capabilities are unavailable, produce the exact initialization plan and unresolved choices instead of pretending files were created.

## Run the stable evolution loop

### 1. Establish the baseline

Call `harbor_candidate_snapshot` for the baseline Candidate. Then call `harbor_eval_run` with the accepted Candidate and Dataset paths. Record the Candidate id, version, digest, Job path, evaluation-context digest, metrics, exceptions, and failed trials.

`harbor_eval_run` already snapshots again before execution. Treat a digest mismatch as a real Candidate change, not as noise.

### 2. Diagnose before changing

Use the summary returned by `harbor_eval_run`; call `harbor_eval_result` only when reopening an existing Job or when the stable summary is needed again. Read failed samples and trajectories when available.

Classify each failure as one of:

- Agent capability or policy failure.
- Tool-call, search, citation, or output-contract failure.
- Dataset, Verifier, or ground-truth defect.
- Infrastructure, dependency, permission, timeout, or deployment failure.
- Stochastic variance requiring repeats.

Do not optimize the Agent to compensate for a broken evaluation environment. Do not leak holdout answers or ground truth into the Candidate.

### 3. Make one controlled change

State one hypothesis that connects evidence to the proposed change. Create a new immutable Candidate version and modify only the accepted mutation surface. Never edit the baseline Candidate in place.

Snapshot the new Candidate and verify that its digest differs. If it does not differ, stop because no new Candidate exists.

### 4. Re-run under the same context

Call `harbor_eval_run` with the same Dataset and evaluation settings. For stochastic Agents, use the accepted repeat policy for both baseline and Candidate; never cherry-pick the best run.

Compare only Jobs whose `evaluation-context` digests match. If the context changed, establish a new baseline instead of claiming improvement.

### 5. Apply the deterministic gate

Call `harbor_candidate_compare` with the baseline Job, Candidate Job, and accepted Promotion Policy. Respect its decision:

- `PROMOTE`: recommend promotion and provide the evidence package.
- `REJECT`: keep the current Champion and explain each failed criterion.

The gate is a recommendation boundary. Never deploy, mutate the active DSH profile, merge code, or replace the Champion unless the user separately authorizes the external CI/CD action.

## Preserve experimental invariants

- One Job binds one Candidate digest; one Candidate may have many Jobs.
- Baseline and Candidate must share the same evaluation-context digest.
- Keep Candidate, evaluation context, policy, summaries, trajectories, and gate report as checkpoints.
- Separate infrastructure failures from capability failures in every report.
- Change one causal factor per iteration unless the user explicitly accepts a bundled experiment.
- Use hidden or held-out evaluation data for promotion; do not let the Optimizer train directly on it.
- Report uncertainty when sample size or stochastic variance prevents a stable conclusion.

## Handle evaluator meta-evaluation

When the object being improved is the evaluator, rotate the roles:

- Candidate is a Verifier or Judge version.
- Dataset contains cases with independently maintained human ground truth.
- Metrics measure evaluator alignment, such as RCR, bias, variance, calibration, latency, and cost.
- Promotion compares evaluator Candidates under a fixed GT set and policy.

Never let the Candidate Judge provide its own final ground truth or promotion decision.

## Report each cycle

Return a compact audit record containing:

- Accepted evaluation contract and any remaining assumptions.
- Baseline and Candidate ids, versions, digests, and Job paths.
- Evaluation-context and Promotion Policy identities.
- Primary and diagnostic metric deltas.
- Representative failure evidence and root-cause classification.
- Gate decision with exact reasons.
- External action required for promotion and the next controlled hypothesis if rejected.
