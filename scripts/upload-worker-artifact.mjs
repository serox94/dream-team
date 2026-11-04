// Trusted upload step: consumes sealed bytes with pinned Wrangler, no rebuild.
import {readFile,writeFile} from 'node:fs/promises';import {resolve,join,relative} from 'node:path';import {execFileSync} from 'node:child_process';
import {artifactManifest} from './worker-artifact-provenance.mjs';import {configuration,digest} from './release-config-policy.mjs';import {cf} from './recovery-common.mjs';
const check=(v,c)=>{if(!v)throw Error(c)};
export async function uploadWorkerArtifact({directory,configPath,sourceSha,operator,runId,receiptPath,request=cf,runCommand=execFileSync,production=false}){
 check(/^[a-f0-9]{40}$/.test(sourceSha||'')&&/^[a-f0-9]{40}$/.test(operator||'')&&/^\d+$/.test(runId||''),'INVALID_ARTIFACT_CONTEXT');
 check(/^[a-f0-9]{32}$/.test(process.env.CLOUDFLARE_ACCOUNT_ID||''),'ARTIFACT_ACCOUNT_REQUIRED');
 const root=resolve(directory),config=JSON.parse(await readFile(configPath,'utf8'));
 check(Object.keys(config).every(k=>['name','main','compatibility_date','compatibility_flags','vars','d1_databases','r2_buckets','assets','ai','keep_vars','rules','find_additional_modules','workers_dev'].includes(k)),'UNTRUSTED_UPLOAD_CONFIGURATION');
 check(!production&&new RegExp(`^dream-team-audit-${runId}-artifact-probe$`).test(config.name),'PRODUCTION_ARTIFACT_UPLOAD_NOT_AUTHORIZED');
 for(const path of [config.main,...(config.assets?.directory?[config.assets.directory]:[])]){const file=resolve(root,path);check(relative(root,file)&&!relative(root,file).startsWith('..'),'ARTIFACT_PATH_ESCAPE')}
 const before=await artifactManifest(root),pkg=JSON.parse(await readFile(new URL('../node_modules/wrangler/package.json',import.meta.url),'utf8'));
 check(pkg.version==='4.150.0','UNPINNED_UPLOAD_TOOLCHAIN');
 let output;try{output=runCommand(process.execPath,[new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url).pathname,'versions','upload','--no-bundle','--config',resolve(configPath),'--message','artifact-sha256:'+before.sha256],{cwd:new URL('../',import.meta.url).pathname,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000})}catch{throw Error('ARTIFACT_UPLOAD_FAILED')}
 const ids=[...output.replace(/\u001b\[[0-9;]*m/g,'').matchAll(/Worker Version ID:\s*([a-f0-9-]{36})/gi)].map(m=>m[1]);check(ids.length===1,'UPLOAD_VERSION_ID_UNVERIFIED');
 const version=await request('/workers/scripts/'+config.name+'/versions/'+ids[0]);check(version.id===ids[0]&&version.resources?.script?.etag,'UPLOADED_ARTIFACT_UNVERIFIED');
 check((await artifactManifest(root)).sha256===before.sha256,'ARTIFACT_CHANGED_DURING_UPLOAD');
 const receipt={format:'dream-team-worker-upload-v1',repository:'serox94/dream-team',worker:config.name,versionId:version.id,sourceSha,operator,accountDigest:digest(process.env.CLOUDFLARE_ACCOUNT_ID),artifactSha256:before.sha256,scriptEtag:version.resources.script.etag,configurationDigest:digest(configuration(version)),uploadRunId:runId,toolchain:{node:process.versions.node,wrangler:pkg.version}};
 await writeFile(receiptPath,JSON.stringify(receipt,null,2),{mode:0o600});return receipt;
}
