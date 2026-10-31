# bernard

**Repo-committed, project-scoped AI memory for coding agents — zero API keys, zero embeddings, zero external services.**

[![npm version](https://img.shields.io/npm/v/bernard-mcp.svg)](https://www.npmjs.com/package/bernard-mcp)
[![CI](https://github.com/yeneryigitcelik-debug/bernard/actions/workflows/ci.yml/badge.svg)](https://github.com/yeneryigitcelik-debug/bernard/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/bernard-mcp.svg)](https://nodejs.org)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> 🇹🇷 [Türkçe README](README.tr.md)

`bernard` is your codebase's **team memory**. It stores the decisions you made, the architecture notes, the bugs you fixed, and the preferences you settled on — as plain text (JSONL) **inside the repo**. Then you, or an AI agent, can pull that context back in seconds before starting new work. The knowledge lives where the code lives — in git — so it's committed, versioned, reviewed, and shared with the whole team.

It connects to AI coding agents (Claude Code, Cursor, and anything that speaks [MCP](https://modelcontextprotocol.io)) as an **MCP server**, so the agent searches past decisions and records new ones on its own.

```jsonc
// .bernard/records.jsonl — committed, one JSON object per line
{"id":"ber_a1b2c3","type":"decision","title":"Switched to Postgres","content":"MySQL → Postgres for JSONB and better indexing.","tags":["db"],"created":"2026-06-27T10:00:00Z","invalid":false,"superseded_by":null,"source":"manual"}
```

---

## Why bernard?

A `memory.md` file rots: it's unstructured, unsearchable, and nobody trims it. Cloud "agent memory" products want an API key, ship your code context to a third party, and vanish when the subscription lapses.

bernard takes the opposite stance:

- **It lives in your repo.** Clone the repo, get the memory. No service to run, nothing to provision.
- **Zero API keys, zero embeddings, zero network calls.** Everything is local files + a pure algorithm.
- **It's structured and queryable.** Typed records, tags, synonyms, recency weighting, and supersession — not a flat dump.
- **It's MCP-native.** Your agent uses it automatically; you rarely touch the CLI.
- **It's private by construction.** Data never leaves the repo, so it's GDPR/KVKK-friendly by default.

## Smart without an API key

How is "no API key" still smart? Intelligence comes from two places, neither of which needs the network:

1. **The agent itself.** An agent like Claude Code is already capable. bernard's job isn't to *understand* — it's to put the **right past records in front of the agent**. bernard retrieves, the agent reasons.
2. **BM25 retrieval.** A classic, robust, dependency-free full-text ranking algorithm, plus **synonym expansion** (e.g. `login` → `auth`), **recency weighting** (newer decisions rank higher), and **record invalidation** (superseded decisions drop out). All local, all instant.

The bridge between the two is bernard. No keys, no subscription, no privacy leak.

## Quick start (with Claude Code)

```bash
# In your project, set up the memory store once:
npx -y bernard-mcp init
```

Add bernard as an MCP server in your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "bernard": {
      "command": "npx",
      "args": ["-y", "bernard-mcp", "mcp"]
    }
  }
}
```

That's it. Your agent can now call `bernard_search` before starting a task and `bernard_add` to record decisions. Commit `.bernard/` and your teammates inherit the same memory.

## Installation

Run on demand with `npx` (no install):

```bash
npx -y bernard-mcp <command>
```

Or install globally to get a `bernard` binary:

```bash
npm i -g bernard-mcp
bernard --help
```

Or add it as a dev dependency:

```bash
npm i -D bernard-mcp
```

Requires **Node.js ≥ 20**.

## CLI usage

Every command has an English name and a Turkish alias (e.g. `add` / `ekle`). Output language follows your locale — see [Internationalization](#internationalization).

### Initialize

```bash
bernard init
```

Creates (never overwrites existing files):

- `.bernard/records.jsonl` — the records (JSONL, **committed**)
- `.bernard/categories.json` — types + synonyms (**committed**)
- `.bernard/config.json` — project settings (**committed**)
- adds `.bernard/.cache/` to `.gitignore`
- adds `.bernard/records.jsonl merge=union` to `.gitattributes`

### Add a record

```bash
bernard add --type decision --title "Switched to Postgres" \
  --content "MySQL → Postgres for JSONB and better indexing." \
  --tags db,architecture
```

Run `bernard add` with no flags in a terminal and it asks interactively.

### Search

```bash
bernard search authentication flow
bernard search "token refresh" --type bug
bernard search migration --tag db
```

Results print with score, type, title, date, tags, and a content snippet.

### List

```bash
bernard list
bernard list --type decision
bernard list --tag auth
```

The list includes history and marks invalid records and their replacement IDs.
Search/list type filters reject unknown types with the valid choices instead of
silently returning an empty result. Tags keep their exact-match behavior.

### Inspect a full record

```bash
bernard show <record-id>
bernard show <record-id> --json
bernard goster <record-id> --json --locale tr
```

Use the exact ID from search or list to read the complete content. `show --json`
prints only the full stored record, including unknown fields, `invalid`, and
`superseded_by`; search and list remain compact views. Inspection includes history,
so check its state before using a record as current context or updating it.
It never creates a missing store, rebuilds the cache or changes record bytes.

Differing copies of an ID cannot be inspected as one exact record, even when a
copy is invalid. Run `bernard doctor` and reconcile the reported lines manually.
Identical copies can be inspected; no copy is repaired or deleted.

### Invalidate (supersede)

```bash
bernard invalidate ber_abc123
bernard invalidate ber_abc123 --by ber_def456
```

Marks a record invalid **without deleting it** (`invalid: true`). `--by` links the record that replaces it, preserving the decision history. Search drops invalid records by default. Retrying invalidation without `--by` preserves any existing replacement link.

To record a new decision that directly supersedes an old one:

```bash
bernard add --type decision --title "Switched to Param" \
  --content "Better fees than the previous provider." --tags payment \
  --supersedes ber_abc123
```

### Distill

```bash
bernard distill
bernard distill --apply
```

Surfaces possible conflicts (multiple tagged records with the same type + tags), supersession chains, and suggestions. Untagged records and separate `bug` events are excluded from conflict proposals; sharing a type or tag is not proof of contradiction. For each conflict it proposes **keep the newest, invalidate the rest** and prints ready-to-run `bernard invalidate … --by …` commands. `--apply` (TTY) applies them interactively. **It never deletes anything** — it only marks and suggests.

### Check integrity (read-only)

```bash
bernard doctor
bernard doctor --json
bernard doktor --locale tr
```

Checks source lines, duplicate IDs, supersession links/cycles, settings, categories,
Git ignore/merge rules, tracked caches, cache freshness, locks and hook ownership.
It never repairs records, acquires/removes a lock, creates a store or rebuilds a cache.
JSON output has `schema: 1`, a `summary`, stable English diagnostic `id`s, localized
messages, line numbers and an `exitCode`. Exit status: **0** healthy (information only),
**1** warnings, **2** data/layout errors, **3** root unavailable. `summary.records`
counts valid physical rows; `unique_ids` and `quarantined_ids` make duplicates explicit.
For a duplicate, inspect the reported lines and reconcile the history manually, then
run `doctor` again. There is no automatic repair or deletion.

### Stats

```bash
bernard stats
```

A summary dashboard: total records, distribution by type, top 5 tags, invalid count, oldest/newest dates, and source (manual/agent) breakdown.

### Tags (synonym management)

```bash
bernard tags
bernard tags --add "auth=login,session"
bernard tags --remove "auth"
```

Lists/edits the types and synonym groups in `categories.json`. Fresh projects must run `init` before editing tags; existing standalone categories files remain editable for compatibility. Synonyms power query expansion at search time, so the team's vocabulary becomes the team's recall.

### Suggest (draft from commits)

```bash
bernard suggest --n 3
bernard suggest --add
```

Drafts records from recent commits: type guessed from the title (`feat→decision`, `fix→bug`, `refactor→architecture`, `docs/chore→note`) and tags from changed directories. This is only a starting point — the real understanding is the agent's. `--add` (TTY) saves drafts after you confirm.

### Install hook (post-commit reminder)

```bash
bernard install-hook
bernard install-hook --remove
```

Installs a marked, idempotent `.git/hooks/post-commit` reminder to run `bernard suggest` after each commit. It never overwrites a non-bernard hook (it prints a snippet to add by hand). `--remove` removes only bernard's hook.

## MCP integration (the main path)

bernard's real power is connecting to an AI agent. As an **MCP server** it exposes seven tools that an agent uses automatically — searching prior decisions before it starts, recording new ones, and invalidating stale ones.

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "bernard": {
      "command": "npx",
      "args": ["-y", "bernard-mcp", "mcp"]
    }
  }
}
```

If you installed globally, use the binary directly:

```json
{
  "mcpServers": {
    "bernard": {
      "command": "bernard",
      "args": ["mcp"]
    }
  }
}
```

The server exposes:

| Tool | What it does |
|------|--------------|
| **`bernard_search`** | Search past decisions, architecture notes, fixed bugs, and preferences. The key tool — the agent calls it before starting work. |
| **`bernard_add`** | Add a new record (`source: "agent"`); validates the schema before writing. |
| **`bernard_list`** | List records with visible state and replacement IDs, optionally filtered by type/tag. History is included by default; `include_invalid: false` excludes invalid or replacement-linked records. |
| **`bernard_get`** | Inspect one exact `id` as full JSON, including historical state and every stored field. Read-only; differing duplicate copies require manual reconciliation. |
| **`bernard_invalidate`** | Invalidate a record (`id`, optional `by`). Marks, never deletes. |
| **`bernard_update`** | Update fields of an existing record; only provided fields change. |
| **`bernard_suggest`** | Fetch recent commits + diffs so the agent can extract records worth keeping. |

Works with any MCP client (Claude Code, Cursor, and others) — the config block is the same, just placed wherever that client reads MCP servers.

## Data model

Records live in `.bernard/records.jsonl`, one JSON object per line:

```json
{
  "id": "ber_a1b2c3d4",
  "type": "decision",
  "title": "Switched to Postgres",
  "content": "MySQL → Postgres for JSONB and better indexing.",
  "tags": ["db", "architecture"],
  "created": "2026-06-27T10:00:00.000Z",
  "invalid": false,
  "superseded_by": null,
  "source": "manual"
}
```

Record types:

| type | Meaning |
|------|---------|
| `decision` | A decision that was made |
| `architecture` | An architecture note / structural fact |
| `bug` | A fixed bug and its fix |
| `preference` | A style / approach preference |
| `note` | A free-form note |

JSONL is line-oriented: appends are cheap, git diffs stay clean (one record per line), it's machine-friendly, and still human-readable via `git log -p`.

### Invalidation lifecycle

bernard never deletes knowledge; it **invalidates** stale decisions and preserves history. A new decision is added (optionally with `--supersedes`) linking the old one; the agent can do the same via `bernard_add` + `bernard_invalidate`. Over time, `bernard distill` surfaces conflicts and gives you ready commands to keep the newest and invalidate the rest. Invalid records stay in the file but drop out of search; the `superseded_by` chain answers "why did this change?".

### Team sharing (merge=union)

`init` adds a `.gitattributes` line:

```
.bernard/records.jsonl merge=union
```

Because each record is an independent line in an append-mostly file, git **unions** both sides when two branches add different records — so teammates writing to memory at the same time don't hit needless merge conflicts.

Updating a line on one branch while another branch appends nearby can also produce
**duplicate IDs**. Bernard keeps all source bytes and reports their line numbers:
identical copies count once; if any copy is invalid, the ID stays excluded from search.
When different copies are all active, that ID is **quarantined from search, list,
stats and distill** rather than choosing a branch's content arbitrarily. CLI reads
warn on stderr; MCP search/list include the diagnostic in the tool response.
Updates to conflicting copies fail with an actionable `doctor` hint; unrelated
records remain usable. An explicit patch to identical copies updates each copy while
preserving its line ending. Run `bernard doctor` and reconcile duplicate lines by hand;
no read silently rewrites or removes them. Search cache format 3 invalidates older
indexes even when the JSONL fingerprint is unchanged.


## Architecture: what's committed, what's local

```
your-project/
├── .git/
├── .gitignore                 # .bernard/.cache/ is added here
├── .gitattributes             # .bernard/records.jsonl merge=union
├── .mcp.json                  # agent integration (committed)
└── .bernard/
    ├── records.jsonl          # COMMITTED — shared memory
    ├── categories.json        # COMMITTED — types + synonyms
    ├── config.json            # COMMITTED — project settings
    └── .cache/                # LOCAL — gitignored
        └── index.json         # BM25 index (derived, auto-rebuilt)
```

**Committed:** `records.jsonl`, `categories.json`, `config.json`. Memory is code — it should be shared, reviewed, and versioned with git history.

**Initialization:** Read commands do not create missing stores. MCP writes require an existing records file; launch the server in the intended project root and run `bernard init` there first. CLI `add` retains its older auto-create behavior with a warning to run `init` for configuration and Git rules.

**Local writes:** CLI and MCP writers in the same working copy share a lock and replace JSONL atomically. A CLI `add --supersedes` appends the replacement and invalidates the old record in one locked, atomic write. Concurrent writers wait for a bounded interval; an active lock is never stolen. This does not coordinate separate computers or resolve Git merge conflicts. Malformed or invalid rows are skipped for retrieval and preserved on disk for manual repair.

**Local:** `.bernard/.cache/`. The BM25 `index.json` is fully derivable from `records.jsonl` (rebuilt automatically when the records change, or when the locale changes). Committing derived data would only create meaningless conflicts.

## Internationalization

bernard ships **bilingual**: English (default) and Turkish. All user-facing output is localized; command names stay English with Turkish aliases, and stable identifiers (record types, field names) stay canonical.

Locale precedence (highest first):

1. `--locale <en|tr>` flag (e.g. `bernard --locale tr stats`)
2. `BERNARD_LOCALE` environment variable
3. `locale` in `.bernard/config.json` (set at `init`, committed → team-wide)
4. `en` (default)

Retrieval is locale-aware too: Turkish gets a conservative stemmer (so `tokenları` matches `token`); English uses lowercase tokenization (BM25 + synonyms carry the recall).

## Configuration

`.bernard/config.json`:

```json
{
  "project": "my-app",
  "locale": "en",
  "retrieval": {
    "max_results": 8,
    "recency_weight": 0.3,
    "half_life_days": 30,
    "type_weights": {
      "decision": 1.2,
      "architecture": 1.2,
      "bug": 1.0,
      "preference": 1.0,
      "note": 0.9
    }
  }
}
```

- `recency_weight` — how much newer records are boosted.
- `half_life_days` — how fast the recency boost decays.
- `type_weights` — per-type ranking multipliers.

## Roadmap

- **Optional local embeddings (Ollama)** — keep BM25 as the keyless default; add a fully local, keyless semantic layer for those who want it.
- **Automatic extraction from commits/diffs** — propose decision/architecture records straight from git history.
- **Team conflict resolution** — a shared flow for the conflicts `distill` finds: flag, discuss, invalidate.
- **`distill` automation** — periodic distillation and warnings via pre-commit hook or CI.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). The project is intentionally dependency-light (only the MCP SDK + zod for the server) and ships an offline smoke suite plus storage, retrieval, hook and real MCP protocol regressions:

```bash
npm ci
npm test
```

Please also read the [Code of Conduct](CODE_OF_CONDUCT.md) and the [Security Policy](SECURITY.md).

## License

[MIT](LICENSE) © Yener Yiğit Çelik

---

*Not generated — crafted.*
