// Pre-deploy gate: reads secret names only. Never requests or logs secret values.
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token)throw Error('Cloudflare deployment credentials unavailable');
const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/workers/scripts/dream-team/secrets`,{headers:{Authorization:`Bearer ${token}`}});
if(!response.ok)throw Error(`Cannot verify Worker secret names: HTTP ${response.status}`);
const data=await response.json();
if(!data.success||!Array.isArray(data.result))throw Error('Cannot verify Worker secret names');
if(!data.result.some(item=>item.name==='TAVILY_API_KEY'))throw Error('TAVILY_API_KEY is not bound to dream-team in the deployment account. Deployment stopped.');
console.log('Required Tavily secret name is bound to dream-team; value was not read.');
