// test/smoke.js — dependency-free smoke test.
// CORE modules are imported directly; src/mcp/server.js is NEVER imported here
// (that keeps the test runnable without the MCP SDK installed).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { newId, readRecords, appendRecord, updateRecord } from "../src/core/store.js";
import { retrieve, expandQuery } from "../src/core/retrieve.js";
import { stem, stemTr, tokenize, buildIndex } from "../src/core/bm25.js";
import { ensureIndex, indexPath, isStale } from "../src/core/index-cache.js";
import { distill } from "../src/core/distill.js";
import { init } from "../src/commands/init.js";
import { validateRecord, normalizeTags, TYPES } from "../src/util/schema.js";
import { isGitRepo, recentCommits } from "../src/util/git.js";
import { tags as tagsCmd } from "../src/commands/tags.js";
import { makeT, resolveLocale } from "../src/i18n/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const binPath = path.join(__dirname, "..", "bin", "bernard.js");

// Make sure no inherited locale leaks into in-process or subprocess runs.
delete process.env.BERNARD_LOCALE;

function tempGitRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bernard-git-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "t@t.dev"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: root });
  return root;
}

const mk = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

// --- tiny assert helper ---
let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) pass++;
  else {
    fail++;
    process.stderr.write(`FAIL: ${msg}\n`);
  }
}

const dir = mk("bernard-smoke-");

// === 1) init creates .bernard + 3 files ===
const repoRoot = mk("bernard-repo-");
fs.mkdirSync(path.join(repoRoot, ".git"), { recursive: true });
const oldCwd = process.cwd();
const realLog = console.log;
console.log = () => {}; // silence init's stdout summary
try {
  process.chdir(repoRoot);
  await init({ _: [], flags: {} });
} finally {
  process.chdir(oldCwd);
  console.log = realLog;
}
const initDir = path.join(repoRoot, ".bernard");
ok(fs.existsSync(initDir), "init: .bernard directory created");
ok(fs.existsSync(path.join(initDir, "records.jsonl")), "init: records.jsonl exists");
ok(fs.existsSync(path.join(initDir, "categories.json")), "init: categories.json exists");
ok(fs.existsSync(path.join(initDir, "config.json")), "init: config.json exists");
const initCfg = JSON.parse(fs.readFileSync(path.join(initDir, "config.json"), "utf8"));
ok(initCfg.locale === "en", "init: default locale is en");
ok(initCfg.retrieval && initCfg.retrieval.max_results === 8, "init: retrieval.max_results default");
const initCats = JSON.parse(fs.readFileSync(path.join(initDir, "categories.json"), "utf8"));
ok(Array.isArray(initCats.types) && initCats.types.includes("decision"), "init: English types seeded");
ok(initCats.synonyms && Array.isArray(initCats.synonyms.auth), "init: English synonyms seeded");
const giContent = fs.readFileSync(path.join(repoRoot, ".gitignore"), "utf8");
ok(giContent.includes(".bernard/.cache/"), "init: .gitignore has cache ignore");
const gaContent = fs.readFileSync(path.join(repoRoot, ".gitattributes"), "utf8");
ok(gaContent.includes(".bernard/records.jsonl merge=union"), "init: .gitattributes has merge=union");

// === 2) appendRecord returns ber_ id, English fields, stable order ===
const r1 = appendRecord(dir, {
  type: "decision",
  title: "Use JWT for auth",
  content: "Authentication handled via JWT tokens.",
  tags: ["auth"],
});
ok(typeof r1.id === "string" && r1.id.startsWith("ber_"), "appendRecord: id starts with ber_");
ok(r1.type === "decision" && r1.invalid === false && r1.source === "manual", "appendRecord: defaults applied");
ok(r1.superseded_by === null && Array.isArray(r1.tags), "appendRecord: superseded_by null, tags array");
const r2 = appendRecord(dir, {
  type: "architecture",
  title: "Database choice",
  content: "Postgres was chosen.",
  tags: ["db"],
});
let lineCount = fs
  .readFileSync(path.join(dir, "records.jsonl"), "utf8")
  .split(/\r?\n/)
  .filter((l) => l.trim()).length;
ok(lineCount === 2, "appendRecord: 2 lines in file");

// === 3) readRecords round-trips ===
let recs = readRecords(dir);
ok(recs.length === 2, "readRecords: 2 records read");
const foundR1 = recs.find((r) => r.id === r1.id);
ok(foundR1 && foundR1.title === "Use JWT for auth" && foundR1.type === "decision", "readRecords: r1 round-trip");

// === 4) readRecords skips corrupt line ===
fs.appendFileSync(path.join(dir, "records.jsonl"), "{bad json\n");
recs = readRecords(dir);
ok(recs.length === 2, "readRecords: corrupt line skipped");

// === 5) BM25/retrieve: matching record ranked #1 (en) ===
let res = retrieve("JWT token", recs, { maxResults: 8 });
ok(res.length > 0 && res[0].record.id === r1.id, "retrieve: most relevant record is #1");
ok(typeof res[0].score === "number", "retrieve: result has numeric score");

// === 6) synonyms (en): "login" finds the auth-tagged record ===
const synonyms = { auth: ["authentication", "login", "session", "signin"] };
res = retrieve("login", recs, { synonyms, maxResults: 8 });
ok(res.some((x) => x.record.id === r1.id), "retrieve: synonym expansion found auth record");

// === 7) recency weight: equal relevance -> newer first ===
const dir2 = mk("bernard-smoke2-");
const older = appendRecord(dir2, {
  type: "note",
  title: "kafka message queue",
  content: "kafka message queue",
  created: "2020-01-01T00:00:00.000Z",
});
const newer = appendRecord(dir2, {
  type: "note",
  title: "kafka message queue",
  content: "kafka message queue",
  created: "2025-01-01T00:00:00.000Z",
});
res = retrieve("kafka message queue", readRecords(dir2), { recencyWeight: 0.3, maxResults: 8 });
ok(res.length === 2 && res[0].record.id === newer.id, "retrieve: newer record first via recency");

// === 8) invalid records dropped by default ===
const dir3 = mk("bernard-smoke3-");
const valid = appendRecord(dir3, { type: "note", title: "redis cache", content: "use redis cache" });
appendRecord(dir3, { type: "note", title: "redis cache", content: "use redis cache", invalid: true });
res = retrieve("redis cache", readRecords(dir3), { maxResults: 8 });
ok(res.length === 1 && res[0].record.id === valid.id, "retrieve: invalid record dropped");

// === 9) ensureIndex creates index.json with locale ===
const idxP = indexPath(dir);
ok(!fs.existsSync(idxP), "ensureIndex: no index.json yet");
const builtIdx = ensureIndex(dir, "en");
ok(fs.existsSync(idxP), "ensureIndex: index.json created");
ok(builtIdx.locale === "en", "ensureIndex: index records its locale");

// === 10) ensureIndex rebuilds when records.jsonl is newer (isStale) ===
const recordsP = path.join(dir, "records.jsonl");
const past = new Date(Date.now() - 60_000);
const future = new Date(Date.now() + 60_000);
fs.utimesSync(idxP, past, past);
fs.utimesSync(recordsP, future, future);
ok(isStale(dir) === true, "isStale: true when records newer");
const beforeMtime = fs.statSync(idxP).mtimeMs;
ensureIndex(dir, "en");
const afterMtime = fs.statSync(idxP).mtimeMs;
ok(afterMtime > beforeMtime, "ensureIndex: stale index rebuilt");

// === 11) retrieve respects maxResults ===
const dir4 = mk("bernard-smoke4-");
for (let i = 0; i < 5; i++) {
  appendRecord(dir4, { type: "note", title: `microservice note ${i}`, content: "microservice architecture note" });
}
res = retrieve("microservice", readRecords(dir4), { maxResults: 2 });
ok(res.length === 2, "retrieve: maxResults=2 returns at most 2");

// === 12) English tokenization has no stemming ===
ok(stem("tokens", "en") === "tokens", "stem(en): identity (no stemming)");
ok(stem("databases") === "databases", "stem: default locale en is identity");
const enToks = tokenize("Running TESTS, fast!", "en");
ok(enToks.length === 3 && enToks[0] === "running" && enToks[1] === "tests" && enToks[2] === "fast", "tokenize(en): lowercase split, no stem");

// === 13) Turkish stemmer (tr) ===
ok(stem("kararları", "tr") === "karar", "stem(tr): kararları -> karar");
ok(stemTr("tokenları") === "token", "stemTr: tokenları -> token");
ok(stem("girişler", "tr") === "giriş", "stem(tr): girişler -> giriş");
ok(stem("db", "tr") === "db", "stem(tr): db unchanged (floor)");

// === 14) tr morphology recall: "tokenları" finds token record (no synonyms) ===
const dir5 = mk("bernard-smoke5-");
const tokenRec = appendRecord(dir5, {
  type: "bug",
  title: "Oturum token süresi yanlış",
  content: "token süresi jwt expiry",
  tags: ["auth"],
});
res = retrieve("tokenları", readRecords(dir5), { locale: "tr" });
ok(res.some((x) => x.record.id === tokenRec.id), "retrieve(tr): morphology found token record");

// === 15) synonym precision: token-based, "iz" not matched inside "deniz" ===
const dir6 = mk("bernard-smoke6-");
const logRec = appendRecord(dir6, {
  type: "note",
  title: "log record",
  content: "application log record kept",
  tags: ["log"],
});
const synIz = { iz: ["record", "log"] };
res = retrieve("deniz view", readRecords(dir6), { synonyms: synIz, locale: "tr" });
ok(res.length === 0, "retrieve: 'iz' inside 'deniz' did not match (token-based)");
const expandDeniz = expandQuery("deniz", synIz, "tr");
ok(!expandDeniz.includes("log"), "expandQuery: 'deniz' does not add group token");
const expandLog = expandQuery("log", synIz, "en");
ok(expandLog.includes("iz"), "expandQuery: 'log' adds group tokens");
res = retrieve("log", readRecords(dir6), { synonyms: synIz });
ok(res.some((x) => x.record.id === logRec.id), "retrieve: 'log' found log record via group");

// === 16) type weights: higher-weight type first on a tie ===
const dir7 = mk("bernard-smoke7-");
const sameDate = "2025-01-01T00:00:00.000Z";
const bugRec = appendRecord(dir7, { type: "bug", title: "grpc timeout", content: "grpc timeout", created: sameDate });
const decisionRec = appendRecord(dir7, { type: "decision", title: "grpc timeout", content: "grpc timeout", created: sameDate });
const weighted = retrieve("grpc timeout", readRecords(dir7), { typeWeights: { decision: 2.0, bug: 1.0 } });
ok(weighted.length === 2 && weighted[0].record.id === decisionRec.id, "retrieve: type weight ranks decision first");
const unweighted = retrieve("grpc timeout", readRecords(dir7), {});
ok(unweighted.length === 2, "retrieve: both records returned without weights");

// === 17) prebuilt index gives the same top result ===
const dir8 = mk("bernard-smoke8-");
appendRecord(dir8, { type: "note", title: "elasticsearch indexing", content: "elasticsearch indexing" });
appendRecord(dir8, { type: "note", title: "kafka stream", content: "kafka stream" });
const all8 = readRecords(dir8);
const pre = buildIndex(all8, "en");
const withIdx = retrieve("elasticsearch", all8, { index: pre });
const withoutIdx = retrieve("elasticsearch", all8, {});
ok(
  withIdx.length > 0 && withoutIdx.length > 0 && withIdx[0].record.id === withoutIdx[0].record.id,
  "retrieve: prebuilt index gives same top result"
);

// === 18) locale-aware index rebuild on locale change ===
const dirL = mk("bernard-smokeL-");
appendRecord(dirL, { type: "note", title: "kayıtları test", content: "kayıtları test" });
const enIdx = ensureIndex(dirL, "en");
ok(enIdx.locale === "en", "ensureIndex: built with en");
ok(isStale(dirL, "tr") === true, "isStale: true when requested locale differs");
const trIdx = ensureIndex(dirL, "tr");
ok(trIdx.locale === "tr", "ensureIndex: rebuilt with tr after locale change");

// === 19) newId + distill basic shape ===
ok(typeof newId() === "string" && newId().startsWith("ber_"), "newId: starts with ber_");
const dShape = distill(readRecords(dir4));
ok(dShape && Array.isArray(dShape.conflicts) && Array.isArray(dShape.chains), "distill: returns conflicts + chains");

// === 20) schema: validation + normalizeTags ===
const vBad = validateRecord({ type: "nonsense", title: "", content: "x" });
ok(vBad.ok === false, "validateRecord: bad type + empty title rejected");
ok(vBad.errors.length >= 2, "validateRecord: at least 2 errors");
const vGood = validateRecord({ type: "decision", title: "Valid title", content: "content", tags: ["a"] });
ok(vGood.ok === true && vGood.errors.length === 0, "validateRecord: valid record accepted");
ok(TYPES.includes("decision") && TYPES.length === 5, "schema: 5 types");
const nt1 = normalizeTags("a, b ,c");
ok(nt1.length === 3 && nt1[0] === "a" && nt1[2] === "c", "normalizeTags: comma string trimmed to array");
const nt2 = normalizeTags([" x ", "", "y"]);
ok(nt2.length === 2 && nt2[0] === "x" && nt2[1] === "y", "normalizeTags: array trimmed, empties dropped");
// localized validation message
const tTrV = makeT("tr");
const vTr = validateRecord({ type: "x", title: "ok", content: "c" }, tTrV);
ok(vTr.errors[0].includes("Geçersiz tip"), "validateRecord: localized (tr) error message");

// === 21) supersession lifecycle ===
const dirSup = mk("bernard-sup-");
const oldDec = appendRecord(dirSup, { type: "decision", title: "use iyzico", content: "payment via iyzico", tags: ["payment"] });
const newDec = appendRecord(dirSup, { type: "decision", title: "switched to Param", content: "payment via Param, better fees", tags: ["payment"] });
const upd = updateRecord(dirSup, oldDec.id, { invalid: true, superseded_by: newDec.id });
ok(upd && upd.invalid === true && upd.superseded_by === newDec.id, "supersession: old invalid + superseded_by set");
const supRes = retrieve("payment", readRecords(dirSup), { maxResults: 8 });
ok(!supRes.some((x) => x.record.id === oldDec.id), "supersession: invalid record not in results");
ok(supRes.some((x) => x.record.id === newDec.id), "supersession: replacement in results");

// === 22) distill enrichment: keep newest, toInvalidate has old, conflict shape ===
const dirDist = mk("bernard-dist-");
const distOld = appendRecord(dirDist, { type: "decision", title: "use redis", content: "cache redis", tags: ["cache"], created: "2021-01-01T00:00:00.000Z" });
const distNew = appendRecord(dirDist, { type: "decision", title: "use memcached", content: "cache memcached", tags: ["cache"], created: "2024-01-01T00:00:00.000Z" });
const dRes = distill(readRecords(dirDist));
ok(dRes.conflicts.length === 1, "distill: one conflict group found");
ok(dRes.conflicts[0].keep === distNew.id, "distill: keep is newest");
ok(dRes.conflicts[0].toInvalidate.includes(distOld.id), "distill: toInvalidate has old record");

// === 23) i18n: translation, interpolation, fallback, precedence ===
const tEn = makeT("en");
const tTr = makeT("tr");
ok(tEn("list.total", { n: 3 }) === "Total: 3 record(s)", "i18n(en): interpolation");
ok(tTr("list.total", { n: 3 }) === "Toplam: 3 kayıt", "i18n(tr): interpolation");
ok(tEn("nope.key") === "nope.key", "i18n: unknown key returns the key");
ok(makeT("xx")("list.none") === tEn("list.none"), "i18n: unknown locale falls back to en");
delete process.env.BERNARD_LOCALE;
ok(resolveLocale({}) === "en", "resolveLocale: default en");
ok(resolveLocale({ flag: "tr" }) === "tr", "resolveLocale: flag honored");
ok(resolveLocale({ config: "tr" }) === "tr", "resolveLocale: config honored");
ok(resolveLocale({ flag: "xx" }) === "en", "resolveLocale: unknown flag -> en");
process.env.BERNARD_LOCALE = "tr";
ok(resolveLocale({}) === "tr", "resolveLocale: env honored");
ok(resolveLocale({ flag: "en" }) === "en", "resolveLocale: flag beats env");
ok(resolveLocale({ config: "en" }) === "tr", "resolveLocale: env beats config");
delete process.env.BERNARD_LOCALE;

// === 24) git util: recentCommits + isGitRepo (English fields) ===
let hasGit = true;
try {
  execFileSync("git", ["--version"], { stdio: "ignore" });
} catch {
  hasGit = false;
}
if (hasGit) {
  const gitRepo = tempGitRepo();
  fs.writeFileSync(path.join(gitRepo, "file.txt"), "hello\n");
  execFileSync("git", ["add", "."], { cwd: gitRepo });
  execFileSync("git", ["commit", "-q", "-m", "feat: first commit"], { cwd: gitRepo });
  ok(isGitRepo(gitRepo) === true, "isGitRepo: fresh repo true");
  const commits = recentCommits(gitRepo, 5);
  ok(commits.length >= 1, "recentCommits: at least 1 commit");
  ok(commits[0].title === "feat: first commit", "recentCommits: title matches");
  ok(Array.isArray(commits[0].files) && commits[0].files.includes("file.txt"), "recentCommits: changed file listed");
  ok(typeof commits[0].shortHash === "string" && commits[0].shortHash.length > 0, "recentCommits: shortHash present");
  ok(isGitRepo(path.join(os.tmpdir(), "bernard-not-a-repo-xyz")) === false, "isGitRepo: non-repo false");
} else {
  for (let i = 0; i < 6; i++) ok(true, "git util: git missing, skipped");
}

// === 25) tags command: --add creates/dedupes a synonym group ===
const dirTags = mk("bernard-tags-");
fs.mkdirSync(path.join(dirTags, ".git"), { recursive: true });
const tagsBernard = path.join(dirTags, ".bernard");
fs.mkdirSync(tagsBernard, { recursive: true });
fs.writeFileSync(
  path.join(tagsBernard, "categories.json"),
  JSON.stringify({ types: TYPES, synonyms: {} }, null, 2) + "\n"
);
{
  const oldCwd2 = process.cwd();
  const realLog2 = console.log;
  console.log = () => {};
  try {
    process.chdir(dirTags);
    await tagsCmd({ _: [], flags: { add: "auth=login,session" } });
    await tagsCmd({ _: [], flags: { add: "auth=session,signin" } }); // dedupe test
  } finally {
    process.chdir(oldCwd2);
    console.log = realLog2;
  }
}
const tagsWritten = JSON.parse(fs.readFileSync(path.join(tagsBernard, "categories.json"), "utf8"));
ok(Array.isArray(tagsWritten.synonyms.auth), "tags: auth group created");
ok(tagsWritten.synonyms.auth.includes("login") && tagsWritten.synonyms.auth.includes("session"), "tags: login + session added");
ok(tagsWritten.synonyms.auth.filter((s) => s === "session").length === 1, "tags: session deduped");
ok(tagsWritten.synonyms.auth.includes("signin"), "tags: second add merged signin");

// === 26) CLI end-to-end (English, default locale) ===
if (hasGit) {
  const cliRepo = tempGitRepo();
  const run = (args) =>
    execFileSync(process.execPath, [binPath, ...args], { cwd: cliRepo, encoding: "utf8" });

  const initOut = run(["init"]);
  ok(typeof initOut === "string", "CLI init: exit 0");
  ok(fs.existsSync(path.join(cliRepo, ".bernard", "records.jsonl")), "CLI init: .bernard created");

  const addOut = run(["add", "--type", "decision", "--title", "We use Postgres", "--content", "Chose Postgres over MySQL for JSONB", "--tags", "db"]);
  ok(/Added:/.test(addOut), "CLI add: 'Added:' printed");
  const addId = (addOut.match(/Added:\s+(ber_\w+)/) || [])[1];
  ok(typeof addId === "string" && addId.startsWith("ber_"), "CLI add: id parsed");

  run(["add", "--type", "bug", "--title", "Token refresh race", "--content", "Fixed token refresh race condition", "--tags", "auth"]);

  const searchOut = run(["search", "postgres"]);
  ok(/result\(s\) for/.test(searchOut) && /Postgres/.test(searchOut), "CLI search: finds Postgres record");

  const invOut = run(["invalidate", addId]);
  ok(/Invalidated:/.test(invOut), "CLI invalidate: 'Invalidated:' printed");

  const statsOut = run(["stats"]);
  ok(/Memory statistics/.test(statsOut), "CLI stats: English title");
  ok(/Invalid records: 1/.test(statsOut), "CLI stats: invalid count 1");
  ok(/Total records: 2/.test(statsOut), "CLI stats: total 2");

  const search2 = run(["search", "postgres"]);
  ok(/No results found/.test(search2), "CLI search: invalidated record dropped");

  // alias check: 'ara' == 'search'
  const aliasOut = run(["ara", "token"]);
  ok(/result\(s\) for/.test(aliasOut), "CLI alias: 'ara' works like 'search'");
} else {
  for (let i = 0; i < 11; i++) ok(true, "CLI e2e: git missing, skipped");
}

// === 27) CLI i18n: --locale tr persists to config and drives later output ===
if (hasGit) {
  const trRepo = tempGitRepo();
  const run = (args, opts = {}) =>
    execFileSync(process.execPath, [binPath, ...args], { cwd: trRepo, encoding: "utf8", ...opts });

  run(["--locale", "tr", "init"]);
  const trCfg = JSON.parse(fs.readFileSync(path.join(trRepo, ".bernard", "config.json"), "utf8"));
  ok(trCfg.locale === "tr", "CLI --locale tr: config locale persisted");

  // No flag now: locale should come from config.json
  const trStats = run(["stats"]);
  ok(/Bellek istatistikleri/.test(trStats), "CLI: config-driven Turkish output");

  const trAdd = run(["add", "--type", "note", "--title", "deneme", "--content", "icerik", "--tags", "test"]);
  ok(/Eklendi:/.test(trAdd), "CLI(tr): 'Eklendi:' printed");

  // help respects --locale flag
  const trHelp = run(["--locale", "tr", "--help"]);
  ok(/Kullanım:/.test(trHelp), "CLI(tr): localized help");
} else {
  for (let i = 0; i < 4; i++) ok(true, "CLI i18n: git missing, skipped");
}

// --- summary ---
const total = pass + fail;
process.stdout.write(`${pass}/${total} passed\n`);
process.exit(fail ? 1 : 0);
