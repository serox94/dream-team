// Read-only Cloudflare D1 inventory and cleanup classification: NO Cloudflare mutations.
// The only POSTs, if any, are explicitly allowlisted read-only SQL queries.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('CREDENTIALS_UNAVAILABLE');
const origin='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const errors=[];
async function api(path,{method='GET',body}={}){
 for(let attempt=0;attempt<4;attempt++){
  let response,data;
  try{
   response=await fetch(origin+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
   data=await response.json();
  }catch(e){if(attempt<3){await sleep(300*(attempt+1));continue;}throw Error('CF_TRANSPORT '+path.slice(0,100));}
  if(response.ok&&data?.success===true)return data;
  if(([429,500,502,503,504].includes(response.status))&&attempt<3){await sleep((attempt+1)*1000);continue;}
  throw Error('CF_API_FAILED '+method+' '+path.slice(0,100)+' HTTP_'+response.status+' CODE_'+String(data?.errors?.[0]?.code||'unknown'));
 }
 throw Error('CF_RETRY_EXCEEDED '+path.slice(0,100));
}
async function pool(items,limit,fn){
 let cursor=0;const result=new Array(items.length);
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
  while(cursor<items.length){const i=cursor++;try{result[i]=await fn(items[i],i);}catch(e){result[i]={error:String(e.message).slice(0,200)};}}
 }));
 return result;
}
const d1=(await api('/d1/database?per_page=100')).result;
if(!Array.isArray(d1)||d1.length!==10)throw Error('D1_COUNT_CHANGED_OR_INCOMPLETE');
const workers=(await api('/workers/scripts')).result;
if(!Array.isArray(workers))throw Error('WORKER_LIST_INVALID');
const protectedNames=new Set(['dream-team-db','dream-team-preview-db']);
const dbs=d1.map(d=>({name:d.name,uuid:d.uuid,createdAt:d.created_at,fileSize:d.file_size,protected:protectedNames.has(d.name)}));
const byId=new Map(dbs.map(d=>[d.uuid,d]));
const refs=new Map(dbs.map(d=>[d.uuid,{active:[],otherLive:[],versions:[],settings:[],code:[]}]));
const nonDbRefs=[];
function matches(bindings){
 if(!Array.isArray(bindings))throw Error('BINDING_ARRAY_UNAVAILABLE');
 const ids=[];
 for(const b of bindings){
  const typ=b.type;
  for(const d of dbs)if((typ==='d1'&&([b.id,b.database_id,b.database_name].includes(d.uuid)||[b.id,b.database_id,b.database_name].includes(d.name)))||(typ==='plain_text'&&typeof b.text==='string'&&(b.text.includes(d.uuid)||b.text.includes(d.name)))){
   ids.push(d.uuid);
  }
 }
 return [...new Set(ids)];
}
const activeVersions=new Map();
const workerScan=[];
for(const w of workers){
 if(!/^[\w-]+$/.test(w.id))throw Error('INVALID_WORKER_ID');
 const script=w.id,workerInfo={script,history:0,historyComplete:false,historyPages:0,activeVersions:[],settingsChecked:false,errors:[]};
 const deployments=(await api('/workers/scripts/'+script+'/deployments')).result;
 const recent=deployments.deployments?.[0]?.versions||[];
 workerInfo.activeVersions=recent.map(x=>({id:x.version_id,pct:x.percentage}));
 activeVersions.set(script,new Set(recent.map(x=>x.version_id)));
 const settings=(await api('/workers/scripts/'+script+'/settings')).result;
 workerInfo.settingsChecked=true;
 for(const id of matches(settings.bindings||[]))refs.get(id).settings.push(script);
 for(const row of recent){
  const ver=(await api('/workers/scripts/'+script+'/versions/'+row.version_id)).result;
  for(const id of matches(ver.resources?.bindings||[]))refs.get(id).active.push({script,version:row.version_id,pct:row.percentage});
 }
 for(let page=1;page<=50;page++){
  const response=(await api('/workers/scripts/'+script+'/versions?per_page=100&page='+page)).result;
  if(!Array.isArray(response.items))throw Error('HISTORY_UNAVAILABLE '+script+' '+page);
  workerInfo.historyPages++;
  const items=response.items;
  workerInfo.history+=items.length;
  if(items.length>0){
   const scanned=await pool(items,6,async item=>{
    if(!/^[0-9a-f-]{36}$/.test(item.id||''))throw Error('INVALID_VERSION_ID');
    const version=(await api('/workers/scripts/'+script+'/versions/'+item.id)).result;
    return {id:item.id,matched:matches(version.resources?.bindings||[])};
   });
   for(const item of scanned){
    if(item.error)throw Error('VERSION_SCAN_INCOMPLETE '+script+' '+item.error);
    for(const id of item.matched)refs.get(id).versions.push({script,version:item.id,active:activeVersions.get(script).has(item.id)});
   }
  }
  if(items.length<100){workerInfo.historyComplete=true;break;}
 }
 if(!workerInfo.historyComplete)throw Error('HISTORY_PAGINATION_INCOMPLETE '+script);
 workerScan.push(workerInfo);
 console.log('D1_AUDIT_WORKER '+JSON.stringify({script,versions:workerInfo.history,pages:workerInfo.historyPages,settings:workerInfo.settingsChecked,historyComplete:workerInfo.historyComplete}));
}
function grepBranches(patterns){
 const branches=execFileSync('git',['for-each-ref','--format=%(refname)','refs/remotes/origin'],{encoding:'utf8'}).split('\n').filter(x=>x.startsWith('refs/remotes/origin/')&&!x.endsWith('/HEAD'));
 const matches=[];
 for(const branch of branches){
  try{
   const paths=execFileSync('git',['grep','-l','-F',...patterns.flatMap(x=>['-e',x]),branch,'--'],{encoding:'utf8',maxBuffer:1024*1024}).trim().split('\n').filter(Boolean);
   for(const path of paths)matches.push(path);
  }catch(e){if(e.status!==1)throw Error('GIT_GREP_FAILED '+branch);}
 }
 return {branchesScanned:branches.length,files:matches};
}
const gitReferences={};
for(const d of dbs){
 const found=grepBranches([d.uuid,d.name]);
 const ref=refs.get(d.uuid);
 ref.code=found.files;
 gitReferences[d.uuid]={branches:found.branchesScanned,matches:found.files.length,examples:found.files.slice(0,12)};
}
const details=await pool(dbs,4,async d=>{
 const meta=(await api('/d1/database/'+d.uuid)).result;
 if(meta.uuid!==d.uuid||meta.name!==d.name)throw Error('D1_IDENTITY_MISMATCH');
 return {name:meta.name,uuid:meta.uuid,fileSize:meta.file_size,createdAt:meta.created_at,numTables:meta.num_tables,readReplication:meta.read_replication||null};
});
for(const d of details)if(d.error)throw Error('DB_DETAILS_INCOMPLETE '+d.error);
const r2=(await api('/r2/buckets?per_page=1000')).result;
if(!Array.isArray(r2?.buckets)||r2.cursor)throw Error('R2_BUCKET_LIST_INCOMPLETE');
async function listBucket(bucket){
 let cursor=null,rows=[],pages=0;
 do{
  const path='/r2/buckets/'+encodeURIComponent(bucket)+'/objects?per_page=100'+(cursor?'&cursor='+encodeURIComponent(cursor):'');
  const response=await api(path);
  const body=response.result;
  const items=body?.objects??body;
  if(!Array.isArray(items))throw Error('R2_OBJECT_LIST_INVALID '+bucket);
  rows.push(...items);pages++;
  if(rows.length>10000||pages>200)throw Error('R2_OBJECT_LIST_EXCEEDED '+bucket);
  const next=body?.cursor??response.result_info?.cursor;
  const more=body?.truncated??response.result_info?.is_truncated??Boolean(next);
  if(!more){cursor=null;break;}
  if(!next||next===cursor)throw Error('R2_CURSOR_INVALID '+bucket);
  cursor=next;
 }while(cursor);
 return rows;
}
const bucketNames=r2.buckets.map(x=>x.name).sort();
const protectedBucket='dream-team-d1-backups';
if(!bucketNames.includes(protectedBucket))throw Error('BACKUP_BUCKET_MISSING');
const backups=await listBucket(protectedBucket);
const keys=backups.map(x=>x.key);
const todayBackup=backups.filter(x=>x.key.startsWith('dream-team-db/')&&Number(x.size)>1000).sort((a,b)=>Date.parse(b.uploaded||b.last_modified||0)-Date.parse(a.uploaded||a.last_modified||0))[0];
const receiptKey='private-releases/code32/40742309300-179da4d9/receipt.json';
const backupKey='private-releases/code32/40742309300-179da4d9/schema32.sql';
const objectDigest=async key=>{
 const uri=origin+'/r2/buckets/'+encodeURIComponent(protectedBucket)+'/objects/'+key.split('/').map(encodeURIComponent).join('/');
 const response=await fetch(uri,{method:'GET',headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('BACKUP_OBJECT_UNAVAILABLE '+response.status);
 const bytes=Buffer.from(await response.arrayBuffer());
 return {bytes,sha:createHash('sha256').update(bytes).digest('hex')};
};
const r2Release={receiptPresent:keys.includes(receiptKey),snapshotPresent:keys.includes(backupKey)};
if(r2Release.receiptPresent&&r2Release.snapshotPresent){
 const rec=JSON.parse((await objectDigest(receiptKey)).bytes.toString('utf8'));
 const sql=await objectDigest(backupKey);
 r2Release.receiptMatchesDatabase=rec.restore?.uuid==='213f3f6f-bdc3-4a0e-b098-b82489653e07'&&rec.restore?.name==='dream-team-audit-4074230930032-db';
 r2Release.backupHashMatches=sql.sha===rec.snapshotSha256;
 r2Release.actualRestore=rec.actualRestore;
 r2Release.mediaObjects=rec.media?.objects;
 r2Release.schema=rec.schemaTo;
 r2Release.snapshotBytes=sql.bytes.length;
}
const directDbInfo=await pool(dbs,4,async d=>{
 const qs=[
  ['schema','SELECT value FROM app_settings WHERE key = ?',['schema_version']],
  ['trips','SELECT COUNT(*) AS n FROM trips',[]],
  ['tables',"SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",[]],
  ['quick','PRAGMA quick_check',[]],
  ['fk','PRAGMA foreign_key_check',[]]
 ];
 const out={name:d.name,uuid:d.uuid};
 for(const [k,sql,params] of qs){
  const clean=/^(SELECT |PRAGMA (quick_check|foreign_key_check)$)/.test(sql);
  if(!clean)throw Error('QUERY_NOT_READONLY');
  const payload=(await api('/d1/database/'+d.uuid+'/query',{method:'POST',body:{sql,params}})).result;
  const rows=Array.isArray(payload)?payload[0]?.results:null;
  if(!Array.isArray(rows))throw Error('D1_QUERY_INVALID_'+k);
  out[k]=k==='fk'?{issues:rows.length}:k==='quick'?rows[0]?.quick_check:k==='schema'?rows[0]?.value||'MISSING':Number(rows[0]?.n);
 }
 return out;
});
const final={
 result:'PASS',
 scannedAt:new Date().toISOString(),mode:'READ_ONLY_D1_AND_R2_WITH_SELECT_PRAGMA_QUERIES',
 d1Count:d1.length,workersInspected:workers.length,workerVersionsInspected:workerScan.reduce((n,x)=>n+x.history,0),
 allHistoryComplete:workerScan.every(x=>x.historyComplete),
 workerScan,
 r2Buckets:bucketNames,
 r2BackupSummary:{bucket:protectedBucket,objects:backups.length,latestScheduled:todayBackup?{key:todayBackup.key,size:todayBackup.size,uploaded:todayBackup.uploaded}:null,
  code32Receipt:r2Release},
 databases:dbs.map(d=>{
  const r=refs.get(d.uuid);
  const check=directDbInfo.find(x=>x.uuid===d.uuid);
  return {...d,...details.find(x=>x.uuid===d.uuid),current:{active:r.active,settings:r.settings},
   historical:{count:r.versions.length,nonactive:r.versions.filter(x=>!x.active).length,byWorker:Object.fromEntries([...new Set(r.versions.map(x=>x.script))].map(w=>[w,r.versions.filter(x=>x.script===w).length])),examples:r.versions.slice(0,5)},
   code:gitReferences[d.uuid],integrity:check,
   decision:d.protected?'KEEP_PROTECTED':r.active.length||r.settings.length?'KEEP_ACTIVE_BINDING':r.versions.length?'REVIEW_HISTORIC_WORKER_REFERENCES':r.code.length?'REVIEW_CODE_REFERENCES':'CANDIDATE_FOR_RETIREMENT_AFTER_EXACT_BACKUP_VERIFICATION'
  };
 }),
 writes:0,deletes:0,workerDeployments:0,approvalsChanged:0
};
console.log('D1_DEEP_READONLY '+JSON.stringify(final));
if(directDbInfo.some(x=>x.error))throw Error('INTEGRITY_INSPECTION_INCOMPLETE');
