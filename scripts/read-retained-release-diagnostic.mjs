// Read-only Actions artifact inspection. Emits only safe provider failure fields.
import {execFileSync} from 'node:child_process';import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const repo='serox94/dream-team';
const safe=value=>typeof value==='string'&&/^[A-Z0-9_]{1,80}$/.test(value)?value:undefined;
const select=data=>({stage:safe(data.stage),error:safe(data.error),httpStatus:Number.isInteger(data.httpStatus)?data.httpStatus:undefined,cloudflareCode:Number.isInteger(data.cloudflareCode)?data.cloudflareCode:undefined,operation:safe(data.operation)});
const gh=args=>execFileSync('gh',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000});
const runs=(process.env.DIAGNOSTIC_RUN_IDS||'').split(',');
if(process.env.GITHUB_REPOSITORY!==repo||runs.length>10||!runs.every(id=>/^\d+$/.test(id)))throw Error('INVALID_DIAGNOSTIC_CONTEXT');
for(const id of runs){
 let dir;
 try{
  const run=JSON.parse(gh(['api',`repos/${repo}/actions/runs/${id}`]));
  if(run.path!=='.github/workflows/isolated-release-drill.yml'||run.head_repository?.full_name!==repo)throw Error('UNEXPECTED_DIAGNOSTIC_RUN');
  dir=await mkdtemp(join(tmpdir(),'retained-release-'));
  gh(['run','download',id,'--repo',repo,'--pattern','isolated-release-*','--dir',dir]);
  const files=(await readdir(dir,{recursive:true})).filter(f=>f.endsWith('.json'));
  if(!files.length||files.length>100)throw Error('RETAINED_REPORT_MISSING');
  for(const file of files){
   const bytes=await readFile(join(dir,file));if(bytes.length>1024*1024)throw Error('RETAINED_REPORT_TOO_LARGE');
   const data=JSON.parse(bytes.toString()),report={run:id,...select(data)};
   if(Array.isArray(data.scenarios))report.scenarios=data.scenarios.map(s=>({scenario:['success','activation-timeout','migration-timeout','readiness-failure'].includes(s.scenario)?s.scenario:undefined,...select(s.release||{})}));
   console.log('::notice title=Retained provider diagnostic::'+JSON.stringify(report));
  }
 }catch(e){console.log('::error title=Retained provider diagnostic::'+JSON.stringify({run:id,error:safe(e.message)||'RETAINED_EVIDENCE_UNAVAILABLE'}));process.exitCode=1}
 finally{if(dir)await rm(dir,{recursive:true,force:true})}
}
