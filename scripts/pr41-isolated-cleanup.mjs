// Delete only resources recorded as created by this run. Never enumerate-delete.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {cf,assertSandbox} from './recovery-common.mjs';
let owner;try{owner=JSON.parse(await readFile('pr41-isolated-owner.json','utf8'))}catch{console.log('::notice::No owned isolated resources recorded');process.exit(0)}
if(owner.run!==process.env.GITHUB_RUN_ID||!/^\d+$/.test(owner.run))throw Error('OWNER_MISMATCH');
const name='dream-team-audit-'+owner.run,report={};
for(const kind of ['worker','bucket','database']) {
 if(!owner[kind])continue;
 try {
  const n=kind==='database'?owner.database.name:owner[kind];assertSandbox(n,kind==='database'?owner.database.uuid:undefined);
  if(n!==(kind==='worker'?name:name+(kind==='bucket'?'-media':'-db')))throw Error('RESOURCE_MISMATCH');
  if(kind==='worker')await cf('/workers/scripts/'+n,'DELETE');
  if(kind==='bucket')await cf('/r2/buckets/'+n,'DELETE');
  if(kind==='database'){const d=await cf('/d1/database/'+owner.database.uuid);if(d.name!==n)throw Error('DATABASE_IDENTITY');await cf('/d1/database/'+owner.database.uuid,'DELETE');}
  report[kind]='DELETED_OWNED_RESOURCE';
 }catch(e){report[kind]={result:'BLOCKED',http:e.status??null,cloudflareCode:e.code??null};process.exitCode=1;}
}
await mkdir('pr41-isolated-status',{recursive:true});await writeFile('pr41-isolated-status/cleanup.json',JSON.stringify(report,null,2));console.log('::notice title=PR41 controlled cleanup::'+JSON.stringify(report));
