// Record schema validation and tag normalization. Zero-dep: plain JS.
import { makeT } from "../i18n/index.js";

export const TYPES = ["decision", "architecture", "bug", "preference", "note"];

export const SOURCES = ["manual", "agent"];

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim() !== "";
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function checkTags(rec, errors, t) {
  if (rec.tags !== undefined) {
    if (!Array.isArray(rec.tags)) {
      errors.push(t("schema.tagsArray"));
    } else if (!rec.tags.every((e) => typeof e === "string")) {
      errors.push(t("schema.tagsAllStrings"));
    }
  }
}

// Validate a record as supplied by a user/agent (id not required).
// Returns { ok: boolean, errors: string[] }.
// Pass a translator `t` for localized messages; defaults to English.
export function validateRecord(rec, t = makeT("en")) {
  const errors = [];

  if (!isPlainObject(rec)) {
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

  checkTags(rec, errors, t);

  if (rec.source !== undefined && !SOURCES.includes(rec.source)) {
    errors.push(
      t("schema.invalidSource", { source: rec.source, sources: SOURCES.join(", ") })
    );
  }

  return { ok: errors.length === 0, errors };
}

// Validate the minimum persisted shape of a record read from / written to disk.
// Unknown fields are allowed (forward compatibility).
export function validateStoredRecord(rec, t = makeT("en")) {
  if (!isPlainObject(rec)) {
    return { ok: false, errors: [t("schema.notObject")] };
  }
  const errors = [];

  if (!isNonEmptyString(rec.id)) errors.push(t("schema.idRequired"));

  if (!TYPES.includes(rec.type)) {
    errors.push(t("schema.invalidType", { type: rec.type, types: TYPES.join(", ") }));
  }

  if (!isNonEmptyString(rec.title)) errors.push(t("schema.titleRequired"));

  if (typeof rec.content !== "string") errors.push(t("schema.contentString"));

  checkTags(rec, errors, t);

  if (
    rec.created !== undefined &&
    !(typeof rec.created === "string" && Number.isFinite(Date.parse(rec.created)))
  ) {
    errors.push(t("schema.createdInvalid"));
  }

  if (rec.invalid !== undefined && typeof rec.invalid !== "boolean") {
    errors.push(t("schema.invalidBoolean"));
  }

  if (
    rec.superseded_by !== undefined &&
    rec.superseded_by !== null &&
    !isNonEmptyString(rec.superseded_by)
  ) {
    errors.push(t("schema.supersededByInvalid"));
  }

  if (rec.source !== undefined && typeof rec.source !== "string") {
    errors.push(t("schema.sourceString"));
  }

  return { ok: errors.length === 0, errors };
}

// Validate a full candidate about to be written. Source must be a known value
// unless the caller is preserving an existing (possibly newer) source value.
export function validateWriteCandidate(rec, t = makeT("en"), { allowUnknownSource = false } = {}) {
  const res = validateStoredRecord(rec, t);
  if (
    isPlainObject(rec) &&
    !allowUnknownSource &&
    rec.source !== undefined &&
    typeof rec.source === "string" &&
    !SOURCES.includes(rec.source)
  ) {
    res.errors.push(
      t("schema.invalidSource", { source: rec.source, sources: SOURCES.join(", ") })
    );
    res.ok = false;
  }
  return res;
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
