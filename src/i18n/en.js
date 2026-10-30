// English message catalog (default locale).
// Keys are flat, dotted strings. {tokens} are interpolated by makeT().
// Keep this file and tr.js in sync, key-for-key.

export const en = {
  // Storage validation and concurrency diagnostics.
  "store.invalidRecord": "Invalid record: {errors}",
  "store.invalidLine": "Skipping invalid record line: {line} ({errors})",
  "store.invalidUtf8": "Skipping line with invalid UTF-8 ({bytes} bytes); original bytes are preserved.",
  "store.duplicateId": "A record with id \"{id}\" already exists.",
  "store.patchNotObject": "Patch must be an object.",
  "store.idImmutable": "The record id cannot be changed.",
  "store.supersedeSelf": "Record \"{id}\" cannot supersede itself.",
  "store.supersedeMissing": "Superseding record \"{id}\" does not exist.",
  "store.supersedeCycle": "Superseding \"{id}\" with \"{by}\" would create a cycle.",
  "store.lockOwnerUnknown": "unknown owner",
  "store.lockTimeout": "Timed out after {ms} ms waiting for store lock {path} (held by {owner}).",
  "store.lockGarbled": "Timed out after {ms} ms: lock file {path} has unreadable content and no identifiable owner. If no bernard process is running, delete {path} manually.",
  "store.lockBreakerStuck": "Timed out after {ms} ms: stale-lock breaker {path} exists (held by {owner}). It is never removed automatically. If no bernard process is running, delete {path} (and {lock} if its owner is dead) manually.",
  "store.lockLost": "Store lock {path} was no longer ours at release time.",
  "schema.idRequired": "Id is required and must be a non-empty string.",
  "schema.createdInvalid": "Created must be a valid date string.",
  "schema.invalidBoolean": "Invalid must be a boolean.",
  "schema.supersededByInvalid": "superseded_by must be null or a non-empty string.",
  "schema.sourceString": "Source must be a string.",
  "store.indexWriteFailed": "Could not write the local search index: {error}",

  // --- common ---
  "common.noGitRepo": "Git repository not found; using the current directory.",
  "common.corruptLine": "Skipped corrupt line: {line}",
  "cli.unknownCommand": "Unknown command: {sub}",

  // generic labels reused across outputs
  "label.id": "id",
  "label.date": "date",
  "label.tags": "tags",
  "label.score": "score",
  "label.none": "-",

  // --- schema validation ---
  "schema.notObject": "Record must be an object.",
  "schema.invalidType": 'Invalid type: "{type}". Valid types: {types}.',
  "schema.titleRequired": "Title must be a non-empty string.",
  "schema.contentString": "Content must be a string.",
  "schema.tagsArray": "Tags must be an array.",
  "schema.tagsAllStrings": "All tags must be strings.",
  "schema.invalidSource": 'Invalid source: "{source}". Valid sources: {sources}.',

  // --- init ---
  "init.done": "Memory initialized: {dir}",
  "init.created": "Created:",
  "init.skipped": "Skipped (already present):",
  "init.allInPlace": "Everything is already in place; no changes made.",
  "init.success": "init complete",
  "init.gitignoreCreated": ".gitignore (created)",
  "init.gitignoreAdded": ".gitignore (.bernard/.cache/ added)",
  "init.gitignoreContains": ".gitignore (already contains the entry)",
  "init.gitattrCreated": ".gitattributes (created)",
  "init.gitattrAdded": ".gitattributes (merge=union added)",
  "init.gitattrContains": ".gitattributes (already contains the entry)",

  // --- add ---
  "add.promptType": "Type ({types}): ",
  "add.promptTitle": "Title: ",
  "add.promptContent": "Content: ",
  "add.promptTags": "Tags (comma-separated, optional): ",
  "add.invalidType": "Invalid type. Must be one of: {types}",
  "add.missingFields": "Missing required field(s): {fields}",
  "add.usage": "Usage: bernard add --type <type> --title <title> --content <content> [--tags a,b]",
  "add.supersedeNotFound": 'Record to supersede was not found: "{id}"',
  "add.validateFailed": "Record validation failed:",
  "add.added": "Added: {id} ({type}) {title}{tags}",
  "add.superseded": "Superseded: {old} -> replaced by {new}",

  // --- search ---
  "search.empty": "Empty query. Usage: bernard search <query> [--type ...] [--tag ...]",
  "search.indexFailed": "Could not prepare the index: {error}",
  "search.noResults": "No results found.",
  "search.header": '{n} result(s) for "{query}":',

  // --- list ---
  "list.none": "No records found.",
  "list.invalid": "(invalid)",
  "list.total": "Total: {n} record(s)",

  // --- invalidate ---
  "invalidate.missingId": "Missing record id.",
  "invalidate.usage": "Usage: bernard invalidate <id> [--by <id2>]",
  "invalidate.notFound": "Record not found: {id}",
  "invalidate.byNotFound": "--by record not found: {id}",
  "invalidate.done": "Invalidated: {id} ({title})",
  "invalidate.doneBy": "Invalidated: {id} ({title}) — replaced by: {by}",

  // --- distill ---
  "distill.reportHeader": "Memory distillation report ({n} record(s) examined)",
  "distill.noDelete": "Note: this never deletes anything; it only marks and suggests.",
  "distill.conflicts": "Possible conflicts: {n}",
  "distill.none": "(none)",
  "distill.records": "records: {ids}",
  "distill.keep": "keep (newest): {id}",
  "distill.toInvalidate": "to invalidate: {ids}",
  "distill.chains": "Supersession chains: {n}",
  "distill.chainLine": "{id} -> superseded by {by}",
  "distill.suggestions": "Suggestions: {n}",
  "distill.suggestConflict":
    'There are {count} records of type "{type}"{tags}: {ids}. ' +
    'Keep the newest ("{keep}") and supersede the others by pointing them to it.',
  "distill.suggestChain":
    'Record "{id}" is invalid and was superseded by "{by}"; make sure the current decision still holds.',
  "distill.suggestConsistent":
    "No obvious conflicts or supersession chains found; memory looks consistent.",
  "distill.tagsInline": " (tags: {tags})",
  "distill.readyHeader": "Ready-to-run commands (nothing is deleted automatically):",
  "distill.applyHint": "Tip: use the '--apply' flag to apply interactively (TTY required).",
  "distill.applyNoConflicts": "No conflicts to apply.",
  "distill.conflictHeading": "Conflict [{type}] tags: {tags}",
  "distill.applyPrompt": "Keep the newest and invalidate the others? (y/n) ",
  "distill.applied": '"{old}" invalidated; superseded by "{keep}".',
  "distill.skipped": "Skipped.",
  "distill.completed": "Done: {n} record(s) invalidated (nothing was deleted).",

  // --- suggest ---
  "suggest.notGitRepo": "This is not a git repository; cannot generate suggestions.",
  "suggest.noCommits": "No commits to suggest from.",
  "suggest.header": "Draft suggestion(s) from the last {n} commit(s):",
  "suggest.note1": "Note: the real understanding is yours (the agent). These are only a starting point;",
  "suggest.note2": "review and edit before saving.",
  "suggest.labelType": "Type",
  "suggest.labelTitle": "Title",
  "suggest.labelTags": "Tags",
  "suggest.labelContent": "Content",
  "suggest.none": "(none)",
  "suggest.savePrompt": '[{i}/{n}] "{title}" — Save? (y/n): ',
  "suggest.saved": "Saved: {id} ({type}) {title}",
  "suggest.skipped": "Skipped.",
  "suggest.useAddHint": "To save these drafts, use 'bernard add' or the MCP tool.",
  "suggest.ttyHint": "--add requires an interactive terminal (TTY); only suggestions were shown.",

  // --- install-hook ---
  "hook.notGitRepo": "This is not a git repository; the hook was not installed.",
  "hook.notGitRepoOut": "Git repository not found. You must be inside a git repository to install the hook.",
  "hook.removeNone": "No post-commit hook to remove.",
  "hook.removeNoneDim": "install-hook --remove: nothing to do",
  "hook.removeNotOurs": "The existing post-commit hook was not installed by bernard; left untouched.",
  "hook.removeNotOursOut": "The post-commit hook has no bernard marker; nothing was removed.",
  "hook.removeFailed": "Could not remove the hook: {error}",
  "hook.removeFailedOut": "Failed to remove the post-commit hook.",
  "hook.removed": "bernard post-commit hook removed: {path}",
  "hook.removeSuccess": "install-hook --remove complete",
  "hook.alreadyInstalled": "bernard post-commit hook is already installed: {path}",
  "hook.noChange": "install-hook: no changes made",
  "hook.existsNotOurs": "The existing post-commit hook is not bernard's; it was not overwritten.",
  "hook.existsOut": "A post-commit hook already exists: {path}",
  "hook.snippetIntro": "You can add the following lines to your existing post-commit hook by hand:",
  "hook.installFailed": "Could not install the hook: {error}",
  "hook.installFailedOut": "Failed to install the post-commit hook.",
  "hook.installed": "bernard post-commit hook installed: {path}",
  "hook.installedHint": "You'll be reminded to run 'bernard suggest' after each commit.",
  "hook.success": "install-hook complete",
  // text echoed by the installed shell hook after every commit
  "hook.reminder": "[bernard] New commit recorded. For draft suggestions: bernard suggest",

  // --- stats ---
  "stats.title": "Memory statistics",
  "stats.total": "Total records: {n}",
  "stats.empty": "Memory is empty. Create your first record with 'bernard add'.",
  "stats.byType": "By type:",
  "stats.topTags": "Top 5 tags:",
  "stats.noTags": "(no tags)",
  "stats.invalidCount": "Invalid records: {n}",
  "stats.oldest": "Oldest record: {date}",
  "stats.newest": "Newest record: {date}",
  "stats.noDates": "Date range: (no valid dates)",
  "stats.bySource": "By source:",

  // --- tags ---
  "tags.invalidAddFormat": 'Invalid format. Usage: --add "key=syn1,syn2"',
  "tags.emptyKey": 'Invalid format: key cannot be empty. Usage: --add "key=syn1,syn2"',
  "tags.groupUpdated": "Synonym group updated: {key}: {syns}",
  "tags.success": "tags updated",
  "tags.invalidRemoveFormat": 'Invalid format. Usage: --remove "key"',
  "tags.groupRemoved": "Synonym group removed: {key}",
  "tags.groupNotFound": "Synonym group not found: {key}",
  "tags.typesHeader": "Types:",
  "tags.noTypes": "(no types defined)",
  "tags.synonymsHeader": "Synonym groups:",
  "tags.noSynonyms": "(no synonym groups defined)",

  // --- mcp tool descriptions ---
  "mcp.search.desc":
    "Search this project's past decisions, architecture notes, fixed bugs, and preferences. Use it before starting any task to find relevant prior context.",
  "mcp.add.desc":
    "Save a new decision, architecture note, fixed bug, preference, or note about this project to memory. Use it when context should be remembered later.",
  "mcp.list.desc":
    "List records in memory, optionally filtered by type or tag. Use it to see what is stored for this project.",
  "mcp.invalidate.desc":
    "Mark a record as invalid (no longer current). Optionally provide the id of the record that supersedes it. The record is not deleted, only marked.",
  "mcp.update.desc":
    "Update fields (type, title, content, tags) of an existing record. Only the provided fields change.",
  "mcp.suggest.desc":
    "Fetch recent commits and their diffs so you can extract decisions/bugs worth keeping and save them with bernard_add.",
  "mcp.noResults": "No results.",
  "mcp.invalidRecord": "Record is invalid, not added:\n- {errors}",
  "mcp.added": "Record added: {id} [{type}] {title}",
  "mcp.noRecords": "No records.",
  "mcp.notFound": "Record not found: {id}",
  "mcp.invalidated": "Record invalidated: {id} [{type}] {title}{by}",
  "mcp.invalidatedBy": " (superseded by: {by})",
  "mcp.updated": "Record updated: {id} [{type}] {title}",
  "mcp.notGitRepo": "This directory is not a git repository; cannot suggest from commits.",
  "mcp.noCommits": "No commits found.",
  "mcp.suggestIntro":
    "Recent commits and their changes are below. Extract decisions/bugs/architecture notes worth keeping and save them with bernard_add:",
  "mcp.serverRunning": "bernard MCP server is running on stdio.",

  // --- cli help ---
  "help.text": `bernard — repo-committed, project-scoped AI memory (CLI + MCP)

Usage:
  bernard <command> [options]

Commands:
  init                          Set up the .bernard/ structure in this repo
  add        (alias: ekle)      Add a new memory record
  search     (alias: ara)       Search records (BM25 full-text retrieval)
  list       (alias: listele)   List records (newest first)
  invalidate (alias: gecersiz)  Mark a record invalid (does not delete)
  distill    (alias: damit)     Surface conflicts / supersession chains
  suggest    (alias: oner)      Draft records from recent commits
  install-hook (alias: kanca-kur)  Install/remove a post-commit reminder hook
  stats      (alias: istatistik)   Show a summary dashboard
  tags       (alias: etiketler)    Manage types / synonym groups
  mcp                           Start the MCP server (stdio)

Options:
  --type <type>                 decision | architecture | bug | preference | note
  --title <text>                Record title
  --content <text>              Record content
  --tags <a,b,c>                Comma-separated tags
  --supersedes <oldId>          (add) new record supersedes an old one
  --by <id2>                    (invalidate) id of the replacement record
  --apply                       (distill) invalidate conflicts interactively
  --add                         (suggest) save drafts interactively
  --n <count>                   (suggest) number of commits to process
  --remove                      (install-hook) remove the bernard hook
  --locale <en|tr>              Output language (also: BERNARD_LOCALE env)
  -h, --help                    Show this help
  -v, --version                 Show the version

Examples:
  bernard init
  bernard add --type decision --title "Use JWT" --content "Sessions via JWT" --tags auth,api
  bernard search "authentication flow"
  bernard search "payment" --type decision
  bernard list --type bug
  bernard invalidate ber_abc123 --by ber_def456
  bernard distill --apply
  bernard suggest --add
  bernard stats
  bernard tags --add "auth=login,session"
  bernard install-hook
`,
};
