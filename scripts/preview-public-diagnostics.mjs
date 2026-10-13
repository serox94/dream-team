// Safe transport evidence only: no cookies, credentials, request bodies or client IPs.
import {mkdir,writeFile} from 'node:fs/promises';
export async function publicDiagnostic(name,url){
 try{
  const r=await fetch(url,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(12000)}),body=await r.text();
  const plain=body.replace(/<[^>]*>/g,' '),code=plain.match(/error(?:\s*code|_code)?\s*[:=]?\s*(\d{4})/i)?.[1]||null;
  return {name,status:r.status,cloudflareError:code,title:body.match(/<title[^>]*>([^<]{0,120})<\/title>/i)?.[1]||null,retryAfter:r.headers.get('retry-after'),server:r.headers.get('server')};
 }catch(error){return {name,result:'BLOCKED',error:error.name};}
}
const report={at:new Date().toISOString(),public:[]};
for(const [name,url] of [['preview','https://dream-team-preview.sewerynski00.workers.dev/login'],['production-public','https://dream-team.sewerynski00.workers.dev/login']])report.public.push(await publicDiagnostic(name,url));
if(process.env.CLOUDFLARE_API_TOKEN&&process.env.CLOUDFLARE_ACCOUNT_ID){
 try{
  // Aggregate historical outcomes; do not expose account IDs or unrelated script names.
  const query='query($accountTag: string, $start: string, $end: string) { viewer { accounts(filter: {accountTag: $accountTag}) { workersInvocationsAdaptive(limit: 100, filter: {datetime_geq: $start, datetime_lt: $end}) { sum { requests errors } dimensions { status } } } } }';
  const r=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},body:JSON.stringify({query,variables:{accountTag:process.env.CLOUDFLARE_ACCOUNT_ID,start:'2026-10-12T00:00:00Z',end:'2026-10-13T00:00:00Z'}}),signal:AbortSignal.timeout(15000)}),data=await r.json();
  report.historicalWorkersMetrics=data.errors?.length||!r.ok?{result:'BLOCKED',httpStatus:r.status,errorCode:data.errors?.[0]?.extensions?.code||null}:{result:'PASS',period:'2026-10-12 UTC',outcomes:data.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive||[]};
 }catch(error){report.historicalWorkersMetrics={result:'BLOCKED',error:error.name};}
}
await mkdir('live-preview-qa',{recursive:true});await writeFile('live-preview-qa/transport-diagnostics.json',JSON.stringify(report,null,2));console.log('PUBLIC TRANSPORT DIAGNOSTICS',JSON.stringify(report));
