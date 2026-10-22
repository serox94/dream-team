import {mkdir,writeFile} from 'node:fs/promises';
import {APPROVED,inspect,requireApproval,check,git} from './ui-release-core.mjs';
const action=process.env.RELEASE_ACTION;let status={result:'BLOCKED',action};
try{
 check(process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&process.env.GITHUB_REF==='refs/heads/ops/ui-release-20261022','MANUAL_OPERATOR_ONLY');
 check(['inspect','prepare','deploy'].includes(action),'UNKNOWN_OPERATION');check(git('rev-parse','HEAD')===process.env.RELEASE_CANDIDATE,'CHECKOUT_MISMATCH');
 status={...await inspect(),action};
 if(action!=='inspect'){if(action==='deploy')requireApproval(process.env.DREAMTEAM_PRODUCTION_APPROVED);const {execute}=await import('./ui-production-release.mjs');await execute(status,action);}
}catch(e){status.result='BLOCKED';status.error=/^[A-Z0-9_]+$/.test(e.message)?e.message:'OPERATOR_FAILED';status.http=e.status;status.code=e.code;process.exitCode=1;}
finally{await mkdir('ui-production-status',{recursive:true});await writeFile('ui-production-status/'+action+'.json',JSON.stringify(status,null,2));console.log('UI_PRODUCTION '+JSON.stringify(status));}
