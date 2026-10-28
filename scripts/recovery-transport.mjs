// Only private audit gateways. Restore is idempotent on a disposable target;
// retry edge publication/availability errors, never authentication or data errors.
export async function privateRestore(url,key,{fetcher=fetch,pause=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 if(!/^https:\/\/dream-team-audit-\d+-io\.[a-z0-9-]+\.workers\.dev$/.test(url))throw Error('NOT_PRIVATE_RECOVERY_GATEWAY');
 for(let attempt=0;attempt<3;attempt++){
  const response=await fetcher(url+'/restore',{method:'POST',headers:{'x-recovery-key':key},signal:AbortSignal.timeout(120000)});
  const text=await response.text();let data;try{data=JSON.parse(text);}catch{}
  if(response.status===200&&data?.ok===true&&data.verified===true)return {data,httpStatus:200,attempts:attempt+1};
  if(attempt<2&&(([404,502,503,504].includes(response.status)&&!data)||(response.status===500&&data?.ok===false&&data.error==='NO_MANIFEST'))){await pause(2000*(attempt+1));continue;}
  const error=Error('PRIVATE_R2_RESTORE_FAILED');error.status=response.status;error.recoveryCode=/^[A-Z_]+$/.test(data?.error||'')?data.error:data?'INVALID_RESPONSE':'NON_JSON';error.contentType=response.headers.get('content-type');throw error;
 }
}
