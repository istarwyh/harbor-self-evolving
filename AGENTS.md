# Installation instructions for coding agents

When a user asks to install Harbor Self-Evolving from this GitHub repository, treat the repository URL as the product documentation and source location, not as the npm package spec.

## Default installation

Run this from the user's business Agent workspace:

```bash
npx --yes dsh-harbor-evolution@latest setup --project-root "$PWD"
```

Follow the restart command printed by setup. Verify that:

- the selected DSH profile depends on the exact current registry version `"dsh-harbor-evolution": "0.9.2"`, not `link:...`;
- `harbor plugins list` contains both `dsh-evolution` and `dsh-historical-evaluation`;
- the bundled `evolve-agent-with-harbor` Skill is present.

Do not clone this repository and run `dsh plugin add ./packages/dsh-plugin` for a normal user installation. That creates a machine-local `link:` dependency, ties the profile to the checkout path, and omits the Python Adapter setup.

## Explicit source-development installation

Only when the user explicitly wants to modify or debug this repository, clone it and run:

```bash
./hse dsh-install-source web
```

This command installs the linked checkout's locked Node.js dependencies before adding it to the profile and installs the local Python Adapter. Do not call `dsh plugin add` on the source directory directly.
