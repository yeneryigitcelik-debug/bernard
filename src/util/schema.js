// Record schema validation and tag normalization. Zero-dep: plain JS.
import { makeT } from "../i18n/index.js";

export const TYPES = ["decision", "architecture", "bug", "preference", "note"];

const SOURCES = ["manual", "agent"];

// Validate a record. Returns { ok: boolean, errors: string[] }.
// Pass a translator `t` for localized messages; defaults to English.
export function validateRecord(rec, t = makeT("en")) {
  const errors = [];

  if (rec === null || typeof rec !== "object" || Array.isArray(rec)) {
    return { ok: false, errors: [t("schema.notObject")] };
  }

  if (!TYPES.includes(rec.type)) {
    errors.push(t("schema.invalidType", { type: rec.type, types: TYPES.join(", ") }));
  }

  if (typeof rec.title !== "string" || rec.title.trim() === "") {
    errors.push(t("schema.titleRequired"));
  }

  if (typeof rec.content !== "string") {
    errors.push(t("schema.contentString"));
  }

  if (rec.tags !== undefined) {
    if (!Array.isArray(rec.tags)) {
      errors.push(t("schema.tagsArray"));
    } else if (!rec.tags.every((e) => typeof e === "string")) {
      errors.push(t("schema.tagsAllStrings"));
    }
  }

  if (rec.source !== undefined && !SOURCES.includes(rec.source)) {
    errors.push(
      t("schema.invalidSource", { source: rec.source, sources: SOURCES.join(", ") })
    );
  }

  return { ok: errors.length === 0, errors };
}

// Array OR comma-separated string -> trimmed, non-empty array.
export function normalizeTags(input) {
  let parts;
  if (Array.isArray(input)) {
    parts = input;
  } else if (typeof input === "string") {
    parts = input.split(",");
  } else {
    return [];
  }
  return parts
    .map((e) => (typeof e === "string" ? e.trim() : ""))
    .filter((e) => e !== "");
}
