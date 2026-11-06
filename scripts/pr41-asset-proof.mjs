// Audit-only asset reader: deliberately has NO D1, R2, AI or secret bindings.
// It retains the currently active AND latest uploaded version's asset namespace.
// It does not claim that a rebuilt reference is a dump of production assets.
import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {cf,assertSandbox,sha} from './recovery-common.mjs';
import {uploadExactAuditVersion} from './pr41-audit-artifact.mjs';
const check=(v,c)=>{if(!v)throw Error(c)};
export async function verifyAuditAssetNamespace({worker,source,expectedVersion,root,base}) {
 assertSandbox(worker);
 const current=async()=>{const v=(await cf('/workers/scripts/'+worker+'/deployments')).deployments[0].versions;check(v.length===1&&v[0].percentage===100,'ASSET_PROOF_TRAFFIC_SPLIT');return v[0].version_id};
 const activate=id=>cf('/workers/scripts/'+worker+'/deployments','POST',{strategy:'percentage',versions:[{version_id:id,percentage:100}]});
 check(await current()===expectedVersion,'ASSET_PROOF_SOURCE_CHANGED');
 const files=[];const visit=async(base='')=>{for(const e of await readdir(join(root,base),{withFileTypes:true})){const p=join(base,e.name);if(e.isDirectory())await visit(p);else{check(e.isFile(),'ASSET_PROOF_FILE_TYPE');files.push({path:p,sha256:sha(await readFile(join(root,p)))})}}};await visit();files.sort((a,b)=>a.path.localeCompare(b.path));check(files.length>0,'ASSET_PROOF_EMPTY');
 const nonce=randomBytes(16).toString('hex');
 const code='export default {async fetch(r,e){const a=await e.ASSETS.fetch(r);const out=new Response(a.body,a);out.headers.set("x-pr41-static-probe",'+JSON.stringify(nonce)+');return out}}';
 const probe=await uploadExactAuditVersion(worker,source,[{name:'ASSETS',type:'assets'}],[{name:source.main_module,content_type:'application/javascript+module',content_base64:Buffer.from(code).toString('base64')}]);
 let attempted=false;
 try {
  attempted=true;await activate(probe);
  let ready=false;
  for(let i=0;i<30;i++) {
   const r=await fetch(base+'/login.html',{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(5000)});
   ready=r.status===200&&r.headers.get('x-pr41-static-probe')===nonce;await r.body?.cancel();if(ready)break;
   await new Promise(r=>setTimeout(r,1500));
  }
  check(ready,'ASSET_PROOF_EDGE_NOT_READY');
  for(const file of files) {
   const path=base+'/'+file.path.split('/').map(encodeURIComponent).join('/');
   let verified=false,last={status:null,marker:false};
   for(let attempt=0;attempt<5;attempt++){
    const r=await fetch(path+'?pr41_audit='+nonce+'-'+attempt,{redirect:'manual',cache:'no-store',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(10000)});
    last={status:r.status,marker:r.headers.get('x-pr41-static-probe')===nonce};
    if(last.status===200&&last.marker){
     check(sha(Buffer.from(await r.arrayBuffer()))===file.sha256,'ASSET_PROOF_BYTES_MISMATCH');
     verified=true;break;
    }
    await r.body?.cancel();
    if(attempt<4)await new Promise(resolve=>setTimeout(resolve,1200));
   }
   if(!verified){console.log('::warning title=PR41 isolated static read::'+JSON.stringify({path:file.path,status:last.status,marker:last.marker}));throw Error('ASSET_PROOF_RESPONSE_IDENTITY')}
  }
  check(await current()===probe,'ASSET_PROOF_ACTIVE_CHANGED');
  return {status:'PASS',files:files.length,sha256:sha(JSON.stringify(files)),databaseBindings:0};
 }finally {
  if(attempted){check([probe,expectedVersion].includes(await current()),'ASSET_PROOF_UNKNOWN_VERSION');await activate(expectedVersion);}
 }
}
