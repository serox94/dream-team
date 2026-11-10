// PR43 guarded, code-only production release. No migrations, data writes or session resets.
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const candidate='fa9bf8def9d9ddd5319dc33a7055c742213cadd2';
const previous='02996b7d-66ae-460c-9de5-2304440c56fd';
const previousBuild='4260c2e17102635a770bac7fe1d9db43ae202824';
const databaseId='b64c7a2c-8694-41c6-b54a-857b88bf2c96';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const report={status:'BLOCKED',stage:'PREFLIGHT',candidate,previous,rollback:'NOT_NEEDED'};
let directory=null,uploaded=null,attempted=false;
const need=(condition,message)=>{if(!condition)throw Error(message);};
const hash=x=>createHash('sha256').update(x).digest('hex');
const command=(cmd,args,timeout=360000)=>{
 try{return execFileSync(cmd,args,{encoding:'utf8',timeout,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']}).trim();}
 catch(e){
  // Never expose secrets, raw configuration, URLs or environment variable values.
  const err=String(e.stderr||'')+'\n'+String(e.stdout||'');
  const known=[
   ['UNKNOWN_ARGUMENT',/unknown argument|unrecognized option|unknown option/i],
   ['WRANGLER_CONFIG_ERROR',/invalid wrangler|configuration file|invalid configuration|unexpected fields/i],
   ['STRICT_REMOTE_CONFLICT',/strict mode|conflicting remote changes|conflicting configuration|conflicting secrets|conflict with remote/i],
   ['WRANGLER_ENTRYPOINT_ERROR',/entry.point|entrypoint|could not resolve|no such file/i],
   ['WRANGLER_ASSETS_ERROR',/static assets|asset directory|assets binding|assets configuration/i],
   ['WRANGLER_UPLOAD_PERMISSION',/unauthorized|forbidden|permission|authentication/i],
   ['WRANGLER_API_ERROR',/api error|cloudflare api|error 400|error 403|error 500/i]
  ];
  report.commandFailure={exitCode:typeof e.status==='number'?e.status:null,kind:known.find(([,re])=>re.test(err))?.[0]||'WRANGLER_UNCLASSIFIED_ERROR',phase:report.stage};
  throw Error('WRANGLER_COMMAND_FAILED');
 }
};
const git=(...args)=>command('git',args,30000);
async function request(path,method='GET',data){
 const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{method,headers:{authorization:'Bearer '+token,...(data?{'content-type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(50000)});
 const json=await response.json();need(response.ok&&json.success,'CLOUDFLARE_HTTP_'+response.status);
 return json.result;
}
async function github(path){
 const response=await fetch('https://api.github.com/repos/serox94/dream-team'+path,{headers:{authorization:'Bearer '+process.env.GH_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});
 need(response.ok,'GITHUB_HTTP_'+response.status);return response.json();
}
const query=async sql=>(await request('/d1/database/'+databaseId+'/query','POST',{sql}))[0].results;
async function dbCheck(){
 const state=(await query("SELECT (SELECT value FROM app_settings WHERE key='schema_version') schema,(SELECT COUNT(*) FROM d1_migrations) migrations,(SELECT value FROM app_settings WHERE key='maintenance_mode') maintenance"))[0];
 need(state.schema==='32'&&state.migrations===32&&state.maintenance==='off','SCHEMA32_MAINTENANCE_GATE');
 need((await query('PRAGMA quick_check'))[0]?.quick_check==='ok','D1_QUICK_CHECK');
 need((await query('PRAGMA foreign_key_check')).length===0,'D1_FOREIGN_KEYS');
}
async function active(){
 const x=await request('/workers/scripts/dream-team/deployments');
 const versions=x.deployments?.[0]?.versions;
 need(versions?.length===1&&versions[0].percentage===100,'UNEXPECTED_TRAFFIC_SPLIT');
 return versions[0].version_id;
}
const version=id=>request('/workers/workers/dream-team/versions/'+id+'?include=modules');
const sorted=b=>b.map(x=>{const v={name:x.name,type:x.type};if(x.type==='plain_text')v.text=x.text;if(x.type==='d1')v.id=x.id||x.database_id;if(x.type==='r2_bucket')v.bucket_name=x.bucket_name;return v;}).sort((a,b)=>a.name.localeCompare(b.name));
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function sourceGate(){
 need(await active()===previous,'SOURCE_VERSION_CHANGED');
 const src=await version(previous);
 need(src.id===previous&&src.assets?.config&&src.compatibility_date,'SOURCE_METADATA_INVALID');
 need(src.bindings.find(x=>x.name==='DB')?.id===databaseId,'DATABASE_BINDING_CHANGED');
 need(src.bindings.find(x=>x.name==='APP_BUILD')?.text===previousBuild,'SOURCE_CODE_CHANGED');
 const names=src.bindings.map(x=>x.name);
 for(const name of ['DB','ASSETS','AI','MEDIA','BACKUP_STATUS','RYBY_SESSION_SECRET','RYBY_LOGIN_PASSWORD','TAVILY_API_KEY'])need(names.includes(name),'SOURCE_BINDING_MISSING');
 need(src.bindings.every(x=>['ai','assets','plain_text','secret_text','d1','r2_bucket'].includes(x.type)),'UNSUPPORTED_BINDING_TYPE');
 const versions=await request('/workers/scripts/dream-team/versions?deployable=true');
 need((Array.isArray(versions)?versions:versions.items||[]).some(x=>x.id===previous),'PREVIOUS_VERSION_NOT_DEPLOYABLE');
 return src;
}
async function ghCheck(){
 need((await github('/git/ref/heads/main')).object?.sha===candidate,'MAIN_MOVED');
 const runs=(await github('/actions/runs?branch=main&per_page=30')).workflow_runs;
 for(const name of ['Validate Dream Team','Responsive UI QA'])
  need(runs.some(x=>x.name===name&&x.head_sha===candidate&&x.conclusion==='success'&&x.status==='completed'),'CI_NOT_GREEN');
}
async function backup(){
 report.stage='BACKUP';
 const r2=await request('/r2/buckets/dream-team-d1-backups/objects?prefix=dream-team-db%2F2026-11-&per_page=100');
 const backups=(Array.isArray(r2)?r2:r2.objects||[]).filter(x=>typeof x.key==='string'&&x.key.startsWith('dream-team-db/')).sort((a,b)=>String(b.uploaded||b.last_modified).localeCompare(String(a.uploaded||a.last_modified)));
 const latest=backups[0],date=Date.parse(latest?.uploaded||latest?.last_modified||'');
 need(latest&&date<=Date.now()&&Date.now()-date<36*3600000,'BACKUP_NOT_CURRENT');
 const media=await request('/r2/buckets/dream-team-media/objects?per_page=100');
 need((Array.isArray(media)?media:media.objects||[]).length===0&&!media.truncated,'MEDIA_REQUIRES_INDEPENDENT_BACKUP');
 const file=join(directory,'export.sql');
 command('npx',['wrangler','d1','export','dream-team-db','--remote','--output',file]);
 const bytes=await readFile(file);
 need(bytes.length>50000&&bytes.length<40000000,'D1_EXPORT_INVALID');
 const py=["import sqlite3,sys","db=sqlite3.connect(':memory:')","db.executescript(open(sys.argv[1],encoding='utf8').read())","assert db.execute('PRAGMA quick_check').fetchone()[0]=='ok'","assert db.execute('PRAGMA foreign_key_check').fetchall()==[]","assert db.execute(\"SELECT value FROM app_settings WHERE key='schema_version'\").fetchone()[0]=='32'","db.close()"].join('\n');
 command('python3',['-c',py,file],120000);
 const key='private-releases/pr43/'+process.env.GITHUB_RUN_ID+'/production-schema32.sql';
 command('npx',['wrangler','r2','object','put','dream-team-d1-backups/'+key,'--remote','--file',file],120000);
 const restored=join(directory,'verified.sql');
 command('npx',['wrangler','r2','object','get','dream-team-d1-backups/'+key,'--remote','--file',restored],120000);
 need(hash(await readFile(restored))===hash(bytes),'R2_ROUNDTRIP_HASH_MISMATCH');
 report.backup={status:'PASS',sha256:hash(bytes),localRestore:'PASS',r2Roundtrip:'PASS',r2Key:key};
}
function config(src){
 const vars=Object.fromEntries(src.bindings.filter(b=>b.type==='plain_text').map(b=>[b.name,b.text]));
 vars.APP_BUILD=candidate;
 return {name:'dream-team',main:join(process.cwd(),'src','worker.js'),compatibility_date:src.compatibility_date,
  compatibility_flags:src.compatibility_flags||[],keep_vars:true,vars,
  secrets:{required:src.bindings.filter(b=>b.type==='secret_text').map(b=>b.name)},
  assets:{directory:join(process.cwd(),'public'),binding:'ASSETS',run_worker_first:src.assets.config.run_worker_first,html_handling:src.assets.config.html_handling},
  ai:{binding:'AI'},
  d1_databases:src.bindings.filter(b=>b.type==='d1').map(b=>({binding:b.name,database_id:b.id||b.database_id,database_name:'dream-team-db'})),
  r2_buckets:src.bindings.filter(b=>b.type==='r2_bucket').map(b=>({binding:b.name,bucket_name:b.bucket_name}))};
}
async function httpCheck(url,build){
 for(let i=0;i<8;i++){
  try{const r=await fetch(url+'/login',{redirect:'manual',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(7000)});
   const ok=r.status===200&&r.headers.get('x-dreamteam-build')===build;
   await r.body?.cancel();if(ok)return true;
  }catch{}await new Promise(r=>setTimeout(r,1300));
 }
 return false;
}
async function stagedCheck(src,id){
 const v=await version(id);
 need(v.id===id,'STAGED_VERSION_NOT_FOUND');
 const expected=src.bindings.map(b=>b.name==='APP_BUILD'?{...b,text:candidate}:b);
 need(eq(sorted(v.bindings||[]),sorted(expected)),'STAGED_BINDINGS_NOT_IDENTICAL');
 need(eq(v.assets?.config,src.assets.config),'STAGED_ASSETS_CONFIG_DIFF');
 need(v.compatibility_date===src.compatibility_date&&eq(v.compatibility_flags||[],src.compatibility_flags||[]),'STAGED_COMPATIBILITY_DIFF');
 need(await httpCheck('https://'+id.slice(0,8)+'-dream-team.sewerynski00.workers.dev',candidate),'STAGED_HTTP_CANARY_FAILED');
 report.canary='PASS';
}
async function activate(id){
 await request('/workers/scripts/dream-team/deployments','POST',{strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':'PR43 approved code '+candidate}});
}
async function verify(id,build){
 for(let i=0;i<14;i++){
  need(await active()===id,'CONCURRENT_DEPLOYMENT');
  if(await httpCheck('https://dream-team.sewerynski00.workers.dev',build)){await dbCheck();return;}
  await new Promise(r=>setTimeout(r,1500));
 }
 throw Error('LIVE_HTTP_FAILED');
}
try{
 need(process.env.GITHUB_REF==='refs/heads/ops/pr43-trash-only-release-20261110'&&process.env.GITHUB_EVENT_NAME==='push'&&process.env.GITHUB_REPOSITORY==='serox94/dream-team','RELEASE_CONTEXT_INVALID');
 need(process.env.DREAMTEAM_PRODUCTION_APPROVED==='yes','OWNER_PRODUCTION_FLAG_CLOSED');
 need(account&&token&&process.env.GH_TOKEN,'DEPLOY_CREDENTIALS_MISSING');
 need(git('merge-base',candidate,'HEAD')===candidate,'CANDIDATE_NOT_ANCESTOR');
 need(git('diff','--name-only',candidate,'HEAD','--','src','public','migrations','wrangler.jsonc','package.json','package-lock.json')==='','APPLICATION_FILES_CHANGED');
 need(git('rev-parse','refs/remotes/origin/main')===candidate,'MAIN_HEAD_CHANGED');
 await ghCheck();await dbCheck();const src=await sourceGate();
 directory=await mkdtemp(join(tmpdir(),'pr43-release-'));
 await backup();
 report.stage='INACTIVE_UPLOAD';
 const cfg=join(directory,'release-config.json');
 await writeFile(cfg,JSON.stringify(config(src)),{mode:0o600});
 const output=command('npx',['wrangler','versions','upload','--config',cfg,'--keep-vars','--message','PR43 '+candidate]);
 uploaded=output.match(/Version ID:\s*([a-f0-9-]{36})/i)?.[1];
 need(uploaded,'UPLOAD_VERSION_ID_NOT_FOUND');report.uploaded=uploaded;
 need(await active()===previous,'UPLOAD_MODIFIED_TRAFFIC');
 await stagedCheck(src,uploaded);await dbCheck();
 need(await active()===previous,'SOURCE_MOVED_BEFORE_ACTIVATION');
 report.stage='ACTIVATE';attempted=true;await activate(uploaded);
 report.stage='VERIFY';
 await verify(uploaded,candidate);
 report.status='PASS';report.stage='COMPLETE';
}catch(e){
 report.error=/^[A-Z0-9_]+$/.test(e?.message||'')?e.message:'OPERATION_FAILED';
 if(attempted){
  try{const current=await active();need(current===previous||current===uploaded,'UNKNOWN_CONCURRENT_VERSION');if(current===uploaded)await activate(previous);await verify(previous,previousBuild);report.rollback='PASS';report.status='ROLLED_BACK';}
  catch{report.rollback='FAILED';}
 }
 process.exitCode=1;
}finally{
 if(directory)await rm(directory,{recursive:true,force:true});
 await mkdir('pr43-release-status',{recursive:true});
 await writeFile('pr43-release-status/summary.json',JSON.stringify(report,null,2));
 console.log('::notice title=PR43 production::'+JSON.stringify(report));
}
