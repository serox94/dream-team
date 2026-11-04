// Cloudflare documents 1200 API requests / 5 minutes cumulatively per user/token.
// Keep half that budget for other clients. Retry only reads, never ambiguous writes.
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function isReadOnlyCloudflareRequest(path,method,body){
 if(['GET','HEAD'].includes(method))return true;
 if(method!=='POST'||!/^\/d1\/database\/[a-f0-9-]+\/query$/i.test(path)||typeof body?.sql!=='string')return false;
 const sql=body.sql.trim().replace(/;$/,'').trim();
 if(sql.includes(';'))return false;
 return /^SELECT\b/i.test(sql)||/^PRAGMA\s+(foreign_key_check|quick_check|table_xinfo|foreign_key_list)(?:\s*\([^;]*\))?$/i.test(sql);
}
export function cloudflareClient({fetcher=fetch,wait=sleep,now=Date.now,intervalMs=500,maxReadRetries=2,onThrottle=event=>{if(process.env.GITHUB_ACTIONS==='true')console.log('::notice title=Cloudflare rate limit::'+JSON.stringify(event))}}={}){
 if(intervalMs<500||intervalMs>5000||!Number.isInteger(maxReadRetries)||maxReadRetries<0||maxReadRetries>2)throw Error('INVALID_CLOUDFLARE_RATE_POLICY');
 let tail=Promise.resolve(),nextAt=0;
 const pauseUntil=async deadline=>{while(now()<deadline)await wait(Math.min(deadline-now(),30000))};
 return (path,method='GET',body)=>{
  const operation=async()=>{
   for(let attempt=0;;attempt++){
    await pauseUntil(nextAt);nextAt=now()+intervalMs;
    const r=await fetcher(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}`+path,{method,headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
    let data;try{data=await r.json()}catch{}
    if(r.ok&&data?.success)return data.result;
    const e=Error('CLOUDFLARE_ACCESS');e.status=r.status;
    if(Number.isInteger(data?.errors?.[0]?.code))e.code=data.errors[0].code;
    e.operation=method+'_'+(path.startsWith('/d1/database')?'D1':path.startsWith('/workers/')?'WORKERS':'CLOUDFLARE');
    if(r.status===429){
     const header=r.headers.get('retry-after'),reset=r.headers.get('ratelimit')?.match(/\bt=(\d+)/)?.[1];
     const seconds=Number(header||reset);
     e.retryAfterSeconds=Number.isFinite(seconds)&&seconds>0?Math.min(Math.ceil(seconds),300):300;
     nextAt=Math.max(nextAt,now()+e.retryAfterSeconds*1000);
     const retry=isReadOnlyCloudflareRequest(path,method,body)&&attempt<maxReadRetries;
     onThrottle({httpStatus:429,cloudflareCode:e.code,operation:e.operation,retryAfterSeconds:e.retryAfterSeconds,retry:retry?'READ_ONLY':'NOT_RETRIED'});
     if(retry)continue;
    }
    throw e;
   }
  };
  const result=tail.then(operation);tail=result.catch(()=>{});return result;
 };
}
