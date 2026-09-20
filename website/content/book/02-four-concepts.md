---
title: Define the four concepts
book_number: 2
weight: 20
description: Understand Dataset, Generator, Evaluator, Optimizer, train/validation/test splits and meta-evaluation in business language.
---

Self-evolution is not “letting the model edit itself.” It is an inspectable learning chain: **Dataset defines the problem, Generator produces results, Evaluator judges evidence, and Optimizer proposes one controlled change.** The Evaluator is itself tested through Meta-Evaluation.

## Meet the four roles {#four-roles}

- **Dataset** — business tasks and failure cases that answer what to evaluate.
- **Generator** — runs the Candidate and produces answers or Artifacts: who answers and how.
- **Evaluator** — applies criteria and Evidence requirements: what counts as good and whether evidence is sufficient.
- **Optimizer** — proposes one new-version change from failure evidence: what to change next.

In an Agent system, each role is broader than a model. Generator includes prompts, Skills, tools and runtime; Evaluator includes rubric, Judge, parsing and validity rules; Optimizer may be a Coding Agent constrained by the project Skill.

## Why separate train, validation and test data {#splits}

Data splits prevent taking an exam after seeing its answers.

| Layer | Purpose | May it guide changes? |
|---|---|---|
| Training/fix set | Expose known badcases and modify prompts, Skills, code or tool policy | Yes; that is its purpose |
| Validation/regression set | Compare Candidates, tune thresholds and select an approach | Results are visible, so it can be overfit |
| Test/holdout set | Estimate unseen-case performance after identities are frozen | Answers should remain hidden from the Optimizer before the final run |

Once a case changes the Candidate, it is no longer an unseen test case. Small datasets need not be mechanically split into equal thirds, but every case still needs an explicit purpose and leakage history.

Historical Sessions are useful for discovering real failures and constructing training/fix cases; they are not promotion evidence. After review, redaction and versioning, badcases can enter a Dataset. Final Candidate regression should use a fixed Dataset, Stack, Context and baseline.

## How the Plugin runs the loop {#plugin-loop}

1. **Curate Dataset** — validate Task uniqueness, paths, instructions and immutable source digest.
2. **Freeze Generator** — record Candidate manifest, model binding and Host/Docker environment.
3. **Run Evaluator** — produce criterion observations, Evidence, validity, abstention and coverage.
4. **Constrain Optimizer** — allow one reviewed change on an explicit surface and create a new identity.
5. **Regress again** — preserve old Jobs so baseline and Candidate evidence remain comparable.
6. **Run Gate** — return `PROMOTE` or `REJECT` for fixed inputs without deploying.

## Why the Evaluator must be evaluated {#meta-evaluation}

An Evaluator is not an oracle. A Judge can be affected by wording, position, model version or parsing failures; a deterministic script can read the wrong field.

The Plugin supports independent Ground Truth and compares repeated Evaluator observations against it to compute ESF, SCE and RCR. Data used to change a rubric forms an evaluator tuning set; evidence that the Evaluator is reliable should come from an independent holdout. A Candidate Evaluator cannot create its own labels and use them to prove itself correct.

## You do {#you-do}

Choose representative cases, label each as training, validation or holdout, define Agent outputs, write evidence requirements for criteria, constrain the allowed change surface and review every proposal.

## Harbor records {#harbor-records}

Dataset and Stack manifests, criterion and Evaluator identities, Candidate/model binding, execution environment, Trial Evidence, coverage, meta-evaluation provenance and Gate receipt.

## This does not prove {#does-not-prove}

A valid manifest proves structure and identity. Training improvement does not prove generalization; a high test score does not prove the Evaluator correct; and a passing Gate does not mean deployment occurred. Trustworthy improvement requires all of these boundaries.

See [Concepts and trustworthy scores](https://istarwyh.github.io/harbor-self-evolving/docs/concepts/) for the detailed glossary and Plugin mapping.
