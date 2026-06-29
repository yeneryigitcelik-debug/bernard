// MCP server: exposes bernard's memory to agents over stdio.
// Written against SDK 1.x: McpServer + StdioServerTransport + registerTool.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { findRepoRoot, bernardDir } from "../core/paths.js";
import { readRecords, appendRecord, updateRecord } from "../core/store.js";
import { ensureIndex } from "../core/index-cache.js";
import { retrieve } from "../core/retrieve.js";
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

function resolveDir() {
  return bernardDir(findRepoRoot());
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
    short ? `  ${short}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function startServer() {
  const dir = resolveDir();
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
        type: z.string().optional(),
        tag: z.string().optional(),
      },
    },
    async ({ query, type, tag }) => {
      const records = readRecords(dir);
      const index = ensureIndex(dir, locale);
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

      if (!res.length) {
        return { content: [{ type: "text", text: t("mcp.noResults") }] };
      }
      const text = res.map(({ record, score }) => formatRecord(record, score, t)).join("\n\n");
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
          content: [{ type: "text", text: t("mcp.invalidRecord", { errors: errors.join("\n- ") }) }],
        };
      }
      const rec = appendRecord(dir, candidate);
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
        type: z.string().optional(),
        tag: z.string().optional(),
      },
    },
    async ({ type, tag }) => {
      let records = readRecords(dir);
      if (type) records = records.filter((r) => r.type === type);
      if (tag) records = records.filter((r) => Array.isArray(r.tags) && r.tags.includes(tag));
      records.sort((a, b) => (Date.parse(b.created) || 0) - (Date.parse(a.created) || 0));

      if (!records.length) {
        return { content: [{ type: "text", text: t("mcp.noRecords") }] };
      }
      const text = records.map((r) => formatRecord(r, undefined, t)).join("\n\n");
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
      const rec = updateRecord(dir, id, { invalid: true, superseded_by: by || null });
      if (!rec) {
        return { content: [{ type: "text", text: t("mcp.notFound", { id }) }] };
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
      const patch = {};
      if (type !== undefined) patch.type = type;
      if (title !== undefined) patch.title = title;
      if (content !== undefined) patch.content = content;
      if (tags !== undefined) patch.tags = normalizeTags(tags);

      const rec = updateRecord(dir, id, patch);
      if (!rec) {
        return { content: [{ type: "text", text: t("mcp.notFound", { id }) }] };
      }
      return {
        content: [{ type: "text", text: t("mcp.updated", { id: rec.id, type: rec.type, title: rec.title }) }],
      };
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
      const root = findRepoRoot();
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
