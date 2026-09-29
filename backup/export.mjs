// Read-only D1 export via the Cloudflare API. Runs in a separate scheduled Worker.
export async function exportD1(env,step,fetcher=fetch,now=()=>new Date()){
  const account=env.CLOUDFLARE_ACCOUNT_ID,db=env.DREAM_TEAM_DATABASE_ID;
  if(!account||!db||!env.D1_EXPORT_TOKEN||!env.BACKUP_BUCKET)throw new Error('Missing backup configuration.');
  const url=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database/${encodeURIComponent(db)}/export`;
  const headers={'content-type':'application/json',authorization:`Bearer ${env.D1_EXPORT_TOKEN}`};
  async function poll(payload){
    const response=await fetcher(url,{method:'POST',headers,body:JSON.stringify(payload)});
    if(!response.ok)throw new Error(`D1 export API returned ${response.status}.`);
    const data=await response.json();
    if(!data.success||!data.result||data.result.success===false)throw new Error('D1 export API did not confirm success.');
    if(data.result.status==='error')throw new Error('D1 export failed.');
    return data.result;
  }
  const bookmark=await step.do('Start D1 export',async()=>{
    const result=await poll({output_format:'polling'});
    if(!result.at_bookmark)throw new Error('D1 export bookmark not ready.');
    return result.at_bookmark;
  });
  return step.do('Store SQL in private R2',async()=>{
    const result=await poll({current_bookmark:bookmark});
    // Cloudflare's API schema nests the completed file under result.result;
    // its Workflow example shows the same fields directly under result.
    const signedUrl=result.result?.signed_url||result.signed_url;
    if(!signedUrl)throw new Error('D1 export is still being prepared.');
    const source=new URL(signedUrl);
    if(source.protocol!=='https:')throw new Error('Invalid D1 export URL.');
    const download=await fetcher(signedUrl);
    if(!download.ok||!download.body)throw new Error(`D1 export download returned ${download.status}.`);
    const key=`dream-team-db/${now().toISOString().replace(/[:.]/g,'-')}-${crypto.randomUUID()}.sql`;
    const object=await env.BACKUP_BUCKET.put(key,download.body,{
      httpMetadata:{contentType:'application/sql'},
      customMetadata:{source:'dream-team-db',bookmark}
    });
    if(!object||object.size===0)throw new Error('Empty or incomplete R2 backup.');
    return {key,size:object.size};
  });
}
