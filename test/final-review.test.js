import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { acquireStoreLock, releaseStoreLock } from '../src/core/store.js';
import { tags } from '../src/commands/tags.js';

const BIN = fileURLToPath(new URL('../bin/bernard.js', import.meta.url));
const DISTILL = pathToFileURL(fileURLToPath(new URL('../src/commands/distill.js', import.meta.url))).href;
const env = { ...process.env, GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:'/dev/null', GIT_AUTHOR_NAME:'fixture', GIT_AUTHOR_EMAIL:'test@example.invalid', GIT_COMMITTER_NAME:'fixture', GIT_COMMITTER_EMAIL:'test@example.invalid', NO_COLOR:'1', BERNARD_LOCALE:'en' };
const rec = (id, more={}) => ({id,type:'decision',title:'postgres '+id,content:'postgres durability',tags:['db'],created:'2024-01-01T00:00:00Z',invalid:false,superseded_by:null,source:'manual',...more});
const line = (r) => JSON.stringify(r)+'\n';

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'bernard-final-')));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const r = spawnSync('git',['init','-q'],{cwd:root,env}); assert.equal(r.status,0);
  const cli=(...args)=>spawnSync(process.execPath,[BIN,...args],{cwd:root,env,encoding:'utf8',timeout:10000});
  assert.equal(cli('init').status,0);
  const dir=path.join(root,'.bernard');
  return {root,dir,file:path.join(dir,'records.jsonl'),cli};
}
const doctor=(cli)=>{const r=cli('doctor','--json');return {status:r.status,checks:JSON.parse(r.stdout).checks};};

test('ambiguous invalidation prints concise doctor hint without stack and keeps bytes', (t)=>{
  const {file,cli}=fixture(t);
  fs.writeFileSync(file,line(rec('ber_A'))+line(rec('ber_A',{invalid:true,content:'other'})));
  const before=fs.readFileSync(file);
  const r=cli('invalidate','ber_A');
  assert.equal(r.status,1);assert.match(r.stderr,/doctor/);assert.doesNotMatch(r.stderr,/\n\s+at /);
  assert.ok(fs.readFileSync(file).equals(before));
});

test('tags mutations refuse a missing store; default read stays read-only', (t)=>{
  const {dir,cli}=fixture(t);fs.rmSync(dir,{recursive:true});
  for (const args of [['--add','auth=login'],['--remove','auth']]) {
    const r=cli('tags',...args);assert.equal(r.status,1);assert.match(r.stderr,/init/);assert.equal(fs.existsSync(dir),false);
  }
  assert.equal(cli('tags').status,0);assert.equal(fs.existsSync(dir),false);
});

test('tags atomic temp file is created under ignored .cache and unknown fields survive', async (t)=>{
  const {root,dir}=fixture(t);const cat=path.join(dir,'categories.json');
  fs.writeFileSync(cat,JSON.stringify({types:['note'],synonyms:{},future:{keep:1}}));
  const seen=[];const orig=fs.renameSync;
  const mocked=t.mock.method(fs,'renameSync',(from,to)=>{if(path.resolve(to)===path.resolve(cat))seen.push(from);return orig(from,to);});
  const cwd=process.cwd(), code=process.exitCode;
  try { process.chdir(root); await tags({_:[],flags:{add:'auth=login'}}); }
  finally { process.chdir(cwd); mocked.mock.restore(); }
  assert.equal(process.exitCode,code);
  assert.equal(seen.length,1);assert.equal(path.dirname(seen[0]),path.join(dir,'.cache'));
  const saved=JSON.parse(fs.readFileSync(cat));assert.deepEqual(saved.future,{keep:1});assert.deepEqual(saved.synonyms.auth,['login']);
});

test('doctor uses effective Git ignore/attribute semantics', (t)=>{
  const {root,cli}=fixture(t);
  fs.writeFileSync(path.join(root,'.gitignore'),'**/.cache/\n');
  fs.writeFileSync(path.join(root,'.gitattributes'),'/.bernard/records.jsonl -diff merge=union\n');
  let d=doctor(cli);assert.equal(d.status,0,JSON.stringify(d.checks));
  fs.writeFileSync(path.join(root,'.gitignore'),'.bernard/.cach*\n');
  assert.equal(doctor(cli).status,0);
  fs.appendFileSync(path.join(root,'.gitattributes'),'.bernard/records.jsonl merge=binary\n');
  d=doctor(cli);assert.equal(d.status,1);assert.ok(d.checks.some(c=>c.id==='layout.gitattributes_union'));
  fs.appendFileSync(path.join(root,'.gitignore'),'!.bernard/.cache/\n');
  assert.ok(doctor(cli).checks.some(c=>c.id==='layout.gitignore_cache'));
});

test('existing unreadable files report unreadable, never missing', (t)=>{
  for (const name of ['records.jsonl','config.json','categories.json']) {
    const {dir,cli}=fixture(t);const p=path.join(dir,name);fs.rmSync(p,{force:true});fs.mkdirSync(p);
    const d=doctor(cli);assert.equal(d.status,2);
    assert.ok(d.checks.some(c=>c.id==='layout.unreadable'&&c.data.path===p),name);
    assert.ok(!d.checks.some(c=>c.id==='layout.missing_file'&&c.data.file===name),name);
  }
});

test('valueless filters fail before reads; valid filters still work', (t)=>{
  const {dir,file,cli}=fixture(t);
  fs.writeFileSync(file,line(rec('ber_A'))+line(rec('ber_N',{type:'note',title:'other note',tags:['x']})));
  assert.match(cli('list','--type','decision').stdout,/postgres ber_A/);
  assert.doesNotMatch(cli('list','--type','decision').stdout,/other note/);
  assert.match(cli('list','--tags','x').stdout,/other note/);
  const s=cli('search','postgres','--type','decision');assert.equal(s.status,0);assert.match(s.stdout,/postgres ber_A/);
  fs.rmSync(dir,{recursive:true});
  for (const cmd of [['list'],['search','postgres']]) for (const f of [['--type'],['--tag='],['--tags','  ']]) {
    const r=cli(...cmd,...f);assert.equal(r.status,1,cmd+f);assert.match(r.stderr,/--(type|tag|tags)/);assert.equal(fs.existsSync(dir),false);
  }
});

test('distill --apply continues after lock timeouts and always prints the summary', {timeout:30000}, async (t)=>{
  const {root,dir,file}=fixture(t);
  fs.writeFileSync(file,[rec('a1'),rec('a2',{created:'2024-02-01T00:00:00Z'}),rec('b1',{tags:['api']}),rec('b2',{tags:['api'],created:'2024-02-01T00:00:00Z'})].map(line).join(''));
  const before=fs.readFileSync(file);
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bernard-runner-'));t.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
  const runner=path.join(tmp,'runner.mjs');
  fs.writeFileSync(runner,`Object.defineProperty(process.stdin,'isTTY',{value:true,configurable:true});\nconst {distillCmd}=await import(${JSON.stringify(DISTILL)});\nawait distillCmd({_:[],flags:{apply:true}});\n`);
  const lock=acquireStoreLock(dir);
  let child;
  try {
    child=spawn(process.execPath,[runner],{cwd:root,env:{...env,BERNARD_LOCK_TIMEOUT_MS:'30'},stdio:['pipe','pipe','pipe']});
    let out='',err='',prompts=0;
    child.stdout.on('data',d=>{out+=d;});
    child.stderr.on('data',d=>{err+=d;const n=(err.match(/\(y\/n\)/g)||[]).length;while(prompts<n){prompts++;child.stdin.write('y\n');if(prompts===2)child.stdin.end();}});
    const timer=setTimeout(()=>child.kill('SIGKILL'),20000);
    const [code]=await once(child,'exit');clearTimeout(timer);
    assert.equal(prompts,2,err);assert.equal(code,1,err);
    assert.match(out,/Done: 0 record\(s\) invalidated/);
    assert.match(err,/Timed out/);assert.doesNotMatch(err,/\n\s+at /);
  } finally {
    if (child && child.exitCode===null) child.kill('SIGKILL');
    releaseStoreLock(lock);
  }
  assert.ok(fs.readFileSync(file).equals(before));
});
