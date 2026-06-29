# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-06-29

Initial public release of **bernard** (`bernard-mcp`): repo-committed,
project-scoped AI memory for coding agents — zero API keys, zero embeddings,
zero external services.

### Added

- **CLI** with English command names and Turkish aliases: `init`, `add` (`ekle`),
  `search` (`ara`), `list` (`listele`), `invalidate` (`gecersiz`), `distill`
  (`damit`), `suggest` (`oner`), `install-hook` (`kanca-kur`), `stats`
  (`istatistik`), `tags` (`etiketler`), and `mcp`.
- **MCP server** exposing six tools: `bernard_search`, `bernard_add`,
  `bernard_list`, `bernard_invalidate`, `bernard_update`, `bernard_suggest`.
- **Dependency-free BM25 retrieval** with token-based synonym expansion, recency
  decay, and per-type weighting.
- **Locale-aware tokenization**: a conservative Turkish stemmer; lowercase
  tokenization for English.
- **Invalidation / supersession lifecycle** — records are never deleted, only
  marked and chained (`invalid`, `superseded_by`).
- **`distill`** to surface conflicts and supersession chains with ready-to-run
  commands (and an interactive `--apply`).
- **Git capture**: `suggest` drafts records from recent commits; `install-hook`
  installs an idempotent post-commit reminder; `bernard_suggest` exposes the
  same to agents.
- **Team-friendly storage**: `.bernard/records.jsonl` with `merge=union`, a
  locally-cached BM25 index that is gitignored and auto-rebuilt.
- **Full internationalization (i18n)**: English (default) and Turkish, selectable
  via `--locale`, the `BERNARD_LOCALE` env var, or `.bernard/config.json`.
- **Tooling**: zero-dependency smoke test suite, GitHub Actions CI on Node 20/22/24,
  and community health files.

[Unreleased]: https://github.com/yeneryigitcelik-debug/bernard/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yeneryigitcelik-debug/bernard/releases/tag/v0.1.0
