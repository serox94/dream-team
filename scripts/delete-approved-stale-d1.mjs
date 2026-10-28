// Owner-approved retirement of ONE exact old test DB. No other mutation endpoint.
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {wrangler, sha} from './recovery-common.mjs';
import {verifySnapshot} from './d1-snapshot.mjs';
import {TARGET, assertPinnedTarget, checkedSnapshot, targetReference} from './prepare-stale-d1-backup.mjs';

export const BACKUP = Object.freeze({run:'40696672859',prefix:'private-releases/stale-d1/39575383767/40696672859/',hash:'97d988530c7dd81b174ebf9de0c8dbb563f10479ad339fd84513f026116a4b66',bytes:311605});
export const APPROVAL = 'DELETE:' + TARGET.name + ':' + TARGET.id + ':BACKUP:' + BACKUP.run;
const EXPECTED_WORKER='81f011a2-ba96-4bdf-b199-10e89f8271e4';
const check=(ok,code)=>{if(!ok)throw Error(code);};
const nameOk=n=>/^dream-team(?:-[a-z0-9]+)*$/.test(n||'');
const canon=v=>Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;
const digest=v=>sha(Buffer.from(JSON.stringify(canon(v))));

export function allowedOperation(method,path,body) {
  if(method==='DELETE')return path==='/d1/database/'+TARGET.id && body===undefined;
  if(method==='POST')return path==='/d1/database/'+TARGET.id+'/query' && typeof body?.sql==='string' && !/[;]|--|\/\*/.test(body.sql) && (/^SELECT\b/i.test(body.sql)||/^PRAGMA (foreign_key_check|quick_check)$/i.test(body.sql));
  if(method!=='GET'||body!==undefined)return false;
  if(path==='/d1/database?per_page=100'||path==='/d1/database/'+TARGET.id||path==='/workers/scripts'||path==='/r2/buckets?per_page=1000')return true;
  const m=path.match(/^\/workers\/scripts\/([^/]+)\/(settings|schedules|deployments)$/);
  return Boolean(m&&nameOk(m[1]));
}

export function guardedClient({account,token,fetcher=fetch}) {
  let calls=0,deleteAttempted=false,rowsRead=0;
  return {
    get stats(){return {calls,deleteAttempted,testRowsRead:rowsRead};},
    async request(method,path,body) {
      check(/^[a-f0-9]{32}$/.test(account||'')&&Boolean(token),'CLOUDFLARE_CREDENTIALS_REQUIRED');
      check(allowedOperation(method,path,body),'UNAPPROVED_OPERATION');
      check(++calls<=120,'OPERATION_BUDGET');
      if(method==='DELETE'){check(!deleteAttempted,'SECOND_DELETE_FORBIDDEN');deleteAttempted=true;}
      let response;
      try {response=await fetcher('https://api.cloudflare.com/client/v4/accounts/'+account+path,{method,redirect:'error',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});}
      catch {throw Error(method==='DELETE'?'DELETE_TRANSPORT_UNCERTAIN':'CONTROL_PLANE_TRANSPORT_FAILED');}
      let data;try{data=await response.json();}catch{data=null;}
      if(!response.ok||data?.success!==true){const e=Error('CLOUDFLARE_OPERATION_FAILED');e.status=response.status;const code=Number(data?.errors?.[0]?.code);if(Number.isSafeInteger(code)&&code>=0)e.code=code;throw e;}
      if(method==='POST'){rowsRead+=Number(data.result?.[0]?.meta?.rows_read||0);check(rowsRead<=10000,'TEST_DATABASE_READ_BUDGET');}
      return data;
    }
  };
}

export function validateRecovery(receipt,bytes) {
  check(receipt?.format==='dream-stale-test-backup-v1'&&receipt.source?.id===TARGET.id&&receipt.source?.name===TARGET.name,'BACKUP_RECEIPT_TARGET_MISMATCH');
  check(receipt.privateSqlKey===BACKUP.prefix+'schema.sql'&&receipt.sqlSha256===BACKUP.hash,'BACKUP_RECEIPT_HASH_MISMATCH');
  check(receipt.productionWorker===EXPECTED_WORKER&&receipt.productionDeploymentUnchanged===true&&receipt.deletePerformed===false,'BACKUP_PRODUCTION_EVIDENCE_MISMATCH');
  check(receipt.dependencies?.historicalReadsComplete===true&&receipt.dependencies.activeReferences?.length===0,'BACKUP_DEPENDENCY_EVIDENCE_REQUIRED');
  const expected=new Set(['af3cac1e-65ba-4a87-b2fc-65751b0a924d','ef951917-165e-49ac-b378-97e0bde15c27']);
  check(receipt.dependencies.historicalReferences?.length===2&&receipt.dependencies.historicalReferences.every(x=>x.worker==='dream-team-pro2-preview'&&expected.has(x.version)),'UNAPPROVED_HISTORICAL_REFERENCE');
  check(bytes.length===BACKUP.bytes&&sha(bytes)===BACKUP.hash,'PRIVATE_SQL_HASH_MISMATCH');
  const restored=checkedSnapshot(bytes);
  check(restored.summary.tables===32&&restored.summary.rows===978&&String(restored.summary.schemaVersion)==='30','PINNED_RESTORE_MISMATCH');
  check(restored.summary.contentDigest===receipt.restore?.contentDigest,'RESTORED_CONTENT_MISMATCH');
  return restored;
}

export function verifyOnlyTargetRemoved(before,after) {
  check(before.length===10&&after.length===9,'EXPECTED_D1_COUNT_MISMATCH');
  const identity=list=>list.map(x=>({uuid:x.uuid,name:x.name})).sort((a,b)=>a.uuid.localeCompare(b.uuid));
  check(before.filter(d=>d.uuid===TARGET.id&&d.name===TARGET.name).length===1,'EXACT_TARGET_NOT_IN_SOURCE');
  check(!after.some(d=>d.uuid===TARGET.id||d.name===TARGET.name),'TARGET_STILL_PRESENT');
  check(digest(identity(before.filter(x=>x.uuid!==TARGET.id)))===digest(identity(after)),'OTHER_DATABASE_INVENTORY_CHANGED');
}

async function main() {
  const report={result:'BLOCKED',mode:'EXACT_APPROVED_TEST_DB_DELETE',target:TARGET.name,productionWrites:0,productionQueries:0,workerDeployments:0,approvalChanges:0,backupWrites:0,otherResourceDeletes:0,deleteRequests:0};
  const dir=await mkdtemp(join(tmpdir(),'dream-approved-delete-'));let phase='OWNER_APPROVAL';
  const client=guardedClient({account:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.CLOUDFLARE_API_TOKEN});
  const read=async p=>(await client.request('GET',p)).result;
  const list=async()=>{const d=await client.request('GET','/d1/database?per_page=100');check(Array.isArray(d.result)&&(!d.result_info?.total_count||d.result_info.total_count===d.result.length),'INCOMPLETE_D1_INVENTORY');return d.result;};
  const production=async()=>{
    const deployment=(await read('/workers/scripts/dream-team/deployments')).deployments?.[0];
    check(deployment?.versions?.length===1&&deployment.versions[0].percentage===100&&deployment.versions[0].version_id===EXPECTED_WORKER,'PRODUCTION_WORKER_CHANGED');
    const settings=await read('/workers/scripts/dream-team/settings');
    const schedules=await read('/workers/scripts/dream-team/schedules'),backupSchedules=await read('/workers/scripts/dream-team-d1-backup/schedules');
    return {deployment,settings,schedules,backupSchedules};
  };
  const privateBackup=async suffix=>{
    const file=join(dir,suffix);
    wrangler(['r2','object','get','dream-team-d1-backups/'+BACKUP.prefix+suffix,'--remote','--file',file]);
    return readFile(file);
  };
  try {
    check(process.env.STALE_D1_DELETE_APPROVAL===APPROVAL,'EXACT_TARGET_OWNER_APPROVAL_REQUIRED');
    phase='CURRENT_INVENTORY';
    const before=await list(),present=before.some(d=>d.uuid===TARGET.id&&d.name===TARGET.name);
    const prodBefore=await production();
    const bucketsBefore=await read('/r2/buckets?per_page=1000');
    check(Array.isArray(bucketsBefore?.buckets),'BUCKET_INVENTORY_FORMAT');
    check(before.length===(present?10:9),'UNEXPECTED_CAPACITY_STATE');
    phase='VERIFY_PRIVATE_BACKUP';
    const receiptBytes=await privateBackup('receipt.json'),sqlBytes=await privateBackup('schema.sql');
    const receipt=JSON.parse(receiptBytes.toString()),restored=validateRecovery(receipt,sqlBytes);
    report.backup={run:BACKUP.run,privateSqlKey:BACKUP.prefix+'schema.sql',sha256:BACKUP.hash,localRestore:'PASS',tables:restored.summary.tables,rows:restored.summary.rows};
    phase='CURRENT_ACTIVE_BINDINGS';
    const workers=await read('/workers/scripts');check(Array.isArray(workers)&&workers.length<=20,'WORKER_INVENTORY_BUDGET');
    const active=[];
    for(const worker of workers){check(nameOk(worker.id),'UNREVIEWED_WORKER_NAME');const s=await read('/workers/scripts/'+worker.id+'/settings');check(Array.isArray(s?.bindings),'ACTIVE_BINDINGS_FORMAT');if(targetReference(s.bindings))active.push(worker.id);}
    check(active.length===0,'TARGET_HAS_ACTIVE_BINDING');report.activeReferences=[];
    if(present){
      phase='VERIFY_CURRENT_TEST_ROWS';assertPinnedTarget(await read('/d1/database/'+TARGET.id));
      await verifySnapshot({name:TARGET.name,uuid:TARGET.id},restored.snapshot,async(id,sql,params=[])=>{check(id===TARGET.id,'SOURCE_QUERY_TARGET_CHANGED');return (await client.request('POST','/d1/database/'+TARGET.id+'/query',{sql,params})).result[0];});
      report.currentTestRowsMatchBackup='PASS';
      phase='FINAL_PRE_DELETE_GATE';
      check(digest((await production()))===digest(prodBefore),'PRODUCTION_STATE_MOVED');
      const now=await list();check(digest(now.map(d=>[d.uuid,d.name]).sort())===digest(before.map(d=>[d.uuid,d.name]).sort()),'DATABASE_INVENTORY_MOVED');
      phase='ONE_APPROVED_DELETE';report.deleteRequests=1;
      try{await client.request('DELETE','/d1/database/'+TARGET.id);report.deleteResponseAccepted=true;}
      catch(e){report.deleteResponseAccepted=false;report.deleteResponseFailure={error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'DELETE_RESPONSE_FAILED',...(e.status?{httpStatus:e.status}:{}),...(Number.isInteger(e.code)?{cloudflareCode:e.code}:{})};}
    }else report.alreadyAbsentBeforeRun=true;
    phase='VERIFY_TARGET_ABSENT';
    let after;
    for(let attempt=0;attempt<5;attempt++){after=await list();if(!after.some(d=>d.uuid===TARGET.id||d.name===TARGET.name))break;if(attempt<4)await new Promise(r=>setTimeout(r,1000));}
    if(present)verifyOnlyTargetRemoved(before,after);else {
      check(after.length===9&&!after.some(d=>d.uuid===TARGET.id||d.name===TARGET.name),'TARGET_ABSENCE_NOT_CONFIRMED');
      check(digest(before.map(d=>[d.uuid,d.name]).sort())===digest(after.map(d=>[d.uuid,d.name]).sort()),'OTHER_DATABASE_INVENTORY_CHANGED');
    }
    phase='VERIFY_PRODUCTION_AND_BACKUP_RETAINED';
    check(digest(await production())===digest(prodBefore),'PRODUCTION_OR_SCHEDULE_CHANGED');
    const bucketsAfter=await read('/r2/buckets?per_page=1000');
    check(digest(bucketsBefore.buckets.map(b=>b.name).sort())===digest((bucketsAfter?.buckets||[]).map(b=>b.name).sort()),'BUCKET_INVENTORY_CHANGED');
    check(sha(await privateBackup('schema.sql'))===BACKUP.hash,'RETAINED_SQL_BACKUP_MISMATCH');
    check(sha(await privateBackup('receipt.json'))===sha(receiptBytes),'RETAINED_RECEIPT_MISMATCH');
    Object.assign(report,{result:'PASS',targetAbsent:true,d1Before:before.length,d1After:after.length,privateBackupRetained:'PASS',otherDatabasesPreserved:'PASS',productionUnchanged:'PASS',schedulesUnchanged:'PASS',r2BucketInventoryUnchanged:'PASS',activeProductionWorker:EXPECTED_WORKER,retiredTestVersions:[1,2]});
  }catch(e){report.failure={phase,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'APPROVED_DELETE_FAILED',...(e.status?{httpStatus:e.status}:{}),...(Number.isInteger(e.code)?{cloudflareCode:e.code}:{})};process.exitCode=1;}
  finally{report.operations=client.stats;await rm(dir,{recursive:true,force:true});await mkdir('approved-delete-status',{recursive:true});await writeFile('approved-delete-status/summary.json',JSON.stringify(report,null,2),{mode:0o600});console.log('APPROVED_STALE_D1_DELETE '+JSON.stringify(report));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
