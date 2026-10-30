# Contributing to bernard

Thanks for your interest in improving bernard! This project is intentionally small, dependency-light, and easy to reason about. Contributions of all sizes are welcome.

## Project philosophy

Keep these constraints in mind — they are the point of the project, not accidents:

- **Zero API keys, zero embeddings, zero network calls.** Nothing should reach out to a remote service. Intelligence comes from the agent + a pure local algorithm (BM25).
- **Dependency-light.** Runtime dependencies are limited to the MCP SDK and `zod` (both only used by the MCP server). The core and CLI use Node built-ins. Smoke, storage, retrieval and hook tests use Node built-ins; protocol regression tests use the installed MCP SDK. Please don't add dependencies without a strong reason.
- **Repo-committed data.** Records live in the user's repo as plain JSONL and are committed. Anything derived (the BM25 index) stays local and gitignored.
- **Bilingual by design.** English is the default; Turkish is fully supported. All user-facing strings go through the i18n layer.

## Getting started

```bash
git clone https://github.com/yeneryigitcelik-debug/bernard.git
cd bernard
npm install
npm test
```

Node.js ≥ 20 is required. `npm test` runs the dependency-free smoke suite plus Node regression tests for concurrent writers, cache recovery, Git hooks and the actual MCP stdio protocol. Run `npm ci` first for the protocol tests; execution uses no external services.

Try it locally:

```bash
node bin/bernard.js --help
node bin/bernard.js init
node bin/bernard.js add --type decision --title "Test" --content "Hello"
node bin/bernard.js search test
```

## Project layout

```
bin/bernard.js          CLI entry + command router (English names + Turkish aliases)
src/core/               store, bm25, retrieve, index-cache, distill, paths
src/commands/           one file per command
src/mcp/server.js       MCP server (6 tools)
src/util/               schema, git, args, log
src/i18n/               index (resolver) + en.js + tr.js catalogs
test/smoke.js           core, CLI and bilingual smoke assertions
test/*.test.js          storage, retrieval, hook and MCP regressions
```

## Guidelines

- **Match the surrounding style.** ESM, small focused modules, comments where intent isn't obvious.
- **Localize all user-facing text.** Don't hardcode strings in commands or the MCP server — add a key to **both** `src/i18n/en.js` and `src/i18n/tr.js` and call `t("your.key", { params })`. The two catalogs must stay key-for-key in sync.
- **Keep canonical identifiers stable.** Record field names (`type`, `title`, …) and type values (`decision`, `architecture`, …) are part of the committed data format — don't localize or rename them lightly.
- **Add tests.** Cover changed behavior in the smoke suite or focused `test/*.test.js` regressions. Keep execution offline; use temporary repositories and dummy records.
- **Keep the core pure.** Functions in `src/core/` should be deterministic and side-effect-free where possible (the `distill` core returns structured data; the command renders it).

## Commit & PR process

1. Fork and create a feature branch.
2. Make your change with tests; run `npm test` (must be green).
3. Use clear commit messages. Conventional Commit prefixes (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`) are appreciated — `bernard suggest` even uses them to guess record types.
4. Open a pull request describing the change and the motivation. Link any related issue.

CI runs the full test command on Node 20, 22, and 24; please make sure it passes.

## Reporting bugs & requesting features

Use the [issue templates](https://github.com/yeneryigitcelik-debug/bernard/issues/new/choose). For security issues, see [SECURITY.md](SECURITY.md) — please do not open a public issue.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
