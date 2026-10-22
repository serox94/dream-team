// Usage metadata only; the existing write-only Tavily key never leaves its Worker.
export async function tavilyUsage(env){
 if(!env.TAVILY_API_KEY)return {configured:false,freeOnlyConfirmed:false,reason:'MISSING_KEY'};
 const r=await fetch('https://api.tavily.com/usage',{headers:{authorization:'Bearer '+env.TAVILY_API_KEY},signal:AbortSignal.timeout(15000)});
 if(!r.ok)return {configured:true,freeOnlyConfirmed:false,reason:'USAGE_HTTP_'+r.status};
 const data=await r.json(),pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o?.[k]!==undefined).map(k=>[k,o[k]]));
 const account=pick(data.account,['current_plan','plan_usage','plan_limit','paygo_usage','paygo_limit']),key=pick(data.key,['usage','limit','search_usage','extract_usage']);
 const valid=Number.isFinite(account.plan_limit)&&account.plan_limit>0&&account.plan_limit<=1000&&Number.isFinite(account.plan_usage)&&account.paygo_usage===0&&account.paygo_limit===0;
 return {configured:true,freeOnlyConfirmed:valid,key,account,available:valid?Math.max(0,Math.min(900,account.plan_limit-25)-account.plan_usage):0};
}
