// Resume only the exact disposable canary created in run 41720081279.
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {cf,wrangler,configFile,query,productionId} from './recovery-common.mjs';
const name='dream-team-audit-41720081279-canary',media='dream-team-audit-41720081279-media',db='232d19f4-d4e7-403f-bda0-04b2e312cf4d',a='5da357ae-7379-4b0b-8f18-2dce24cefd4e',base='https://'+name+'.sewerynski00.workers.dev';
const report={result:'BLOCKED',stage:'PRECHECK',name,db,versionA:a,rollbackAttempts:0};const check=(x,c)=>{if(!x)throw Error(c)};let dir,b=null,activationAttempted=false;
const active=async()=>(await cf('/workers/scripts/'+name+'/deployments')).deployments[0].versions[0].version_id;
const deploy=async id=>cf('/workers/scripts/'+name+'/deployments','POST',{strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':'Isolated recovery drill'}});
const ready=async build=>{for(let i=0;i<20;i++){try{let r=await fetch(base+'/login',{redirect:'manual'});if(r.status===200&&r.headers.get('x-dreamteam-build')===build)return true}catch{}await new Promise(r=>setTimeout(r,2000))}return false};
try{
 check(db!==productionId&&db!=='5d32f54f-f953-463f-8519-745e51417986','PROTECTED_DB');
 check((await cf('/d1/database/'+db)).name==='dream-team-audit-41718988537-db'&&await active()===a,'ISOLATION_CHANGED');
 const current=await cf('/workers/scripts/'+name+'/versions/'+a);check(current.resources.bindings.some(x=>x.type==='d1'&&x.id===db)&&current.resources.bindings.some(x=>x.type==='r2_bucket'&&x.bucket_name===media),'BINDING_MISMATCH');
 check((await query(db,"SELECT value FROM app_settings WHERE key='schema_version'")).results[0].value==='32','WRONG_SCHEMA');check(await ready('rehearsal-a'),'A_NOT_READY');
 dir=await mkdtemp(join(tmpdir(),'preview-drill-resume-'));const config={name,main:process.cwd()+'/src/worker.js',compatibility_date:'2026-09-03',assets:{directory:process.cwd()+'/public',binding:'ASSETS',run_worker_first:true,html_handling:'none'},d1_databases:[{binding:'DB',database_name:'dream-team-audit-41718988537-db',database_id:db}],r2_buckets:[{binding:'MEDIA',bucket_name:media}],vars:{APP_ENV:'preview',APP_BUILD:'rehearsal-b',INDIVIDUAL_ACCOUNTS:'true',ANGLER_PASSWORD_POLICY:'shared',TRANSLATION_ENABLED:'false',AI_FREE_ONLY:'true',RESEARCH_FREE_ONLY:'true'}};
 report.stage='UPLOAD_B';let cfg=await configFile(dir,config,'resume.jsonc');wrangler(['versions','upload','--config',cfg]);b=(await cf('/workers/scripts/'+name+'/versions?per_page=5')).items[0].id;check(b!==a&&await active()===a,'VERSION_NOT_ISOLATED');report.versionB=b;
 const bv=await cf('/workers/scripts/'+name+'/versions/'+b);check(bv.resources.bindings.some(x=>x.type==='d1'&&x.id===db)&&bv.resources.bindings.some(x=>x.type==='r2_bucket'&&x.bucket_name===media),'B_BINDING_MISMATCH');
 report.stage='ACTIVATE_B';activationAttempted=true;await deploy(b);check(await active()===b,'B_ACTIVE_MISMATCH');check(await ready('rehearsal-b'),'B_NOT_READY');report.activationB='PASS';
 report.stage='SIMULATED_FAILURE_ROLLBACK';report.rollbackAttempts++;await deploy(a);check(await active()===a&&await ready('rehearsal-a'),'ROLLBACK_NOT_READY');activationAttempted=false;report.rollback='PASS';
 check((await cf('/workers/scripts/dream-team/deployments')).deployments[0].versions[0].version_id==='31b6b9bd-8f0b-4566-9ced-6b5bf1c26f9d','PRODUCTION_CHANGED');report.result='PASS';report.stage='COMPLETE';
}catch(e){report.failure={stage:report.stage,code:/^[A-Z0-9_]+$/.test(e.message)?e.message:'OPERATION_FAILED',http:e.status??null};if(activationAttempted&&report.rollbackAttempts===0){try{report.rollbackAttempts++;await deploy(a);report.recovery=(await active()===a&&await ready('rehearsal-a'))?'PASS':'FAILED'}catch{report.recovery='FAILED'}}process.exitCode=1}
finally{if(dir)await rm(dir,{recursive:true,force:true});await mkdir('preview-resume-status',{recursive:true});await writeFile('preview-resume-status/summary.json',JSON.stringify(report,null,2));console.log('PREVIEW_RESUME '+JSON.stringify(report))}
