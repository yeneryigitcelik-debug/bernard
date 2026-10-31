import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN = path.resolve(__dirname, "..", "bin", "bernard.js");

const EXPECTED_TOOLS = [
  "bernard_add",
  "bernard_get",
  "bernard_invalidate",
  "bernard_list",
  "bernard_search",
  "bernard_suggest",
  "bernard_update",
];

function makeEnv(tmp) {
  const home = path.join(tmp, ".home");
  fs.mkdirSync(home, { recursive: true });
  return {
    ...getDefaultEnvironment(),
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    XDG_DATA_HOME: path.join(home, ".local", "share"),
    LANG: "en_US.UTF-8",
    LC_ALL: "en_US.UTF-8",
    LANGUAGE: "en",
    BERNARD_LANG: "en",
    BERNARD_LOCALE: "en",
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "bernard-test",
    GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "bernard-test",
    GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
}

function findFile(dir, name) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    if (e.isFile() && e.name === name) return path.join(dir, e.name);
  }
  for (const e of entries) {
    if (e.isDirectory() && e.name !== ".git" && e.name !== ".home" && e.name !== "node_modules") {
      const found = findFile(path.join(dir, e.name), name);
      if (found) return found;
    }
  }
  return null;
}

function recordsPath(tmp) {
  return findFile(tmp, "records.jsonl");
}

function readBytes(tmp) {
  const p = recordsPath(tmp);
  if (!p) return Buffer.alloc(0);
  return fs.readFileSync(p);
}

function readRecordsFile(tmp) {
  const text = readBytes(tmp).toString("utf8");
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function textOf(result) {
  return (result.content || [])
    .filter((c) => c && c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

test("bernard MCP server over real stdio", { timeout: 15000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bernard-mcp-"));
  const env = makeEnv(tmp);
  let client = null;
  let transport = null;

  try {
    // Temp git project
    const g = spawnSync("git", ["init", "-q"], { cwd: tmp, env, stdio: "ignore", timeout: 5000 });
    if (g.error || g.status !== 0) {
      fs.mkdirSync(path.join(tmp, ".git"), { recursive: true });
    }

    // bernard init
    const init = spawnSync(process.execPath, [BIN, "init"], {
      cwd: tmp,
      env,
      input: "",
      encoding: "utf8",
      timeout: 8000,
    });
    assert.equal(init.status, 0, `bernard init failed: ${init.stderr || init.stdout}`);

    // Start MCP server via real stdio transport
    transport = new StdioClientTransport({
      command: process.execPath,
      args: [BIN, "mcp"],
      cwd: tmp,
      env,
      stderr: "pipe",
    });
    const errStream = transport.stderr;
    if (errStream) errStream.on("data", () => {});

    client = new Client({ name: "bernard-test", version: "0.0.0" });
    await client.connect(transport);

    const call = (name, args) => client.callTool({ name, arguments: args });

    // Seven tools
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, EXPECTED_TOOLS);

    // Add valid A and B
    const addA = await call("bernard_add", {
      type: "decision",
      title: "Use postgres for persistence",
      content: "We chose postgres as the primary database for durability.",
      tags: ["db", "infra"],
    });
    assert.notEqual(addA.isError, true, textOf(addA));
    let recs = readRecordsFile(tmp);
    const recA = recs.find((r) => r.title === "Use postgres for persistence");
    assert.ok(recA, "record A persisted");
    assert.ok(textOf(addA).includes(recA.id), "add response contains A id");
    const idA = recA.id;

    const addB = await call("bernard_add", {
      type: "decision",
      title: "Migrate persistence to sqlite",
      content: "Replaced postgres with sqlite to simplify local setup.",
      tags: "db",
    });
    assert.notEqual(addB.isError, true, textOf(addB));
    recs = readRecordsFile(tmp);
    const recB = recs.find((r) => r.title === "Migrate persistence to sqlite");
    assert.ok(recB, "record B persisted");
    assert.ok(textOf(addB).includes(recB.id), "add response contains B id");
    const idB = recB.id;
    assert.notEqual(idA, idB);

    // Invalid updates: unknown type, blank title
    let before = readBytes(tmp);
    const badType = await call("bernard_update", { id: idA, type: "not-a-real-type-xyz" });
    assert.equal(badType.isError, true, "unknown type update must be isError");
    assert.ok(readBytes(tmp).equals(before), "file unchanged after unknown type update");

    const blankTitle = await call("bernard_update", { id: idA, title: "   " });
    assert.equal(blankTitle.isError, true, "blank title update must be isError");
    assert.ok(readBytes(tmp).equals(before), "file unchanged after blank title update");

    // Valid content-only update
    const origA = readRecordsFile(tmp).find((r) => r.id === idA);
    const upd = await call("bernard_update", {
      id: idA,
      content: "We chose postgres as the primary database; revisited durability.",
    });
    assert.notEqual(upd.isError, true, textOf(upd));
    const newA = readRecordsFile(tmp).find((r) => r.id === idA);
    assert.ok(newA);
    assert.equal(newA.content, "We chose postgres as the primary database; revisited durability.");
    assert.equal(newA.id, origA.id);
    assert.equal(newA.title, origA.title);
    assert.equal(newA.type, origA.type);
    assert.deepEqual(newA.tags, origA.tags);
    assert.equal(newA.created, origA.created);

    // "constructor" record: add / search / list
    const addC = await call("bernard_add", {
      type: "decision",
      title: "constructor injection for services",
      content: "Services receive dependencies via constructor parameters.",
      tags: ["constructor"],
    });
    assert.notEqual(addC.isError, true, textOf(addC));
    const recC = readRecordsFile(tmp).find((r) => r.title === "constructor injection for services");
    assert.ok(recC);
    const searchC = await call("bernard_search", { query: "constructor" });
    assert.notEqual(searchC.isError, true, textOf(searchC));
    assert.ok(textOf(searchC).includes(recC.id), "search finds constructor record");
    const listAll = await call("bernard_list", {});
    assert.notEqual(listAll.isError, true, textOf(listAll));
    const listText = textOf(listAll);
    assert.ok(listText.includes(recC.id));
    assert.ok(listText.includes(idA));
    assert.ok(listText.includes(idB));
    const listTag = await call("bernard_list", { tag: "constructor" });
    assert.ok(textOf(listTag).includes(recC.id));

    // Dangling / self invalidate rejected
    before = readBytes(tmp);
    const dangling = await call("bernard_invalidate", { id: idA, by: "does-not-exist-123" });
    assert.equal(dangling.isError, true, "dangling superseded_by must be isError");
    assert.ok(readBytes(tmp).equals(before), "file unchanged after dangling invalidate");

    const self = await call("bernard_invalidate", { id: idA, by: idA });
    assert.equal(self.isError, true, "self supersede must be isError");
    assert.ok(readBytes(tmp).equals(before), "file unchanged after self invalidate");

    // Valid: A superseded by B
    const inv = await call("bernard_invalidate", { id: idA, by: idB });
    assert.notEqual(inv.isError, true, textOf(inv));
    const invA = readRecordsFile(tmp).find((r) => r.id === idA);
    assert.equal(invA.invalid, true);
    assert.equal(invA.superseded_by, idB);
    const retry = await call("bernard_invalidate", { id: idA });
    assert.notEqual(retry.isError, true, textOf(retry));
    assert.equal(readRecordsFile(tmp).find((r) => r.id === idA).superseded_by, idB, "retry preserves chain");


    // Cyclic: B superseded by A rejected
    before = readBytes(tmp);
    const cyclic = await call("bernard_invalidate", { id: idB, by: idA });
    assert.equal(cyclic.isError, true, "cyclic supersede must be isError");
    assert.ok(readBytes(tmp).equals(before), "file unchanged after cyclic invalidate");

    // Search excludes A
    const searchP = await call("bernard_search", { query: "postgres persistence database" });
    assert.notEqual(searchP.isError, true, textOf(searchP));
    const spText = textOf(searchP);
    assert.ok(!spText.includes(idA), "invalidated A excluded from search");
    assert.ok(spText.includes(idB), "B still found");

    // Invalid add (blank title) rejected and flagged
    before = readBytes(tmp);
    const badAdd = await call("bernard_add", {
      type: "decision",
      title: "  ",
      content: "Should not be stored.",
    });
    assert.equal(badAdd.isError, true, "blank title add must be isError");
    assert.ok(readBytes(tmp).equals(before), "file unchanged after invalid add");
  } finally {
    let pid = null;
    try {
      pid = transport ? transport.pid : null;
    } catch {}
    try {
      if (client) await client.close();
    } catch {}
    try {
      if (transport) await transport.close();
    } catch {}
    if (pid) {
      try {
        process.kill(pid, 0);
        process.kill(pid, "SIGKILL");
      } catch {}
    }
    try {
      fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    } catch {}
  }
});


test("MCP missing-store writes fail without creating files, and duplicate diagnostics are visible to clients", { timeout: 15000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bernard-mcp-missing-"));
  const env = { ...makeEnv(tmp), BERNARD_LOCK_TIMEOUT_MS: "50" };
  let client, transport;
  try {
    spawnSync("git", ["init", "-q"], { cwd: tmp, env, stdio: "ignore" });
    transport = new StdioClientTransport({ command: process.execPath, args: [BIN, "mcp"], cwd: tmp, env, stderr: "pipe" });
    transport.stderr?.on("data", () => {});
    client = new Client({ name: "bernard-missing-test", version: "0.0.0" });
    await client.connect(transport);
    const call = (name, args) => client.callTool({ name, arguments: args });
    for (const [name,args] of [["bernard_add",{type:"note",title:"fixture",content:"test"}],["bernard_update",{id:"a",content:"test"}],["bernard_invalidate",{id:"a"}]]) {
      const result = await call(name,args); assert.equal(result.isError,true); assert.match(textOf(result),/init/);
      assert.equal(fs.existsSync(path.join(tmp,".bernard")),false);
    }
    assert.match(textOf(await call("bernard_search",{query:"fixture"})),/No results/);
    assert.match(textOf(await call("bernard_list",{})),/No records/);
    assert.equal(fs.existsSync(path.join(tmp,".bernard")),false);
    const initialized = spawnSync(process.execPath,[BIN,"init"],{cwd:tmp,env,encoding:"utf8"}); assert.equal(initialized.status,0);
    const store=path.join(tmp,".bernard"), file=path.join(store,"records.jsonl");
    const row={id:"dup",type:"note",title:"fixture",content:"one",tags:[],created:"2024-01-01T00:00:00Z",invalid:false,superseded_by:null,source:"manual"};
    const raw=JSON.stringify(row)+"\n"+JSON.stringify({...row,content:"other branch"})+"\n";
    fs.writeFileSync(file,raw);
    for (const [name,args] of [["bernard_search",{query:"fixture"}],["bernard_list",{}]]) assert.match(textOf(await call(name,args)),/doctor/);
    const update=await call("bernard_update",{id:"dup",content:"overwrite"});assert.equal(update.isError,true);assert.match(textOf(update),/doctor/);assert.equal(fs.readFileSync(file,"utf8"),raw);
    const {acquireStoreLock,releaseStoreLock}=await import("../src/core/store.js");const lock=acquireStoreLock(store);
    try {const blocked=await call("bernard_add",{type:"note",title:"blocked",content:"fixture"});assert.equal(blocked.isError,true);assert.match(textOf(blocked),/lock/);}
    finally {releaseStoreLock(lock);}
    const recovered=await call("bernard_add",{type:"note",title:"after timeout",content:"fixture"});assert.notEqual(recovered.isError,true,textOf(recovered));
  } finally {
    try {await client?.close();} catch {}
    try {await transport?.close();} catch {}
    fs.rmSync(tmp,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
});
