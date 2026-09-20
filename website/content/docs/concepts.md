---
title: Concepts and trustworthy scores
linkTitle: Concepts
weight: 40
description: Dataset, Generator, Evaluator, Optimizer, train/validation/test splits, meta-evaluation, trustworthy scores and promotion semantics.
verified_against_version: 0.9.7
source_refs: [README.md, docs/architecture.md, docs/evaluator-interface.md]
---

## Translate the four concepts into business language {#four-concepts}

| Concept | Practical meaning | Question answered in Harbor |
|---|---|---|
| **Dataset** | Business cases with task instructions, inputs and expected evidence. It defines what to evaluate; it is not a raw dump of conversations. | Which capabilities must work, and which failures must be detected? |
| **Generator** | The execution process that receives a Task and produces an answer or Artifact under a fixed Candidate, model and runtime. It may be an LLM Agent, script, workflow or other program. | Who answers, how is it run, and what does it produce? |
| **Evaluator** | The criteria and evidence logic used to judge output quality. It may be a deterministic script or `llm-as-judge`. | What counts as good, and is the evidence sufficient to decide? |
| **Optimizer** | The role that reads Dataset-level results and Trial evidence, then proposes one constrained, reviewable change. It cannot declare success by itself. | What should change, and how do we avoid changing too much at once? |

Harbor compiles these user-facing concepts into a stricter Evaluation Stack with Integration, Renderer, Judge, Contract, Reporter, Policy, Context and Gate roles. Users describe the business problem first instead of filling in an internal architecture questionnaire.

> [!IMPORTANT]
> A Harbor Dataset is primarily an **evaluation dataset**. Whether it serves training, validation or final testing is a governance decision—not a directory name. A case cannot secretly guide optimization and still be presented as never-seen final evidence.

## Train, validation and test splits {#dataset-splits}

Machine learning separates data to control **information leakage**: what the optimization process has already seen, and whether the final result still says anything about unseen cases.

### Training set {#training-set}

A training set directly guides learning or improvement. Traditional ML updates parameters from it; Agent engineering may use it to diagnose badcases and modify prompts, Skills, tool policies, code or retrieval configuration.

- Inputs, outputs and failure reasons may be inspected repeatedly.
- Optimizers may derive change hypotheses from it.
- Its score shows whether known failures were fixed, not generalization by itself.
- Reviewed badcases derived from Historical Sessions usually enter this layer before they become any promotion dataset.

### Validation or development set {#validation-set}

A validation set compares alternatives, selects thresholds and determines when to stop. Even without gradient updates, repeated feedback lets the Optimizer overfit to it.

- Use it to select among Candidates or configurations.
- Record any use for tuning Evaluator rubrics, Policy thresholds or runtime parameters.
- It can be an iterative regression set, but not an indefinitely reused independent final proof.
- Comparable baseline and Candidate Jobs may run on a fixed validation set, while their purpose must remain labeled as development selection or promotion evidence.

### Test or holdout set {#test-set}

A test set estimates final generalization. Before the final run, the Optimizer, Candidate author and Evaluator-tuning process should not see its answers, Ground Truth or per-case feedback.

- Run only after Candidate, Evaluator, Policy and runtime identities are frozen.
- Minimize repeated inspection and reruns.
- Once its results guide the next change, treat it as development data and create a new holdout.
- A Promotion Gate is comparable only when baseline and Candidate use the same immutable Dataset, Stack and Context with valid evidence.

### A useful data layering for Agents {#agent-data-layers}

| Layer | Primary purpose | Who sees feedback | Typical Plugin path |
|---|---|---|---|
| Historical diagnostic samples | Find real failure patterns and hypotheses | Humans and the diagnostic Judge | Preview completed Sessions → disclose boundary → non-promotion Historical Job |
| Training/fix set | Repair known badcases | Optimizer and developers | Curate reviewed failures into Tasks and run targeted regressions |
| Validation/regression set | Compare Candidates and select changes | Optimizer may inspect aggregates and Trial evidence | Freeze Candidate/Dataset/Stack/Context and run comparable Jobs |
| Test/holdout set | Final generalization and promotion evidence | Answers remain hidden before the final run | Run a promotion-eligible Job, then deterministic Gate |
| Evaluator meta-evaluation set | Test whether the measuring instrument is reliable | Evaluator governance process | Independent Ground Truth + repeated observations → ESF/SCE/RCR |

Small projects should preserve these **logical boundaries** even when they lack enough cases for statistically strong three-way splits. Record which cases changed the Candidate, which selected among alternatives, and which remain held out.

## Generator: the generation process under test {#generator}

A Generator is more than a model name. It includes:

- prompts, Skills, code, tools and dependencies in the Candidate;
- Candidate model binding and provider/model identity;
- Task instructions, Context and input Artifacts;
- Host or Docker execution environment;
- final output, structured results and Artifacts.

The Python Adapter maps DSH Candidates and Tasks into the Harbor Generator interface. The Plugin and Skill freeze relevant identities before expensive execution. The same model with a different prompt, tool, dependency or runtime is a different generation condition.

## Evaluator: make “good” inspectable {#evaluator}

An Evaluator decomposes the business objective into identified Criteria and evidence requirements. `harbor-dsh-evaluator/v1` supports deterministic `script` and `llm-as-judge` implementations, but both must preserve distinct states:

- **valid score** — contract and evidence requirements were met;
- **invalid score** — a number exists but must not enter quality aggregation;
- **abstention** — the Evaluator explicitly could not decide;
- **coverage** — how much of the target population produced usable evidence.

A Judge is one Evaluator implementation, not an inherently correct oracle. Model version, rubric, parsing logic and source implementation belong to Evaluator identity. Any change requires new Evaluator and Evaluation Stack versions.

## Optimizer: propose one controlled change from evidence {#optimizer}

The Optimizer consumes failure patterns and evidence—not an average score detached from context. The controlled path is:

1. identify repeatable failures in Trial and criterion Evidence;
2. constrain the surface that may change, such as a prompt, Skill, Evaluator source or code;
3. propose one reviewable change and create a new Candidate or Evaluator identity;
4. rerun on a fixed Dataset and Stack;
5. let Policy and Gate decide whether promotion conditions were met.

Ask AI, an Action Draft or an Optimizer proposal remains a recommendation. It does not automatically write files, start Jobs, run Gate or deploy; high-impact actions still require exact preflight and user confirmation.

## Meta-evaluation: prove the measuring instrument {#meta-evaluation}

Ordinary evaluation asks, “Is the Generator output good?” Meta-evaluation asks, “Is the Evaluator judgment reliable?”

The Plugin compares repeated Evaluator observations with **independent Ground Truth**. Ground Truth may be human, programmatic, consensus, model or external, but it needs explicit provenance and independence from the Evaluator under test. Reports include:

- **ESF (Evaluator Score Fidelity)** — agreement with Ground Truth;
- **SCE (Score Calibration Error)** — calibration between confidence and observed correctness;
- **RCR (Ranking Consistency/Reliability)** — stability and Ground-Truth consistency of rankings.

Evaluators can overfit too. Samples used to modify a rubric, prompt or threshold form an evaluator tuning set; final evidence should come from an independent holdout. Labels produced by the Candidate Evaluator cannot be reused to prove that Evaluator correct.

## How the Plugin connects the loop {#plugin-loop}

1. **Dataset** — validate manifest, Task uniqueness, paths and immutable source digest.
2. **Generator** — freeze Candidate manifest, model binding, Context and runtime, then produce Trial output.
3. **Evaluator** — produce criterion observations, Evidence, validity and coverage.
4. **Optimizer** — propose one new-version change from reviewed evidence without owning the verdict.
5. **Meta-evaluation** — test the Evaluator itself against independent Ground Truth.
6. **Gate** — apply deterministic Policy only to fixed, comparable inputs and return a `PROMOTE` or `REJECT` recommendation.

The Historical path creates diagnostic hypotheses and possible future Dataset cases, but is non-promotion evaluation. Only the Candidate path can become promotion evidence after comparability, validity and Policy requirements are met.

## Identity chain {#identity}

A comparable Job binds immutable or versioned identities: Candidate Manifest, Dataset Manifest, Evaluation Stack, Context, execution environment, Candidate model binding and Judge identity. A Trial belongs to one Job and carries output, criterion observations, Evidence and Artifacts.

![Evaluation identity chain](https://istarwyh.github.io/harbor-self-evolving/images/diagrams/identity-chain.svg "Immutable identities precede Trial scores")

## Raw reward is not a valid score {#validity}

A verifier may emit a numeric raw reward even when required evidence is missing, parsing failed or the criterion abstained. Averages without validity and coverage can reward a broken pipeline.

## PROMOTE and REJECT {#promotion}

![Deterministic Gate decision](https://istarwyh.github.io/harbor-self-evolving/images/diagrams/gate-decision.svg "Fixed Jobs and Policy produce a recommendation, not deployment")

A deterministic Gate evaluates fixed Job and Policy inputs. `PROMOTE` means the Candidate satisfies that Policy relative to a comparable baseline. `REJECT` means it does not. Neither means deployed, and neither replaces human or CI/CD authority.
