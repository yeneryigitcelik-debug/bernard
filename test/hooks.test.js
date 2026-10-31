import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { makeT } from "../src/i18n/index.js";
import { legacyHook } from "../src/commands/install-hook.js";

const BIN = fileURLToPath(new URL("../bin/bernard.js", import.meta.url));
const BASE = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "bernard-hook-")));
after(() => fs.rmSync(BASE, { recursive: true, force: true }));
fs.writeFileSync(path.join(BASE, "gitconfig"), "");
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(BASE, "gitconfig"), BERNARD_LOCALE: "en" };
for (const k of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"]) delete env[k];
const EN = makeT("en")("hook.reminder");
const TR = makeT("tr")("hook.reminder");
const isWin = process.platform === "win32";

const git = (cwd, ...a) => execFileSync("git", a, { cwd, env, encoding: "utf8" }).trim();
let n = 0;
function repo() {
  const d = path.join(BASE, `r${n++}`);
  fs.mkdirSync(d);
  git(d, "init", "-q");
  git(d, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");
  fs.mkdirSync(path.join(d, ".git", "hooks"), { recursive: true });
  return d;
}
function cli(cwd, ...a) {
  const r = spawnSync(process.execPath, [BIN, "install-hook", ...a], { cwd, env, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r;
}
const hookOf = (d) => path.join(d, ".git", "hooks", "post-commit");
const read = (p) => fs.readFileSync(p, "utf8");
const isExec = (p) => isWin || (fs.statSync(p).mode & 0o111) !== 0;

test("fresh install: executable managed hook, idempotent, removable", () => {
  const d = repo();
  const h = hookOf(d);
  cli(d);
  const c = read(h);
  assert.ok(c.startsWith("#!/bin/sh\n# >>> bernard managed block >>>\n"));
  assert.ok(isExec(h));
  cli(d);
  assert.equal(read(h), c);
  cli(d, "--remove");
  assert.ok(!fs.existsSync(h));
});

test("linked worktree (.git is a file) uses the real hooks dir", () => {
  const d = repo();
  const wt = path.join(BASE, `wt${n++}`);
  git(d, "worktree", "add", "-q", "--detach", wt);
  assert.ok(fs.statSync(path.join(wt, ".git")).isFile());
  cli(wt);
  assert.ok(fs.existsSync(hookOf(d)));
  cli(wt, "--remove");
  assert.ok(!fs.existsSync(hookOf(d)));
});

test("core.hooksPath relative and absolute are respected", () => {
  const d = repo();
  git(d, "config", "core.hooksPath", "myhooks");
  cli(d);
  assert.ok(isExec(path.join(d, "myhooks", "post-commit")));
  assert.ok(!fs.existsSync(hookOf(d)));
  const abs = path.join(BASE, `abs${n++}`);
  const e = repo();
  git(e, "config", "core.hooksPath", abs);
  cli(e);
  assert.ok(fs.existsSync(path.join(abs, "post-commit")));
  cli(e, "--remove");
  assert.ok(!fs.existsSync(path.join(abs, "post-commit")));
});

for (const [name, r] of [["EN", EN], ["TR", TR]]) {
  test(`legacy ${name} generated hook is recognized and removable`, () => {
    const d = repo();
    const h = hookOf(d);
    fs.writeFileSync(h, legacyHook(r), { mode: 0o755 });
    cli(d);
    assert.equal(read(h), legacyHook(r));
    cli(d, "--remove");
    assert.ok(!fs.existsSync(h));
  });
}

test("user hooks with legacy '# bernard' text survive install and remove", () => {
  for (const c of [
    `#!/bin/sh\nmake lint\n\n  # bernard\n  echo "${EN}" 1>&2\n`,
    legacyHook(EN) + "make lint\n",
  ]) {
    const d = repo();
    const h = hookOf(d);
    fs.writeFileSync(h, c, { mode: 0o755 });
    const r = cli(d);
    assert.match(r.stdout, /bernard managed block/);
    cli(d, "--remove");
    assert.equal(read(h), c);
  }
});

test("removing managed block from mixed hook preserves custom bytes", () => {
  const d = repo();
  const h = hookOf(d);
  cli(d);
  const block = read(h).slice("#!/bin/sh\n".length);
  fs.rmSync(h);
  const pre = "#!/bin/bash\r\nset -e\n";
  const post = "echo after  \n\tdone";
  fs.writeFileSync(h, pre + block + post, { mode: 0o755 });
  cli(d);
  assert.equal(read(h), pre + block + post);
  cli(d, "--remove");
  assert.equal(read(h), pre + post);
  assert.ok(isExec(h));
});

test("symlinked hook is refused for install and remove", { skip: isWin }, () => {
  const d = repo();
  const h = hookOf(d);
  const target = path.join(BASE, `tgt${n++}`);
  fs.writeFileSync(target, legacyHook(EN));
  fs.symlinkSync(target, h);
  cli(d);
  cli(d);
  cli(d, "--remove");
  assert.ok(fs.lstatSync(h).isSymbolicLink());
  assert.equal(read(target), legacyHook(EN));
});
