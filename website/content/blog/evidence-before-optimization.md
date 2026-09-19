---
title: Evidence before optimization
description: Why an Agent needs validity, coverage and comparable identities before it needs another rewrite.
date: 2026-09-19
tags: [evaluation, evidence, design]
---

The fastest way to make self-evolution untrustworthy is to let the same opaque loop choose cases, rewrite itself and declare victory.

Harbor reverses that order. First freeze what is being tested and how. Then inspect whether evidence is valid and how much of the population it covers. Only then propose one change and compare it against a baseline whose identities still match.

This is why the Optimizer and Gate are separate, why Historical Sessions are diagnosis rather than promotion, and why a raw reward never silently becomes a valid score.

The result may feel slower than “rewrite until the demo looks good.” It is much faster than shipping a regression whose score cannot be explained.
