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

# Release handoff instructions for coding agents

When the user authorizes a release, read [the publishing guide](docs/npm-trusted-publishing.md) and [the release evidence convention](docs/releases/README.md) before starting. The latter is the source of truth for evidence format and the handoff checklist.

- Start the version's evidence archive from [the release template](docs/releases/TEMPLATE.md) at `docs/releases/vX.Y.Z/README.md`. Capture key states during verification, not just a final success screen; keep screenshots in that version's `screenshots/` directory.
- Record the actual version/commit, environment, steps, expected and observed results, and verification limits. Distinguish historical images, synthetic data, controlled models, real providers, and public release checks. Never fabricate screenshots or describe a partial verification as full PRD acceptance. Non-UI changes may use test/log evidence without screenshots.
- Before publishing evidence, check readability and remove credentials, personal information, and private business content. Do not expose sensitive originals in Git history or release assets.
- Update the release gallery index and attach the gallery link and downloadable evidence ZIP to the corresponding GitHub Release. Report package publication and evidence archival separately; if evidence is missing, say "packages published; verification archive pending" and list what is missing.
- These are documentation and handoff requirements, not new release gates. Do not add custom release validation scripts, CI gates, approvals, or repeated npm authentication. Do not change the existing tests or OIDC workflow to enforce this convention. Evidence collection alone does not authorize a release or additional paid model/evaluation runs.
