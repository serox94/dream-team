// Narrow read-only check for a version-addressable asset export. Never logs
// source, object contents, URLs, tokens or plaintext configuration values.
import {createHash} from 'node:crypto';
const source='31b6b9bd-8f0b-4566-9ced-6b5bf1c26f9d';
if(process.env.GITHUB_REPOSITORY!=='serox94/dream-team'||process.env.GITHUB_REF!=='refs/heads/ops/pr41-safe-release-20261106')throw Error('CONTEXT');
for(const path of ['/workers/scripts/dream-team/assets','/workers/workers/dream-team/versions/'+source+'/assets']) {
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+path,{headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(30000)});
 const bytes=Buffer.from(await r.arrayBuffer());let data;try{data=JSON.parse(bytes)}catch{}
 const result=data?.result;
 const report={endpoint:path,http:r.status,cloudflareCodes:data?.errors?.map(e=>e.code)||[],success:data?.success===true,resultFields:result&&typeof result==='object'?Object.keys(result).sort():null,bodySha256:createHash('sha256').update(bytes).digest('hex'),mutation:false};
 console.log('::notice title=PR41 static export read::'+JSON.stringify(report));
}
