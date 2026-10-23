// Provisioning helper ONLY for the private sandbox. A rejected gate is before
// application execution. Never replay an application error or ambiguous write.
export async function isolationFetch(url,options,{fetcher=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms)),onRetry=()=>{}}={}){
 if(!/^dream-team-audit-\d+\.[a-z0-9-]+\.workers\.dev$/.test(new URL(url).hostname))throw Error('ISOLATED_HOST_REQUIRED');
 const deadline=AbortSignal.timeout(15000),signal=AbortSignal.any([deadline,...(options.signal?[options.signal]:[])]);
 for(let attempt=0;attempt<6;attempt++){
  const r=await fetcher(url,{...options,signal});
  if(r.status!==503||r.headers.has('x-research-d1-meter')||await r.clone().text()!=='Unavailable'||attempt===5)return r;
  await r.body?.cancel();onRetry({attempt:attempt+1,status:503,reason:'PRIVATE_GATE_BEFORE_APPLICATION'});await wait([500,1000,2000,3000,5000][attempt]);
 }
}
