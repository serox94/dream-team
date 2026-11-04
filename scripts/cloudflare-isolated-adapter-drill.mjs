import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {cf,wrangler,configFile} from './recovery-common.mjs';import {isolatedCloudflareAdapter} from './cloudflare-isolated-adapter.mjs';
const runId=process.env.GITHUB_RUN_ID,worker='dream-team-audit-'+runId+'-recovery-probe',baseUrl='https://'+worker+'.sewerynski00.workers.dev';
const report={result:'FAIL',stage:'PRECHECK',worker};let dir,created=false;
const check=(v,c)=>{if(!v)throw Error(c)};
try{
 check(process.env.GITHUB_REPOSITORY==='serox94/dream-team'&&process.env.GITHUB_RUN_ATTEMPT==='1'&&/^[0-9]+$/.test(runId||''),'CONTEXT');
 check(!(await cf('/workers/scripts')).some(x=>x.id===worker),'WORKER_EXISTS');
 dir=await mkdtemp(join(tmpdir(),'adapter-drill-'));const entry=join(dir,'worker.mjs');
 await writeFile(entry,"export default {fetch(req,env){return new Response(env.APP_BUILD,{headers:{'x-build':env.APP_BUILD}})}};");
 let config={name:worker,main:entry,compatibility_date:'2026-09-03',vars:{APP_BUILD:'source'}};
 let cfg=await configFile(dir,config,'a.jsonc');report.stage='CREATE';created=true;wrangler(['deploy','--config',cfg]);
 const adapter=isolatedCloudflareAdapter({worker,runId,baseUrl});let source=await adapter.active();await adapter.ready(source,'source');
 config.vars.APP_BUILD='target';cfg=await configFile(dir,config,'b.jsonc');wrangler(['versions','upload','--config',cfg]);let target=(await cf('/workers/scripts/'+worker+'/versions?per_page=5')).items[0].id;
 check(source!==target&&await adapter.active()===source,'SOURCE_CHANGED');report.source=source;report.target=target;
 report.stage='ACTIVATE';await adapter.activate(target);await adapter.ready(target,'target');
 report.stage='CONTROLLED_FAILURE';report.injectedFailure='POST_ACTIVATION';check(await adapter.active()===target,'TARGET_NOT_ACTIVE');
 report.stage='RECOVER';await adapter.activate(source);await adapter.ready(source,'source');report.recovery='PASS';report.result='PASS';report.stage='COMPLETE';
}catch(e){report.error=/^[A-Z0-9_]+$/.test(e.message)?e.message:'OPERATION_FAILED';process.exitCode=1}
finally{if(created&&report.result==='PASS')try{await cf('/workers/scripts/'+worker,'DELETE');report.cleanup='PASS'}catch{report.cleanup='FAILED';report.result='FAIL';process.exitCode=1} else if(created)report.cleanup='RETAINED';if(dir)await rm(dir,{recursive:true,force:true});await mkdir('isolated-adapter-status',{recursive:true});await writeFile('isolated-adapter-status/summary.json',JSON.stringify(report,null,2));console.log('ISOLATED_ADAPTER '+JSON.stringify(report))}
