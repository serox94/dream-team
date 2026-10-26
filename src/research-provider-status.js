// No keys leave the Worker. Null PAYGO limit is UNKNOWN, not proof of PAYGO OFF.
// Safe calls are bounded inside the verified Researcher allocation AND key limit.
export function freeBudget(data){
 const account=data.account||{},key=data.key||{};
 const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 const valid=account.current_plan==='Researcher'&&account.plan_limit===1000&&finite(account.plan_usage)&&account.paygo_usage===0&&
  (account.paygo_limit===0||account.paygo_limit===null)&&finite(key.limit)&&key.limit>0&&key.limit<=250&&finite(key.usage);
 const available=valid?Math.max(0,Math.floor(Math.min(900-account.plan_usage,key.limit-key.usage-10))):0;
 return {freeOnlyConfirmed:valid,available,paygoDisabledConfirmed:account.paygo_limit===0,reason:valid?'FREE_PLAN_AND_KEY_HEADROOM':'UNVERIFIED_FREE_ALLOCATION',key,account};
}
export async function tavilyUsage(env,{timeoutMs=15000}={}){
 if(!env.TAVILY_API_KEY)return {configured:false,freeOnlyConfirmed:false,available:0,reason:'MISSING_KEY'};
 const r=await fetch('https://api.tavily.com/usage',{headers:{authorization:'Bearer '+env.TAVILY_API_KEY},signal:AbortSignal.timeout(Math.min(15000,Math.max(1000,timeoutMs)))});
 if(!r.ok)return {configured:true,freeOnlyConfirmed:false,available:0,reason:'USAGE_HTTP_'+r.status};
 const data=await r.json(),pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o?.[k]!==undefined).map(k=>[k,o[k]]));
 return {configured:true,...freeBudget({account:pick(data.account,['current_plan','plan_usage','plan_limit','paygo_usage','paygo_limit']),key:pick(data.key,['usage','limit','search_usage','extract_usage'])})};
}
