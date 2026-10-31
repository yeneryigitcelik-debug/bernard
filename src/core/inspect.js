// Read-only exact-ID inspection helpers. Pure: no I/O, no writes, no index use.

function hasReplacement(rec) {
  return typeof rec.superseded_by === "string" && rec.superseded_by.trim() !== "";
}

// Display state. A record with superseded_by is never reported as active,
// even when invalid is false (doctor flags that inconsistency separately).
export function recordState(rec) {
  if (!rec || typeof rec !== "object") return "invalid";
  if (rec.invalid === true) return "invalid";
  if (hasReplacement(rec)) return "replaced";
  return "active";
}

export function isActive(rec) {
  return recordState(rec) === "active";
}

export function stateLabel(rec, t) {
  const s = recordState(rec);
  if (s === "replaced") return t("inspect.stateReplaced");
  if (s === "invalid") return t("inspect.stateInvalid");
  return t("inspect.stateActive");
}

// One localized line: state plus replacement ID where present.
export function stateLine(rec, t) {
  let line = t("inspect.state", { state: stateLabel(rec, t) });
  if (rec && hasReplacement(rec)) {
    line += "  " + t("inspect.replacement", { id: String(rec.superseded_by) });
  }
  return line;
}

// Resolve an exact ID from a readSnapshot() result.
// Returns { record, problem: null | "notFound" | "ambiguous", lineNos }.
// Non-identical duplicate copies are always rejected; no winner is chosen.
export function resolveRecord(snapshot, id) {
  const wanted = typeof id === "string" ? id : "";
  const dups = (snapshot && Array.isArray(snapshot.duplicates)) ? snapshot.duplicates : [];
  const conflict = dups.find((d) => d && d.id === wanted && d.identical === false);
  if (conflict) {
    return { record: null, problem: "ambiguous", lineNos: Array.isArray(conflict.lineNos) ? conflict.lineNos.slice() : [] };
  }
  const records = (snapshot && Array.isArray(snapshot.records)) ? snapshot.records : [];
  const record = records.find((r) => r && r.id === wanted) || null;
  if (!record) return { record: null, problem: "notFound", lineNos: [] };
  return { record, problem: null, lineNos: [] };
}
