// Read-only discovery. Never logs source, binding values, SQL or credentials.
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {cf} from './recovery-common.mjs';
const expected='31b6b9bd-8f0b-4566-9ced-6b5bf1c26f9d';
const digest=x=>createHash('sha256').update(x).digest('hex');
const report={result:'BLOCKED',stage:'CONTEXT',expected};
const check=(v,c)=>{if(!v)throw Error(c)};
const shape=x=>x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,Array.isArray(v)?'array':v&&typeof v==='object'?Object.keys(v).sort():typeof v])):typeof x;
try {
 check(process.env.GITHUB_REPOSITORY==='serox94/dream-team'&&process.env.GITHUB_REF==='refs/heads/ops/pr41-safe-release-20261106'&&process.env.GITHUB_RUN_ATTEMPT==='1','CONTEXT');
 const active=async()=>{const d=(await cf('/workers/scripts/dream-team/deployments')).deployments[0];check(d.versions.length===1&&d.versions[0].percentage===100&&d.versions[0].version_id===expected,'PRODUCTION_MOVED');return expected};
 await active();report.stage='VERSION';
 const version=await cf('/workers/scripts/dream-team/versions/'+expected);
 report.versionShape=shape(version);report.resourceShape=shape(version.resources);
 report.script=version.resources?.script;
 // Names/types are public configuration structure; values never leave the runner.
 report.bindings=(version.resources?.bindings||[]).map(b=>({name:b.name,type:b.type,fields:Object.keys(b).sort()}));
 report.configurationSha256=digest(JSON.stringify(version.resources));
 report.stage='CONTENT';
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers/scripts/dream-team/content/v2',{headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(30000)});
 if(!r.ok){let j=await r.json().catch(()=>({}));const e=Error('CONTENT_READ_FAILED');e.status=r.status;e.code=j.errors?.[0]?.code;throw e;}
 report.content={etag:r.headers.get('etag'),entrypoint:r.headers.get('cf-entrypoint'),type:r.headers.get('content-type'),modules:[]};
 if(report.content.type?.startsWith('multipart/')) {
  for(const [name,file] of await r.formData()) {const bytes=typeof file==='string'?Buffer.from(file):Buffer.from(await file.arrayBuffer());report.content.modules.push({name,bytes:bytes.length,sha256:digest(bytes)});}
 }else {const bytes=Buffer.from(await r.arrayBuffer());report.content.modules.push({name:'index.js',bytes:bytes.length,sha256:digest(bytes)});}
 await active();report.stage='EXACT_VERSION_CONTENT';
 const exact=await cf('/workers/workers/dream-team/versions/'+expected+'?include=modules');
 report.exact={shape:shape(exact),id:exact.id,entrypoint:exact.main_module,assets:shape(exact.assets),modules:exact.modules?.map(m=>({name:m.name,shape:shape(m),sha256:typeof m.content==='string'?digest(m.content):null}))};
 check(exact.id===expected&&exact.modules?.length>0,'EXACT_VERSION_CONTENT_UNAVAILABLE');
 await active();report.stage='BACKUP_EVIDENCE';
 const gh=async path=>{const r=await fetch('https://api.github.com/repos/serox94/dream-team'+path,{headers:{authorization:'Bearer '+process.env.GH_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});check(r.ok,'GITHUB_EVIDENCE_READ_FAILED');return r.json()};
 const run=await gh('/actions/runs/42255416804');
 report.backup={run:run.id,conclusion:run.conclusion,sha:run.head_sha,created:run.created_at,updated:run.updated_at};
 const artifacts=await gh('/actions/runs/42255416804/artifacts');
 report.backup.artifacts=artifacts.artifacts.map(a=>({id:a.id,name:a.name,expired:a.expired,digest:a.digest}));
 const environment=await gh('/environments/production');
 report.environment={name:environment.name,protectionRules:environment.protection_rules.map(p=>({type:p.type,reviewerCount:p.reviewers?.length,preventSelfReview:p.prevent_self_review})),customBranchPolicies:environment.deployment_branch_policy};
 report.approval=process.env.APPROVED==='yes'?'yes':process.env.APPROVED==='no'?'no':'unset-or-other';
 report.result='READ_COMPLETE';report.stage='COMPLETE';
}catch(e){report.failure={code:/^[A-Z0-9_]+$/.test(e.message)?e.message:'OPERATION_FAILED',http:e.status??null,cloudflareCode:e.code??null};process.exitCode=1;}
await mkdir('pr41-identity-status',{recursive:true});
await writeFile('pr41-identity-status/summary.json',JSON.stringify(report,null,2));
console.log('::notice title=PR41 identity evidence::'+JSON.stringify(report));
