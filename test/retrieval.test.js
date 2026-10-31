import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildIndex, score, tokenize } from '../src/core/bm25.js';
import { retrieve } from '../src/core/retrieve.js';
import { ensureIndex, isStale, indexPath } from '../src/core/index-cache.js';
import { readSnapshot } from '../src/core/store.js';

const NL = String.fromCharCode(10);

function mkDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bernard-retrieval-test-'));
}

function base(id, extra = {}) {
  return {
    id,
    type: 'note',
    title: 't',
    content: '',
    tags: [],
    created: '2024-01-01T00:00:00.000Z',
    invalid: false,
    superseded_by: null,
    source: 'manual',
    ...extra,
  };
}

function writeRecords(dir, recs) {
  fs.writeFileSync(path.join(dir, 'records.jsonl'), recs.map((r) => JSON.stringify(r) + NL).join(''));
}

const finitePos = (s) => typeof s === 'number' && Number.isFinite(s) && s > 0;

test('constructor/toString/__proto__ terms score finite positive before and after JSON roundtrip', () => {
  const recs = [
    base('ber_p', { title: 'constructor toString __proto__ hasOwnProperty valueOf' }),
    base('ber_q', { title: 'plain words only' }),
  ];
  for (const locale of ['en', 'tr']) {
    const idx = buildIndex(recs, locale);
    const rt = JSON.parse(JSON.stringify(idx));
    for (const ix of [idx, rt]) {
      for (const q of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
        const toks = tokenize(q, locale);
        assert.ok(finitePos(score(toks, ix, 'ber_p')), locale + ' ' + q);
        assert.equal(score(toks, ix, 'ber_q'), 0, locale + ' ' + q + ' absent');
      }
      const res = retrieve('constructor', recs, { index: ix, locale });
      assert.equal(res.length, 1);
      assert.equal(res[0].record.id, 'ber_p');
      assert.ok(Number.isFinite(res[0].score));
    }
  }
});

test('same-size, same-mtime content replacement invalidates cache by fingerprint', () => {
  const dir = mkDir();
  try {
    writeRecords(dir, [base('ber_1', { title: 'alpha' })]);
    const file = path.join(dir, 'records.jsonl');
    const first = ensureIndex(dir, 'en');
    assert.ok(finitePos(score(tokenize('alpha'), first, 'ber_1')));
    assert.equal(isStale(dir, 'en'), false);
    const st = fs.statSync(file);
    const oldSize = st.size;
    writeRecords(dir, [base('ber_1', { title: 'omega' })]);
    fs.utimesSync(file, st.atime, st.mtime);
    assert.equal(fs.statSync(file).size, oldSize);
    assert.equal(isStale(dir, 'en'), true);
    const next = ensureIndex(dir, 'en');
    assert.ok(finitePos(score(tokenize('omega'), next, 'ber_1')));
    assert.equal(score(tokenize('alpha'), next, 'ber_1'), 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('corrupt JSON and malformed-shape cache are rebuilt', () => {
  const dir = mkDir();
  try {
    writeRecords(dir, [base('ber_1', { title: 'hello world' })]);
    ensureIndex(dir, 'en');
    fs.writeFileSync(indexPath(dir), '{');
    let idx = ensureIndex(dir, 'en');
    assert.equal(idx.N, 1);
    assert.ok(finitePos(score(tokenize('hello'), idx, 'ber_1')));
    assert.equal(isStale(dir, 'en'), false);

    const good = JSON.parse(fs.readFileSync(indexPath(dir), 'utf8'));
    const fp = good.source;
    const mut = (fn) => {
      const c = structuredClone(good);
      fn(c);
      return c;
    };
    const tk = (c) => Object.keys(c.docs[0].tf)[0];
    const dk = (c) => Object.keys(c.df)[0];
    for (const bad of [
      mut((c) => { c.docs[0].tf[tk(c)] = -1; }),
      mut((c) => { c.docs[0].tf[tk(c)] = 1.5; }),
      mut((c) => { c.docs[0].tf[tk(c)] = '1'; }),
      mut((c) => { c.df[dk(c)] = '1'; }),
      mut((c) => { c.df[dk(c)] = 2; }),
      mut((c) => { c.df[dk(c)] = -1; }),
      mut((c) => { c.docs[0].len += 1; }),
      mut((c) => { c.df.zzzextra = 1; }),
      mut((c) => { c.avgdl += 1; }),
      mut((c) => { c.N = -1; c.docs = []; }),
      { version: 2, N: 1, avgdl: 1, df: {}, docs: 'x', locale: 'en', source: fp },
      { version: 2, N: 2, avgdl: 1, df: {}, docs: [{ id: 'ber_1', len: 1, tf: {} }], locale: 'en', source: fp },
      { version: 2, N: 1, avgdl: 1, df: {}, docs: [{ id: 5, len: 1, tf: {} }], locale: 'en', source: fp },
      [],
      null,
    ]) {
      fs.writeFileSync(indexPath(dir), JSON.stringify(bad));
      idx = ensureIndex(dir, 'en');
      assert.equal(idx.N, 1);
      assert.ok(finitePos(score(tokenize('hello'), idx, 'ber_1')));
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('removing records clears index to N=0', () => {
  const dir = mkDir();
  try {
    writeRecords(dir, [base('ber_1', { title: 'one' }), base('ber_2', { title: 'two' })]);
    assert.equal(ensureIndex(dir, 'en').N, 2);
    fs.writeFileSync(path.join(dir, 'records.jsonl'), '');
    let idx = ensureIndex(dir, 'en');
    assert.equal(idx.N, 0);
    assert.equal(idx.docs.length, 0);
    writeRecords(dir, [base('ber_1', { title: 'one' })]);
    assert.equal(ensureIndex(dir, 'en').N, 1);
    fs.rmSync(path.join(dir, 'records.jsonl'));
    idx = ensureIndex(dir, 'en');
    assert.equal(idx.N, 0);
    assert.equal(idx.docs.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('read-only cache write failure still returns the computed index', (t) => {
  const dir = mkDir();
  try {
    writeRecords(dir, [base('ber_1', { title: 'cached term' }), base('ber_2', { title: 'other' })]);
    const target = path.resolve(indexPath(dir));
    const orig = fs.renameSync;
    t.mock.method(fs, 'renameSync', function (from, to) {
      if (path.resolve(String(to)) === target) {
        const e = new Error('injected EROFS');
        e.code = 'EROFS';
        throw e;
      }
      return orig.call(fs, from, to);
    });
    const idx = ensureIndex(dir, 'en');
    assert.equal(idx.N, 2);
    assert.ok(finitePos(score(tokenize('cached'), idx, 'ber_1')));
    assert.equal(fs.existsSync(indexPath(dir)), false);
    const cache = path.dirname(indexPath(dir));
    const leftovers = fs.existsSync(cache) ? fs.readdirSync(cache).filter((n) => n.endsWith('.tmp')) : [];
    assert.deepEqual(leftovers, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('index built from a provided snapshot matches its records and does not poison cache', () => {
  const dir = mkDir();
  try {
    writeRecords(dir, [base('ber_1', { title: 'alpha', content: 'old body' })]);
    const snap = readSnapshot(dir);
    writeRecords(dir, [base('ber_1', { title: 'omega', content: 'new body' })]);
    const idx = ensureIndex(dir, 'en', snap);
    assert.equal(retrieve('omega', snap.records, { index: idx, locale: 'en' }).length, 0);
    const old = retrieve('alpha', snap.records, { index: idx, locale: 'en' });
    assert.equal(old.length, 1);
    assert.equal(old[0].record.content, 'old body');
    const fresh = readSnapshot(dir);
    const next = ensureIndex(dir, 'en');
    const res = retrieve('omega', fresh.records, { index: next, locale: 'en' });
    assert.equal(res.length, 1);
    assert.equal(res[0].record.content, 'new body');
    assert.equal(retrieve('alpha', fresh.records, { index: next, locale: 'en' }).length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
