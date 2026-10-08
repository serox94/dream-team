// Provision only isolated staging resources; never mutate the production D1 or backup R2.
import {readFile,writeFile} from 'node:fs/promises';

const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
if(!token||!account)throw Error('Preview requires existing Cloudflare deployment credentials.');
const apiRoot=`https://api.cloudflare.com/client/v4/accounts/${account}`;
async function api(path,method='GET',body){
 const response=await fetch(apiRoot+path,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
 const data=await response.json();
 if(!response.ok||!data.success){
  const error=Error(`Cloudflare ${method} ${path.split('/')[1]} failed (${response.status}; code ${data.errors?.[0]?.code||'unknown'}).`);
  error.status=response.status;error.code=data.errors?.[0]?.code;throw error;
 }
 return data.result;
}
const databaseName='dream-team-preview-db',bucketName='dream-team-preview-media';
const databases=await api(`/d1/database?name=${databaseName}&per_page=100`);
let database=databases.find(row=>row.name===databaseName);
if(!database)database=await api('/d1/database','POST',{name:databaseName});
try{
 const buckets=(await api('/r2/buckets')).buckets||[];
 if(!buckets.some(row=>row.name===bucketName))await api('/r2/buckets','POST',{name:bucketName});
}catch(error){
 // The deployment token can lose R2-list permission independently of Worker deploy permission.
 // This preview bucket is persistent and has already been provisioned by successful runs.
 // Reuse it instead of blocking every QA rerun; wrangler deploy / the R2 smoke step will
 // still fail closed if the bucket is genuinely missing or inaccessible.
 if(!(error.status===403&&Number(error.code)===10042))throw error;
 console.warn('R2 list permission unavailable; reusing the existing isolated preview media bucket.');
}
const production=JSON.parse((await readFile('wrangler.jsonc','utf8')).replace(/^\s*\/\/.*$/gm,''));
const productionId=production.d1_databases[0].database_id;
if(!database.uuid||database.uuid===productionId)throw Error('Preview database identity is missing or matches production.');

// Workers AI Free cannot bill overage: after the 10,000-neuron daily allocation,
// requests fail until the next reset. Enable preview AI only when Cloudflare reports
// no Workers Paid subscription; if plan detection is unavailable, fail closed.
let aiFreeOnly='false';
try{
 const subscriptions=await api('/subscriptions');
 const workersPaid=(Array.isArray(subscriptions)?subscriptions:[]).some(subscription=>{
  const plan=(subscription.rate_plan?.id+' '+subscription.rate_plan?.public_name).toLowerCase();
  return plan.includes('workers')&&!plan.includes('free');
 });
 aiFreeOnly=workersPaid?'false':'true';
}catch(error){
 console.warn('Workers plan could not be verified; preview AI remains disabled:',error.message);
}
const preview={...production,name:'dream-team-preview',workers_dev:true,triggers:{crons:[]},secrets:undefined,
 d1_databases:[{binding:'DB',database_name:databaseName,database_id:database.uuid}],
 r2_buckets:[{binding:'MEDIA',bucket_name:bucketName}],
 vars:{AI_FREE_ONLY:aiFreeOnly,APP_ENV:'preview',APP_BUILD:process.env.GITHUB_SHA||'unknown'}};
delete preview.secrets;
await writeFile('wrangler.preview.generated.jsonc',JSON.stringify(preview,null,2));
console.log(`Isolated preview configuration ready: separate D1 and private media R2; AI_FREE_ONLY=${aiFreeOnly}.`);
