// distill.js — pure function: analyze records, surface conflicts and chains.
// No mutation, no deletion. Human-readable suggestions are rendered by the
// caller (so they can be localized); core returns structured data only.

export function distill(records) {
  const list = Array.isArray(records) ? records : [];

  // id -> record map (to compare `created` and find the newest).
  const byId = new Map();
  for (const rec of list) {
    if (rec && rec.id != null) byId.set(rec.id, rec);
  }

  // Group non-invalid records by type + sorted tags.
  const groups = new Map();
  for (const rec of list) {
    if (!rec || rec.invalid || rec.type === "bug") continue;
    const tags = Array.isArray(rec.tags) ? rec.tags : [];
    if (!tags.length) continue; // Sharing a type alone does not imply a conflict.
    const key = JSON.stringify([rec.type, [...tags].sort()]);
    if (!groups.has(key)) {
      groups.set(key, { type: rec.type, tags: [...tags].sort(), ids: [] });
    }
    groups.get(key).ids.push(rec.id);
  }

  // Groups with >1 record are possible conflicts.
  const conflicts = [];
  for (const g of groups.values()) {
    if (g.ids.length > 1) {
      // Keep the newest record (by `created`); suggest invalidating the rest.
      let keep = g.ids[0];
      for (const id of g.ids) {
        const a = byId.get(id);
        const b = byId.get(keep);
        const ta = a && a.created ? a.created : "";
        const tb = b && b.created ? b.created : "";
        const da = Date.parse(ta), db = Date.parse(tb);
        if (Number.isFinite(da) && Number.isFinite(db) ? da > db : ta > tb) keep = id;
      }
      const toInvalidate = g.ids.filter((id) => id !== keep);
      conflicts.push({ type: g.type, tags: g.tags, ids: g.ids, keep, toInvalidate });
    }
  }

  // Supersession chains: invalid === true && superseded_by set.
  const chains = [];
  for (const rec of list) {
    if (rec && rec.invalid === true && rec.superseded_by) {
      chains.push({ id: rec.id, superseded_by: rec.superseded_by });
    }
  }

  return { conflicts, chains };
}
