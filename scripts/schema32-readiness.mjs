// No application changes: UUID + immutable configuration + an anonymous feature
// discriminator identify full versus fallback even when APP_BUILD is identical.
const uuid=/^[a-f0-9]{8}-[a-f0-9-]{27}$/;
const sha=/^[a-f0-9]{40}$/;
const safeSha=x=>sha.test(x||'')?x:null;
const safeRay=x=>/^[a-f0-9]{16}-[A-Z0-9]{3,8}$/.test(x||'')?x:null;
const safeId=x=>uuid.test(x||'')?x:null;
const check=(x,c)=>{if(!x)throw Error(c);};
async function bounded(promise,signal){if(signal.aborted)throw signal.reason;let abort;const stopped=new Promise((_,reject)=>{abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});});try{return await Promise.race([promise,stopped]);}finally{signal.removeEventListener('abort',abort);}}
export function versionIdentity(version){
 const vars=Object.fromEntries(version.resources.bindings.filter(x=>x.type==='plain_text').map(x=>[x.name,x.text]));
 return {id:version.id,build:vars.APP_BUILD,variant:vars.APP_VARIANT||'full'};
}
export async function fetchReadiness(baseUrl,{variant,headers={},timeoutMs=4000,fetcher=fetch,signal}={}){
 // Never forward a browser cookie jar, Authorization or conditional-cache headers.
 check(Object.keys(headers).every(k=>['x-release-gate','x-research-proxy-key'].includes(k.toLowerCase())),'PROBE_HEADERS_FORBIDDEN');
 const signals=[AbortSignal.timeout(timeoutMs),...(signal?[signal]:[])];
 const opts={method:'GET',redirect:'manual',credentials:'omit',cache:'no-store',headers:{...headers,'cache-control':'no-cache'},signal:AbortSignal.any(signals)};
 const login=await fetcher(new URL('/login',baseUrl),opts);
 const result={status:login.status,build:safeSha(login.headers.get('x-dreamteam-build')),invalidBuild:Boolean(login.headers.get('x-dreamteam-build'))&&!safeSha(login.headers.get('x-dreamteam-build')),ray:safeRay(login.headers.get('cf-ray')),responseVersion:safeId(login.headers.get('x-dreamteam-version')),featureStatus:null,featureVariant:'unknown'};
 if(login.status!==200){const reader=login.body?.getReader();let text='';if(reader)try{while(text.length<8192){const part=await reader.read();if(part.done)break;text+=new TextDecoder().decode(part.value).slice(0,8192-text.length);}}finally{await reader.cancel().catch(()=>{});}result.cfError=(text.match(/(?:error code:|error)\s*[:#]?\s*(\d{4,5})/i)||[])[1]||null;}else await login.body?.cancel();
 if(login.status===200){
  const feature=await fetcher(new URL('/api/lake-candidates',baseUrl),opts);result.featureStatus=feature.status;
  // Only the boolean discriminator is retained. Never log response bodies.
  const raw=await feature.text();let data;try{data=JSON.parse(raw);}catch{}
  result.featureKind=data?'JSON':raw==='Unavailable'?'ISOLATION_GATE':'NON_JSON';result.featureRay=safeRay(feature.headers.get('cf-ray'));result.featureBuild=safeSha(feature.headers.get('x-dreamteam-build'));
  if(feature.status===401&&data?.ok===false)result.featureVariant='full';
  if(feature.status===503&&data?.error==='Research temporarily paused during recovery.')result.featureVariant='schema32-fallback';
 }
 return result;
}
export async function waitForVersionReady({expected,previousVersionId,staleBuilds=[],readControlPlane,probe,maxMs=30000,maxAttempts=8,now=Date.now,wait=ms=>new Promise(r=>setTimeout(r,ms)),onAttempt=()=>{},signal}={}){
 check(uuid.test(expected?.id||'')&&sha.test(expected?.build||'')&&['full','schema32-fallback'].includes(expected?.variant),'EXPECTED_IDENTITY_REQUIRED');
 check(maxMs>0&&maxMs<=45000&&maxAttempts>0&&maxAttempts<=10,'READINESS_BOUND_REQUIRED');
 const start=now(),attempts=[];let consecutive=0,transient=false;
 const failure=reason=>{const e=Error(reason);e.report={result:'BLOCKED',reason,expected,attempts,elapsedMs:now()-start};throw e;};
 for(let index=0;index<maxAttempts&&now()-start<maxMs;index++){
  const a={attempt:index+1,expectedBuild:expected.build,expectedVersion:expected.id,expectedVariant:expected.variant,status:null,receivedBuild:null,ray:null,responseVersion:null};
  let terminal=false,good=false;
  try{
   const remainingForApi=maxMs-(now()-start);if(remainingForApi<=0)break;const apiSignal=AbortSignal.any([AbortSignal.timeout(remainingForApi),...(signal?[signal]:[])]);
   const state=await bounded(readControlPlane(apiSignal),apiSignal),versions=state.versions;
   a.controlPlaneSource=state.source||'deployment';a.workersDevEnabled=typeof state.routing?.enabled==='boolean'?state.routing.enabled:null;a.versionUrlsEnabled=typeof state.routing?.previews_enabled==='boolean'?state.routing.previews_enabled:null;a.controlPlaneVersion=versions?.length===1?safeId(versions[0].version_id):null;
   if(state.routing?.enabled===false){a.reason='WORKERS_DEV_ROUTE_DISABLED';terminal=true;}
   else if(versions?.length!==1||versions[0].percentage!==100){a.reason='UNEXPECTED_TRAFFIC_SPLIT';terminal=true;}
   else if(versions[0].version_id!==expected.id){if(versions[0].version_id===previousVersionId)a.reason='CONTROL_PLANE_PENDING';else{a.reason='UNEXPECTED_ACTIVE_VERSION';terminal=true;}}
   else if(state.identity.id!==expected.id||state.identity.build!==expected.build||state.identity.variant!==expected.variant){a.reason='VERSION_CONFIGURATION_MISMATCH';terminal=true;}
   else{
    const remaining=maxMs-(now()-start);if(remaining<=0)break;
    const p=await probe(AbortSignal.any([AbortSignal.timeout(remaining),...(signal?[signal]:[])]));
    Object.assign(a,{status:p.status,cfError:p.cfError||null,receivedBuild:p.build,invalidBuild:p.invalidBuild||false,ray:p.ray,responseVersion:p.responseVersion,featureStatus:p.featureStatus,featureVariant:p.featureVariant,featureKind:p.featureKind,featureRay:p.featureRay,featureBuild:p.featureBuild});
    if(p.responseVersion&&p.responseVersion!==expected.id){a.reason='RESPONSE_VERSION_MISMATCH';terminal=true;}
    else if(p.status===503&&p.build===expected.build){a.reason='APPLICATION_SCHEMA_OR_MAINTENANCE';terminal=true;}
    else if(p.status===404&&!p.build)a.reason='ROUTING_UNCONFIRMED';
    else if([502,503,504].includes(p.status))a.reason='TRANSIENT_HTTP_UNCONFIRMED';
    else if(p.status!==200){a.reason='HTTP_STATUS_MISMATCH';terminal=true;}
    else if(!p.build){a.reason='BUILD_HEADER_MISSING_OR_INVALID';terminal=true;}
    else if(p.build!==expected.build){if(staleBuilds.includes(p.build))a.reason='STALE_BUILD_OBSERVED';else{a.reason='BUILD_MISMATCH';terminal=true;}}
    else if(p.featureVariant==='unknown'&&[502,503,504].includes(p.featureStatus)&&p.featureKind!=='JSON')a.reason='FEATURE_ROUTE_UNCONFIRMED';
    else if(p.featureVariant!==expected.variant){if(previousVersionId&&['full','schema32-fallback'].includes(p.featureVariant))a.reason='PREVIOUS_VARIANT_STILL_SERVING';else{a.reason='APPLICATION_VARIANT_MISMATCH';terminal=true;}}
    else{a.reason='IDENTITY_READY';good=true;}
   }
  }catch(e){if(e.report)throw e;a.reason=['AbortError','TimeoutError','TypeError'].includes(e.name)?'TRANSIENT_TRANSPORT_UNCONFIRMED':'CONTROL_PLANE_UNAVAILABLE';}
  attempts.push(a);onAttempt(a);
  if(terminal)failure(a.reason);
  consecutive=good?consecutive+1:0;if(!good)transient=true;
  // Two fresh observations prevent a one-response success during a transition.
  if(consecutive===2)return {result:'PASS',expected,attempts,elapsedMs:now()-start,transition:transient?'RECOVERED_AFTER_OBSERVED_TRANSIENT':'READY_WITHOUT_TRANSIENT',propagationConfirmed:false};
  if(index+1<maxAttempts){const delay=Math.min([500,1000,2000,3000,5000][Math.min(index,4)],maxMs-(now()-start));if(delay>0)await wait(delay);}
 }
 failure('READINESS_DEADLINE');
}
