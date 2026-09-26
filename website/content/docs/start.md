---
title: Install and start
description: Install the registry release into the selected DSH profile, restart, verify the Plugin and choose an evaluation path.
weight: 10
aliases: [/docs/start/install/, /docs/start/recent-sessions/, /docs/start/candidate/]
verified_against_version: 0.10.1
source_refs: [AGENTS.md, README.md, docs/dsh-web-quickstart.md]
---

## Requirements {#requirements}

- A working DeepSeek Harness installation and the business Agent workspace you want to evaluate.
- Node.js/npm for the DSH Plugin setup command.
- Python environment support used by the installed Adapter.
- Harbor `>=0.21,<0.22`.
- Docker only if you explicitly choose container execution; 0.10.1 defaults to Host.

## Install {#install}

Run from the **business Agent workspace**, not from this source repository:

```bash
npx --yes dsh-harbor-evolution@latest setup --project-root "$PWD"
```

For a version-pinned installation, replace `latest` with `0.10.1`. Setup writes the selected DSH profile dependency, configures the Harbor project integration, installs the compatible Python Adapter and exposes the bundled `evolve-agent-with-harbor` Skill. Follow the exact restart command printed by setup.

> [!WARNING]
> Do not use `dsh plugin add ./packages/dsh-plugin` for a normal installation. That creates a machine-local `link:` dependency and omits the Adapter setup.

## Verify {#verify}

After restart, confirm all three surfaces:

1. the selected profile depends on exact registry version `"dsh-harbor-evolution": "0.10.1"`, not `link:...`;
2. `harbor plugins list` contains `dsh-evolution` and `dsh-historical-evaluation`;
3. the bundled `evolve-agent-with-harbor` Skill is present.

Then open the DSH Harbor navigation entry. A healthy installation exposes Workbench, Historical Sessions, Context and Settings rather than a standalone web server.

## Choose your first path {#choose-path}

**No Dataset yet?** Start with [Historical diagnosis](https://istarwyh.github.io/harbor-self-evolving/docs/workflows/historical/). Preview up to three recently completed Sessions in Web (or up to ten exact-cwd Sessions through the Agent tool), review the redaction/Judge disclosure, then confirm a non-promotion Job.

**Candidate and Dataset ready?** Follow [Candidate evaluation](https://istarwyh.github.io/harbor-self-evolving/docs/workflows/candidate/). Snapshot, validate, doctor, preview Context, choose a comparable baseline, run one controlled regression, then apply Gate.

## Source development {#source-development}

Only contributors modifying this repository should clone it and run:

```bash
./hse dsh-install-source web
```

Source builds can contain unreleased behavior and must not be presented as the formal 0.10.1 package. The earlier untagged one-click updater preview was withdrawn before 0.9.7; the browser only checks versions and copies a complete, reviewable terminal command.
