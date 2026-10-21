// Continue the existing PR14 preview; no production writes, no new subscription.
import assert from 'node:assert/strict';import {assessSamples} from '../src/translation-quality.js';import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {cf,query,configFile,wrangler,assertSandbox} from './recovery-common.mjs';
const name='dream-team-pro2-preview',status={result:'BLOCKED',build:process.env.GITHUB_SHA,productionWrites:0,productionDeployments:0,provider:'@cf/meta/m2m100-1.2b',at:new Date().toISOString()},dir=await mkdtemp(join(tmpdir(),'pro2-ai-'));let phase='preflight';
await mkdir('pro2-ai-status',{recursive:true});
try{
 assert.equal(process.env.GITHUB_REF,'refs/heads/feat/pro2-i18n-photos-20261021');
 const preflight=JSON.parse(await readFile('pro2-ai-status/preflight.json','utf8'));
 // List Subscriptions returns every account subscription. The successful nonempty
 // result identifies only R2 Paid, which does not enable Workers AI overage.
 const subscriptions=preflight.checks.subscriptions;assert.equal(subscriptions.status,'PASS');assert.ok(subscriptions.data.length>0);
 assert.ok(subscriptions.data.every(s=>s.rate_plan?.id==='r2_paid'&&s.rate_plan.is_contract===false),'WORKERS_FREE_NOT_VERIFIED');
 status.costControl={subscriptionIds:subscriptions.data.map(s=>s.rate_plan.id),workersPaidSubscription:false,freeNeuronsDaily:10000,providerHardStop:'Workers Free rejects usage beyond allocation',appDailyReservedUnits:240000,otherAiFeaturesEnabled:false};
 const before=(await cf('/workers/scripts/dream-team/deployments')).deployments[0].versions[0].version_id;status.productionWorkerBefore=before;
 const deployments=await cf('/workers/scripts/'+name+'/deployments'),current=await cf('/workers/scripts/'+name+'/versions/'+deployments.deployments[0].versions[0].version_id);
 const dbId=current.resources.bindings.find(b=>b.type==='d1'&&b.name==='DB')?.id;assert.ok(dbId);const database=await cf('/d1/database/'+dbId);assertSandbox(database.name,database.uuid);status.database={id:database.uuid,name:database.name};
 const schema=Number((await query(dbId,"SELECT value FROM app_settings WHERE key='schema_version'")).results[0].value);assert.equal(schema,30);
 status.before=(await query(dbId,'SELECT status,COUNT(*) count FROM translation_jobs GROUP BY status')).results;
 const base=JSON.parse(await readFile('wrangler.jsonc','utf8'));
 const config={...base,name,main:process.cwd()+'/src/worker.js',assets:{...base.assets,directory:process.cwd()+'/public'},workers_dev:true,secrets:undefined,triggers:{crons:[]},ai:{binding:'AI'},d1_databases:[{binding:'DB',database_name:database.name,database_id:database.uuid}],r2_buckets:[{binding:'MEDIA',bucket_name:'dream-team-audit-39580535456-media'}],vars:{APP_ENV:'preview',APP_BUILD:process.env.GITHUB_SHA,INDIVIDUAL_ACCOUNTS:'true',AUTH_LEGACY_ALIAS:'Patryk',AI_FREE_ONLY:'false',TRANSLATION_REVIEW_ENABLED:'true',TRANSLATION_ENABLED:'true',TRANSLATION_FREE_CONFIRMED:'true',TRANSLATION_QA_ENABLED:'true',TRANSLATION_DAILY_UNITS:'240000'}};
 phase='bind AI on existing isolated preview';const file=await configFile(dir,config,'preview-ai.jsonc');wrangler(['deploy','--config',file]);status.bindingDeployed=true;
 const domain=await cf('/workers/subdomain');status.previewUrl='https://'+name+'.'+domain.subdomain+'.workers.dev';
 const login=async username=>{const r=await fetch(status.previewUrl+'/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username,password:process.env.RYBY_LOGIN_PASSWORD}),redirect:'manual'});assert.equal(r.status,303,'ACCOUNT_LOGIN_'+username);return r.headers.get('set-cookie').split(';')[0];};
 const cookie=await login('Patryk');
 const api=async(path,body,lang='pl',session=cookie)=>{for(let n=0;n<3;n++){const r=await fetch(status.previewUrl+path,{method:body===undefined?'GET':'POST',headers:{cookie:session,'content-type':'application/json','accept-language':lang},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(45000)});if(r.ok)return r.json();if([429,502,503,504].includes(r.status)&&n<2){await r.body?.cancel();await new Promise(resolve=>setTimeout(resolve,1000*(n+1)));continue;}const data=await r.json().catch(()=>({}));throw Object.assign(Error('PREVIEW_HTTP_'+r.status),{safeError:data.error});}};
 phase='32 real Cloudflare Llama alternatives to the recorded raw M2M100 benchmark';status.samples=[];
 for(let probe=0;probe<32;probe++){
  const started=Date.now(),answer=await api('/api/content-translations/process',{tripId:'next-trip',probe,reviewOnly:true});status.samples.push({...answer,ms:Date.now()-started});
  await writeFile('pro2-ai-status/model-responses.json',JSON.stringify(status.samples,null,2));console.log('M2M100_SAMPLE '+JSON.stringify({number:probe+1,...answer}));
 }
 status.quality=assessSamples(status.samples);await writeFile('pro2-ai-status/alternative-quality.json',JSON.stringify(status.quality,null,2));
 assert.ok(status.quality.pass>=30&&status.quality.checks.slice(0,9).every(x=>x.pass),'ALTERNATIVE_QUALITY_GATE');
 phase='controlled resumable archive backfill';status.batches=0;
 // Reprocess only automatic M2M100 drafts. Originals and manual corrections stay.
 await query(dbId,"UPDATE translation_jobs SET status='pending',attempts=0,last_error=NULL WHERE EXISTS(SELECT 1 FROM content_translations t WHERE t.entity=translation_jobs.entity AND t.record_id=translation_jobs.record_id AND t.field=translation_jobs.field AND t.language=translation_jobs.language AND t.origin='cloudflare_m2m100')");
 for(let pass=0;pass<3;pass++){const pump=async()=>{let cursor=0,guard=0;do{
   const r=await api('/api/content-translations/process',{tripId:'next-trip',queue:true});status.batches++;cursor=r.nextCursor;
   if(r.paused)throw Error('FREE_BUDGET_PAUSED');if(++guard>1500)throw Error('BACKFILL_GUARD');
   if(status.batches%20===0){status.progress=r.stats;await writeFile('pro2-ai-status/progress.json',JSON.stringify(status,null,2));console.log('M2M100_BACKFILL '+JSON.stringify({batches:status.batches,stats:r.stats}));}
  }while(cursor!==null);};await Promise.all([pump(),pump()]);
  const outstanding=(await query(dbId,"SELECT COUNT(*) count FROM translation_jobs WHERE status NOT IN ('complete','superseded')")).results[0].count;
  if(!outstanding)break;if(pass<2)await new Promise(r=>setTimeout(r,3000));
 }
 status.after=(await query(dbId,'SELECT status,COUNT(*) count FROM translation_jobs GROUP BY status')).results;
 status.errors=(await query(dbId,"SELECT last_error,COUNT(*) count FROM translation_jobs WHERE status NOT IN ('complete','superseded') GROUP BY last_error")).results;
 status.providers=(await query(dbId,'SELECT origin,COUNT(*) count FROM content_translations GROUP BY origin')).results;
 status.budget=(await query(dbId,"SELECT key,value FROM app_settings WHERE key LIKE 'translation.budget.%'")).results;
 phase='disable QA probes and verify fresh deployment';config.vars.TRANSLATION_QA_ENABLED='false';await writeFile(file,JSON.stringify(config));wrangler(['deploy','--config',file]);status.qaProbesDisabled=true;
 const fresh=await api('/api/content-translations?tripId=next-trip&language=en');status.persistedAfterRedeploy=fresh.records.filter(r=>r.status==='current').length;
 await login('Maciek');status.twoAccountLogins='PASS';
 status.productionWorkerAfter=(await cf('/workers/scripts/dream-team/deployments')).deployments[0].versions[0].version_id;assert.equal(status.productionWorkerAfter,before);
 const incomplete=status.after.filter(s=>!['complete','superseded'].includes(s.status)).reduce((n,s)=>n+s.count,0);status.result=incomplete?'PARTIAL':'PASS';
}catch(e){status.phase=phase;status.error=e.message;status.http=e.status;status.code=e.code;status.safeError=e.safeError;status.deployDetail=e.deployDetail;process.exitCode=1;}
finally{await rm(dir,{recursive:true,force:true});await writeFile('pro2-ai-status/activation.json',JSON.stringify(status,null,2));console.log('PRO2_AI_ACTIVATION '+JSON.stringify({...status,samples:status.samples?.length}));}
