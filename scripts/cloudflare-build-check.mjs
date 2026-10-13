// One read-only attempt per required administrative surface; no build or deploy requests.
import {cf} from './recovery-common.mjs';import {mkdir,writeFile,readFile} from 'node:fs/promises';
const report={at:new Date().toISOString(),worker:'dream-team',result:'BLOCKED',action:'Udostępnij eksport ustawień Cloudflare dream-team: Builds/Git integration, deploy hooks i oczekujące deployments, potwierdzający brak automatycznego wydania main.'};
try{
 const known=JSON.parse(await readFile(new URL('../docs/verification/cloudflare-access-2026-10-13.json',import.meta.url),'utf8').catch(()=> 'null'));if(known?.result==='BLOCKED'){Object.assign(report,known,{reusedAccessBlock:true});throw Error('KNOWN_ACCESS_BLOCK_NOT_RETRIED');}
 const workers=await cf('/workers/scripts'),worker=workers.find(w=>w.id==='dream-team');if(!worker?.tag)throw Error('WORKER_TAG_UNAVAILABLE');
 const triggers=await cf('/builds/workers/'+worker.tag+'/triggers'),hooks=await cf('/builds/workers/dream-team/deploy_hooks'),builds=await cf('/builds/workers/'+worker.tag+'/builds'),deployments=await cf('/workers/scripts/dream-team/deployments');
 const list=x=>{const a=Array.isArray(x)?x:x?.results||x?.triggers||x?.builds||x?.deploy_hooks;if(!Array.isArray(a))throw Error('UNRECOGNIZED_ADMIN_RESPONSE');return a;};
 report.triggerCount=list(triggers).length;report.hookCount=list(hooks).length;report.pendingBuilds=list(builds).filter(b=>['queued','pending','running'].includes(b.status)).length;report.currentDeployment=deployments.deployments?.[0]?.id||null;
 if(!report.triggerCount&&!report.hookCount&&!report.pendingBuilds&&report.currentDeployment){report.result='PASS';delete report.action;}else{report.result='BLOCKED';report.action='W Cloudflare dream-team wyłącz automatyczne Builds/deploy hooks i przekaż eksport ustawień z pustą kolejką wdrożeń.';}
}catch(error){if(!report.reusedAccessBlock){report.httpStatus=error.status||null;report.code=error.code||error.message;}}
await mkdir('live-preview-qa',{recursive:true});await writeFile('live-preview-qa/H04.json',JSON.stringify(report,null,2));console.log('H04 '+JSON.stringify(report));
