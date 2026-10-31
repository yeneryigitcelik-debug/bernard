# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Full read-only exact-ID inspection through `show` / `goster --json` and `bernard_get`, with explicit historical state and conservative duplicate-ID diagnostics.
- An optional `include_invalid: false` MCP list filter for active records.
- Read-only `doctor` / `doktor` integrity reports with bilingual messages, stable JSON diagnostics and documented exit codes; no automatic repair.

### Fixed

- Use the same active-record policy for recall and distill: legacy replacement-linked rows stay out of current results/proposals while their complete history and replacement edges remain readable without rewriting data.
- Refuse stale interactive distill plans under the writer lock, preserving concurrent edits and reporting any earlier successful steps accurately.
- Show invalid/replacement state in MCP record snippets and replacement IDs in CLI history lists; reject unknown search/list type filters instead of reporting empty memory.
- Keep expected CLI errors concise and finish interactive distill reports after per-record failures; reject empty read filters.
- Respect effective Git ignore/attribute rules in doctor and distinguish unreadable files from missing ones.
- Require initialization for new tag stores and keep category temporary files inside the ignored cache directory, preserving existing standalone category workflows.

- Prevent union-merge duplicate IDs from resurrecting invalid records; quarantine conflicting active copies, report their lines and retain every source segment. Bump derived cache format to 3.
- Preserve supersession provenance on invalidation retries; make `add --supersedes` one atomic transaction.
- Keep uninitialized reads free of writes and reject MCP writes without a memory store.
- Refuse destructive category fallbacks and serialize atomic synonym edits.
- Limit distill proposals to tagged non-bug cohorts and compare timestamps chronologically.
- Parse Git commit metadata separately from NUL-delimited file lists, preserving merge/empty commit bodies and marking truncated diffs.

- Serialize local record writers and atomically replace JSONL to preserve concurrent additions and updates; retain malformed source lines for manual repair.
- Validate full MCP record updates and skip malformed records during retrieval.
- Handle prototype-like query tokens and rebuild incompatible or stale search caches.
- Resolve Git hook paths through Git for linked worktrees and `core.hooksPath`; remove only recognized managed content and preserve custom or symlinked hooks.
- Create initial memory files exclusively so `init` cannot overwrite a concurrent first record.
- Update vulnerable dependencies, including Zod 4; exercise the real MCP protocol in regression tests.

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
