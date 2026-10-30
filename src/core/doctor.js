// Read-only integrity inspection. Never acquires locks, writes caches or repairs data.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { parseLines, fingerprintBuffer, recordsPath, lockPath, readOwner, isOwnerDead } from "./store.js";
import { INDEX_VERSION, isValidIndex } from "./index-cache.js";
import { TYPES } from "../util/schema.js";
import { LOCALES, makeT } from "../i18n/index.js";
import { gitHookPath } from "../util/git.js";
import { classify } from "../commands/install-hook.js";

const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const numeric = (v) => typeof v === "number" && Number.isFinite(v);

export function diagnose(root, locale = "en", version = "0.0.0") {
  const t = makeT(locale);
  const dir = path.join(root, ".bernard");
  const checks = [];
  const add = (id, severity, data = {}) => checks.push({ id, severity, message: t("doctor." + id, data), data });
  const read = (file) => {
    try { return fs.readFileSync(file); }
    catch (error) {
      if (error.code !== "ENOENT") add("layout.unreadable", "error", { path: file, error: error.message });
      return null;
    }
  };
  let parsed = { lines: [], records: [], duplicates: [] };
  let raw = null;
  try {
    if (!fs.statSync(root).isDirectory()) throw new Error("Not a directory");
    fs.accessSync(root, fs.constants.R_OK);
  } catch (error) {
    add("layout.root_unreadable", "error", { path: root, error: error.message });
    return finish(3);
  }
  if (!fs.existsSync(dir)) {
    add("layout.missing_dir", "error", { path: dir });
    return finish();
  }
  raw = read(recordsPath(dir));
  if (raw === null) add("layout.missing_file", "error", { file: "records.jsonl" });
  else {
    parsed = parseLines(raw, t);
    for (const line of parsed.lines) if (line.error) add(line.error.id, "error", { lineNo: line.lineNo, errors: line.error.errors });
    for (const duplicate of parsed.duplicates) add("records.duplicate_id", "error", duplicate);
    if (raw.length && raw[raw.length - 1] !== 10) add("records.no_trailing_newline", "info");
    const endings = new Set(parsed.lines.filter((l) => l.seg.at(-1) === 10).map((l) => l.seg.at(-2) === 13 ? "CRLF" : "LF"));
    if (endings.size > 1) add("records.mixed_eol", "info");
  }

  // Inspect every valid row's edge, including copies excluded from retrieval.
  const rows = parsed.lines.filter((l) => l.rec);
  const ids = new Set(rows.map((l) => l.rec.id));
  const edges = new Map();
  for (const { rec, lineNo } of rows) {
    if (!rec.superseded_by) continue;
    const data = { id: rec.id, by: rec.superseded_by, lineNo };
    if (!ids.has(rec.superseded_by)) add("graph.superseded_by_missing", "error", data);
    else if (rec.id === rec.superseded_by) add("graph.superseded_by_self", "error", data);
    else {
      if (!edges.has(rec.id)) edges.set(rec.id, new Set());
      edges.get(rec.id).add(rec.superseded_by);
    }
    if (!rec.invalid) add("graph.valid_but_superseded", "warning", data);
  }
  // Iterative DFS avoids stack overflow on long histories. A back edge is one
  // actionable cycle; parallel copies don't create duplicate diagnostics.
  const state = new Map();
  for (const start of edges.keys()) {
    if (state.has(start)) continue;
    const stack = [{ id: start, next: null }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (!frame.next) { state.set(frame.id, 1); frame.next = (edges.get(frame.id) || new Set()).values(); }
      const next = frame.next.next();
      if (next.done) { state.set(frame.id, 2); stack.pop(); continue; }
      if (state.get(next.value) === 1) {
        add("graph.cycle", "error", { ids: stack.slice(stack.findIndex((f) => f.id === next.value)).map((f) => f.id) });
      } else if (!state.has(next.value)) stack.push({ id: next.value, next: null });
    }
  }

  for (const name of ["config.json", "categories.json"]) {
    const bytes = read(path.join(dir, name));
    if (bytes === null) { add("layout.missing_file", "warning", { file: name }); continue; }
    let data;
    try { data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { add(name === "config.json" ? "config.unparseable" : "categories.unparseable", "warning"); continue; }
    if (name === "config.json") {
      if (!object(data)) { add("config.unparseable", "warning"); continue; }
      if (data.locale !== undefined && !LOCALES.includes(data.locale)) add("config.locale_unknown", "warning", { locale: data.locale });
      const r = data.retrieval;
      if (r !== undefined) {
        const bad = [];
        if (!object(r)) bad.push("retrieval");
        else {
          if (r.max_results !== undefined && (!Number.isSafeInteger(r.max_results) || r.max_results < 1)) bad.push("max_results");
          if (r.recency_weight !== undefined && (!numeric(r.recency_weight) || r.recency_weight < 0)) bad.push("recency_weight");
          if (r.half_life_days !== undefined && (!numeric(r.half_life_days) || r.half_life_days <= 0)) bad.push("half_life_days");
          if (r.type_weights !== undefined && (!object(r.type_weights) || Object.entries(r.type_weights).some(([k, v]) => !TYPES.includes(k) || !numeric(v) || v < 0))) bad.push("type_weights");
        }
        if (bad.length) add("config.retrieval_range", "warning", { fields: bad });
      }
    } else {
      if (!object(data)) { add("categories.unparseable", "warning"); continue; }
      if (!Array.isArray(data.types) || data.types.length !== TYPES.length || new Set(data.types).size !== TYPES.length || data.types.some((type) => !TYPES.includes(type))) add("categories.types_diverge", "warning");
      if (!object(data.synonyms) || Object.values(data.synonyms).some((v) => !Array.isArray(v) || v.some((s) => typeof s !== "string"))) add("categories.synonyms_shape", "warning");
    }
  }
  const linesOf = (file) => (read(path.join(root, file)) || Buffer.alloc(0)).toString("utf8").split(/\r?\n/).map((l) => l.trim());
  if (!linesOf(".gitignore").some((l) => [".bernard/.cache/", ".bernard/.cache", "/.bernard/.cache/", "/.bernard/.cache"].includes(l))) add("layout.gitignore_cache", "warning");
  if (!linesOf(".gitattributes").some((l) => /^\/?\.bernard\/records\.jsonl\s+merge=union(?:\s|$)/.test(l))) add("layout.gitattributes_union", "warning");
  try {
    const tracked = execFileSync("git", ["ls-files", "-z", "--", ".bernard/.cache"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\0").filter(Boolean);
    if (tracked.length) add("layout.cache_tracked", "warning", { files: tracked });
  } catch { /* Non-Git stores are supported; no network calls. */ }
  const cache = read(path.join(dir, ".cache", "index.json"));
  if (cache) {
    let index;
    try { index = JSON.parse(cache.toString("utf8")); } catch { /* stale below */ }
    if (index && index.version !== INDEX_VERSION) add("cache.version_mismatch", "info", { expected: INDEX_VERSION, actual: index.version });
    if (!isValidIndex(index) || index.version !== INDEX_VERSION || index.locale !== locale || index.source?.fingerprint !== fingerprintBuffer(raw || Buffer.alloc(0))) add("cache.stale", "info");
  } else add("cache.stale", "info");
  for (const [file, id] of [[lockPath(dir), "lock.present"], [lockPath(dir) + ".break", "lock.breaker_present"]]) {
    try {
      const owner = readOwner(file);
      if (owner.state !== "missing") add(id, "warning", { path: file, state: owner.state, ...(owner.owner ? { owner: { ...owner.owner, dead: isOwnerDead(owner.owner), foreignHost: owner.owner.host !== os.hostname() } } : {}) });
    } catch (error) { add("layout.unreadable", "error", { path: file, error: error.message }); }
  }
  const hook = gitHookPath(root, "post-commit");
  let kind = "none";
  if (hook) {
    try {
      const st = fs.lstatSync(hook);
      kind = st.isFile() ? classify(fs.readFileSync(hook, "utf8"), t("hook.reminder")).kind : "foreign";
    } catch (error) { if (error.code !== "ENOENT") add("layout.unreadable", "error", { path: hook, error: error.message }); }
  }
  add("hook.state", "info", { kind });
  return finish();

  function finish(override) {
    const summary = { errors: 0, warnings: 0, infos: 0, records: parsed.lines.filter((l) => l.rec).length, unique_ids: new Set(parsed.lines.filter((l) => l.rec).map((l) => l.rec.id)).size, quarantined_ids: parsed.duplicates.filter((d) => d.quarantined).length };
    for (const check of checks) summary[check.severity === "error" ? "errors" : check.severity === "warning" ? "warnings" : "infos"]++;
    const exitCode = override ?? (summary.errors ? 2 : summary.warnings ? 1 : 0);
    return { schema: 1, bernard: version, root, locale, summary, checks, exitCode };
  }
}
