import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { diagnose } from '../src/core/doctor.js';
import { en } from '../src/i18n/en.js';
import { tr } from '../src/i18n/tr.js';
const BIN=fileURLToPath(new URL('../bin/bernard.js',import.meta.url));
const rec=(id,more={})=>({id,type:'note',title:id,content:'fixture',tags:[],created:'2024-01-01T00:00:00Z',invalid:false,superseded_by:null,source:'manual',...more});
const env={...process.env,NO_COLOR:'1',BERNARD_LOCALE:'en',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'};
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'bernard-doctor-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));spawnSync('git',['init','-q'],{cwd:root,env});const cli=(...args)=>spawnSync(process.execPath,[BIN,...args],{cwd:root,env,encoding:'utf8',timeout:10000});assert.equal(cli('init').status,0);return{root,dir:path.join(root,'.bernard'),cli};}
function disk(dir){const result={};function visit(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){if(e.name==='.git')continue;const file=path.join(p,e.name);if(e.isDirectory())visit(file);else result[path.relative(dir,file)]={bytes:fs.readFileSync(file).toString('base64'),mtime:fs.statSync(file).mtimeMs};}}visit(dir);return result;}

test('doctor JSON/alias is healthy after init and never creates an absent store',t=>{
 const {root,dir,cli}=fixture(t);let r=cli('doctor','--json');assert.equal(r.status,0,r.stderr);const report=JSON.parse(r.stdout);assert.equal(report.schema,1);assert.equal(report.summary.records,0);assert.equal(report.summary.errors,0);assert.equal(report.summary.warnings,0);
 assert.equal(cli('doktor','--json','--locale','tr').status,0);
 fs.rmSync(dir,{recursive:true});const before=disk(root);r=cli('doctor','--json');assert.equal(r.status,2);assert.ok(JSON.parse(r.stdout).checks.some(c=>c.id==='layout.missing_dir'));assert.equal(fs.existsSync(dir),false);assert.deepEqual(disk(root),before);
});

test('doctor shares line parsing, reports all graph edges and preserves source/cache/lock bytes and mtimes',t=>{
 const {root,dir,cli}=fixture(t);
 const rows=[rec('a'),rec('a',{invalid:true,superseded_by:'b'}),rec('b',{invalid:true,superseded_by:'a'}),rec('missing',{superseded_by:'absent'}),rec('self',{invalid:true,superseded_by:'self'})];
 const raw=Buffer.concat([Buffer.from(rows.map((r,i)=>JSON.stringify(r)+(i%2?'\r\n':'\n')).join('')),Buffer.from('{bad\n'),Buffer.from([255,10]),Buffer.from('null')]);fs.writeFileSync(path.join(dir,'records.jsonl'),raw);
 fs.mkdirSync(path.join(dir,'.cache'));const cache=path.join(dir,'.cache/index.json');fs.writeFileSync(cache,'{"version":2}');
 const lock=path.join(dir,'.cache/records.lock');fs.writeFileSync(lock,JSON.stringify({token:'fixture',pid:2147483647,host:os.hostname()}));fs.writeFileSync(lock+'.break','garbled');
 const before=disk(root), r=cli('doctor','--json');assert.equal(r.status,2,r.stderr);const report=JSON.parse(r.stdout), checks=report.checks;
 assert.deepEqual(checks.find(c=>c.id==='records.duplicate_id').data.lineNos,[1,2]);
 assert.equal(checks.find(c=>c.id==='records.corrupt_json').data.lineNo,6);assert.equal(checks.find(c=>c.id==='records.invalid_utf8').data.lineNo,7);assert.equal(checks.find(c=>c.id==='records.schema_invalid').data.lineNo,8);
 for(const id of ['graph.cycle','graph.superseded_by_self','graph.superseded_by_missing','graph.valid_but_superseded','records.mixed_eol','records.no_trailing_newline','cache.version_mismatch','lock.present','lock.breaker_present'])assert.ok(checks.some(c=>c.id===id),id);
 assert.equal(checks.find(c=>c.id==='lock.present').data.owner.dead,true);assert.deepEqual(disk(root),before,'doctor performs no mutation or cache rebuild');
 assert.equal(report.summary.records,5);assert.equal(report.summary.unique_ids,4);
 const turkish=JSON.parse(cli('doktor','--json','--locale','tr').stdout);assert.deepEqual(turkish.checks.map(c=>c.id),checks.map(c=>c.id));assert.notEqual(turkish.checks[0].message,checks[0].message);
});

test('doctor warning exit and actionable configuration/category/layout diagnostics',t=>{
 const {root,dir,cli}=fixture(t);fs.writeFileSync(path.join(dir,'config.json'),JSON.stringify({locale:'xx',retrieval:{max_results:0,recency_weight:-1,half_life_days:0,type_weights:{unknown:1}}}));fs.writeFileSync(path.join(dir,'categories.json'),'{"types":["alien"],"synonyms":{"auth":4}}');fs.writeFileSync(path.join(root,'.gitattributes'),'');
 const r=cli('doctor','--json');assert.equal(r.status,1);const checks=JSON.parse(r.stdout).checks;for(const id of ['config.locale_unknown','config.retrieval_range','categories.types_diverge','categories.synonyms_shape','layout.gitattributes_union'])assert.ok(checks.some(c=>c.id===id),id);
 assert.deepEqual(checks.find(c=>c.id==='config.retrieval_range').data.fields,['max_results','recency_weight','half_life_days','type_weights']);
 fs.writeFileSync(path.join(dir,'config.json'),'null');fs.writeFileSync(path.join(dir,'categories.json'),'{bad');const broken=JSON.parse(cli('doctor','--json').stdout);assert.ok(broken.checks.some(c=>c.id==='config.unparseable'));assert.ok(broken.checks.some(c=>c.id==='categories.unparseable'));
});

test('doctor detects tracked cache and inspects symlinked hooks without following them',t=>{
 const {root,dir,cli}=fixture(t);fs.mkdirSync(path.join(dir,'.cache'));fs.writeFileSync(path.join(dir,'.cache/index.json'),'{}');spawnSync('git',['add','-f','.bernard/.cache/index.json'],{cwd:root,env});
 const target=path.join(root,'foreign-hook');fs.writeFileSync(target,'foreign');fs.symlinkSync(target,path.join(root,'.git/hooks/post-commit'));const before=disk(root);const report=JSON.parse(cli('doctor','--json').stdout);assert.ok(report.checks.some(c=>c.id==='layout.cache_tracked'));assert.equal(report.checks.find(c=>c.id==='hook.state').data.kind,'foreign');assert.deepEqual(disk(root),before);
});

test('doctor handles long histories without recursive stack overflow and unreadable roots return code 3',t=>{
 const {root,dir}=fixture(t);const rows=Array.from({length:5000},(_,i)=>rec('r'+i,{invalid:true,superseded_by:i===4999?null:'r'+(i+1)}));fs.writeFileSync(path.join(dir,'records.jsonl'),rows.map(JSON.stringify).join('\n')+'\n');assert.equal(diagnose(root).summary.errors,0);assert.equal(diagnose(path.join(root,'not-there')).exitCode,3);
});

test('bilingual catalogs have identical keys and every doctor diagnostic is localized',()=>{
 assert.deepEqual(Object.keys(en).sort(),Object.keys(tr).sort());for(const [key,value] of Object.entries(en).filter(([key])=>key.startsWith('doctor.'))){assert.equal(typeof tr[key],'string');assert.notEqual(value,tr[key],key);}
});
