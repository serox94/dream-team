// One guarded code-only operator for PR41. It cannot manufacture rehearsal proof,
// GitHub approval, or static-asset provenance. No migrations or DB restore path.
import {mkdtemp,readFile,writeFile,mkdir,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {cf,query,wrangler,sha,productionId} from './recovery-common.mjs';
import {rowsDigest} from './d1-snapshot.mjs';
import {releaseCodeOnly,authorizeEvidence,productionGate,proveImmutableSourceRollback,PR41_CANDIDATE,PR41_PREVIOUS} from './pr41-release-transition.mjs';
import {uploadExactApprovedProductionVersion} from './pr41-audit-artifact.mjs';
const check=(v,c)=>{if(!v)throw Error(c)};
const report={result:'BLOCKED',stage:'AUTHORIZATION',productionMutations:0};let dir;
const gh=async path=>{const r=await fetch('https://api.github.com/repos/serox94/dream-team'+path,{headers:{authorization:'Bearer '+process.env.GH_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});check(r.ok,'GITHUB_EVIDENCE_UNAVAILABLE');return r.json()};
const normalized=bindings=>bindings.map(b=>{const x={...b};if(x.type==='d1'){x.id=x.id||x.database_id;delete x.database_id;}if(x.type==='secret_text')delete x.text;return x}).sort((a,b)=>a.name.localeCompare(b.name));
const current=async()=>{const v=(await cf('/workers/scripts/dream-team/deployments')).deployments[0].versions;check(v.length===1&&v[0].percentage===100,'UNEXPECTED_TRAFFIC_SPLIT');return v[0].version_id};
const exact=id=>cf('/workers/workers/dream-team/versions/'+id+'?include=modules');
const state=async()=>{const s=(await query(productionId,"SELECT (SELECT value FROM app_settings WHERE key='schema_version') schema,(SELECT count(*) FROM d1_migrations) migrations,(SELECT value FROM app_settings WHERE key='maintenance_mode') maintenance")).results[0];check(s.schema==='32'&&s.migrations===32&&s.maintenance==='off','SCHEMA32_OR_MAINTENANCE');check((await query(productionId,'PRAGMA quick_check')).results[0].quick_check==='ok'&&(await query(productionId,'PRAGMA foreign_key_check')).results.length===0,'PRODUCTION_INTEGRITY');};
try {
 check(process.env.GITHUB_REPOSITORY==='serox94/dream-team'&&process.env.GITHUB_REF==='refs/heads/ops/pr41-safe-release-20261106'&&process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&process.env.GITHUB_RUN_ATTEMPT==='1','MANUAL_OPERATIONS_CONTEXT_REQUIRED');
 // This check precedes even artifact downloads and all Cloudflare calls.
 check(process.env.DREAMTEAM_PRODUCTION_APPROVED==='yes','PRODUCTION_APPROVAL_REQUIRED');
 const env=await gh('/environments/production'),reviews=await gh('/actions/runs/'+process.env.GITHUB_RUN_ID+'/approvals');
 check(env.protection_rules.some(r=>r.type==='required_reviewers'&&r.reviewers?.some(x=>x.type==='User'&&x.reviewer?.login==='serox94')),'OWNER_PROTECTED_REVIEW_RULE_REQUIRED');
 const protectedReview=reviews.some(r=>r.state==='approved'&&r.user?.login==='serox94'&&r.environments?.some(e=>e.name==='production'));
 check(protectedReview,'OWNER_ENVIRONMENT_REVIEW_REQUIRED');
 const evidenceRun=process.env.PR41_EVIDENCE_RUN;check(/^\d+$/.test(evidenceRun||''),'EXACT_EVIDENCE_RUN_REQUIRED');
 const run=await gh('/actions/runs/'+evidenceRun);
 check(run.path==='.github/workflows/pr41-isolated-release.yml'&&run.head_branch==='ops/pr41-safe-release-20261106'&&run.head_sha===process.env.GITHUB_SHA&&run.status==='completed'&&run.conclusion==='success'&&run.run_attempt===1,'REHEARSAL_NOT_FROM_EXACT_OPERATOR_COMMIT');
 const artifacts=await gh('/actions/runs/'+evidenceRun+'/artifacts'),artifact=artifacts.artifacts.find(a=>a.name==='pr41-release-bundle'&&!a.expired);
 check(artifact&&/^sha256:[a-f0-9]{64}$/.test(artifact.digest||''),'SEALED_RELEASE_BUNDLE_REQUIRED');
 dir=await mkdtemp(join(tmpdir(),'pr41-production-'));
 const r=await fetch('https://api.github.com/repos/serox94/dream-team/actions/artifacts/'+artifact.id+'/zip',{headers:{authorization:'Bearer '+process.env.GH_TOKEN},signal:AbortSignal.timeout(60000)});check(r.ok,'BUNDLE_DOWNLOAD_FAILED');
 const zip=Buffer.from(await r.arrayBuffer());check(zip.length<32*1024*1024&&'sha256:'+sha(zip)===artifact.digest,'BUNDLE_ARCHIVE_DIGEST');
 const archive=join(dir,'bundle.zip');await writeFile(archive,zip,{mode:0o600});
 execFileSync('python3',['-c',"import zipfile,sys,pathlib,stat\nz=zipfile.ZipFile(sys.argv[1]); root=pathlib.Path(sys.argv[2]).resolve()\nfor i in z.infolist():\n p=pathlib.PurePosixPath(i.filename)\n assert not p.is_absolute() and '..' not in p.parts and not stat.S_ISLNK(i.external_attr>>16)\n assert i.filename in ['plan.json','worker.js'] or i.filename.startswith('public/')\n assert i.file_size<16000000\nz.extractall(root)",archive,dir],{stdio:['ignore','pipe','pipe']});
 const plan=JSON.parse(await readFile(join(dir,'plan.json'))),authorization={approved:process.env.DREAMTEAM_PRODUCTION_APPROVED,approvedPlan:process.env.PR41_APPROVED_PLAN_SHA256,protectedReview};
 authorizeEvidence(plan,authorization);
 check(plan.evidenceRun===evidenceRun&&plan.operatorCommit===process.env.GITHUB_SHA,'PLAN_RUN_BINDING');
 const module=await readFile(join(dir,'worker.js'));check(sha(module)===plan.candidateModuleSha256,'CANDIDATE_MODULE_DIGEST');
 const files=[];const visit=async(base='')=>{for(const e of await readdir(join(dir,'public',base),{withFileTypes:true})){const p=join(base,e.name);if(e.isDirectory())await visit(p);else{check(e.isFile(),'ASSET_TYPE');files.push({path:p,sha256:sha(await readFile(join(dir,'public',p)))})}}};await visit();files.sort((a,b)=>a.path.localeCompare(b.path));check(sha(JSON.stringify(files))===plan.candidateAssetsSha256,'CANDIDATE_ASSET_DIGEST');
 report.stage='PREFLIGHT';check(await current()===PR41_PREVIOUS,'PRODUCTION_MOVED');
 const source=await exact(PR41_PREVIOUS);check(source.id===PR41_PREVIOUS&&source.modules.length===1&&sha(Buffer.from(source.modules[0].content_base64,'base64'))===plan.sourceModuleSha256,'SOURCE_CODE_CHANGED');
 check(sha(JSON.stringify(normalized(source.bindings)))===plan.sourceConfigurationSha256,'SOURCE_CONFIGURATION_CHANGED');
 const checkNativeRollback=async()=>proveImmutableSourceRollback(await exact(PR41_PREVIOUS),await cf('/workers/scripts/dream-team/versions?deployable=true'));
 report.nativeRollback=await checkNativeRollback();
 await state();
 // Only after ALL source/target/recovery evidence and actual owner approval.
 // Existing capture mechanism creates a NEW private snapshot, never overwrites
 // data or restores production. No capture runs while authorization is blocked.
 execFileSync(process.execPath,['scripts/pr41-private-backup.mjs'],{stdio:['ignore','pipe','pipe'],timeout:900000});
 const backup=JSON.parse(await readFile('pr41-backup-status/summary.json'));
 check(backup.result==='PASS'&&backup.worker===PR41_PREVIOUS&&backup.schema===32,'FRESH_BACKUP_FAILED');
 const recovery={d1:'PASS',r2:'PASS',verifiedAt:new Date().toISOString()};
 productionGate(plan,{...authorization,backup:recovery});
 const credentials=async()=>rowsDigest((await query(productionId,'SELECT id,salt,password_hash,iterations,version FROM auth_credential')).results.concat((await query(productionId,'SELECT * FROM auth_account_credentials ORDER BY account_id')).results));
 const beforeCredentials=await credentials();
 const vars=Object.fromEntries(source.bindings.filter(b=>b.type==='plain_text').map(b=>[b.name,b.text]));
 const configuration={name:'dream-team',main:join(dir,'worker.js'),no_bundle:true,compatibility_date:source.compatibility_date,compatibility_flags:source.compatibility_flags||[],vars:{...vars,APP_BUILD:PR41_CANDIDATE},assets:{...source.assets.config,directory:join(dir,'public'),binding:'ASSETS'},d1_databases:source.bindings.filter(b=>b.type==='d1').map(b=>({binding:b.name,database_id:b.id||b.database_id,database_name:'dream-team-db'})),r2_buckets:source.bindings.filter(b=>b.type==='r2_bucket').map(b=>({binding:b.name,bucket_name:b.bucket_name})),unsafe:{bindings:source.bindings.filter(b=>b.type==='ai')}};
 check(source.bindings.every(b=>['ai','d1','r2_bucket','plain_text','secret_text','assets'].includes(b.type)),'UNSUPPORTED_CONFIGURATION');
 const config=join(dir,'production.json');await writeFile(config,JSON.stringify(configuration),{mode:0o600});
 report.stage='UPLOAD';const out=wrangler(['versions','upload','--config',config]),staged=out.match(/Version ID:\s*([a-f0-9-]{36})/i)?.[1];report.productionMutations++;
 check(staged&&await current()===PR41_PREVIOUS,'UPLOAD_CHANGED_TRAFFIC');
 const expected=source.bindings.map(b=>b.name==='APP_BUILD'?{...b,text:PR41_CANDIDATE}:b);
 const target=await uploadExactApprovedProductionVersion(source,expected.filter(b=>b.type!=='secret_text'),[{name:'worker.js',content_type:source.modules[0].content_type,content_base64:module.toString('base64')}],plan,{...authorization,backup:recovery});report.productionMutations++;
 const v=await exact(target);check(v.modules.length===1&&sha(Buffer.from(v.modules[0].content_base64,'base64'))===plan.candidateModuleSha256,'UPLOADED_MODULE_MISMATCH');
 check(rowsDigest(normalized(v.bindings))===rowsDigest(normalized(expected))&&rowsDigest([v.assets.config])===rowsDigest([source.assets.config])&&v.compatibility_date===source.compatibility_date&&rowsDigest(v.compatibility_flags||[])===rowsDigest(source.compatibility_flags||[]),'UPLOADED_CONFIGURATION_MISMATCH');
 const activate=async id=>{check([PR41_PREVIOUS,target].includes(id),'UNPINNED_VERSION');if(id===target)await checkNativeRollback();await cf('/workers/scripts/dream-team/deployments','POST',{strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':'Owner-approved PR41 code-only '+plan.digest}});report.productionMutations++};
 const verify=async id=>{let ok=0;const build=id===target?PR41_CANDIDATE:vars.APP_BUILD;for(let i=0;i<30;i++){check(await current()===id,'ACTIVE_VERSION_CHANGED');try{const r=await fetch('https://dream-team.sewerynski00.workers.dev/login',{redirect:'manual',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(5000)});const good=r.status===200&&r.headers.get('x-dreamteam-build')===build;await r.body?.cancel();if(good&&++ok===2)break;if(!good)ok=0;}catch{}if(i===29)throw Error('PRODUCTION_READINESS_TIMEOUT');await new Promise(r=>setTimeout(r,1500));}await state();check(await credentials()===beforeCredentials,'CREDENTIALS_CHANGED');};
 report.transition=await releaseCodeOnly({preflight:async()=>{productionGate(plan,{...authorization,backup:recovery});await checkNativeRollback();await state();},current,activate,verify,verifyRecovery:verify},{previous:PR41_PREVIOUS,target});
 report.result=report.transition.result;report.activeWorker=await current();report.targetWorker=target;report.plan=plan.digest;
 if(report.result!=='PASS')process.exitCode=1;
}catch(e){report.failure={stage:report.stage,code:/^[A-Z0-9_]+$/.test(e.message)?e.message:'OPERATION_FAILED',http:e.status??null,cloudflareCode:e.code??null};process.exitCode=1;}
finally{if(dir)await rm(dir,{recursive:true,force:true});await mkdir('pr41-production-status',{recursive:true});await writeFile('pr41-production-status/summary.json',JSON.stringify(report,null,2));console.log('::notice title=PR41 production status::'+JSON.stringify(report));}
