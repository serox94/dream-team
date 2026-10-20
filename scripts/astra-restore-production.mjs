// Explicit schema-compatible recovery. No migration, data restore or credential rotation.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {cf,query,wrangler,sha,productionId,assertSandbox} from './recovery-common.mjs';
import {inspectSql,verifySnapshot,rowsDigest} from './d1-snapshot.mjs';
const oldVersion='d43aa522-4781-4259-a298-72b6e9793288',oldBuild='600d1f55ad0481a77cfc725a7a1810ea15347ee0';
const archive='dream-team-audit-39370527927-archive',url='https://dream-team.sewerynski00.workers.dev';
const status={result:'BLOCKED',maintenance:'ON',productionBusinessWrites:0,migrations:0,initializations:0};
const dir=await mkdtemp(join(tmpdir(),'dream-private-recovery-'));let opened=false,restored=false,phase='approval and queue',cookie;
const check=(v,c)=>{if(!v)throw Error(c);};
const http=(path,options={})=>fetch(url+path,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(20000),...options});
async function privateFile(bucket,key){const file=join(dir,sha(bucket+'/'+key));wrangler(['r2','object','get',bucket+'/'+key,'--remote','--file',file]);return readFile(file);}
async function queue(){const scripts=await cf('/workers/scripts'),worker=scripts.find(s=>s.id==='dream-team');const data=await cf('/builds/workers/'+worker.tag+'/builds?per_page=100');const builds=Array.isArray(data)?data:data.builds;check(Array.isArray(builds)&&!builds.some(b=>['queued','pending','initializing','running','building'].includes(b.status)),'PARALLEL_BUILD');const r=await fetch('https://api.github.com/repos/serox94/dream-team/actions/runs?per_page=100',{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'}});check(r.ok,'RELEASE_QUEUE_UNAVAILABLE');check(!(await r.json()).workflow_runs.some(r=>String(r.id)!==process.env.GITHUB_RUN_ID&&r.path==='.github/workflows/deploy-private.yml'&&r.status!=='completed'),'PARALLEL_RELEASE');}
async function poll(path,predicate){for(let n=0;n<45;n++){const r=await http(path);if(await predicate(r))return;await new Promise(r=>setTimeout(r,2000));}throw Error('RESTORE_PROPAGATION_TIMEOUT');}
try{
 check(process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&process.env.RELEASE_ACTION==='restore'&&process.env.RELEASE_CANDIDATE===oldBuild,'RESTORE_APPROVAL');assertSandbox(archive);await queue();status.queue='PASS';
 phase='private checkpoint and unchanged schema28';console.log('RESTORE PHASE: '+phase);
 const checkpoint=JSON.parse(await privateFile(archive,'checkpoint.json'));check(checkpoint.databaseId===productionId&&checkpoint.sourceSchema===28&&checkpoint.previousWorkerVersion===oldVersion,'PRIVATE_CHECKPOINT_MISMATCH');
 const sql=await privateFile(archive,'source.sql');check(sha(sql)===checkpoint.sqlSha256&&checkpoint.sqlSha256==='34592718b5f970c21c56a3eaa1ac439660b08766ce0d2d5ce9d438d91f8f21ed','CHECKPOINT_HASH');const snap=inspectSql(sql);
 const previous=JSON.parse(await privateFile(archive,'previous-worker.json'));check(previous.sourceMain===oldBuild&&previous.sourceSchema===28&&previous.activeVersion.id===oldVersion,'PREVIOUS_WORKER_MISMATCH');
 const schema=(await query(productionId,"SELECT value FROM app_settings WHERE key='schema_version'")).results[0];check(schema?.value==='28','SCHEMA_NOT_28');check((await query(productionId,'SELECT COUNT(*) n FROM d1_migrations')).results[0].n===28,'MIGRATIONS_NOT_28');
 // The failed run cleaned its own baseline login. Identify it against the earlier private preflight.
 const preflight=JSON.parse(await privateFile('dream-team-d1-backups','private-releases/8aa02e30-5507-4d19-8b73-0503346dc3ab.json'));
 const before=inspectSql(await privateFile(preflight.bootstrapPrivateKeyBucket,'source.sql'));
 const existingIds=new Set(before.tables.find(t=>t.name==='auth_sessions').rows.map(r=>r.id_hash));
 const currentSessions=(await query(productionId,'SELECT * FROM auth_sessions')).results;
 const expectedSessions=snap.tables.find(t=>t.name==='auth_sessions').rows;
 const missing=expectedSessions.filter(r=>!currentSessions.some(c=>c.id_hash===r.id_hash));
 check(missing.length<=1&&missing.every(r=>!existingIds.has(r.id_hash)),'EXISTING_SESSION_REMOVED');
 const expected={...snap,tables:snap.tables.map(t=>t.name==='auth_sessions'?{...t,rows:t.rows.filter(r=>!missing.some(m=>m.id_hash===r.id_hash))}:t)};
 await verifySnapshot({uuid:productionId},expected,async(id,sql,params)=>{const r=await query(id,sql,params);if(sql==='SELECT * FROM "app_settings"'){const baseline=expected.tables.find(t=>t.name==='app_settings').rows.find(r=>r.key==='maintenance_mode');for(const row of r.results)if(row.key==='maintenance_mode'){check(row.value==='on'&&baseline?.value==='on','MAINTENANCE_NOT_ON');row.updated_at=baseline.updated_at;}}return r;});status.integrity='PASS';status.existingAccountsPasswordsSessions='PRESERVED';status.schema=28;
 const retained=await cf('/workers/scripts/dream-team/versions/'+oldVersion);check(rowsDigest(retained.resources.bindings)===rowsDigest(previous.activeVersion.resources.bindings),'PREVIOUS_BINDINGS_CHANGED');
 const active=(await cf('/workers/scripts/dream-team/deployments')).deployments[0];check(active.versions.length===1&&active.versions[0].percentage===100,'SPLIT_TRAFFIC');check((await http('/login')).status===503,'NOT_MAINTENANCE');
 const source=await fetch('https://api.github.com/repos/serox94/dream-team/contents/wrangler.jsonc?ref='+oldBuild,{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'}});check(source.ok,'PREVIOUS_CRON_CONFIG_UNAVAILABLE');const cfg=JSON.parse(Buffer.from((await source.json()).content,'base64').toString());check(cfg.name==='dream-team'&&cfg.d1_databases[0].database_id===productionId,'ORIGINAL_CONFIG_MISMATCH');const crons=cfg.triggers.crons;check(JSON.stringify(crons)==='["0 6 * * *"]','ORIGINAL_CRON_MISMATCH');
 phase='restore retained Worker version and exact bindings';console.log('RESTORE PHASE: '+phase);await queue();
 await cf('/workers/scripts/dream-team/deployments','POST',{strategy:'percentage',versions:[{version_id:oldVersion,percentage:100}],annotations:{'workers/message':'Explicit approved schema28 recovery after isolated candidate failure'}});restored=true;
 await poll('/login',r=>r.status===503&&r.headers.get('x-dreamteam-build')===oldBuild);
 const deployed=(await cf('/workers/scripts/dream-team/deployments')).deployments[0];check(deployed.versions.length===1&&deployed.versions[0].version_id===oldVersion&&deployed.versions[0].percentage===100,'RESTORED_VERSION_MISMATCH');const current=await cf('/workers/scripts/dream-team/settings');check(rowsDigest(current.bindings)===rowsDigest(previous.activeVersion.resources.bindings),'RESTORED_BINDINGS_MISMATCH');
 await verifySnapshot({uuid:productionId},expected,async(id,sql,params)=>{const r=await query(id,sql,params);if(sql==='SELECT * FROM "app_settings"'){const baseline=expected.tables.find(t=>t.name==='app_settings').rows.find(r=>r.key==='maintenance_mode');for(const row of r.results)if(row.key==='maintenance_mode'){check(row.value==='on'&&baseline?.value==='on','MAINTENANCE_NOT_ON');row.updated_at=baseline.updated_at;}}return r;});
 phase='open verified original application and restore cron';console.log('RESTORE PHASE: '+phase);
 await query(productionId,"UPDATE app_settings SET value='off' WHERE key='maintenance_mode' AND value='on'");opened=true;await poll('/login',r=>r.status===200&&r.headers.get('x-dreamteam-build')===oldBuild);
 const login=await http('/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:'Patryk',password:process.env.RYBY_LOGIN_PASSWORD})});check(login.status===303&&!login.headers.get('location')?.includes('error='),'RESTORED_LOGIN_FAILED');cookie=login.headers.get('set-cookie')?.split(';')[0];check(cookie,'RESTORED_SESSION_MISSING');check((await http('/api/bootstrap',{headers:{cookie}})).status===200,'RESTORED_SESSION_FAILED');status.login='PASS';
 check((await http('/api/logout',{method:'POST',headers:{cookie}})).status===200,'RESTORED_LOGOUT_FAILED');cookie=null;
 await cf('/workers/scripts/dream-team/schedules','PUT',crons.map(cron=>({cron})));const schedules=await cf('/workers/scripts/dream-team/schedules');check(JSON.stringify(schedules.schedules.map(s=>s.cron).sort())===JSON.stringify([...crons].sort()),'RESTORED_CRON_MISMATCH');
 status.cron='RESTORED';status.activeVersion=oldVersion;status.activeBuild=oldBuild;status.maintenance='OFF';status.result='PRODUCTION RESTORED';
}catch(error){status.phase=phase;status.reason=/^[A-Z0-9_]+$/.test(error.message)?error.message:'RECOVERY_GATE_FAILED';status.httpStatus=error.status;status.code=error.code;if(opened){try{await query(productionId,"UPDATE app_settings SET value='on' WHERE key='maintenance_mode'");}catch{status.maintenance='CHECK REQUIRED';}}status.previousVersionRestored=restored;process.exitCode=1;
}finally{await rm(dir,{recursive:true,force:true});await mkdir('astra-release-status',{recursive:true});await writeFile('astra-release-status/restoration.json',JSON.stringify(status,null,2));console.log('ASTRA RESTORATION '+JSON.stringify(status));}
