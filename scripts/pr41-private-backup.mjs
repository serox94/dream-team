// Read-only production capture. Writes only new private recovery objects; no D1 mutation.
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {cf,query,wrangler,sha,exportSql,configFile,productionId} from './recovery-common.mjs';import {inspectSql,verifySnapshot} from './d1-snapshot.mjs';import {listRestR2Objects} from '../src/backup-status.js';
const db={name:'dream-team-db',uuid:'b64c7a2c-8694-41c6-b54a-857b88bf2c96'},media='dream-team-media',backup='dream-team-d1-backups',expected='31b6b9bd-8f0b-4566-9ced-6b5bf1c26f9d',report={result:'BLOCKED',stage:'PRECHECK'};let dir;
const check=(v,c)=>{if(!v)throw Error(c)};
const list=()=>listRestR2Objects('https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/r2/buckets/'+media+'/objects?per_page=100',{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN});
const normalize=x=>JSON.stringify(x.map(o=>({key:o.key,size:o.size,etag:o.etag,last_modified:o.last_modified,http_metadata:o.http_metadata,custom_metadata:o.custom_metadata})).sort((a,b)=>a.key.localeCompare(b.key)));
const put=(key,file)=>wrangler(['r2','object','put',backup+'/'+key,'--remote','--file',file]);
const get=async(key,file)=>{wrangler(['r2','object','get',backup+'/'+key,'--remote','--file',file]);return readFile(file)};
try{
 check(process.env.GITHUB_REPOSITORY==='serox94/dream-team'&&process.env.GITHUB_RUN_ATTEMPT==='1'&&db.uuid===productionId,'CONTEXT');
 let d=await cf('/d1/database/'+db.uuid);check(d.name===db.name,'DATABASE_IDENTITY');
 let deployment=(await cf('/workers/scripts/dream-team/deployments')).deployments[0];check(deployment.versions.length===1&&deployment.versions[0].percentage===100&&deployment.versions[0].version_id===expected,'PRODUCTION_MOVED');
 let v=await cf('/workers/scripts/dream-team/versions/'+expected),bindings=v.resources.bindings;check(bindings.filter(x=>x.type==='d1').length===1&&bindings.some(x=>x.type==='d1'&&x.id===db.uuid)&&bindings.some(x=>x.type==='r2_bucket'&&x.name==='MEDIA'&&x.bucket_name===media)&&bindings.some(x=>x.type==='r2_bucket'&&x.name==='BACKUP_STATUS'&&x.bucket_name===backup),'BINDINGS');
 let [managed,custom]=await Promise.all([cf('/r2/buckets/'+backup+'/domains/managed'),cf('/r2/buckets/'+backup+'/domains/custom')]);check(managed.enabled===false&&Array.isArray(custom.domains)&&custom.domains.length===0,'BACKUP_PUBLIC');
 let s=(await query(db.uuid,"SELECT (SELECT value FROM app_settings WHERE key='schema_version') schema,(SELECT count(*) FROM d1_migrations) migrations,(SELECT value FROM app_settings WHERE key='maintenance_mode') maintenance")).results[0];check(s.schema==='32'&&s.migrations===32&&s.maintenance==='off','SCHEMA_OR_MAINTENANCE');
 const before=await list();check(before.length===0,'MEDIA_NOT_EMPTY_REQUIRES_OBJECT_COPY');report.media={count:before.length,inventory:'EMPTY',metadata:'NO_OBJECTS'};
 dir=await mkdtemp(join(tmpdir(),'pr41-private-backup-'));const prefix='private-releases/pr41/'+process.env.GITHUB_RUN_ID+'/',cfg=await configFile(dir,{name:'pr41-readonly-export',compatibility_date:'2026-09-03',d1_databases:[{binding:'DB',database_name:db.name,database_id:db.uuid}]},'export.jsonc');
 report.stage='D1_EXPORT';const sql=join(dir,'production.sql'),dump=await exportSql(cfg,db.name,sql),snapshot=inspectSql(dump.bytes);await verifySnapshot(db,snapshot);
 put(prefix+'production-schema32.sql',sql);let round=await get(prefix+'production-schema32.sql',join(dir,'sql-roundtrip'));check(sha(round)===dump.sha256,'D1_ROUNDTRIP');inspectSql(round);
 const counts=Object.fromEntries(snapshot.tables.filter(t=>['trips','catches','checklist_items','anglers','auth_accounts','auth_sessions','content_translations','water_measurements'].includes(t.name)).map(t=>[t.name,t.rows.length]));
 report.d1={tables:snapshot.tables.length,rows:snapshot.tables.reduce((a,t)=>a+t.rows.length,0),sha256:dump.sha256,bytes:dump.bytes.length,restore:'LOCAL_SQLITE_PASS',counts,key:prefix+'production-schema32.sql'};
 report.stage='R2_VERIFY';check(normalize(before)===normalize(await list()),'MEDIA_CHANGED');await verifySnapshot(db,snapshot);
 let mf=join(dir,'manifest.json');await writeFile(mf,JSON.stringify({source:db,media,worker:expected,objects:[],sql:report.d1}),{mode:0o600});put(prefix+'manifest.json',mf);check(sha(await get(prefix+'manifest.json',join(dir,'manifest-copy')))===sha(await readFile(mf)),'MANIFEST_ROUNDTRIP');
 let again=(await cf('/workers/scripts/dream-team/deployments')).deployments[0];check(again.versions.length===1&&again.versions[0].version_id===expected,'PRODUCTION_MOVED');
 report.media={count:0,inventory:'EMPTY_BEFORE_AND_AFTER',restore:'NO_OBJECTS',manifest:prefix+'manifest.json'};report.result='PASS';report.stage='COMPLETE';report.worker=expected;report.schema=32;
}catch(e){report.failure={stage:report.stage,code:/^[A-Z0-9_]+$/.test(e.message)?e.message:'OPERATION_FAILED',http:e.status??null,cloudflareCode:e.code??null};process.exitCode=1}
finally{if(dir)await rm(dir,{recursive:true,force:true});await mkdir('pr41-backup-status',{recursive:true});await writeFile('pr41-backup-status/summary.json',JSON.stringify(report,null,2));console.log('PR41_BACKUP '+JSON.stringify(report))}
