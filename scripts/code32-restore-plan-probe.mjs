// ONE-OFF READ-ONLY replay of the private SQL saved by failed run 40703214121.
// Runs solely on an ephemeral CI runner. NEVER uploads the SQL or its rows.
import {mkdtemp,readFile,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {wrangler,sha} from './recovery-common.mjs';
import {inspectSql,restoreStatements} from './d1-snapshot.mjs';

const key='dream-team-d1-backups/private-releases/code32/40703214121-179da4d9/schema32.sql';
const dir=await mkdtemp(join(tmpdir(),'code32-plan-'));const file=join(dir,'snapshot.sql');
const report={result:'BLOCKED',mode:'PRIVATE_SQL_READ_ONLY',sourceRun:'40703214121',databaseCreates:0,databaseDeletes:0,productionSqlCalls:0,backupsModified:0,deployments:0};
try{
 wrangler(['r2','object','get',key,'--remote','--file',file]);
 const bytes=await readFile(file);
 if(bytes.length===0||bytes.length>10000000)throw Error('PRIVATE_SNAPSHOT_SIZE_BUDGET');
 const snapshot=inspectSql(bytes),plan=restoreStatements(snapshot);
 const large=plan.filter(x=>x.stage==='rows'&&x.params?.length);
 Object.assign(report,{result:'PASS',schemaTables:snapshot.tables.length,sourceRows:snapshot.tables.reduce((n,t)=>n+t.rows.length,0),plannedStatements:plan.length,parameterizedStatements:large.length,maxSqlBytes:Math.max(...plan.map(x=>Buffer.byteLength(x.sql))),maxBoundTextBytes:Math.max(0,...large.flatMap(x=>x.params.map(y=>Buffer.byteLength(y)))),sourceSqlSha256:sha(bytes),actualRemoteD1Restore:'NOT_RUN'});
}catch(error){report.error=/^[A-Z0-9_]+$/.test(error.message)?error.message:'PRIVATE_SQL_PLAN_BLOCKED';process.exitCode=1;}
finally{await rm(dir,{recursive:true,force:true});await mkdir('code32-plan-status',{recursive:true});await writeFile('code32-plan-status/summary.json',JSON.stringify(report,null,2),{mode:0o600});console.log('CODE32_PRIVATE_SQL_PLAN '+JSON.stringify(report));}
