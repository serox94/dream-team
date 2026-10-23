// Operational read-only closure of release 39905061217. No deployment or data writes.
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {cf,query,wrangler,productionId} from './recovery-common.mjs';
import {inspectSql,rowsDigest} from './d1-snapshot.mjs';
const check=(x,c)=>{if(!x)throw Error(c);};
const report={at:new Date().toISOString(),result:'BLOCKED',productionWrites:0,productionExports:0,providerCalls:0,rowsRead:0};
const dir=await mkdtemp(join(tmpdir(),'release18-readonly-'));
async function q(sql,params=[]){check(/^SELECT\b/.test(sql)&&!sql.includes(';'),'SELECT_ONLY');const r=await query(productionId,sql,params);report.rowsRead+=r.meta?.rows_read||0;check(report.rowsRead<=2500,'READ_CAP');return r.results;}
try{
 const day=new Date().toISOString().slice(0,10);
 const r=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},body:JSON.stringify({query:'query($a:string!,$d:Date!){viewer{accounts(filter:{accountTag:$a}){d1AnalyticsAdaptiveGroups(limit:100,filter:{date_geq:$d,date_leq:$d}){sum{rowsRead}}}}}',variables:{a:process.env.CLOUDFLARE_ACCOUNT_ID,d:day}}),signal:AbortSignal.timeout(20000)}),a=await r.json();
 check(!a.errors?.length&&Array.isArray(a.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups),'BUDGET_UNKNOWN');
 report.dayRowsRead=a.data.viewer.accounts[0].d1AnalyticsAdaptiveGroups.reduce((n,x)=>n+x.sum.rowsRead,0);
 check(report.dayRowsRead+2500<4800000,'HEADROOM_LOW');
 const file=join(dir,'manifest.json');wrangler(['r2','object','get','dream-team-d1-backups/private-releases/schema31/39905061217-db4190d2.json','--remote','--file',file]);
 const manifest=JSON.parse(await readFile(file,'utf8'));
 check(manifest.candidate==='db4190d2f8836786e25656807c1417b42118880e'&&manifest.main==='2b38f99fda6c4c231d2abcaa0ac7c8ef69d77333','WRONG_RECEIPT');
 const active=(await cf('/workers/scripts/dream-team/deployments')).deployments[0];
 check(active.versions.length===1&&active.versions[0].percentage===100,'TRAFFIC_SPLIT');
 const version=await cf('/workers/scripts/dream-team/versions/'+active.versions[0].version_id),bindings=version.resources.bindings;
 const vars=Object.fromEntries(bindings.filter(x=>x.type==='plain_text').map(x=>[x.name,x.text]));
 report.worker={id:version.id,build:vars.APP_BUILD,variant:vars.APP_VARIANT,isTestedFallback:version.id===manifest.fallbackWorker,databaseMatches:bindings.some(x=>x.name==='DB'&&x.id===productionId),sharedPolicy:vars.ANGLER_PASSWORD_POLICY==='shared'};
 check(report.worker.isTestedFallback&&report.worker.databaseMatches,'ACTIVE_FALLBACK_MISMATCH');
 const settings=Object.fromEntries((await q("SELECT key,value FROM app_settings WHERE key IN ('schema_version','maintenance_mode')")).map(x=>[x.key,x.value]));
 report.schema=Number(settings.schema_version);report.maintenance=settings.maintenance_mode;report.migrations=(await q('SELECT COUNT(*) n FROM d1_migrations'))[0].n;
 check(report.schema===31&&report.migrations===31&&report.maintenance==='off','SCHEMA_OR_MAINTENANCE');
 const sqlFile=join(dir,'snapshot.sql');wrangler(['r2','object','get',manifest.privateArchive+'/source-schema30.sql','--remote','--file',sqlFile]);const snapshot=inspectSql(await readFile(sqlFile));
 report.counts={};report.preserved={};
 for(const table of ['trips','lakes','catches','checklist_items','auth_accounts','auth_credential','auth_account_credentials','content_translations','translation_cache']){
  const original=snapshot.tables.find(x=>x.name===table);check(original,'SNAPSHOT_TABLE_MISSING');
  if(table==='translation_cache'){const count=(await q('SELECT COUNT(*) n FROM translation_cache'))[0].n;report.counts[table]=count;check(count>=original.rows.length,'CACHE_LOST');continue;}
  const rows=await q('SELECT * FROM '+table);report.counts[table]=rows.length;report.preserved[table]=rowsDigest(rows)===rowsDigest(original.rows);
 }
 const sessions=await q('SELECT * FROM auth_sessions'),original=snapshot.tables.find(x=>x.name==='auth_sessions').rows;
 report.sessions={before:original.length,current:sessions.length,allOriginalIdsAndVersionsPreserved:original.every(x=>sessions.some(y=>y.id_hash===x.id_hash&&y.account_id===x.account_id&&y.auth_version===x.auth_version&&y.expires_at>=x.expires_at))};
 report.translations=await q("SELECT status,COUNT(*) n FROM translation_jobs GROUP BY status");
 const ready=await fetch('https://dream-team.sewerynski00.workers.dev/login',{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(20000)});
 report.login={status:ready.status,build:ready.headers.get('x-dreamteam-build')};
 report.schedules=(await cf('/workers/scripts/dream-team/schedules')).schedules?.map(x=>x.cron);
 report.backupSchedules=(await cf('/workers/scripts/dream-team-d1-backup/schedules')).schedules?.map(x=>x.cron);
 const worker=(await cf('/workers/scripts')).find(x=>x.id==='dream-team');
 const raw=await cf('/builds/workers/'+worker.tag+'/builds?per_page=100'),builds=Array.isArray(raw)?raw:raw.builds;
 report.activeBuilds=builds.filter(x=>['queued','pending','initializing','running','building'].includes(x.status)).length;
 check(Object.values(report.preserved).every(Boolean)&&report.sessions.allOriginalIdsAndVersionsPreserved,'PRESERVATION_MISMATCH');
 check(ready.status===200&&report.login.build===manifest.main,'LOGIN_READINESS');
 report.result='PASS';
}catch(e){report.error=/^[A-Z0-9_]+$/.test(e.message)?e.message:'READONLY_STATUS_FAILED';process.exitCode=1;}
finally{await rm(dir,{recursive:true,force:true});console.log('RELEASE18_READONLY '+JSON.stringify(report));}
