// Cloudflare control-plane adapter for disposable CI Workers only.
// Production activation is deliberately unsupported until full release safety is verified.
import {cf} from './recovery-common.mjs';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(ok,code)=>{if(!ok)throw Error(code)};
export function isolatedCloudflareAdapter({worker,runId,baseUrl,request=cf,fetcher=fetch,wait=sleep}){
 assert(/^[0-9]+$/.test(runId||'')&&worker===`dream-team-audit-${runId}-recovery-probe`,'NON_ISOLATED_WORKER');
 const base=new URL(baseUrl);
 assert(base.protocol==='https:'&&base.hostname.startsWith(worker+'.')&&base.hostname.endsWith('.workers.dev')&&!base.username&&!base.password&&base.pathname==='/','NON_ISOLATED_URL');
 const prefix='/workers/scripts/'+worker;
 const active=async()=>{
  const d=(await request(prefix+'/deployments')).deployments[0];
  assert(d?.versions?.length===1&&d.versions[0].percentage===100&&uuid.test(d.versions[0].version_id),'UNSAFE_TRAFFIC_SPLIT');
  return d.versions[0].version_id;
 };
 const version=async id=>{assert(uuid.test(id||''),'INVALID_VERSION');const v=await request(prefix+'/versions/'+id);assert(v.id===id,'VERSION_ID_MISMATCH');return v};
 const activate=async id=>{
  await version(id);
  return request(prefix+'/deployments','POST',{strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':'Disposable isolated release adapter test'}});
 };
 const ready=async(id,expectedBuild)=>{
  assert(/^[a-z0-9-]{1,64}$/i.test(expectedBuild||''),'INVALID_BUILD');
  let last={},consecutive=0;
  for(let i=0;i<16;i++){
   const observed=await active();assert(observed===id,'CONTROL_PLANE_MISMATCH');
   try{const r=await fetcher(new URL('/?probe='+i,base),{redirect:'manual',signal:AbortSignal.timeout(5000)});last={http:r.status,build:r.headers.get('x-build')};await r.body?.cancel();if(r.status===200&&last.build===expectedBuild){if(++consecutive===2)return {result:'PASS',version:id,...last}}else consecutive=0}catch(e){consecutive=0;last={network:e.name}}
   if(i<15)await wait(1500);
  }
  const e=Error('READINESS_DEADLINE');e.safe=last;throw e;
 };
 return {active,version,activate,ready};
}
