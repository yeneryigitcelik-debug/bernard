import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { appendRecord, appendSuperseding, updateRecord, readRawRecords, readSnapshot, readRecords, parseLines, acquireStoreLock, releaseStoreLock } from '../src/core/store.js';
import { ensureIndex, INDEX_VERSION } from '../src/core/index-cache.js';
import { buildIndex } from '../src/core/bm25.js';
import { retrieve } from '../src/core/retrieve.js';
import { recentCommits, commitDiff } from '../src/util/git.js';
import { distill } from '../src/core/distill.js';

const BIN = fileURLToPath(new URL('../bin/bernard.js', import.meta.url));
const env = { ...process.env, GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:'/dev/null', GIT_AUTHOR_NAME:'fixture', GIT_AUTHOR_EMAIL:'test@example.invalid', GIT_COMMITTER_NAME:'fixture', GIT_COMMITTER_EMAIL:'test@example.invalid', NO_COLOR:'1', BERNARD_LOCALE:'en' };
const rec = (id, more={}) => ({id,type:'decision',title:'postgres decision',content:'postgres durability',tags:['db'],created:'2024-01-01T00:00:00Z',invalid:false,superseded_by:null,source:'manual',...more});
const line = (r,eol='\n') => JSON.stringify(r)+eol;
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'bernard-integrity-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const git = (...args)=> { const r=spawnSync('git',args,{cwd:root,env,encoding:'utf8'}); assert.equal(r.status,0,r.stderr); return r.stdout.trim(); };
  git('init','-q','-b','main');
  const cli=(...args)=>spawnSync(process.execPath,[BIN,...args],{cwd:root,env,encoding:'utf8',timeout:10000});
  assert.equal(cli('init').status,0);
  const dir=path.join(root,'.bernard'), file=path.join(dir,'records.jsonl');
  return {root,dir,file,git,cli};
}

test('real Git union merge cannot resurrect invalidated memory; old cache is rebuilt', (t)=>{
  const {dir,file,git}=fixture(t);
  fs.writeFileSync(file,line(rec('ber_A')));git('add','.');git('commit','-qm','base');
  git('checkout','-qb','invalidate');updateRecord(dir,'ber_A',{invalid:true});git('add','.');git('commit','-qm','invalidate');
  git('checkout','-q','main');appendRecord(dir,rec('ber_B'));git('add','.');git('commit','-qm','append');git('merge','--no-edit','invalidate');
  const before=readRawRecords(dir);
  const physical=before.toString().trim().split('\n').map(JSON.parse);
  assert.equal(physical.filter(r=>r.id==='ber_A').length,2,'Git actually duplicated the ID');
  const snap=readSnapshot(dir);
  assert.equal(snap.records.length,2);
  assert.equal(snap.records.find(r=>r.id==='ber_A').invalid,true);
  const old=buildIndex(physical,'en');old.version=2;old.source={fingerprint:snap.fingerprint};
  fs.mkdirSync(path.join(dir,'.cache'),{recursive:true});fs.writeFileSync(path.join(dir,'.cache/index.json'),JSON.stringify(old));
  const idx=ensureIndex(dir,'en',snap);
  assert.equal(INDEX_VERSION,3);assert.equal(idx.version,3);assert.equal(idx.N,2);
  assert.ok(!retrieve('postgres',snap.records,{index:idx,locale:'en'}).some(r=>r.record.id==='ber_A'));
  assert.ok(readRawRecords(dir).equals(before),'reads never repair merged rows');
});

test('duplicate permutations are monotone; conflicting active IDs quarantine and fail updates without changing bytes', (t)=>{
  const {dir,file}=fixture(t);
  const a=rec('ber_A'), invalid=rec('ber_A',{invalid:true,superseded_by:'ber_B'}), b=rec('ber_B');
  for (const rows of [[a,invalid,b],[invalid,a,b],[b,a,invalid],[b,invalid,a]]) {
    fs.writeFileSync(file,rows.map(r=>line(r)).join(''));
    assert.equal(readSnapshot(dir).records.find(r=>r.id==='ber_A').invalid,true);
  }
  const legacy = { ...a, invalid:true }; delete legacy.superseded_by;
  fs.writeFileSync(file, [invalid,legacy,b].map(r=>line(r)).join(''));
  assert.equal(readSnapshot(dir).records.find(r=>r.id==='ber_A').superseded_by,'ber_B','explicit provenance wins over omitted legacy field');
  const raw=Buffer.from(line(a,'\r\n')+'{bad\n'+line({...a,content:'different branch choice'})+line(b));fs.writeFileSync(file,raw);
  const snapshot=readSnapshot(dir);
  assert.deepEqual(snapshot.records.map(r=>r.id),['ber_B']);
  assert.deepEqual(snapshot.duplicates,[{id:'ber_A',lineNos:[1,3],identical:false,quarantined:true}]);
  assert.throws(()=>updateRecord(dir,'ber_A',{title:'edit'}), e=>e.code==='EBERNARD_INVALID_RECORD'&&/doctor/.test(e.message));
  assert.throws(()=>appendRecord(dir,a), e=>e.code==='EBERNARD_INVALID_RECORD');
  assert.ok(readRawRecords(dir).equals(raw));
});

test('explicit patch reaches identical copies and preserves CRLF, unknown fields and unrelated invalid bytes', (t)=>{
  const {dir,file}=fixture(t);
  const a=rec('ber_A',{future:{keep:true}});
  const middle=Buffer.from([0xff,0x0a]);
  fs.writeFileSync(file,Buffer.concat([Buffer.from(line(a,'\r\n')),middle,Buffer.from(line(a,''))]));
  updateRecord(dir,'ber_A',{content:'explicit change'});
  const raw=readRawRecords(dir), parsed=parseLines(raw);
  assert.equal(parsed.lines.length,3);
  assert.ok(parsed.lines[1].seg.equals(middle));
  assert.ok(parsed.lines[0].seg.toString().endsWith('\r\n'));
  assert.equal(parsed.lines[2].seg.at(-1),125,'unterminated copy remains unterminated');
  for(const {rec:r} of parsed.lines.filter(l=>l.rec)) { assert.equal(r.content,'explicit change');assert.deepEqual(r.future,{keep:true});assert.equal(r.created,a.created); }
});

test('CLI invalidation retry preserves provenance and valueless --by is rejected', (t)=>{
  const {dir,file,cli}=fixture(t);fs.writeFileSync(file,line(rec('ber_A'))+line(rec('ber_B')));
  assert.equal(cli('invalidate','ber_A','--by','ber_B').status,0);
  assert.equal(cli('invalidate','ber_A').status,0);
  assert.equal(readRecords(dir).find(r=>r.id==='ber_A').superseded_by,'ber_B');
  const raw=readRawRecords(dir);assert.equal(cli('invalidate','ber_A','--by').status,1);assert.ok(readRawRecords(dir).equals(raw));
});

test('read operations do not initialize a missing store; CLI add compatibility is explicit', (t)=>{
  const {dir,cli}=fixture(t);fs.rmSync(dir,{recursive:true});
  assert.equal(ensureIndex(dir).N,0);assert.equal(fs.existsSync(dir),false);
  assert.equal(cli('search','postgres').status,0);assert.equal(fs.existsSync(dir),false);
  fs.mkdirSync(dir);assert.equal(ensureIndex(dir).N,0);assert.equal(fs.existsSync(path.join(dir,'.cache')),false);
  fs.writeFileSync(path.join(dir,'config.json'),'null');fs.writeFileSync(path.join(dir,'categories.json'),'null');
  assert.equal(cli('search','postgres').status,0,'damaged settings do not crash empty read');
  fs.rmSync(dir,{recursive:true});
  const add=cli('add','--type','note','--title','Legacy add','--content','fixture');
  assert.equal(add.status,0);assert.match(add.stderr,/init/);assert.ok(fs.existsSync(path.join(dir,'records.jsonl')));
});

test('superseding append is a single atomic write and lock/rename failures leave no partial record', (t)=>{
  const {dir,file}=fixture(t);fs.writeFileSync(file,line(rec('ber_A',{future:7}),'\r\n')+'{bad\n');
  const before=readRawRecords(dir), lock=acquireStoreLock(dir);
  try {assert.throws(()=>appendSuperseding(dir,rec('ber_B'),'ber_A',{lockTimeoutMs:0}),e=>e.code==='EBERNARD_LOCK_TIMEOUT');assert.ok(readRawRecords(dir).equals(before));}
  finally {releaseStoreLock(lock);}
  const orig=fs.renameSync;
  const mocked=t.mock.method(fs,'renameSync',(from,to)=>{if(path.resolve(to)===path.resolve(file)){const e=new Error('fixture EIO');e.code='EIO';throw e;}return orig(from,to);});
  assert.throws(()=>appendSuperseding(dir,rec('ber_B'),'ber_A'));
  assert.ok(readRawRecords(dir).equals(before));mocked.mock.restore();
  const added=appendSuperseding(dir,rec('ber_B'),'ber_A');assert.equal(added.id,'ber_B');
  const rows=readRecords(dir);assert.equal(rows.find(r=>r.id==='ber_A').superseded_by,'ber_B');assert.equal(rows.find(r=>r.id==='ber_A').future,7);
  assert.ok(readRawRecords(dir).includes(Buffer.from('\r\n{bad\n')));
  const final=readRawRecords(dir);
  assert.throws(()=>appendSuperseding(dir,rec('ber_C',{superseded_by:'ber_B'}),'ber_B'),e=>e.code==='EBERNARD_INVALID_RECORD');
  assert.ok(readRawRecords(dir).equals(final),'prospective cycle rejected');
});

test('tags refuse corrupt or malformed categories and preserve unknown valid fields', (t)=>{
  const {dir,cli}=fixture(t), file=path.join(dir,'categories.json');
  for(const raw of [Buffer.from('{bad\r\n'),Buffer.from('{"types":[],"synonyms":[]}'),Buffer.from('{"types":[],"synonyms":{"x":4}}'),Buffer.from([123,34,120,34,58,34,255,34,125])]) {
    fs.writeFileSync(file,raw);assert.equal(cli('tags','--add','auth=login').status,1);assert.ok(fs.readFileSync(file).equals(raw));
  }
  const data={types:['note'],synonyms:{},future:{keep:1}};fs.writeFileSync(file,JSON.stringify(data));
  assert.equal(cli('tags','--add','__proto__=x').status,0);const saved=JSON.parse(fs.readFileSync(file));assert.deepEqual(saved.future,{keep:1});assert.deepEqual(saved.synonyms.__proto__,['x']);
});

test('parallel synonym edits are serialized instead of overwriting each other', {timeout:20000}, async(t)=>{
  const {root,dir}=fixture(t);
  const children=Array.from({length:6},(_,i)=>spawn(process.execPath,[BIN,'tags','--add',`group${i}=value${i}`],{cwd:root,env,stdio:'ignore'}));
  t.after(()=>children.forEach(c=>{if(c.exitCode===null)c.kill('SIGKILL');}));
  const statuses=await Promise.all(children.map(c=>once(c,'exit')));assert.ok(statuses.every(([status])=>status===0));
  const data=JSON.parse(fs.readFileSync(path.join(dir,'categories.json')));for(let i=0;i<6;i++)assert.deepEqual(data.synonyms[`group${i}`],[`value${i}`]);
});

test('distill excludes untagged notes and bug events and compares dates chronologically', ()=>{
  assert.equal(distill([rec('a',{type:'note',tags:[]}),rec('b',{type:'note',tags:[]})]).conflicts.length,0);
  assert.equal(distill([rec('a',{type:'bug'}),rec('b',{type:'bug'})]).conflicts.length,0);
  const group=distill([rec('a',{created:'2024-01-01T00:00:00Z'}),rec('b',{created:'2024-01-01T00:00:00.001Z'})]).conflicts[0];assert.equal(group.keep,'b');
  assert.equal(distill([rec('a',{tags:['a,b']}),rec('b',{tags:['a','b']})]).conflicts.length,0);
});

test('Git metadata preserves merge/empty bodies and NUL-delimited file names; diffs announce truncation', (t)=>{
  const {root,git}=fixture(t);
  fs.writeFileSync(path.join(root,'first.txt'),'one');git('add','.');git('commit','-qm','first');
  git('checkout','-qb','side');fs.writeFileSync(path.join(root,'odd\nfile.txt'),'side');git('add','.');git('commit','-qm','side');
  git('checkout','-q','main');fs.writeFileSync(path.join(root,'other.txt'),'main');git('add','.');git('commit','-qm','main');
  git('merge','--no-ff','side','-m','merge title','-m','Body first paragraph\n\nBody second paragraph');
  git('commit','--allow-empty','-qm','empty title','-m','Empty body\n\nFinal paragraph');
  const commits=recentCommits(root,5);assert.equal(commits.length,5);
  assert.equal(commits[0].body,'Empty body\n\nFinal paragraph');assert.deepEqual(commits[0].files,[]);
  assert.equal(commits[1].body,'Body first paragraph\n\nBody second paragraph');assert.deepEqual(commits[1].files,[]);
  assert.ok(commits.find(c=>c.title==='side').files.includes('odd\nfile.txt'));
  fs.writeFileSync(path.join(root,'large.txt'),'large fixture\n'.repeat(900));git('add','.');git('commit','-qm','large');
  assert.match(commitDiff(root,git('rev-parse','HEAD')),/\[truncated at 4000 chars\]$/);
});


test('supersession validation inspects ambiguous intermediate copies instead of hiding a cycle', (t)=>{
  const {dir,file}=fixture(t);
  const a=rec('a'), b1=rec('b',{invalid:true,superseded_by:'a'}), b2=rec('b',{invalid:true,superseded_by:'c'}), c=rec('c');
  fs.writeFileSync(file,[a,b1,b2,c].map(r=>line(r)).join(''));
  const before=readRawRecords(dir);
  assert.throws(()=>updateRecord(dir,'a',{invalid:true,superseded_by:'b'}),e=>e.code==='EBERNARD_INVALID_RECORD');
  assert.ok(readRawRecords(dir).equals(before));
});


test('valueless --supersedes never silently appends an ordinary record', (t)=>{
  const {dir,file,cli}=fixture(t);fs.writeFileSync(file,line(rec('ber_A')));
  const before=readRawRecords(dir);
  for (const flag of ['--supersedes','--supersedes=']) {
    const result=cli('add','--type','note','--title','Replacement','--content','fixture',flag);
    assert.equal(result.status,1);assert.match(result.stderr,/--supersedes/);assert.ok(readRawRecords(dir).equals(before));
  }
});
