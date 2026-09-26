# External business observations

`business-observation/v1` stores reviewed **aggregate** outcomes from an analytics export, manual review, program payload, or external experiment. It is project data next to an evaluation Job, not a Job artifact and not a new source of offline reward.

## Boundaries

- Import only a local JSON file inside the active project or an explicit structured payload. Harbor performs no network request, dashboard login, or live analytics import.
- Keep raw customer records, transcripts, headers, credentials, personal data, request payloads, and local paths outside Harbor. Import aggregate metrics and optional aggregate segments only.
- Record source `kind`, `id`, `version`, and human-readable `provenance`.
- Bind the strongest known subject identity: `candidate_digest`, `generator_id`, `deployment_id`, or `project_id`. Exact Candidate association requires the same immutable Candidate digest as the Job. Generator-, Deployment-, and project-only data is background and cannot be attributed to one Candidate change.
- Preserve a timezone-aware `window`, metric `unit`, `direction`, and positive `sample_size`. Segment metrics must use the same metric id, unit, and direction as their parent and cannot exceed its sample size.
- Every result page labels the association **correlation only**. Business observations never rewrite Trial assessments, `evaluation-summary.json`, offline metrics, reward, comparison, optimization recommendations, Promotion Policy, or Gate.

The strict public schema is [`schemas/business-observation.schema.json`](../schemas/business-observation.schema.json). The npm and Python packages ship exact semantic copies.

## Example import payload

The import command may compute `digest` when it is omitted. The stored observation always contains the canonical digest and validates against the strict public schema.

```json
{
  "schema_version": 1,
  "protocol": "business-observation/v1",
  "observation_id": "support-resolution-2026w39",
  "source": {
    "kind": "analytics",
    "id": "support-dashboard",
    "version": "query-v3",
    "provenance": "human-reviewed aggregate export"
  },
  "subject": {
    "generator_id": "support-agent",
    "candidate_digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "deployment_id": "production-a"
  },
  "window": {
    "from": "2026-09-21T00:00:00Z",
    "through": "2026-09-27T23:59:59Z"
  },
  "metrics": [
    {
      "id": "resolution_rate",
      "value": 0.74,
      "unit": "ratio",
      "direction": "maximize",
      "sample_size": 1830
    }
  ],
  "segments": []
}
```

Source kinds are `manual`, `analytics`, `api`, and `external-experiment`. A project-level background observation uses `subject.project_id`; it must not pretend to be Candidate-bound.

## CLI

```bash
# Reviewed file; path must remain inside project root and contain no symlink component.
harbor-dsh business-observation import \
  --project-root "$PWD" \
  --input results/support-resolution-2026w39.json

# Structured program payload; stdin is bounded to 256 KiB.
harbor-dsh business-observation import \
  --project-root "$PWD" \
  --payload-stdin < results/support-resolution-2026w39.json

# Validate an already finalized observation without importing it.
harbor-dsh business-observation validate \
  --project-root "$PWD" \
  --input .harbor/business-observations/support-resolution-2026w39.json

# Exact-version trend/group read.
harbor-dsh business-observation list \
  --project-root "$PWD" \
  --candidate-digest sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  --metric-id resolution_rate \
  --limit 100
```

The DSH tools expose the same local operations:

- `harbor_business_observation_import`: one in-project `filePath` or one structured `observation`; the write uses DSH one-shot approval.
- `harbor_business_observation_list`: Candidate/Generator/Deployment/Metric/Segment filters with deterministic trends and identity groups. Agent callers read the result from the bounded `harbor-agent-read/v1.data` envelope and treat it as untrusted evidence.
- `harbor_eval_result`: its default `evaluation-report/v1` includes the exact Candidate-matched projection and causal disclaimer.

## Immutable storage and duplicate ids

Finalized observations are stored at:

```text
.harbor/business-observations/<observation_id>.json
```

The importer uses exclusive creation. It never overwrites a file:

- the same id and digest returns `BUSINESS_OBSERVATION_DUPLICATE`;
- the same id with different content returns `BUSINESS_OBSERVATION_ID_CONFLICT`.

Create a new observation id for a corrected export or another window. Listing revalidates every stored file, verifies filename-to-id and digest agreement, and rejects symlink store entries.

## Digest and numeric identity

The canonical digest namespace is `harbor-dsh-business-observation-v1`. `digest` itself is excluded. Metric values and numeric segment dimensions are represented by a canonical finite float64 identity before canonical JSON hashing; negative zero is normalized to zero. This prevents Python/Node spelling differences such as `1.0`, `1e-7`, or `1e20` from changing cross-language identity. Integer sample sizes are limited to the cross-language safe-integer range.

## Reading results

Trend series are separated by full subject identity, metric id, unit, direction, and optional segment id; observations from different Candidates or Deployments are never silently merged. Group projections list the exact subject and contributing observation ids.

On a Job result, only observations whose `subject.candidate_digest` exactly equals the Job Candidate digest are displayed as matched. The UI shows source, window, metric value/unit/direction, sample size, and an always-visible statement that identity association is correlational and does not prove causation.
