// Exercise the reusable transition/recovery control against a new isolated Worker only.
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {cf,wrangler,configFile} from './recovery-common.mjs';import {transitionWithRecovery} from './release-guards.mjs';
const run=process.env.GITHUB_RUN_ID,name='dream-team-audit-'+run+'-recovery-probe',prod='31b6b9bd-8f0b-4566-9ced-6b5bf1c26f9d';
const report={status:'FAIL',stage:'CHECK',worker:name};let dir,created=false;
const check=(ok,msg)=>{if(!ok)throw Error(msg)};
const active=async n=>(await cf('/workers/scripts/'+n+'/deployments')).deployments[0].versions[0].version_id;
const deploy=async id=>cf('/workers/scripts/'+name+'/deployments','POST',{strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':'Temporary isolated release guard drill'}});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const base='https://'+name+'.sewerynski00.workers.dev';
try{
 check(process.env.GITHUB_REPOSITORY==='serox94/dream-team'&&/^[0-9]+$/.test(run||'')&&process.env.GITHUB_RUN_ATTEMPT==='1','WRONG_CONTEXT');
 check(await active('dream-team')===prod,'PRODUCTION_CHANGED');
 let scripts=await cf('/workers/scripts');check(!scripts.some(x=>x.id===name),'CANARY_ALREADY_EXISTS');
 dir=await mkdtemp(join(tmpdir(),'release-guard-'));let file=join(dir,'worker.mjs');await writeFile(file,"export default {fetch(req,env){return new Response(env.APP_BUILD,{headers:{'x-build':env.APP_BUILD}})}};");
 let config={name,main:file,compatibility_date:'2026-09-03',vars:{APP_BUILD:'source'}},cfg=await configFile(dir,config,'source.jsonc');
 report.stage='CREATE_SOURCE';created=true;wrangler(['deploy','--config',cfg]);let source=await active(name);report.source=source;
 config.vars.APP_BUILD='target';cfg=await configFile(dir,config,'target.jsonc');wrangler(['versions','upload','--config',cfg]);let target=(await cf('/workers/scripts/'+name+'/versions?per_page=5')).items[0].id;check(source!==target&&await active(name)===source,'UPLOAD_CHANGED_ACTIVE');report.target=target;
 const ready=async(id,expected)=>{check(await active(name)===id,'VERSION_MISMATCH');for(let i=0;i<20;i++){let r=await fetch(base+'/?t='+Date.now()).catch(()=>null);if(r?.status===200&&r.headers.get('x-build')===expected)return;await wait(2000)}throw Error('READINESS_FAILED')};
 await ready(source,'source');report.stage='CONTROLLED_FAILURE';
 let result=await transitionWithRecovery({sourceWorker:source,targetWorker:target,current:()=>active(name),activate:deploy,ready:()=>ready(target,'target'),verify:async()=>{throw Error('INJECTED_FAILURE')},restore:deploy,verifyRestore:()=>ready(source,'source')});
 report.transition=result;check(result.recovery==='PASS'&&result.recoveryAttempts===1&&result.error==='INJECTED_FAILURE'&&await active(name)===source,'ROLLBACK_FAILED');check(await active('dream-team')===prod,'PRODUCTION_CHANGED');report.status='PASS';report.stage='COMPLETE';
}catch(e){report.error=/^[A-Z0-9_]+$/.test(e.message)?e.message:'OPERATION_FAILED';process.exitCode=1}
finally{
 if(created&&report.status==='PASS'){try{await cf('/workers/scripts/'+name,'DELETE');report.cleanup='PASS'}catch{report.cleanup='FAILED';process.exitCode=1;report.status='FAIL'}}else if(created){report.cleanup='RETAINED_FOR_DIAGNOSIS'}
 if(dir)await rm(dir,{recursive:true,force:true});await mkdir('release-guard-live-status',{recursive:true});await writeFile('release-guard-live-status/summary.json',JSON.stringify(report,null,2));console.log('RELEASE_GUARD_LIVE '+JSON.stringify(report));
}
