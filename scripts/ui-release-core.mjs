// Separate operator for an approved, schema30 UI-only release. No legacy gate is weakened.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cf,query,productionId} from './recovery-common.mjs';
export const APPROVED='ec05cea1dddbd941a0d62d8be4880a43fb41ee46';
export const PRODUCTION='https://dream-team.sewerynski00.workers.dev';
export const q=async(sql,args=[])=>(await query(productionId,sql,args)).results;
export const check=(x,code)=>{if(!x)throw Error(code);};
export function requireApproval(value){check(value==='yes','EXPLICIT_PRODUCTION_CONFIRMATION_REQUIRED');}
export function requireSchema(value,maintenance){check(Number(value)===30,'SOURCE_SCHEMA_NOT_30');check(maintenance!=='on','SOURCE_MAINTENANCE_ON');}
export const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
export const tree=ref=>git('rev-parse',ref+'^{tree}');
export async function gh(path){const r=await fetch('https://api.github.com/repos/serox94/dream-team'+path,{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});check(r.ok,'GITHUB_READ_FAILED');return r.json();}
export async function queueGate(){
 const worker=(await cf('/workers/scripts')).find(w=>w.id==='dream-team');check(worker?.tag,'WORKER_TAG');
 const [raw,triggers,hooks,runs]=await Promise.all([cf('/builds/workers/'+worker.tag+'/builds?per_page=100'),cf('/builds/workers/'+worker.tag+'/triggers'),cf('/builds/workers/'+worker.tag+'/deploy_hooks'),gh('/actions/runs?per_page=100')]);
 const list=(x,key)=>{const a=Array.isArray(x)?x:x[key];check(Array.isArray(a),'UNRECOGNIZED_BUILD_RESPONSE');return a;};
 const builds=list(raw,'builds'),ts=list(triggers,'triggers'),hs=list(hooks,'deploy_hooks');
 const pending=builds.filter(b=>['queued','pending','initializing','running','building'].includes(b.status));check(!pending.length,'CLOUDFLARE_BUILD_ACTIVE');
 check(!runs.workflow_runs.some(r=>String(r.id)!==process.env.GITHUB_RUN_ID&&r.path==='.github/workflows/deploy-private.yml'&&r.status!=='completed'),'OTHER_PRODUCTION_RELEASE_ACTIVE');
 // main's package command invokes the unchanged legacy operator with NO action/file arguments:
 // it fails before network access. Non-main builds may only upload inactive versions.
 const approvedCommands=['npm run deploy:production','npx wrangler versions upload'];
 check(ts.every(t=>approvedCommands.includes(t.deploy_command)),'UNCONTROLLED_DEPLOY_COMMAND');
 const branch=await gh('/branches/main');
 return {pendingBuilds:pending.length,triggers:ts.map(t=>({name:t.trigger_name,branches:t.branch_includes,excluded:t.branch_excludes,command:t.deploy_command})),deployHooks:hs.map(h=>({name:h.deploy_hook_name,branch:h.branch})),automaticActiveDeployment:false,main:branch.commit.sha,protected:branch.protected};
}
export async function inspect(){
 const [p15,p16,main]=await Promise.all([gh('/pulls/15'),gh('/pulls/16'),gh('/git/ref/heads/main')]);
 check(p15.head.sha==='ce669dafc138b9d92faa26acf1c64a254ca657d6'&&p16.head.sha===APPROVED,'APPROVED_PR_CHANGED');
 check(tree('HEAD')===tree(APPROVED),'CANDIDATE_TREE_CHANGED');
 const deployment=(await cf('/workers/scripts/dream-team/deployments')).deployments[0];check(deployment.versions.length===1&&deployment.versions[0].percentage===100,'SPLIT_PRODUCTION_TRAFFIC');
 const version=await cf('/workers/scripts/dream-team/versions/'+deployment.versions[0].version_id),bindings=version.resources.bindings,vars=Object.fromEntries(bindings.filter(b=>b.type==='plain_text').map(b=>[b.name,b.text]));
 check(bindings.some(b=>b.name==='DB'&&b.id===productionId),'PRODUCTION_DB_BINDING');
 for(const name of ['RYBY_LOGIN_USERNAME','RYBY_LOGIN_PASSWORD','RYBY_SESSION_SECRET','TAVILY_API_KEY'])check(bindings.some(b=>b.name===name&&b.type==='secret_text'),'SOURCE_SECRET_MISSING');
 const settings=await q("SELECT key,value FROM app_settings WHERE key IN ('schema_version','maintenance_mode')");const schema=settings.find(r=>r.key==='schema_version')?.value,maintenance=settings.find(r=>r.key==='maintenance_mode')?.value;
 requireSchema(schema,maintenance);check((await q('SELECT COUNT(*) n FROM d1_migrations'))[0].n===30,'MIGRATION_REGISTRY');check(!(await q('PRAGMA foreign_key_check')).length,'FOREIGN_KEYS');check((await q('PRAGMA quick_check'))[0].quick_check==='ok','D1_INTEGRITY');
 const counts={};for(const t of ['trips','lakes','catches','checklist_items','trip_documents','auth_accounts','auth_sessions','content_translations','translation_cache'])counts[t]=(await q('SELECT COUNT(*) n FROM '+t))[0].n;
 const accounts=await q('SELECT username,active,protected FROM auth_accounts');
 const subscriptions=await cf('/subscriptions');check(subscriptions.length&&subscriptions.every(s=>s.rate_plan?.id==='r2_paid'&&s.rate_plan.is_contract===false),'WORKERS_FREE_NOT_CONFIRMED');
 const queue=await queueGate(),backupCron=await cf('/workers/scripts/dream-team-d1-backup/schedules'),cron=await cf('/workers/scripts/dream-team/schedules');
 const r=await fetch(PRODUCTION+'/login',{redirect:'manual',cache:'no-store'});check(r.status===200&&r.headers.get('x-dreamteam-build')===vars.APP_BUILD,'PUBLIC_BUILD_MISMATCH');
 return {result:'PASS',at:new Date().toISOString(),candidate:process.env.RELEASE_CANDIDATE,approved:APPROVED,main:main.object.sha,pr15:{head:p15.head.sha,merged:p15.merged},pr16:{head:p16.head.sha,merged:p16.merged},worker:version.id,sourceCommit:vars.APP_BUILD,schema:30,maintenance:'OFF',counts,accounts,queue,cron,backupCron,vars,bindings:bindings.filter(b=>['d1','r2_bucket','ai'].includes(b.type)),translationJobs:await q('SELECT status,COUNT(*) n FROM translation_jobs GROUP BY status'),budget:await q("SELECT key,value FROM app_settings WHERE key LIKE 'translation.budget.%' ORDER BY key"),approval:process.env.DREAMTEAM_PRODUCTION_APPROVED==='yes'?'PRESENT':'EXPLICIT_CONFIRMATION_REQUIRED',productionWrites:0};
}
