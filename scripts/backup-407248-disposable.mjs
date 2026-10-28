// Private target-specific backup of only the failed schema32 release disposable D1.
// NO DELETE, NO database create, NO production SQL or Worker deployments.
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {cf,query,productionId,configFile,exportSql,wrangler,sha} from './recovery-common.mjs';
import {inspectSql,rowsDigest,identifier} from './d1-snapshot.mjs';
const check=(b,c)=>{if(!b)throw Error(c);};
export const TARGET={name:'dream-team-audit-4072485184932-db',uuid:'ee58d26e-26f9-4f25-bbe9-944d6fa91c56'};
export const keyFor=run=>{check(/^\d{6,20}$/.test(String(run||'')),'RUN_ID_INVALID');
 return 'private-releases/stale-d1/40724851849/'+run;};
let dir;
const report={result:'BLOCKED',mode:'EXACT_RELEASE_407248_DISPOSABLE_BACKUP_ONLY',target:TARGET,
 databaseDeletes:0,databaseCreates:0,workerDeployments:0,productionSqlQueries:0,productionWrites:0,approvalChanges:0};
let phase='PREFLIGHT';
try{
 check(process.env.GITHUB_REPOSITORY==='serox94/dream-team','REPOSITORY_MISMATCH');
 const db=await cf('/d1/database/'+TARGET.uuid);
 check(db.name===TARGET.name&&db.uuid===TARGET.uuid&&TARGET.uuid!==productionId,'WRONG_TEST_DATABASE');
 check(db.file_size>0&&db.file_size<8*1024*1024,'SOURCE_SIZE_LIMIT');
 const current=(await cf('/workers/scripts/dream-team/deployments')).deployments?.[0];
 check(current?.versions?.length===1&&current.versions[0].version_id==='81f011a2-ba96-4bdf-b199-10e89f8271e4'&&current.versions[0].percentage===100,'PRODUCTION_CHANGED');
 const databaseList=await cf('/d1/database?per_page=100');
 check(databaseList.length===10&&databaseList.some(x=>x.name===TARGET.name&&x.uuid===TARGET.uuid),'D1_INVENTORY_CHANGED');
 dir=await mkdtemp(join(tmpdir(),'failed-release-private-backup-'));
 phase='EXACT_D1_EXPORT';
 const cfg=await configFile(dir,{name:'exact-audit-backup',compatibility_date:'2026-10-01',
  d1_databases:[{binding:'DB',database_name:TARGET.name,database_id:TARGET.uuid}]},'export.jsonc');
 const output=join(dir,'schema.sql'),backup=await exportSql(cfg,TARGET.name,output);
 check(backup.bytes.length>1000&&backup.bytes.length<8*1024*1024,'SQL_SIZE_INVALID');
 phase='SQLITE_LOCAL_RESTORE';
 const snapshot=inspectSql(backup.bytes);
 check(snapshot.tables.length===37&&snapshot.tables.reduce((n,t)=>n+t.rows.length,0)===2910,'SOURCE_SNAPSHOT_SHAPE_CHANGED');
 const settings=snapshot.tables.find(t=>t.name==='app_settings')?.rows.find(row=>row.key==='schema_version');
 check(settings?.value==='32','SNAPSHOT_SCHEMA_CHANGED');
 phase='SOURCE_ROW_DIGESTS';
 let checked=0;
 for(const table of snapshot.tables){
  const result=await query(TARGET.uuid,'SELECT * FROM '+identifier(table.name));
  check(rowsDigest(result.results)===rowsDigest(table.rows),'SOURCE_ROWS_MISMATCH');
  checked+=result.results.length;
 }
 const remoteSequences=(await query(TARGET.uuid,"SELECT name,seq FROM sqlite_sequence WHERE name NOT GLOB '_cf_*' ORDER BY name")).results;
 check(rowsDigest(remoteSequences)===rowsDigest(snapshot.sequences),'SOURCE_SEQUENCES_MISMATCH');
 check((await query(TARGET.uuid,'PRAGMA foreign_key_check')).results.length===0,'REMOTE_FK_FAILED');
 check((await query(TARGET.uuid,'PRAGMA quick_check')).results[0].quick_check==='ok','REMOTE_INTEGRITY_FAILED');
 phase='PRIVATE_R2_SQL_ROUNDTRIP';
 const prefix=keyFor(process.env.GITHUB_RUN_ID),sqlKey=prefix+'/schema.sql',receiptKey=prefix+'/receipt.json';
 wrangler(['r2','object','put','dream-team-d1-backups/'+sqlKey,'--remote','--file',output]);
 const copy=join(dir,'sql-copy.sql');
 wrangler(['r2','object','get','dream-team-d1-backups/'+sqlKey,'--remote','--file',copy]);
 const copied=await readFile(copy);
 check(sha(copied)===backup.sha256,'SQL_SHA_MISMATCH');
 const restored=inspectSql(copied);
 check(restored.tables.length===37&&restored.tables.reduce((n,t)=>n+t.rows.length,0)===2910,'ROUNDTRIP_RESTORE_FAILED');
 for(let i=0;i<snapshot.tables.length;i++)check(
  snapshot.tables[i].name===restored.tables[i].name&&rowsDigest(snapshot.tables[i].rows)===rowsDigest(restored.tables[i].rows),
  'ROUNDTRIP_ROWS_CHANGED');
 check(rowsDigest(snapshot.schema)===rowsDigest(restored.schema)&&rowsDigest(snapshot.sequences)===rowsDigest(restored.sequences),
  'ROUNDTRIP_SCHEMA_SEQUENCES_CHANGED');
 phase='RECEIPT_AND_FINAL_IDENTITY';
 check((await cf('/d1/database/'+TARGET.uuid)).name===TARGET.name,'SOURCE_CHANGED');
 check((await cf('/workers/scripts/dream-team/deployments')).deployments?.[0]?.id===current.id,'PRODUCTION_DEPLOYMENT_CHANGED');
 const receipt={format:'failed-release-407248-d1-snapshot-v1',run:process.env.GITHUB_RUN_ID,
  createdAt:new Date().toISOString(),target:TARGET,sqlKey,sqlSha256:backup.sha256,sqlBytes:backup.bytes.length,
  tables:37,rows:2910,validatedRows:checked,integrity:'PASS',foreignKeys:'PASS',
  localRestore:'PASS',privateRoundtrip:'PASS',activeProductionWorker:'81f011a2-ba96-4bdf-b199-10e89f8271e4',
  historicalWorkerBindings:'NOT_CHECKED_BY_BACKUP_JOB',deletePerformed:false};
 const receiptFile=await configFile(dir,receipt,'receipt.json');
 wrangler(['r2','object','put','dream-team-d1-backups/'+receiptKey,'--remote','--file',receiptFile]);
 const returned=join(dir,'receipt-copy.json');
 wrangler(['r2','object','get','dream-team-d1-backups/'+receiptKey,'--remote','--file',returned]);
 check(sha(await readFile(returned))===sha(await readFile(receiptFile)),'RECEIPT_SHA_MISMATCH');
 Object.assign(report,{result:'BACKUP_VERIFIED',sqlKey,receiptKey,sqlSha256:backup.sha256,
  sqlBytes:backup.bytes.length,tables:37,rows:2910,sourceRowDigests:'PASS',
  localRestore:'PASS',privateRoundtrip:'PASS',retirementApproved:false});
}catch(e){
 report.failure={phase,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'BACKUP_OPERATION_FAILED'};
 process.exitCode=1;
}finally{
 if(dir)await rm(dir,{recursive:true,force:true});
 await mkdir('failed-release-d1-backup',{recursive:true});
 await writeFile('failed-release-d1-backup/summary.json',JSON.stringify(report,null,2),{mode:0o600});
 console.log('EXACT_407248_D1_BACKUP '+JSON.stringify(report));
}
