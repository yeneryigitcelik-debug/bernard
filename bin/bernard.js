#!/usr/bin/env node
// bernard CLI entry point — routes subcommands (English names + Turkish aliases).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../src/util/args.js";
import { log } from "../src/util/log.js";
import { makeT, resolveLocale } from "../src/i18n/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Expected, user-actionable failures: print the localized message only.
const EXPECTED_CODES = new Set(["EBERNARD_INVALID_RECORD", "EBERNARD_LOCK_TIMEOUT"]);

// alias -> [module path (relative to this file), export name]
const ROUTES = {
  init: ["../src/commands/init.js", "init"],
  add: ["../src/commands/add.js", "add"],
  ekle: ["../src/commands/add.js", "add"],
  search: ["../src/commands/search.js", "search"],
  ara: ["../src/commands/search.js", "search"],
  list: ["../src/commands/list.js", "list"],
  listele: ["../src/commands/list.js", "list"],
  invalidate: ["../src/commands/invalidate.js", "invalidate"],
  gecersiz: ["../src/commands/invalidate.js", "invalidate"],
  distill: ["../src/commands/distill.js", "distillCmd"],
  damit: ["../src/commands/distill.js", "distillCmd"],
  suggest: ["../src/commands/suggest.js", "suggest"],
  oner: ["../src/commands/suggest.js", "suggest"],
  "install-hook": ["../src/commands/install-hook.js", "installHook"],
  "kanca-kur": ["../src/commands/install-hook.js", "installHook"],
  stats: ["../src/commands/stats.js", "stats"],
  istatistik: ["../src/commands/stats.js", "stats"],
  tags: ["../src/commands/tags.js", "tags"],
  etiketler: ["../src/commands/tags.js", "tags"],
  doctor: ["../src/commands/doctor.js", "doctor"],
  doktor: ["../src/commands/doctor.js", "doctor"],
  show: ["../src/commands/show.js", "show"],
  goster: ["../src/commands/show.js", "show"],
  mcp: ["../src/mcp/server.js", "startServer"],
};

function getVersion() {
  try {
    const pkg = JSON.parse(readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// Extract a global --locale/--lang flag from anywhere in argv, set the env var,
// and return argv without those tokens. Lets the flag appear before or after the
// subcommand (e.g. `bernard --locale tr init` or `bernard init --locale tr`).
function extractLocale(argv) {
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--locale" || a === "--lang") {
      const v = argv[i + 1];
      if (v !== undefined && !v.startsWith("--")) {
        process.env.BERNARD_LOCALE = v;
        i++;
      }
      continue;
    }
    if (a.startsWith("--locale=") || a.startsWith("--lang=")) {
      process.env.BERNARD_LOCALE = a.slice(a.indexOf("=") + 1);
      continue;
    }
    rest.push(a);
  }
  return rest;
}

function printHelp() {
  const t = makeT(resolveLocale({}));
  console.log(t("help.text"));
}

async function main() {
  const argv = extractLocale(process.argv.slice(2));
  const [sub, ...rest] = argv;
  const parsed = parseArgs(rest);

  if (!sub || sub === "--help" || sub === "-h") {
    if (parsed.flags.version) {
      console.log(getVersion());
      return;
    }
    printHelp();
    return;
  }
  if (sub === "--version" || sub === "-v") {
    console.log(getVersion());
    return;
  }
  if (parsed.flags.help) {
    printHelp();
    return;
  }
  if (parsed.flags.version) {
    console.log(getVersion());
    return;
  }

  const route = ROUTES[sub];
  if (!route) {
    const t = makeT(resolveLocale({}));
    log.error(t("cli.unknownCommand", { sub }));
    printHelp();
    process.exitCode = 1;
    return;
  }

  const [modPath, exportName] = route;
  const mod = await import(modPath);
  await mod[exportName](parsed);
}

main().catch((err) => {
  if (err && EXPECTED_CODES.has(err.code)) log.error(String(err.message));
  else log.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
});
