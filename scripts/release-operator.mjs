// Explicit operator-only entry point. Runtime never invokes migrations or initializes accounts.
import assert from 'node:assert/strict';import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';import {DatabaseSync} from 'node:sqlite';import {migrateCopy,oldManifest,compareManifest,validateMigrationState} from './migration-contract.mjs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {initializeAccounts} from '../src/auth.js';import {assertReleaseReceipt,cf,query,remoteDb,wrangler,productionId,exportSql,sha} from './recovery-common.mjs';
const [action,file]=process.argv.slice(2);assert.ok(['deploy','migrate','initialize','rollback'].includes(action));assert.equal(process.env.DREAMTEAM_PRODUCTION_APPROVED,'yes','Explicit production approval required; no operation performed.');assert.ok(file,'Private verified release manifest required');
const receipt=JSON.parse(await readFile(file,'utf8'));assertReleaseReceipt(receipt,process.env.GITHUB_SHA);const state=(await query(productionId,"SELECT key,value FROM app_settings WHERE key IN ('schema_version','maintenance_mode')")).results;assert.equal(state.find(r=>r.key==='maintenance_mode')?.value,'on');const dir=await mkdtemp(join(tmpdir(),'dream-private-release-'));
try{
 const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));assert.equal(config.name,'dream-team');assert.equal(config.d1_databases[0].database_id,productionId);assert.equal(config.vars.INDIVIDUAL_ACCOUNTS,'true');assert.equal(config.vars.AI_FREE_ONLY,'false');config.d1_databases[0].migrations_dir=process.cwd()+'/migrations';config.vars.APP_BUILD=receipt.candidate;delete config.vars.AUTH_LEGACY_ALIAS;
 const target=dir+'/production.jsonc';config.main=process.cwd()+'/src/worker.js';config.assets.directory=process.cwd()+'/public';await writeFile(target,JSON.stringify(config),{mode:0o600});
 // Verify the private SQL proof and live schema before any production mutation.
 assert.match(receipt.sourceSqlKey||'',/^private-releases\/[a-f0-9-]+\.sql$/);
 const sourceFile=dir+'/source.sql';wrangler(['r2','object','get','dream-team-d1-backups/'+receipt.sourceSqlKey,'--remote','--file',sourceFile]);const sourceBytes=await readFile(sourceFile);assert.equal(sha(sourceBytes),receipt.sqlSha256);
 const proof=new DatabaseSync(':memory:',{enableForeignKeyConstraints:false}),live=new DatabaseSync(':memory:',{enableForeignKeyConstraints:false});let preservation;try{proof.exec(sourceBytes.toString());preservation=oldManifest(proof);migrateCopy(proof);const dump=await exportSql(target,'dream-team-db',dir+'/current.sql');live.exec(dump.bytes.toString());validateMigrationState(live);compareManifest(live,preservation);assert.equal(live.prepare('PRAGMA foreign_key_check').all().length,0);}finally{proof.close();live.close();}
 if(action==='migrate'){
  assert.equal(receipt.preMigrationVerified,true);assert.equal(receipt.sourceSchema,20);assert.equal(receipt.migrationRehearsal,'PASS');
  wrangler(['d1','migrations','apply','dream-team-db','--remote','--config',target]);
  const verified=new DatabaseSync(':memory:',{enableForeignKeyConstraints:false});try{verified.exec((await exportSql(target,'dream-team-db',dir+'/after.sql')).bytes.toString());assert.equal(validateMigrationState(verified),28);compareManifest(verified,preservation);assert.equal(verified.prepare('PRAGMA foreign_key_check').all().length,0);}finally{verified.close();}
 }else if(action==='initialize'){
  assert.equal(state.find(r=>r.key==='schema_version')?.value,'28');await initializeAccounts({DB:remoteDb(productionId),RYBY_LOGIN_PASSWORD:process.env.RYBY_LOGIN_PASSWORD,RYBY_SESSION_SECRET:process.env.RYBY_SESSION_SECRET});
 }else if(action==='deploy'){
  assert.equal(state.find(r=>r.key==='schema_version')?.value,'28');assert.equal(receipt.postMigrationVerified,true);assert.equal((await query(productionId,'SELECT COUNT(*) n FROM auth_sessions')).results[0].n,0,'Sessions must be physically purged in maintenance before release');assert.ok((await query(productionId,'SELECT id FROM auth_credential WHERE id=1')).results.length);
  wrangler(['deploy','--config',target]);
 }else{
  // No automatic database reset or historical tag checkout. Preserve writes made after release.
  assert.equal(receipt.rollbackDataReconciled,true);assert.equal(receipt.rollbackSchemaCompatible,true);assert.ok(receipt.rollbackConfigVerified);assert.equal(receipt.rollbackCodeHasMaintenanceGuard,true,'Legacy Worker without the global maintenance guard cannot be rolled back automatically');
  await query(productionId,'DELETE FROM auth_sessions');
  wrangler(['rollback',receipt.previousWorkerVersion,'--name','dream-team','--message','Approved manifest-based recovery']);
  // Restored Worker stays behind the maintenance flag; a separate, successful smoke is required.
 }
 console.log('OPERATOR ACTION COMPLETE: '+action+'; maintenance remains on, verify smoke before opening traffic.');
}finally{await rm(dir,{recursive:true,force:true});}
