// Operational branch only. Application checkout remains the exact approved candidate.
// inspect performs GET/SELECT only; production writes require the existing environment approval gate.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {cf,query,productionId,remoteDb,sha} from './recovery-common.mjs';
import {originals,entities} from '../src/content-translations.js';
const APPROVED='4294ce0718f706f2ee72b0c32757ee6913ce1de0';
const PREVIEW='c45a6a34-3ca4-46fb-bef5-ff17b8d9caee';
const production='https://dream-team.sewerynski00.workers.dev';
const action=process.env.RELEASE_ACTION,run=process.env.GITHUB_RUN_ID;
const status={action,candidate:process.env.RELEASE_CANDIDATE,at:new Date().toISOString(),result:'BLOCKED',productionWrites:0,productionDeployments:0};
const check=(x,code)=>{if(!x)throw Error(code);};
const q=async(id,sql,args=[])=>(await query(id,sql,args)).results;
const vars=v=>Object.fromEntries(v.resources.bindings.filter(b=>b.type==='plain_text').map(b=>[b.name,b.text]));
async function gh(path){const r=await fetch('https://api.github.com/repos/serox94/dream-team'+path,{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});check(r.ok,'GITHUB_READ_FAILED');return r.json();}
async function inspection(){
 const pr=await gh('/pulls/14');status.pr={head:pr.head.sha,base:pr.base.sha,merged:pr.merged,draft:pr.draft};check(pr.head.sha===APPROVED,'PR_HEAD_CHANGED');
 const deps=await cf('/workers/scripts/dream-team/deployments'),active=deps.deployments[0];check(active.versions.length===1&&active.versions[0].percentage===100,'SPLIT_TRAFFIC');
 const v=await cf('/workers/scripts/dream-team/versions/'+active.versions[0].version_id),b=v.resources.bindings,pv=vars(v);
 status.production={worker:active.versions[0].version_id,commit:pv.APP_BUILD,url:production,vars:pv,bindings:b.filter(b=>['d1','r2_bucket','ai'].includes(b.type)).map(b=>({name:b.name,type:b.type,id:b.id,bucket:b.bucket_name}))};
 check(b.some(b=>b.name==='DB'&&b.id===productionId),'PRODUCTION_D1_BINDING');
 status.secretBindings=Object.fromEntries(['RYBY_LOGIN_USERNAME','RYBY_LOGIN_PASSWORD','RYBY_SESSION_SECRET','TAVILY_API_KEY'].map(name=>[name,b.some(b=>b.name===name&&b.type==='secret_text')]));
 check(Object.values(status.secretBindings).every(Boolean),'PRODUCTION_SECRET_MISSING');
 const settings=await q(productionId,"SELECT key,value FROM app_settings WHERE key IN ('schema_version','maintenance_mode')");status.schema=Number(settings.find(x=>x.key==='schema_version')?.value);status.maintenance=settings.find(x=>x.key==='maintenance_mode')?.value==='on'?'ON':'OFF';
 check(status.schema===29&&status.maintenance==='OFF','SOURCE_STATE_CHANGED');
 status.foreignKeys=(await q(productionId,'PRAGMA foreign_key_check')).length;status.quickCheck=await q(productionId,'PRAGMA quick_check');check(!status.foreignKeys&&Object.values(status.quickCheck[0]).includes('ok'),'D1_INTEGRITY_FAILED');
 status.migrations=(await q(productionId,'SELECT COUNT(*) n FROM d1_migrations'))[0].n;check(status.migrations===29,'MIGRATION_REGISTRY');
 status.counts={};for(const table of ['trips','catches','checklist_items','trip_documents','auth_accounts','auth_sessions','content_translations']){const rows=await q(productionId,'SELECT * FROM '+table);status.counts[table]={all:rows.length,active:rows.filter(r=>!r.deleted_at).length};}
 const accounts=await q(productionId,'SELECT a.id,a.username,a.active,a.protected,c.must_change FROM auth_accounts a LEFT JOIN auth_account_credentials c ON c.account_id=a.id');status.accounts=accounts.map(a=>({username:a.username,active:a.active,protected:a.protected,mustChange:a.must_change}));
 status.france=await q(productionId,"SELECT id,name,start_at,end_at FROM trips WHERE id='next-trip'");check(status.france.length===1&&status.france[0].start_at.startsWith('2026-11-14')&&status.france[0].end_at.startsWith('2026-11-21'),'FRANCE_ID_MISMATCH');
 const worker=(await cf('/workers/scripts')).find(w=>w.id==='dream-team');check(worker?.tag,'WORKER_TAG');
 const builds=await cf('/builds/workers/'+worker.tag+'/builds?per_page=100');const list=Array.isArray(builds)?builds:builds.builds;check(Array.isArray(list),'BUILD_QUEUE_SHAPE');status.pendingCloudflareBuilds=list.filter(x=>['queued','pending','initializing','running','building'].includes(x.status)).length;check(!status.pendingCloudflareBuilds,'CLOUDFLARE_BUILD_ACTIVE');
 const triggers=await cf('/builds/workers/'+worker.tag+'/triggers');status.buildTriggers=(Array.isArray(triggers)?triggers:triggers.triggers).map(t=>({name:t.trigger_name,branches:t.branch_includes,excluded:t.branch_excludes,deployCommand:t.deploy_command}));
 const runs=(await gh('/actions/runs?per_page=100')).workflow_runs;status.otherReleaseRuns=runs.filter(r=>String(r.id)!==run&&r.path==='.github/workflows/deploy-private.yml'&&r.status!=='completed').map(r=>({id:r.id,status:r.status,head:r.head_sha}));check(!status.otherReleaseRuns.length,'OTHER_RELEASE_ACTIVE');
 status.productionCron=await cf('/workers/scripts/dream-team/schedules');status.backupCron=await cf('/workers/scripts/dream-team-d1-backup/schedules');
 const subs=await cf('/subscriptions');status.subscriptions=subs.map(s=>({id:s.rate_plan?.id,contract:s.rate_plan?.is_contract,price:s.price}));check(subs.length&&subs.every(s=>s.rate_plan?.id==='r2_paid'&&s.rate_plan?.is_contract===false),'WORKERS_FREE_NOT_CONFIRMED');status.freeOnly={workersPaid:false,neuronsDailyHardStop:10000,paidFeaturesActivated:false};
 const pdep=(await cf('/workers/scripts/dream-team-pro2-preview/deployments')).deployments[0],version=await cf('/workers/scripts/dream-team-pro2-preview/versions/'+pdep.versions[0].version_id);check(version.resources.bindings.some(b=>b.name==='DB'&&b.id===PREVIEW),'PREVIEW_D1_CHANGED');check(vars(version).APP_BUILD===APPROVED,'PREVIEW_BUILD_CHANGED');status.preview={worker:version.id,database:PREVIEW,queue:await q(PREVIEW,'SELECT status,COUNT(*) n FROM translation_jobs GROUP BY status'),translations:(await q(PREVIEW,'SELECT COUNT(*) n FROM content_translations'))[0].n,budget:await q(PREVIEW,"SELECT key,value FROM app_settings WHERE key LIKE 'translation.budget.%'"),flags:vars(version)};
 const inputs=new Map();for(const entity of Object.keys(entities))for(const s of await originals({DB:remoteDb(productionId)},entity))inputs.set([s.entity,s.recordId,s.field,s.sourceHash].join('|'),s);
 const [tr,src,jobs]=await Promise.all([q(PREVIEW,'SELECT * FROM content_translations'),q(PREVIEW,'SELECT * FROM content_sources'),q(PREVIEW,"SELECT * FROM translation_jobs WHERE status='complete'")]);
 const matched=tr.filter(t=>inputs.has([t.entity,t.record_id,t.field,t.source_hash].join('|'))&&src.some(s=>s.entity===t.entity&&s.record_id===t.record_id&&s.field===t.field&&s.source_hash===t.source_hash&&s.source_language!==t.language)&&jobs.some(j=>j.entity===t.entity&&j.record_id===t.record_id&&j.field===t.field&&j.language===t.language&&j.source_hash===t.source_hash));
 status.translationImport={eligibleProductionFields:inputs.size,matchingSavedTranslations:matched.length,matchingDigest:sha(JSON.stringify(matched.map(t=>JSON.stringify(t)).sort())),excludedPreviewRecords:tr.length-matched.length};
 status.evidence=[];for(const [id,head] of [[39642960743,APPROVED],[39638708808,'68b3de257f208c099214db41f78f3376c45e347f'],[39637591723,'f09cb989d79212892bb1b481e5238079f7b772a8']]){const r=await gh('/actions/runs/'+id);status.evidence.push({id,head:r.head_sha,status:r.status,conclusion:r.conclusion});check(r.head_sha===head&&r.status==='completed','EVIDENCE_IDENTITY_CHANGED');if(id!==39637591723)check(r.conclusion==='success','EVIDENCE_NOT_PASS');}
 const r=await fetch(production+'/login',{redirect:'manual',cache:'no-store'});status.publicHealth={http:r.status,build:r.headers.get('x-dreamteam-build')};check(r.status===200&&status.publicHealth.build===pv.APP_BUILD,'PRODUCTION_PUBLIC_HEALTH');
 status.existingWorkflowApproval=process.env.DREAMTEAM_PRODUCTION_APPROVED==='yes'?'APPROVED':'EXPLICIT_CONFIRMATION_REQUIRED';status.result='PASS';
}
try{
 assert.equal(process.env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.equal(process.env.GITHUB_REF,'refs/heads/ops/pro2-release-20261021');assert.equal(process.env.RELEASE_CANDIDATE,APPROVED);assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),APPROVED);
 check(['inspect','prepare'].includes(action),'OPERATION_NOT_IMPLEMENTED');await inspection();if(action==='prepare'){const {prepare}=await import('./pro2-production-prepare.mjs');status.result='BLOCKED';await prepare(status);}
}catch(e){status.error=/^[A-Z0-9_]+$/.test(e.message)?e.message:'OPERATION_GATE_FAILED';status.http=e.status;status.code=e.code;status.detail=e.actual!==undefined&&['string','number'].includes(typeof e.actual)?String(e.actual):undefined;process.exitCode=1;}
finally{await mkdir('pro2-production-status',{recursive:true});await writeFile('pro2-production-status/'+action+'.json',JSON.stringify(status,null,2));console.log('PRO2_PRODUCTION '+JSON.stringify(status));}
