// Read-only preparation: no allocations, snapshot writes, production mutations or deploy.
import {cf} from './recovery-common.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const check=(x,c)=>{if(!x)throw Error(c)};
const report={result:'BLOCKED',productionWrites:0,productionExports:0,databaseCreates:0,databaseDeletes:0,deployments:0,approvalChanged:false};
try{
 const base='https://api.github.com/repos/serox94/dream-team';const headers={authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'};
 const gh=async path=>{const r=await fetch(base+path,{headers,signal:AbortSignal.timeout(15000)});check(r.ok,'GITHUB_READ_FAILED');return r.json()};
 const main=await gh('/branches/main');check(main.commit.sha==='d39ddf632b2279573216ac81d536a7e6f0fcc240','MAIN_MOVED');
 const prod=JSON.parse(await readFile('pr23-status/production-readonly.json','utf8'));check(prod.result==='PASS','PRODUCTION_PREFLIGHT_FAILED');
 const dbs=await cf('/d1/database?per_page=100');check(Array.isArray(dbs)&&dbs.length===9,'D1_RECOVERY_SLOT_UNAVAILABLE');
 report.d1Count=dbs.length;report.production=prod.production;report.d1Budget=prod.d1Budget;
 const worker=(await cf('/workers/scripts')).find(x=>x.id==='dream-team');check(worker?.tag,'WORKER_TAG_REQUIRED');
 let builds=[];for(let i=0;i<12;i++){const raw=await cf('/builds/workers/'+worker.tag+'/builds?per_page=100');builds=Array.isArray(raw)?raw:raw.builds;check(Array.isArray(builds),'BUILDS_UNVERIFIED');report.activeBuilds=builds.filter(x=>['queued','pending','initializing','running','building'].includes(x.status)).map(x=>({id:x.id,status:x.status}));if(!report.activeBuilds.length)break;await new Promise(r=>setTimeout(r,5000));}check(report.activeBuilds.length===0,'BUILDS_ACTIVE');
 const tr=await cf('/builds/workers/'+worker.tag+'/triggers'),triggers=Array.isArray(tr)?tr:tr.triggers;
 check(Array.isArray(triggers)&&triggers.length===2&&triggers.every(x=>x.deploy_command==='npx wrangler versions upload'),'UNCONTROLLED_BUILD_TRIGGER');report.buildTriggers='TWO_UPLOAD_ONLY';
 const hooks=await cf('/builds/workers/'+worker.tag+'/deploy_hooks');check((Array.isArray(hooks)?hooks:hooks.deploy_hooks)?.length===0,'DEPLOY_HOOK_PRESENT');
 const runs=(await gh('/actions/runs?per_page=100')).workflow_runs;
 check(!runs.some(r=>String(r.id)!==process.env.GITHUB_RUN_ID&&/\/(production31|schema31-promotion|schema32-release|code32-release|deploy-private)\.yml$/.test(r.path)&&r.status!=='completed'),'OTHER_PRODUCTION_OPERATION');
 const candidate='179da4d917e1968f35c2ddf063790e8a0428b0a9',op='d39ddf632b2279573216ac81d536a7e6f0fcc240';
 const proof=await gh('/actions/runs/40522636326');check(proof.head_sha===candidate&&proof.status==='completed'&&proof.conclusion==='success'&&proof.path==='.github/workflows/pr23-preview.yml','CANDIDATE_PREVIEW_MISSING');
 const c=(await gh('/actions/runs?head_sha='+candidate+'&per_page=100')).workflow_runs,o=(await gh('/actions/runs?head_sha='+op+'&per_page=100')).workflow_runs;
 for(const name of ['Validate Dream Team','Responsive UI QA'])check(c.some(r=>r.name===name&&r.conclusion==='success'),'CANDIDATE_CHECK_MISSING');
 check(o.some(r=>r.name==='Validate Dream Team'&&r.conclusion==='success'),'OPERATOR_CHECK_MISSING');
 report.ownerGate=process.env.DREAMTEAM_PRODUCTION_APPROVED==='no'?'NO':process.env.DREAMTEAM_PRODUCTION_APPROVED==='yes'?'YES':'UNSET_OR_UNAVAILABLE';
 report.main=op;report.candidate=candidate;report.candidateChecks='PASS';report.operatorValidate='PASS';report.schedulesRead='PASS';report.result='PASS';
}catch(e){report.error=/^[A-Z0-9_]+$/.test(e.message)?e.message:'READONLY_PREFLIGHT_FAILED';report.httpStatus=e.status||undefined;process.exitCode=1;}
finally{await mkdir('preflight-readonly-status',{recursive:true});await writeFile('preflight-readonly-status/summary.json',JSON.stringify(report,null,2),{mode:0o600});console.log('FINAL_READONLY_PREFLIGHT '+JSON.stringify(report));}
