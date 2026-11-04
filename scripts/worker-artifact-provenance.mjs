import {readFile,readdir,stat} from 'node:fs/promises';import {join,relative,resolve} from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {digest,configuration} from './release-config-policy.mjs';
const check=(v,c)=>{if(!v)throw Error(c)};
export const bytesDigest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function artifactManifest(directory){
 const root=resolve(directory),files=[];
 async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){check(!item.isSymbolicLink(),'ARTIFACT_SYMLINK_FORBIDDEN');const file=join(dir,item.name);if(item.isDirectory())await walk(file);else {check(item.isFile(),'UNSUPPORTED_ARTIFACT_FILE');const s=await stat(file);check(s.size<=50*1024*1024,'ARTIFACT_FILE_LIMIT');files.push({path:relative(root,file).replaceAll('\\','/'),sha256:bytesDigest(await readFile(file)),size:s.size})}}}
 await walk(root);check(files.length>0&&files.length<=10000,'ARTIFACT_FILE_COUNT');files.sort((a,b)=>a.path.localeCompare(b.path));return {files,sha256:digest(files)};
}
export async function verifyWorkerArtifact({receiptPath,artifactDirectory,worker,versionId,sourceSha,operator,version,signerWorkflow='serox94/dream-team/.github/workflows/prepare-worker-artifact.yml',runCommand=execFileSync}){
 check(/^[a-f0-9]{32}$/.test(process.env.CLOUDFLARE_ACCOUNT_ID||''),'ARTIFACT_ACCOUNT_REQUIRED');
 const bytes=await readFile(receiptPath);check(bytes.length<1024*1024,'PROVENANCE_RECEIPT_LIMIT');const receipt=JSON.parse(bytes);
 // gh verifies Sigstore/OIDC identity and signature over these exact receipt bytes.
 try{runCommand('gh',['attestation','verify',receiptPath,'--repo','serox94/dream-team','--signer-workflow',signerWorkflow,'--signer-digest',operator,'--deny-self-hosted-runners'],{stdio:['ignore','pipe','pipe'],timeout:60000})}catch{throw Error('ARTIFACT_ATTESTATION_UNVERIFIED')}
 check(receipt.format==='dream-team-worker-upload-v1'&&receipt.repository==='serox94/dream-team'&&receipt.worker===worker&&receipt.versionId===versionId&&receipt.sourceSha===sourceSha&&receipt.operator===operator&&receipt.accountDigest===digest(process.env.CLOUDFLARE_ACCOUNT_ID),'ARTIFACT_PROVENANCE_MISMATCH');
 check(version?.id===versionId&&typeof version.resources?.script?.etag==='string'&&receipt.scriptEtag===version.resources.script.etag,'CLOUDFLARE_ARTIFACT_IDENTITY_MISMATCH');
 const manifest=await artifactManifest(artifactDirectory);check(manifest.sha256===receipt.artifactSha256,'ARTIFACT_BYTES_MISMATCH');
 check(receipt.configurationDigest===digest(configuration(version))&&receipt.uploadRunId&&receipt.toolchain?.wrangler,'INCOMPLETE_UPLOAD_RECEIPT');
 return {result:'PASS',artifactSha256:manifest.sha256,receiptSha256:bytesDigest(bytes)};
}
