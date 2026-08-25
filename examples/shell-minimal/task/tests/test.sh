#!/bin/bash

set -eu

mkdir -p /logs/verifier

exists=0
correctness=0

if [ -f /app/answer.txt ]; then
  exists=1
fi

if [ "$exists" -eq 1 ] && [ "$(cat /app/answer.txt)" = "Harbor works" ]; then
  correctness=1
fi

reward=$correctness

printf '{"file_exists":%s,"correctness":%s,"reward":%s}\n' \
  "$exists" "$correctness" "$reward" \
  > /logs/verifier/reward.json

printf '{"schema_version":1,"protocol":"evaluation-result/v1","criteria":[{"id":"correctness","score":%s,"reason":"answer.txt was checked against the required text.","recommendation":"Keep the exact required output when this score is 1; otherwise correct answer.txt."}]}\n' \
  "$correctness" \
  > /logs/verifier/evaluation-result.json

printf 'Verifier inspected /app/answer.txt\n'
printf 'file_exists=%s correctness=%s reward=%s\n' \
  "$exists" "$correctness" "$reward"
