// One exact, user-approved disposable D1: backup-only; NEVER deletes a database.
// The source is known to have no user schema objects, verified by remote SQL + history.
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {inspect} from './audit-407032-readonly.mjs';
import {configFile,wrangler,sha,productionId} from './recovery-common.mjs';

export const TARGET=Object.freeze({name:'dream-team-audit-4070321412132-db',uuid:'36f63ef7-2df9-40ed-9b65-68ceca1624f4'});
const BASE='private-releases/stale-d1/4070321412132/';
const WORKER='81f011a2-ba96-4bdf-b199-10e89f8271e4';
const check=(ok,code)=>{if(!ok)throw Error(code);};
export function keys(run){
 check(/^\d{6,20}$/.test(String(run||'')),'RUN_ID_REQUIRED');
 return {prefix:BASE+run+'/',sql:BASE+run+'/schema.sql',receipt:BASE+run+'/receipt.json'};
}
export function assertExactEmptySource(r){
 check(r?.result==='PASS'&&r?.mode==='TARGETED_READ_ONLY','READ_ONLY_EVIDENCE_REQUIRED');
 check(r.target?.name===TARGET.name&&r.target?.uuid===TARGET.uuid&&TARGET.uuid!==productionId,'SOURCE_IDENTITY_CHANGED');
 check(r.d1Count===10&&r.schemaObjectsCount===0&&r.schemaObjects?.length===0,'NOT_EMPTY_OR_CAPACITY_MOVED');
 check(r.activeReferences?.length===0&&r.historicalReferences?.length===0&&r.versionsInspected>=270,'SOURCE_HAS_WORKER_REFERENCES');
 check(r.productionWorker===WORKER,'PRODUCTION_VERSION_MOVED');
 check(r.operations?.deleteCalls===0&&r.operations?.productionSqlCalls===0,'UNSAFE_PREFLIGHT');
}
export function localEmptyRestore(sql){
 check(sql?.length>0&&sql.length<=1024*1024,'BACKUP_SQL_BUDGET');
 const db=new DatabaseSync(':memory:',{enableForeignKeyConstraints:false});
 try{
  db.exec(Buffer.from(sql).toString('utf8'));
  const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT GLOB '_cf_*' AND name NOT GLOB 'sqlite_*' ORDER BY type,name").all();
  check(schema.length===0,'BACKUP_RESTORE_SCHEMA_MISMATCH');
  check(db.prepare('PRAGMA foreign_key_check').all().length===0,'BACKUP_FOREIGN_KEYS_FAILED');
  check(db.prepare('PRAGMA integrity_check').get().integrity_check==='ok','BACKUP_INTEGRITY_FAILED');
  return {schemaObjects:0,rows:0,foreignKeys:'PASS',integrity:'PASS',restoreMethod:'LOCAL_SQLITE'};
 }finally{db.close();}
}
async function main(){
 const report={result:'BLOCKED',mode:'PINNED_DISPOSABLE_D1_BACKUP_ONLY',target:TARGET.name,uuid:TARGET.uuid,
  databaseDeletes:0,databaseCreates:0,productionQueries:0,productionDeployments:0,productionChanges:0,otherResourceWrites:0};
 let dir=null,phase='IDENTITY_PREFLIGHT';
 try{
  const run=process.env.GITHUB_RUN_ID,k=keys(run);
  dir=await mkdtemp(join(tmpdir(),'dream-disposable-backup-'));
  const before=await inspect();assertExactEmptySource(before);
  phase='EXACT_SOURCE_SQL_EXPORT';
  const config=await configFile(dir,{name:'single-pinned-source',compatibility_date:'2026-10-01',
   d1_databases:[{binding:'DB',database_name:TARGET.name,database_id:TARGET.uuid}]},'backup.jsonc');
  const sqlFile=join(dir,'schema.sql');
  wrangler(['d1','export',TARGET.name,'--remote','--config',config,'--output',sqlFile]);
  const bytes=await readFile(sqlFile), restored=localEmptyRestore(bytes);
  phase='PRIVATE_R2_BACKUP';
  wrangler(['r2','object','put','dream-team-d1-backups/'+k.sql,'--remote','--file',sqlFile]);
  const copyFile=join(dir,'roundtrip.sql');
  wrangler(['r2','object','get','dream-team-d1-backups/'+k.sql,'--remote','--file',copyFile]);
  const copy=await readFile(copyFile);
  check(sha(copy)===sha(bytes),'PRIVATE_SQL_ROUNDTRIP_MISMATCH');
  check(JSON.stringify(localEmptyRestore(copy))===JSON.stringify(restored),'LOCAL_RESTORE_ROUNDTRIP_MISMATCH');
  phase='PRIVATE_R2_RECEIPT';
  const receipt={format:'dream-exact-disposable-empty-backup-v1',source:TARGET,run:String(run),createdAt:new Date().toISOString(),
   key:k.sql,sha256:sha(bytes),bytes:bytes.length,localRestore:restored,
   activeReferences:before.activeReferences,historicalReferences:before.historicalReferences,
   versionsInspected:before.versionsInspected,productionWorker:before.productionWorker,
   productionDeploymentId:before.productionDeploymentId,releaseBackupSeparate:true,deletePerformed:false};
  const receiptFile=await configFile(dir,receipt,'receipt.json');
  wrangler(['r2','object','put','dream-team-d1-backups/'+k.receipt,'--remote','--file',receiptFile]);
  const second=join(dir,'roundtrip-receipt.json');
  wrangler(['r2','object','get','dream-team-d1-backups/'+k.receipt,'--remote','--file',second]);
  check(sha(await readFile(second))===sha(await readFile(receiptFile)),'PRIVATE_RECEIPT_ROUNDTRIP_MISMATCH');
  Object.assign(report,{result:'BACKUP_VERIFIED',backupRun:String(run),sqlKey:k.sql,receiptKey:k.receipt,
   sqlSha256:receipt.sha256,sqlBytes:bytes.length,actualLocalRestore:'PASS',privateRoundtrip:'PASS',
   sourceUserSchemaObjects:0,retainedVersionsInspected:before.versionsInspected,activeProductionWorker:before.productionWorker,
   deletionStatus:'NOT_PERFORMED'});
 }catch(e){report.failure={phase,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'BACKUP_FAILED'};process.exitCode=1;}
 finally{
  if(dir)await rm(dir,{force:true,recursive:true});
  await mkdir('disposable-backup-status',{recursive:true});
  await writeFile('disposable-backup-status/summary.json',JSON.stringify(report,null,2),{mode:0o600});
  console.log('EXACT_D1_BACKUP '+JSON.stringify(report));
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
