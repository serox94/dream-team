import {writeFileSync} from 'node:fs';import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {artifactManifest,verifyWorkerArtifact} from '../scripts/worker-artifact-provenance.mjs';import {digest,configuration} from '../scripts/release-config-policy.mjs';
test('attested upload binds exact bytes, account, source, operator, configuration and Cloudflare version for target and fallback',async t=>{
 const previous=process.env.CLOUDFLARE_ACCOUNT_ID;process.env.CLOUDFLARE_ACCOUNT_ID='9'.repeat(32);t.after(()=>{if(previous===undefined)delete process.env.CLOUDFLARE_ACCOUNT_ID;else process.env.CLOUDFLARE_ACCOUNT_ID=previous});const dir=await mkdtemp(join(tmpdir(),'provenance-'));t.after(()=>rm(dir,{recursive:true,force:true}));const artifact=join(dir,'artifact');await mkdir(artifact);await writeFile(join(artifact,'worker.mjs'),'export default {}');
 const version={id:'version',resources:{script:{etag:'opaque-cloudflare-hash'},bindings:[{name:'APP_BUILD',type:'plain_text',text:'a'.repeat(40)}],script_runtime:{compatibility_date:'2026-09-03'}}};
 const receiptPath=join(dir,'receipt.json'),sourceSha='a'.repeat(40),operator='b'.repeat(40),worker='dream-team';
 const receipt={format:'dream-team-worker-upload-v1',repository:'serox94/dream-team',worker,versionId:version.id,sourceSha,operator,accountDigest:digest(process.env.CLOUDFLARE_ACCOUNT_ID),scriptEtag:version.resources.script.etag,configurationDigest:digest(configuration(version)),artifactSha256:(await artifactManifest(artifact)).sha256,uploadRunId:'123',toolchain:{wrangler:'4.150.0'}};
 await writeFile(receiptPath,JSON.stringify(receipt));let args;
 const options={receiptPath,artifactDirectory:artifact,sourceSha,operator,worker,versionId:version.id,version,runCommand:(bin,a)=>{assert.equal(bin,'gh');args=a}};
 for(const role of ['target','fallback'])assert.equal((await verifyWorkerArtifact(options)).result,'PASS',role);assert.ok(args.includes('--signer-digest'));assert.ok(args.includes('--deny-self-hosted-runners'));
 await assert.rejects(verifyWorkerArtifact({...options,runCommand:()=>{throw Error('signature invalid')}}),/ARTIFACT_ATTESTATION_UNVERIFIED/);
 await assert.rejects(verifyWorkerArtifact({...options,runCommand:()=>writeFileSync(receiptPath,JSON.stringify({...receipt,sourceSha:'c'.repeat(40)}))}),/PROVENANCE_RECEIPT_CHANGED/);await writeFile(receiptPath,JSON.stringify(receipt));
 await assert.rejects(verifyWorkerArtifact({...options,sourceSha:'c'.repeat(40)}),/ARTIFACT_PROVENANCE_MISMATCH/);
 await assert.rejects(verifyWorkerArtifact({...options,version:{...version,resources:{...version.resources,script:{etag:'different-code-same-APP_BUILD'}}}}),/CLOUDFLARE_ARTIFACT_IDENTITY_MISMATCH/);
 await writeFile(join(artifact,'worker.mjs'),'different code with same APP_BUILD');await assert.rejects(verifyWorkerArtifact(options),/ARTIFACT_BYTES_MISMATCH/);
});
