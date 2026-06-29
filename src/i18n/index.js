// Minimal, zero-dependency i18n.
// English is the default language; Turkish is available.
//
// Locale precedence (highest first):
//   1. explicit flag passed to resolveLocale({ flag })
//   2. BERNARD_LOCALE environment variable
//   3. project config (.bernard/config.json "locale")
//   4. "en" (default)
import fs from "node:fs";
import path from "node:path";

import { en } from "./en.js";
import { tr } from "./tr.js";

export const CATALOGS = { en, tr };
export const DEFAULT_LOCALE = "en";
export const LOCALES = Object.keys(CATALOGS);

// Resolve which locale to use given an optional explicit flag and config value.
export function resolveLocale({ flag, config } = {}) {
  const candidates = [flag, process.env.BERNARD_LOCALE, config, DEFAULT_LOCALE];
  for (const c of candidates) {
    if (c && CATALOGS[c]) return c;
  }
  return DEFAULT_LOCALE;
}

// Replace {placeholder} tokens with values from params.
function interpolate(str, params) {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (m, key) =>
    params[key] != null ? String(params[key]) : m
  );
}

// Build a translator bound to a locale.
// Unknown keys fall back to English, then to the key itself (never throws).
export function makeT(locale) {
  const loc = CATALOGS[locale] ? locale : DEFAULT_LOCALE;
  return function t(key, params) {
    let val = CATALOGS[loc][key];
    if (val == null) val = CATALOGS[DEFAULT_LOCALE][key];
    if (val == null) return key;
    if (typeof val === "function") return val(params || {});
    return interpolate(val, params);
  };
}

// Read the project locale from a .bernard directory's config.json (defensive).
export function localeFromConfig(dir) {
  try {
    const raw = fs.readFileSync(path.join(dir, "config.json"), "utf8");
    const cfg = JSON.parse(raw);
    return cfg && typeof cfg.locale === "string" ? cfg.locale : null;
  } catch {
    return null;
  }
}

// Convenience: a translator that respects env/config for a given .bernard dir.
export function getT(dir, flag) {
  return makeT(resolveLocale({ flag, config: dir ? localeFromConfig(dir) : null }));
}
