#!/bin/bash

set -eu

cat > /app/research-result.json <<'JSON'
{
  "answer": "Acme permits refunds within 30 days.",
  "tool_errors": 0,
  "searches": [{"query": "Acme refund policy official", "status": "ok"}],
  "citations": [{"claim": "30-day refund policy", "source_id": "doc-1"}]
}
JSON
