// Selected production D1 records and previous private checkpoint: strict read-only.
import {cf,query,productionId,wrangler,sha} from './recovery-common.mjs';
import {inspectSql,identifier,rowsDigest} from './d1-snapshot.mjs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
let dir;const report={result:'BLOCKED',productionWrites:0,downloadsOnly:true,records:{}};
const check=(x,c)=>{if(!x)throw Error(c)};
try{
 const deploy=(await cf('/workers/scripts/dream-team/deployments')).deployments[0];
 check(deploy.versions.length===1&&deploy.versions[0].percentage===100&&deploy.versions[0].version_id==='31b6b9bd-8f0b-4566-9ced-6b5bf1c26f9d','PRODUCTION_MOVED');
 const get=async sql=>{check(/^SELECT |^PRAGMA (foreign_key_check|quick_check)/.test(sql),'SELECT_ONLY');return (await query(productionId,sql)).results;};
 report.records.trips=await get("SELECT t.id,t.name,t.year,t.status,t.lake_id,l.name AS linked_lake,t.google_photos_url,(SELECT COUNT(*) FROM catches c WHERE c.trip_id=t.id AND c.deleted_at IS NULL) AS catches,(SELECT COUNT(*) FROM checklist_items i WHERE i.trip_id=t.id AND i.deleted_at IS NULL) AS checklist_items FROM trips t LEFT JOIN lakes l ON l.id=t.lake_id ORDER BY t.year,t.id");
 report.records.rules=await get("SELECT id,trip_id,title,content,source_url FROM trip_documents WHERE trip_id='next-trip' AND kind='rules' ORDER BY sort_order,id");
 report.records.lakeRules=await get("SELECT f.field,f.value,f.status,s.url AS source_url FROM lake_facts f LEFT JOIN lake_sources s ON s.id=f.source_id WHERE f.lake_id='plaine2' ORDER BY f.field");
 report.fkErrors=(await get('PRAGMA foreign_key_check')).length;report.quickCheck=(await get('PRAGMA quick_check'))[0]?.quick_check;
 dir=await mkdtemp(join(tmpdir(),'dt-accept-ro-'));const receipt=join(dir,'receipt.json'),sql=join(dir,'snapshot.sql');
 wrangler(['r2','object','get','dream-team-d1-backups/private-releases/code32/40742309300-179da4d9/receipt.json','--remote','--file',receipt]);
 const rec=JSON.parse(await readFile(receipt,'utf8'));check(rec.candidate==='179da4d917e1968f35c2ddf063790e8a0428b0a9'&&rec.schemaFrom===32,'RECEIPT_MISMATCH');
 check(rec.snapshotKey==='private-releases/code32/40742309300-179da4d9/schema32.sql','SNAPSHOT_PATH_MISMATCH');
 wrangler(['r2','object','get','dream-team-d1-backups/'+rec.snapshotKey,'--remote','--file',sql]);const bytes=await readFile(sql);check(sha(bytes)===rec.snapshotSha256,'SNAPSHOT_HASH_MISMATCH');
 const snap=inspectSql(bytes);report.snapshot={integrity:'PASS',tables:[]};
 for(const name of ['trips','lakes','catches','checklist_items','trip_documents','content_translations']){
  let t=snap.tables.find(x=>x.name===name);check(t,'SNAPSHOT_TABLE_MISSING');let actual=await get('SELECT '+t.columns.map(identifier).join(',')+' FROM '+identifier(name));
  report.snapshot.tables.push({table:name,checkpointRows:t.rows.length,currentRows:actual.length,identical:rowsDigest(actual)===rowsDigest(t.rows)});
 }
 report.result='PASS';
}catch(e){report.error=/^[A-Z0-9_]+$/.test(e.message)?e.message:'READ_ONLY_CHECK_FAILED';report.httpStatus=e.status;process.exitCode=1;}
finally{if(dir)await rm(dir,{force:true,recursive:true});console.log('ACCEPTANCE_DATA_READONLY '+JSON.stringify(report));}
