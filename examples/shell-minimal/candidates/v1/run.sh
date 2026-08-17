#!/bin/sh

set -eu

# Baseline candidate: it completes normally but produces a subtly wrong answer.
printf 'Harbor work\n' > /app/answer.txt
