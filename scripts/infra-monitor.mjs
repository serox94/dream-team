// Read-only scheduled check; never logs object keys, account data or secrets.
import {pathToFileURL} from 'node:url';
import {cf} from './recovery-common.mjs';
import {workerMetrics,workerErrorAlert} from './infra-monitor-metrics.mjs';
import {listRestR2Objects} from '../src/backup-status.js';
const safe=e=>/^[A-Z0-9_]+$/.test(e?.message||'')?e.message:'MONITOR_ERROR';
export async function monitor({account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,fetcher=fetch,request=cf,list=listRestR2Objects,now=Date.now()}={}){
 const report={status:'FAIL',backup:'UNKNOWN',site:'UNKNOWN',checks:{}};
 // Every check runs even when an independent prerequisite fails.
 const checks={
  async backup(){
   const url=`https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/dream-team-d1-backups/objects?per_page=100&prefix=dream-team-db%2F`;
   const objects=await list(url,{authorization:'Bearer '+token});
   const sql=objects.filter(o=>typeof o.key==='string'&&o.key.endsWith('.sql'));
   const latest=Math.max(...sql.map(o=>Date.parse(o.last_modified||o.uploaded||0)).filter(Number.isFinite));
   const ageHours=(now-latest)/3600000;
   if(!Number.isFinite(ageHours)||ageHours<0||ageHours>36)throw Error('BACKUP_STALE');
   report.backup='FRESH';report.backupAgeHours=Math.round(ageHours*10)/10;
  },
  async site(){
   const r=await fetcher('https://dream-team.sewerynski00.workers.dev/login',{redirect:'manual',signal:AbortSignal.timeout(15000)});
   await r.body?.cancel();report.siteStatus=r.status;if(r.status!==200)throw Error('LOGIN_PAGE_UNAVAILABLE');report.site='UP';
  },
  async metrics(){
   const gql='query ($accountTag: string!, $start: Time!, $end: Time!) { viewer { accounts(filter: {accountTag: $accountTag}) { workersInvocationsAdaptive(limit: 1, filter: {scriptName: "dream-team", datetime_geq: $start, datetime_leq: $end}) { sum { requests errors } } } } }';
   const r=await fetcher('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({query:gql,variables:{accountTag:account,start:new Date(now-86400000).toISOString(),end:new Date(now).toISOString()}}),signal:AbortSignal.timeout(15000)});
   const g=await r.json();if(!r.ok||g.errors?.length)throw Error('WORKER_METRICS_UNAVAILABLE');
   const groups=g.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive;
   if(!groups?.length)throw Error('WORKER_METRICS_UNAVAILABLE');
   const totals=workerMetrics(groups);report.workerRequests24h=totals.requests;report.workerErrors24h=totals.errors;
   if(workerErrorAlert(totals))throw Error('WORKER_ERROR_RATE_HIGH');
  },
  async deployment(){
   const d=(await request('/workers/scripts/dream-team/deployments')).deployments?.[0];
   if(d?.versions?.length!==1||d.versions[0].percentage!==100)throw Error('WORKER_TRAFFIC_SPLIT');report.activeWorker=d.versions[0].version_id;
  }
 };
 await Promise.all(Object.entries(checks).map(async([name,check])=>{try{await check();report.checks[name]='PASS'}catch(e){report.checks[name]=safe(e)}}));
 if(Object.values(report.checks).every(s=>s==='PASS'))report.status='PASS';
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const report=await monitor();console.log('DREAMTEAM_INFRA_MONITOR '+JSON.stringify(report));if(report.status!=='PASS')process.exitCode=1;
}
