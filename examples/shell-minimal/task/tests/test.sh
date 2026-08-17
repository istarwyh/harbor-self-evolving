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

printf 'Verifier inspected /app/answer.txt\n'
printf 'file_exists=%s correctness=%s reward=%s\n' \
  "$exists" "$correctness" "$reward"
