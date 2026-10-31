import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { init } from "../src/commands/init.js";
import { bernardDir } from "../src/core/paths.js";

function makeRepo() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "bernard-init-")));
  fs.mkdirSync(path.join(root, ".git"));
  return root;
}

async function runInit(root) {
  const origCwd = process.cwd();
  const origLog = console.log;
  const origErr = console.error;
  const origWarn = console.warn;
  const origInfo = console.info;
  const out = [];
  const sink = (...a) => out.push(a.join(" "));
  try {
    process.chdir(root);
    console.log = sink;
    console.error = sink;
    console.warn = sink;
    console.info = sink;
    const result = await init({ flags: { locale: "en" } });
    return { result, out: out.join("\n") };
  } finally {
    console.log = origLog;
    console.error = origErr;
    console.warn = origWarn;
    console.info = origInfo;
    process.chdir(origCwd);
  }
}

const NAMES = ["records.jsonl", "categories.json", "config.json"];

test("init creates missing files and gitignore/gitattributes", async () => {
  const root = makeRepo();
  try {
    const { result } = await runInit(root);
    const dir = bernardDir(root);
    for (const n of NAMES) {
      assert.ok(fs.existsSync(path.join(dir, n)), n);
      assert.ok(result.created.includes(`.bernard/${n}`));
    }
    assert.equal(fs.readFileSync(path.join(dir, "records.jsonl"), "utf8"), "");
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8"));
    assert.equal(cfg.locale, "en");
    JSON.parse(fs.readFileSync(path.join(dir, "categories.json"), "utf8"));
    assert.equal(fs.readFileSync(path.join(root, ".gitignore"), "utf8"), ".bernard/.cache/\n");
    assert.equal(
      fs.readFileSync(path.join(root, ".gitattributes"), "utf8"),
      ".bernard/records.jsonl merge=union\n"
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("init is idempotent and preserves existing gitignore/gitattributes content", async () => {
  const root = makeRepo();
  try {
    fs.writeFileSync(path.join(root, ".gitignore"), "node_modules");
    fs.writeFileSync(path.join(root, ".gitattributes"), "*.png binary\n");
    await runInit(root);
    const dir = bernardDir(root);
    const snap = Object.fromEntries(NAMES.map((n) => [n, fs.readFileSync(path.join(dir, n))]));
    const gi1 = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
    const ga1 = fs.readFileSync(path.join(root, ".gitattributes"), "utf8");
    assert.equal(gi1, "node_modules\n.bernard/.cache/\n");
    assert.equal(ga1, "*.png binary\n.bernard/records.jsonl merge=union\n");

    const { result, out } = await runInit(root);
    assert.equal(result.created.length, 0);
    for (const n of NAMES) {
      assert.ok(result.skipped.includes(`.bernard/${n}`));
      assert.ok(out.includes(`  - .bernard/${n}`));
      assert.deepEqual(fs.readFileSync(path.join(dir, n)), snap[n]);
    }
    assert.equal(fs.readFileSync(path.join(root, ".gitignore"), "utf8"), gi1);
    assert.equal(fs.readFileSync(path.join(root, ".gitattributes"), "utf8"), ga1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("concurrent writer creating files right before create attempt is never overwritten", async () => {
  const root = makeRepo();
  const realWrite = fs.writeFileSync;
  try {
    const dir = bernardDir(root);
    const originals = {
      [path.join(dir, "records.jsonl")]: '{"id":"r1","text":"concurrent"}\n',
      [path.join(dir, "categories.json")]: '{"types":["custom"],"synonyms":{}}\n',
      [path.join(dir, "config.json")]: '{"project":"other-writer","locale":"en"}\n',
    };
    const raced = new Set();
    fs.writeFileSync = function (p, data, opts) {
      const key = typeof p === "string" ? path.resolve(p) : p;
      if (typeof key === "string" && key in originals && !raced.has(key)) {
        raced.add(key);
        // Simulate a concurrent CLI/MCP writer winning the race after any check.
        realWrite.call(fs, key, originals[key], "utf8");
      }
      return realWrite.call(fs, p, data, opts);
    };

    const { result, out } = await runInit(root);
    fs.writeFileSync = realWrite;

    assert.equal(raced.size, 3, "all three create attempts were intercepted");
    for (const [p, bytes] of Object.entries(originals)) {
      assert.equal(fs.readFileSync(p, "utf8"), bytes);
      const rel = `.bernard/${path.basename(p)}`;
      assert.ok(result.skipped.includes(rel), rel);
      assert.ok(!result.created.includes(rel));
      assert.ok(out.includes(`  - ${rel}`));
    }
  } finally {
    fs.writeFileSync = realWrite;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
