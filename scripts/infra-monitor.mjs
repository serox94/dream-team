// Read-only scheduled check; never logs object keys, account data or secrets.
import {cf} from './recovery-common.mjs';
import {workerMetrics,workerErrorAlert} from './infra-monitor-metrics.mjs';
import {listRestR2Objects} from '../src/backup-status.js';
const report={status:'FAIL',backup:'UNKNOWN',site:'UNKNOWN'};
try{
 const url='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/r2/buckets/dream-team-d1-backups/objects?per_page=100&prefix=dream-team-db%2F';
 const objects=await listRestR2Objects(url,{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN});
 const sql=objects.filter(o=>typeof o.key==='string'&&o.key.endsWith('.sql'));
 const latest=Math.max(...sql.map(o=>Date.parse(o.last_modified||o.uploaded||0)).filter(Number.isFinite));
 const ageHours=(Date.now()-latest)/3600000;
 if(!Number.isFinite(ageHours)||ageHours<0||ageHours>36)throw Error('BACKUP_STALE');
 report.backup='FRESH';report.backupAgeHours=Math.round(ageHours*10)/10;
 const r=await fetch('https://dream-team.sewerynski00.workers.dev/login',{redirect:'manual',signal:AbortSignal.timeout(15000)});
 report.siteStatus=r.status;if(r.status!==200)throw Error('LOGIN_PAGE_UNAVAILABLE');report.site='UP';
 const end=new Date(),start=new Date(end.getTime()-24*60*60*1000);
 const gql='query ($accountTag: string!, $start: Time!, $end: Time!) { viewer { accounts(filter: {accountTag: $accountTag}) { workersInvocationsAdaptive(limit: 1, filter: {scriptName: "dream-team", datetime_geq: $start, datetime_leq: $end}) { sum { requests errors } } } } }';
 const gr=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},body:JSON.stringify({query:gql,variables:{accountTag:process.env.CLOUDFLARE_ACCOUNT_ID,start:start.toISOString(),end:end.toISOString()}}),signal:AbortSignal.timeout(15000)});
 const g=await gr.json();if(!gr.ok||g.errors?.length)throw Error('WORKER_METRICS_UNAVAILABLE');
 const totals=workerMetrics(g.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive);
 report.workerRequests24h=totals.requests;report.workerErrors24h=totals.errors;
 if(workerErrorAlert(totals))throw Error('WORKER_ERROR_RATE_HIGH');
 const d=(await cf('/workers/scripts/dream-team/deployments')).deployments[0];if(d.versions?.length!==1||d.versions[0].percentage!==100)throw Error('WORKER_TRAFFIC_SPLIT');report.activeWorker=d.versions[0].version_id;
 report.status='PASS';
}catch(e){report.error=/^[A-Z0-9_]+$/.test(e.message)?e.message:'MONITOR_ERROR';process.exitCode=1}
finally{console.log('DREAMTEAM_INFRA_MONITOR '+JSON.stringify(report))}
