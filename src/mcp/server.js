// MCP server: exposes bernard's memory to agents over stdio.
// Written against SDK 1.x: McpServer + StdioServerTransport + registerTool.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { findRepoRoot, bernardDir } from "../core/paths.js";
import { readRecords, readSnapshot, appendRecord, updateRecord } from "../core/store.js";
import { ensureIndex } from "../core/index-cache.js";
import { retrieve } from "../core/retrieve.js";
import { resolveRecord, stateLine, isActive } from "../core/inspect.js";
import { validateRecord, normalizeTags, TYPES } from "../util/schema.js";
import { recentCommits, commitDiff, isGitRepo } from "../util/git.js";
import { log } from "../util/log.js";
import { getT, resolveLocale, localeFromConfig } from "../i18n/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8")
    );
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// Read the synonym dictionary from categories.json (empty if missing).
function readSynonyms(dir) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dir, "categories.json"), "utf8"));
    return data && typeof data.synonyms === "object" && data.synonyms ? data.synonyms : {};
  } catch {
    return {};
  }
}

// Read retrieval settings from config.json (defaults if missing).
function readConfig(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8")) || {};
  } catch {
    return {};
  }
}

// Render a single record to human-readable text.
function formatRecord(rec, score, t) {
  const tags =
    Array.isArray(rec.tags) && rec.tags.length ? rec.tags.join(", ") : t("label.none");
  const date = rec.created || t("label.none");
  const content = String(rec.content || "").trim();
  const short = content.length > 280 ? content.slice(0, 277) + "..." : content;
  const scoreStr = typeof score === "number" ? ` (${t("label.score")}: ${score.toFixed(3)})` : "";
  return [
    `[${rec.type}] ${rec.title}${scoreStr}`,
    `  ${t("label.id")}: ${rec.id}  ${t("label.date")}: ${date}  ${t("label.tags")}: ${tags}`,
    `  ${stateLine(rec, t)}`,
    short ? `  ${short}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// Map core EBERNARD_INVALID_RECORD errors to an MCP error result; rethrow others.
function invalidRecordResult(err, t) {
  if (err && err.code === "EBERNARD_INVALID_RECORD") {
    const errors = Array.isArray(err.errors) && err.errors.length
      ? err.errors
      : [String(err.message || err)];
    return {
      isError: true,
      content: [{ type: "text", text: t("mcp.invalidRecord", { errors: errors.join("\n- ") }) }],
    };
  }
  throw err;
}

function notFoundResult(id, t) {
  return { isError: true, content: [{ type: "text", text: t("mcp.notFound", { id }) }] };
}

function snapshotNotice(snapshot, t) {
  return snapshot.duplicates.map((d) => t("store.duplicateLines", { id: d.id, lines: d.lineNos.join(", ") })).join("\n");
}

export async function startServer() {
  const root = findRepoRoot();
  const dir = bernardDir(root);
  const notInitialized = () => fs.existsSync(path.join(dir, "records.jsonl")) ? null : {
    isError: true, content: [{ type: "text", text: getT(dir)("mcp.notInitialized", { dir }) }],
  };
  const locale = resolveLocale({ config: localeFromConfig(dir) });
  const t = getT(dir);

  const server = new McpServer({ name: "bernard", version: getVersion() });

  // --- bernard_search: the main retrieval tool ---
  server.registerTool(
    "bernard_search",
    {
      description: t("mcp.search.desc"),
      inputSchema: {
        query: z.string(),
        type: z.enum(TYPES).optional(),
        tag: z.string().optional(),
      },
    },
    async ({ query, type, tag }) => {
      const snap = readSnapshot(dir);
      const records = snap.records;
      const index = ensureIndex(dir, locale, snap);
      const synonyms = readSynonyms(dir);
      const r = (readConfig(dir).retrieval) || {};
      const res = retrieve(query, records, {
        synonyms,
        type: type || null,
        tag: tag || null,
        maxResults: r.max_results ?? 8,
        recencyWeight: r.recency_weight ?? 0.3,
        halfLifeDays: r.half_life_days ?? 30,
        typeWeights: r.type_weights || {},
        index,
        locale,
      });

      const notice = snapshotNotice(snap, t);
      if (!res.length) {
        return { content: [{ type: "text", text: [t("mcp.noResults"), notice].filter(Boolean).join("\n\n") }] };
      }
      const text = [res.map(({ record, score }) => formatRecord(record, score, t)).join("\n\n"), notice].filter(Boolean).join("\n\n");
      return { content: [{ type: "text", text }] };
    }
  );

  // --- bernard_add: agent-sourced record ---
  server.registerTool(
    "bernard_add",
    {
      description: t("mcp.add.desc"),
      inputSchema: {
        type: z.enum(TYPES),
        title: z.string(),
        content: z.string(),
        tags: z.union([z.array(z.string()), z.string()]).optional(),
      },
    },
    async ({ type, title, content, tags }) => {
      const missing = notInitialized();
      if (missing) return missing;
      const candidate = {
        type,
        title,
        content,
        tags: normalizeTags(tags),
        source: "agent",
      };
      const { ok, errors } = validateRecord(candidate, t);
      if (!ok) {
        return {
          isError: true,
          content: [{ type: "text", text: t("mcp.invalidRecord", { errors: errors.join("\n- ") }) }],
        };
      }
      let rec;
      try {
        rec = appendRecord(dir, candidate);
      } catch (err) {
        return invalidRecordResult(err, t);
      }
      return {
        content: [{ type: "text", text: t("mcp.added", { id: rec.id, type: rec.type, title: rec.title }) }],
      };
    }
  );

  // --- bernard_list: list records ---
  server.registerTool(
    "bernard_list",
    {
      description: t("mcp.list.desc"),
      inputSchema: {
        type: z.enum(TYPES).optional(),
        tag: z.string().optional(),
        include_invalid: z.boolean().optional().describe(t("mcp.list.includeInvalid")),
      },
    },
    async ({ type, tag, include_invalid }) => {
      const snap = readSnapshot(dir);
      let records = snap.records;
      const notice = snapshotNotice(snap, t);
      if (type) records = records.filter((r) => r.type === type);
      if (tag) records = records.filter((r) => Array.isArray(r.tags) && r.tags.includes(tag));
      if (include_invalid === false) records = records.filter((r) => isActive(r));
      records.sort((a, b) => (Date.parse(b.created) || 0) - (Date.parse(a.created) || 0));

      if (!records.length) {
        return { content: [{ type: "text", text: [t("mcp.noRecords"), notice].filter(Boolean).join("\n\n") }] };
      }
      const text = [records.map((r) => formatRecord(r, undefined, t)).join("\n\n"), notice].filter(Boolean).join("\n\n");
      return { content: [{ type: "text", text }] };
    }
  );

  // --- bernard_invalidate: mark a record invalid ---
  server.registerTool(
    "bernard_invalidate",
    {
      description: t("mcp.invalidate.desc"),
      inputSchema: {
        id: z.string(),
        by: z.string().optional(),
      },
    },
    async ({ id, by }) => {
      const missing = notInitialized();
      if (missing) return missing;
      let rec;
      try {
        rec = updateRecord(dir, id, { invalid: true, ...(by !== undefined ? { superseded_by: by } : {}) });
      } catch (err) {
        return invalidRecordResult(err, t);
      }
      if (!rec) {
        return notFoundResult(id, t);
      }
      const byStr = by ? t("mcp.invalidatedBy", { by }) : "";
      return {
        content: [
          { type: "text", text: t("mcp.invalidated", { id: rec.id, type: rec.type, title: rec.title, by: byStr }) },
        ],
      };
    }
  );

  // --- bernard_update: update an existing record ---
  server.registerTool(
    "bernard_update",
    {
      description: t("mcp.update.desc"),
      inputSchema: {
        id: z.string(),
        type: z.string().optional(),
        title: z.string().optional(),
        content: z.string().optional(),
        tags: z.union([z.array(z.string()), z.string()]).optional(),
      },
    },
    async ({ id, type, title, content, tags }) => {
      const missing = notInitialized();
      if (missing) return missing;
      const patch = {};
      if (type !== undefined) patch.type = type;
      if (title !== undefined) patch.title = title;
      if (content !== undefined) patch.content = content;
      if (tags !== undefined) patch.tags = normalizeTags(tags);

      let rec;
      try {
        rec = updateRecord(dir, id, patch);
      } catch (err) {
        return invalidRecordResult(err, t);
      }
      if (!rec) {
        return notFoundResult(id, t);
      }
      return {
        content: [{ type: "text", text: t("mcp.updated", { id: rec.id, type: rec.type, title: rec.title }) }],
      };
    }
  );

  // --- bernard_get: exact-ID read-only inspection (history included) ---
  server.registerTool(
    "bernard_get",
    {
      description: t("mcp.get.desc"),
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }) => {
      if (!fs.existsSync(path.join(dir, "records.jsonl"))) {
        return { isError: true, content: [{ type: "text", text: t("inspect.notInitialized", { dir }) }] };
      }
      const snap = readSnapshot(dir);
      const res = resolveRecord(snap, id);
      if (res.problem === "ambiguous") {
        return {
          isError: true,
          content: [{ type: "text", text: t("inspect.ambiguous", { id, lines: res.lineNos.join(", ") }) }],
        };
      }
      if (res.problem) return notFoundResult(id, t);
      return { content: [{ type: "text", text: JSON.stringify(res.record, null, 2) }] };
    }
  );

  // --- bernard_suggest: fetch recent commits + diffs ---
  server.registerTool(
    "bernard_suggest",
    {
      description: t("mcp.suggest.desc"),
      inputSchema: { n: z.number().optional() },
    },
    async ({ n }) => {
      if (!isGitRepo(root)) {
        return { content: [{ type: "text", text: t("mcp.notGitRepo") }] };
      }
      const count = typeof n === "number" && n > 0 ? Math.floor(n) : 5;
      const commits = recentCommits(root, count);
      if (!commits.length) {
        return { content: [{ type: "text", text: t("mcp.noCommits") }] };
      }

      const blocks = commits.map((c) => {
        const files = Array.isArray(c.files) && c.files.length ? c.files.join(", ") : "-";
        const body = c.body ? `\n${c.body}` : "";
        const diff = commitDiff(root, c.hash);
        return [
          `commit ${c.shortHash} (${c.date})`,
          `title: ${c.title}${body}`,
          `files: ${files}`,
          diff ? `\ndiff:\n${diff}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      });

      const text = t("mcp.suggestIntro") + "\n\n" + blocks.join("\n\n---\n\n");
      return { content: [{ type: "text", text }] };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info(t("mcp.serverRunning"));
}
