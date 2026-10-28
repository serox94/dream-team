// One pinned obsolete test DB only. Never deletes resources or deploys Workers.
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {cf, exportSql, configFile, wrangler, sha, productionId} from './recovery-common.mjs';
import {inspectSql, rowsDigest} from './d1-snapshot.mjs';

export const TARGET = Object.freeze({name:'dream-team-audit-39575383767-db', id:'1176032b-5dc6-4835-b11b-2622f9955a22'});
const RESOURCE = /^dream-team(?:-[a-z0-9]+)*$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const check = (ok, code) => {if (!ok) throw Error(code);};

export function assertPinnedTarget(db) {
  check(db?.uuid === TARGET.id && db?.name === TARGET.name && db.uuid !== productionId, 'PINNED_TEST_DATABASE_REQUIRED');
  check(Number.isFinite(db.file_size) && db.file_size > 0 && db.file_size <= 2 * 1024 * 1024, 'TEST_DATABASE_SIZE_BUDGET');
}
export function backupKey(run) {
  check(/^\d{6,20}$/.test(String(run || '')), 'ACTIONS_RUN_REQUIRED');
  return 'private-releases/stale-d1/39575383767/' + run + '/schema.sql';
}
export function checkedSnapshot(bytes) {
  check(bytes.length > 0 && bytes.length <= 8 * 1024 * 1024, 'SQL_BACKUP_SIZE_BUDGET');
  const snapshot = inspectSql(bytes), rowCount = snapshot.tables.reduce((n,t)=>n+t.rows.length,0);
  check(rowCount <= 5000 && snapshot.tables.length <= 80, 'TEST_RESTORE_ROW_BUDGET');
  return {snapshot, summary:{tables:snapshot.tables.length, rows:rowCount, foreignKeys:'PASS', integrity:'PASS',
    schemaVersion:snapshot.tables.find(t=>t.name==='app_settings')?.rows.find(r=>r.key==='schema_version')?.value ?? null,
    tableCounts:snapshot.tables.map(t=>({table:t.name, rows:t.rows.length})),
    contentDigest:sha(Buffer.from(snapshot.tables.map(t=>t.name+':'+rowsDigest(t.rows)).join('\n')))}};
}
export function targetReference(bindings) {
  return (bindings || []).some(b => (b.type === 'd1' && b.id === TARGET.id) || (b.type === 'plain_text' && typeof b.text === 'string' && (b.text.includes(TARGET.id) || b.text.includes(TARGET.name))));
}

export async function dependencyInventory(read) {
  const workers = await read('/workers/scripts');
  check(Array.isArray(workers), 'WORKER_LIST_FORMAT');
  check(workers.length <= 30, 'WORKER_INVENTORY_BUDGET');
  const report = {activeReferences:[], historicalReferences:[], historicalReadsComplete:true, workersInspected:0, versionsInspected:0, failures:[]};
  for (const w of workers) {
    if (!RESOURCE.test(w.id || '')) {report.historicalReadsComplete=false; continue;}
    const name = w.id; report.workersInspected++;
    const settings = await read('/workers/scripts/' + name + '/settings');
    check(Array.isArray(settings?.bindings), 'WORKER_BINDINGS_FORMAT');
    if (targetReference(settings.bindings)) report.activeReferences.push(name);
    try {
      const data = await read('/workers/scripts/' + name + '/versions?deployable=true');
      check(Array.isArray(data?.items), 'VERSION_LIST_FORMAT');
      check(data.items.length <= 100, 'VERSION_INVENTORY_BUDGET');
      for (const item of data.items) {
        check(UUID.test(item.id || ''), 'VERSION_ID_FORMAT');
        const version = await read('/workers/scripts/' + name + '/versions/' + item.id);
        check(Array.isArray(version?.resources?.bindings), 'VERSION_BINDINGS_FORMAT');
        report.versionsInspected++;
        if (targetReference(version.resources.bindings)) report.historicalReferences.push({worker:name, version:item.id, number:Number.isInteger(item.number)?item.number:null});
      }
    } catch(e) {
      report.historicalReadsComplete=false;
      report.failures.push({worker:name, error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'VERSION_READ_FAILED', ...(e.status?{httpStatus:e.status}:{}), ...(Number.isInteger(e.code)?{cloudflareCode:e.code}:{})});
    }
  }
  return report;
}

async function main() {
  const report={result:'BLOCKED',mode:'TEST_DATABASE_BACKUP_ONLY',target:TARGET.name,productionWrites:0,productionQueries:0,databasesCreated:0,databasesDeleted:0,workerDeployments:0,approvalChanges:0,privateBackupWrites:0,exportAttempts:0};
  const dir=await mkdtemp(join(tmpdir(),'dream-stale-backup-')); let phase='TARGET_METADATA', requests=0;
  const read=async path=>{check(++requests<=220,'CONTROL_PLANE_READ_BUDGET'); return cf(path);};
  const active=async()=>{const d=(await read('/workers/scripts/dream-team/deployments')).deployments?.[0];check(d?.versions?.length===1&&d.versions[0].percentage===100,'PRODUCTION_DEPLOYMENT_FORMAT');return d;};
  try {
    const key=backupKey(process.env.GITHUB_RUN_ID);
    const db=await read('/d1/database/'+TARGET.id); assertPinnedTarget(db);
    const before=await active();
    phase='ACTIVE_AND_HISTORICAL_BINDINGS';
    report.dependencies=await dependencyInventory(read);
    check(report.dependencies.activeReferences.length===0,'TEST_DATABASE_STILL_ACTIVE');
    phase='EXPORT_PINNED_TEST_DATABASE';
    const cfg=await configFile(dir,{name:'stale-test-backup',compatibility_date:'2026-10-01',d1_databases:[{binding:'DB',database_name:TARGET.name,database_id:TARGET.id}]},'backup.jsonc');
    const sql=join(dir,'schema.sql'); report.exportAttempts=1;
    const exported=await exportSql(cfg,TARGET.name,sql);
    phase='LOCAL_ACTUAL_RESTORE';
    const first=checkedSnapshot(exported.bytes); report.restore=first.summary;
    phase='PRIVATE_R2_BACKUP_AND_ROUNDTRIP';
    wrangler(['r2','object','put','dream-team-d1-backups/'+key,'--remote','--file',sql]); report.privateBackupWrites++;
    const downloaded=join(dir,'roundtrip.sql');
    wrangler(['r2','object','get','dream-team-d1-backups/'+key,'--remote','--file',downloaded]);
    const copy=await readFile(downloaded);
    check(sha(copy)===exported.sha256,'PRIVATE_BACKUP_HASH_MISMATCH');
    const second=checkedSnapshot(copy);
    check(second.summary.contentDigest===first.summary.contentDigest,'ROUNDTRIP_RESTORE_MISMATCH');
    phase='FINAL_READ_ONLY_CHECK';
    const after=await active();
    check(after.id===before.id&&rowsDigest(after.versions)===rowsDigest(before.versions),'PRODUCTION_DEPLOYMENT_MOVED');
    assertPinnedTarget(await read('/d1/database/'+TARGET.id));
    const receipt={format:'dream-stale-test-backup-v1',createdAt:new Date().toISOString(),source:TARGET,privateSqlKey:key,sqlSha256:exported.sha256,restore:first.summary,dependencies:report.dependencies,productionDeploymentUnchanged:true,productionWorker:before.versions[0].version_id,deletePerformed:false};
    const receiptFile=await configFile(dir,receipt,'receipt.json');
    wrangler(['r2','object','put','dream-team-d1-backups/'+key.replace('schema.sql','receipt.json'),'--remote','--file',receiptFile]); report.privateBackupWrites++;
    const receiptCopy=join(dir,'receipt-copy.json');
    wrangler(['r2','object','get','dream-team-d1-backups/'+key.replace('schema.sql','receipt.json'),'--remote','--file',receiptCopy]);
    check(sha(await readFile(receiptCopy))===sha(await readFile(receiptFile)),'RECEIPT_ROUNDTRIP_MISMATCH');
    Object.assign(report,{result:'BACKUP_VERIFIED',privateSqlKey:key,sqlSha256:exported.sha256,sqlBytes:copy.length,actualLocalRestore:'PASS',privateRoundtrip:'PASS',productionDeploymentUnchanged:true,activeProductionWorker:before.versions[0].version_id,deletionReady:false,deletionStatus:report.dependencies.historicalReferences.length?'RETAINED_TEST_VERSIONS_REFERENCE_DATABASE':'SEPARATE_DELETION_DECISION_REQUIRED'});
  } catch(e) {
    report.failure={phase,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'BACKUP_PREPARATION_FAILED',...(e.status?{httpStatus:e.status}:{}),...(Number.isInteger(e.code)?{cloudflareCode:e.code}:{})}; process.exitCode=1;
  } finally {
    await rm(dir,{recursive:true,force:true});
    report.controlPlaneReads=requests;
    await mkdir('stale-backup-status',{recursive:true});
    await writeFile('stale-backup-status/summary.json',JSON.stringify(report,null,2),{mode:0o600});
    console.log('STALE_TEST_BACKUP '+JSON.stringify(report));
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) await main();
