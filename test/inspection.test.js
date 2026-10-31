import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';

const BIN=fileURLToPath(new URL('../bin/bernard.js',import.meta.url));
const UNKNOWN_ID='ber_'+crypto.randomBytes(6).toString('hex');
const CONTENT='SYNTHETIC_START\nİğdır, architecture runtimebinary, çığ.\n'+('runtimebinary detail '.repeat(100))+'\nSYNTHETIC_FULL_END';
const text=result=>(result.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function snapshot(root){const out={};if(!fs.existsSync(root))return out;function walk(dir,rel=''){for(const name of fs.readdirSync(dir).sort()){const p=path.join(dir,name),r=rel?rel+'/'+name:name,s=fs.lstatSync(p);out[r]={mode:s.mode,mtimeMs:s.mtimeMs};if(s.isDirectory())walk(p,r);else out[r].sha256=sha(fs.readFileSync(p));}}walk(root);return out;}
function fixture(t,{initialized=true}={}){
 const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'bernard-inspection-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const fixtureHome=path.join(root,'home');fs.mkdirSync(fixtureHome);
 const env={PATH:process.env.PATH||'/usr/bin:/bin',HOME:fixtureHome,USERPROFILE:fixtureHome,TMPDIR:root,XDG_CONFIG_HOME:path.join(fixtureHome,'config'),XDG_CACHE_HOME:path.join(fixtureHome,'cache'),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',BERNARD_LOCALE:'en',LANG:'C.UTF-8',LC_ALL:'C.UTF-8',NO_COLOR:'1'};
 assert.equal(spawnSync('git',['init','-q'],{cwd:root,env}).status,0);
 const cli=(...args)=>spawnSync(process.execPath,[BIN,...args],{cwd:root,env,encoding:'utf8',timeout:10000});
 const dir=path.join(root,'.bernard'),file=path.join(dir,'records.jsonl');
 if(initialized)assert.equal(cli('init').status,0);
 const records=()=>fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);
 function add(title,content=CONTENT,more=[]){const r=cli('add','--type','decision','--title',title,'--content',content,'--tags','fixture',...more);assert.equal(r.status,0,r.stderr);return records().find(x=>x.title===title);}
 return{root,env,cli,dir,file,records,add};
}
async function mcp(t,f){
 const transport=new StdioClientTransport({command:process.execPath,args:[BIN,'mcp'],cwd:f.root,env:f.env,stderr:'pipe'});transport.stderr?.on('data',()=>{});
 const client=new Client({name:'bernard-inspection-fixture',version:'1'});await client.connect(transport);
 t.after(async()=>{await client.close().catch(()=>{});await transport.close().catch(()=>{});});
 return{client,call:(name,args)=>client.callTool({name,arguments:args})};
}

test('CLI show/goster JSON round-trips the full canonical record and unknown fields without writes',t=>{
 const f=fixture(t),record=f.add('Synthetic full runtimebinary record');record.future={nested:['kept',7]};
 fs.writeFileSync(f.file,JSON.stringify(record)+'\r\n');fs.mkdirSync(path.join(f.dir,'.cache'),{recursive:true});fs.writeFileSync(path.join(f.dir,'.cache','sentinel'),'synthetic stale cache');
 const before=snapshot(f.dir);
 for(const command of ['show','goster']){const r=f.cli(command,record.id,'--json');assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),record);assert.ok(r.stdout.includes('SYNTHETIC_FULL_END'));}
 const human=f.cli('show',record.id);assert.equal(human.status,0,human.stderr);assert.ok(human.stdout.includes(CONTENT));assert.match(human.stdout,/active/i);
 assert.deepEqual(snapshot(f.dir),before);
});
test('CLI exact inspection validates required ID/JSON flag, localizes errors, and creates no missing store',t=>{
 const f=fixture(t),record=f.add('Synthetic inspection argument fixture'),before=snapshot(f.dir);
 for(const args of [[],[' '],[record.id,'extra'],[record.id,'--json=false']]){const r=f.cli('show',...args);assert.equal(r.status,1,JSON.stringify(args));assert.doesNotMatch(r.stderr,/\n\s+at /);}
 const missing=f.cli('show',UNKNOWN_ID,'--locale','tr');assert.equal(missing.status,1);assert.match(missing.stderr,/bulunamadı/i);assert.deepEqual(snapshot(f.dir),before);
 fs.rmSync(f.dir,{recursive:true});const r=f.cli('show',record.id,'--json');assert.equal(r.status,1);assert.equal(fs.existsSync(f.dir),false);
});
test('historical full inspection retains invalidation and replacement metadata while search stays active-only',t=>{
 const f=fixture(t),old=f.add('Synthetic old runtimebinary choice');const current=f.add('Synthetic new runtimebinary choice','Synthetic current choice',['--supersedes',old.id]);
 const before=snapshot(f.dir),r=f.cli('show',old.id,'--json');assert.equal(r.status,0,r.stderr);const parsed=JSON.parse(r.stdout);assert.equal(parsed.invalid,true);assert.equal(parsed.superseded_by,current.id);assert.equal(parsed.content,CONTENT);
 const human=f.cli('goster',old.id,'--locale','tr');assert.equal(human.status,0);assert.match(human.stdout,/geçersiz/i);assert.ok(human.stdout.includes(current.id));assert.deepEqual(snapshot(f.dir),before);
 const search=f.cli('search','runtimebinary');assert.doesNotMatch(search.stdout,/Synthetic old runtimebinary choice/);
});
test('CLI and MCP exact inspection reject all nonidentical duplicate IDs, preserving raw unrelated bytes',async t=>{
 for(const mode of ['active conflict','invalid copy','identical'])await t.test(mode,async st=>{
  const f=fixture(st),record=f.add('Synthetic duplicate exact inspection'),other={...record,content:'SYNTHETIC_CONFLICT_BODY',...(mode==='invalid copy'?{invalid:true}:{})};
  const raw=Buffer.concat([Buffer.from('\r\n'+JSON.stringify(record)+'\r\n'),Buffer.from(mode==='identical'?JSON.stringify(record):JSON.stringify(other)),Buffer.from('\nSYNTHETIC_CORRUPT_LINE\r\n')]);fs.writeFileSync(f.file,raw);
  const before=snapshot(f.dir),r=f.cli('show',record.id,'--json');const{call}=await mcp(st,f);const got=await call('bernard_get',{id:record.id});
  if(mode==='identical'){assert.equal(r.status,0,r.stderr);assert.deepEqual(JSON.parse(r.stdout),record);assert.notEqual(got.isError,true);assert.deepEqual(JSON.parse(got.content[0].text),record);}
  else{assert.equal(r.status,1);assert.match(r.stderr,/doctor/i);assert.equal(r.stdout,'');assert.equal(got.isError,true);assert.match(text(got),/doctor/i);assert.doesNotMatch(text(got),/SYNTHETIC_CONFLICT_BODY/);}
  assert.deepEqual(snapshot(f.dir),before);assert.ok(fs.readFileSync(f.file).equals(raw));
 });
});
test('MCP stdio full get and marked history list support explicit active-only filtering with no writes',async t=>{
 const f=fixture(t),old=f.add('Synthetic historical decision'),current=f.add('Synthetic current decision','Synthetic active content',['--supersedes',old.id]),long=f.add('Synthetic full MCP record');
 const before=snapshot(f.dir),{client,call}=await mcp(t,f);const tools=(await client.listTools()).tools;assert.ok(tools.some(x=>x.name==='bernard_get'));
 const got=await call('bernard_get',{id:long.id});assert.notEqual(got.isError,true);assert.deepEqual(JSON.parse(got.content[0].text),long);assert.ok(text(got).includes('SYNTHETIC_FULL_END'));
 const history=await call('bernard_get',{id:old.id});assert.equal(JSON.parse(history.content[0].text).invalid,true);assert.equal(JSON.parse(history.content[0].text).superseded_by,current.id);
 const listed=await call('bernard_list',{type:'decision'});assert.notEqual(listed.isError,true);assert.ok(text(listed).includes(old.title));assert.match(text(listed),/invalid/i);assert.ok(text(listed).includes(current.id));
 const active=await call('bernard_list',{type:'decision',include_invalid:false});assert.notEqual(active.isError,true);assert.ok(!text(active).includes(old.title));assert.ok(text(active).includes(current.title));
 const invalidBool=await call('bernard_list',{include_invalid:'false'});assert.equal(invalidBool.isError,true);
 const missing=await call('bernard_get',{id:UNKNOWN_ID});assert.equal(missing.isError,true);assert.match(text(missing),/not found/i);assert.deepEqual(snapshot(f.dir),before);
});
test('unknown type filters fail clearly on CLI and MCP before any index/cache update',async t=>{
 const f=fixture(t);f.add('Synthetic runtimebinary type fixture');const before=snapshot(f.dir),{call}=await mcp(t,f);
 for(const locale of ['en','tr'])for(const command of ['list','search']){const args=command==='search'?['runtimebinary']:[];const r=f.cli(command,...args,'--type','decisions','--locale',locale);assert.equal(r.status,1);for(const type of ['decision','architecture','bug','preference','note'])assert.ok(r.stderr.includes(type));assert.ok(r.stderr.includes('decisions'));}
 for(const name of ['bernard_list','bernard_search']){const r=await call(name,{type:'decisions',...(name==='bernard_search'?{query:'runtimebinary'}:{})});assert.equal(r.isError,true);for(const type of ['decision','architecture','bug','preference','note'])assert.ok(text(r).includes(type));}
 assert.deepEqual(snapshot(f.dir),before);
 fs.rmSync(f.dir,{recursive:true});for(const command of ['list','search']){const r=f.cli(command,...(command==='search'?['runtimebinary']:[]),'--type','decisions');assert.equal(r.status,1);assert.equal(fs.existsSync(f.dir),false);}
});
test('MCP exact inspection of an uninitialized project fails read-only without creating memory',async t=>{
 const f=fixture(t,{initialized:false}),{call}=await mcp(t,f);const r=await call('bernard_get',{id:UNKNOWN_ID});assert.equal(r.isError,true);assert.equal(fs.existsSync(f.dir),false);
});
