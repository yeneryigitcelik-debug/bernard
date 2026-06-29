// BM25 — dependency-free. Index is a JSON-serializable plain object.
// Tokenization is locale-aware: Turkish gets a conservative stemmer, English
// gets lowercase + split with no stemming (BM25 + synonyms carry the recall).

const K1 = 1.5;
const B = 0.75;

const MIN_STEM = 4;

// Turkish suffixes — longest first so the longest match is stripped first.
// Operates on a single, already-lowercased (tr-TR) token. Bare single-vowel
// suffixes (a/e/ı/i/u/ü) are marked so they only strip at a higher floor,
// to avoid eating a root vowel.
const SUFFIXES = [
  // 4 letters — plural + possessive/case combinations
  { s: "ları" }, { s: "leri" },
  { s: "ların" }, { s: "lerin" },
  { s: "ımız" }, { s: "imiz" }, { s: "umuz" }, { s: "ümüz" },
  // 3 letters
  { s: "lar" }, { s: "ler" },
  { s: "ını" }, { s: "ini" }, { s: "unu" }, { s: "ünü" },
  { s: "nın" }, { s: "nin" }, { s: "nun" }, { s: "nün" },
  { s: "dan" }, { s: "den" }, { s: "tan" }, { s: "ten" },
  // 2 letters
  { s: "da" }, { s: "de" }, { s: "ta" }, { s: "te" },
  { s: "ın" }, { s: "in" }, { s: "un" }, { s: "ün" },
  { s: "ım" }, { s: "im" }, { s: "um" }, { s: "üm" },
  // bare single vowel — only stripped when the remaining root > MIN_STEM
  { s: "ı", bareVowel: true }, { s: "i", bareVowel: true },
  { s: "u", bareVowel: true }, { s: "ü", bareVowel: true },
  { s: "a", bareVowel: true }, { s: "e", bareVowel: true },
];

// Conservative Turkish stemmer.
export function stemTr(token) {
  let stem = String(token);
  if (stem.length < MIN_STEM) return stem;

  let changed = true;
  while (changed) {
    changed = false;
    for (const { s, bareVowel } of SUFFIXES) {
      const remaining = stem.length - s.length;
      // General floor: remaining root must be at least MIN_STEM.
      // Bare single vowels use a higher floor to protect the root vowel.
      const floor = bareVowel ? MIN_STEM + 1 : MIN_STEM;
      if (remaining < floor) continue;
      if (stem.endsWith(s)) {
        stem = stem.slice(0, remaining);
        changed = true;
        break;
      }
    }
  }
  return stem;
}

// Locale-aware stem dispatch. English is intentionally identity.
export function stem(token, locale = "en") {
  return locale === "tr" ? stemTr(token) : String(token);
}

export function tokenize(text, locale = "en") {
  const lower =
    locale === "tr"
      ? String(text).toLocaleLowerCase("tr-TR")
      : String(text).toLowerCase();
  const tokens = lower.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 0);
  return locale === "tr" ? tokens.map(stemTr) : tokens;
}

export function recordText(record) {
  const title = record?.title ?? "";
  const content = record?.content ?? "";
  const tags = record?.tags || [];
  return `${title} ${content} ${tags.join(" ")}`;
}

export function buildIndex(records, locale = "en") {
  const docs = [];
  const df = {};
  let totalLen = 0;

  for (const record of records) {
    const tokens = tokenize(recordText(record), locale);
    const tf = {};
    for (const tok of tokens) tf[tok] = (tf[tok] || 0) + 1;
    const len = tokens.length;
    totalLen += len;
    for (const term of Object.keys(tf)) df[term] = (df[term] || 0) + 1;
    docs.push({ id: record.id, len, tf });
  }

  const N = docs.length;
  const avgdl = N > 0 ? totalLen / N : 0;

  // locale is recorded so a cached index can be invalidated on locale change.
  return { N, avgdl, df, docs, locale };
}

export function score(queryTokens, index, docId) {
  if (!index || !Array.isArray(index.docs)) return 0;
  const doc = index.docs.find((d) => d.id === docId);
  if (!doc) return 0;

  const { N, avgdl, df } = index;
  const uniqueTerms = [...new Set(queryTokens)];

  let total = 0;
  for (const term of uniqueTerms) {
    const f = doc.tf[term];
    if (!f) continue;
    const n = df[term] || 0;
    const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
    const denom = f + K1 * (1 - B + B * (avgdl > 0 ? doc.len / avgdl : 0));
    total += idf * ((f * (K1 + 1)) / denom);
  }

  return total;
}
