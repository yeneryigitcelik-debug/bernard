import { buildIndex, score, tokenize } from "./bm25.js";

// Expand a query with the project's synonym groups. Token-based (not substring)
// so "iz" never matches inside "deniz".
export function expandQuery(query, synonyms = {}, locale = "en") {
  const qTokens = tokenize(query, locale);
  const result = new Set(qTokens);

  // Build per-group token sets once.
  const groups = [];
  for (const key of Object.keys(synonyms || {})) {
    const list = Array.isArray(synonyms[key]) ? synonyms[key] : [];
    const groupTokens = new Set(tokenize(key, locale));
    for (const phrase of list) {
      for (const t of tokenize(phrase, locale)) groupTokens.add(t);
    }
    groups.push(groupTokens);
  }

  // For each query token in a group, add all of that group's tokens.
  for (const t of qTokens) {
    for (const groupTokens of groups) {
      if (groupTokens.has(t)) {
        for (const gt of groupTokens) result.add(gt);
      }
    }
  }

  return [...result];
}

export function retrieve(query, records, opts = {}) {
  const {
    synonyms = {},
    type = null,
    tag = null,
    maxResults = 8,
    recencyWeight = 0.3,
    invalidMode = "drop", // "drop" | "mark"
    index = null,
    halfLifeDays = 30,
    typeWeights = {},
    locale = "en",
  } = opts;

  // Full-corpus index so idf is corpus-wide and a prebuilt cache is reusable.
  const idx = index || buildIndex(records, locale);

  // Candidate set + filters.
  let candidates =
    invalidMode === "drop" ? records.filter((r) => !r.invalid) : records.slice();
  if (type) candidates = candidates.filter((r) => r.type === type);
  if (tag)
    candidates = candidates.filter(
      (r) => Array.isArray(r.tags) && r.tags.includes(tag)
    );

  const qTokens = expandQuery(query, synonyms, locale);

  const bm = (rec) => score(qTokens, idx, rec.id);
  const typeW = (rec) => (typeWeights && typeWeights[rec.type]) ?? 1.0;

  const now = Date.now();
  const ageDays = (rec) =>
    Math.max(0, (now - (Date.parse(rec.created) || now)) / 86400000);
  const recency = (rec) =>
    Math.pow(0.5, ageDays(rec) / Math.max(1e-9, halfLifeDays));

  const scored = [];
  for (const rec of candidates) {
    const b = bm(rec);
    if (b > 0) {
      const final = b * typeW(rec) + recencyWeight * recency(rec);
      scored.push({ record: rec, final });
    }
  }

  scored.sort((a, b) => {
    if (invalidMode === "mark") {
      const ai = a.record.invalid ? 1 : 0;
      const bi = b.record.invalid ? 1 : 0;
      if (ai !== bi) return ai - bi; // invalid records sort LAST
    }
    if (b.final !== a.final) return b.final - a.final; // final desc
    const at = Date.parse(a.record.created) || 0;
    const bt = Date.parse(b.record.created) || 0;
    if (bt !== at) return bt - at; // newer first
    const ai = String(a.record.id);
    const bi = String(b.record.id);
    return ai < bi ? -1 : ai > bi ? 1 : 0; // id asc
  });

  return scored.slice(0, maxResults).map((s) => ({ record: s.record, score: s.final }));
}
