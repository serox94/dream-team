import test from 'node:test';import assert from 'node:assert/strict';
import {database} from './db.mjs';import {migrateCopy,oldManifest,compareManifest} from '../scripts/migration-contract.mjs';
import {initializeProtectedAccount} from '../src/auth.js';import {wrapLocal,insertSql} from '../scripts/astra-release-model.mjs';
test('release schema28-to29 and private system initialization preserve all original rows, credentials and sessions',async()=>{
 const source=database({through:'0028'}),target=database({through:'0028'});const env={DB:source,RYBY_SESSION_SECRET:'isolated-fixture-strong-session-secret',RYBY_LOGIN_PASSWORD:'isolated-fixture-shared',RYBY_LOGIN_USERNAME:'fixture'};
 try{
  source.sqlite.exec("INSERT INTO auth_credential(id,salt,password_hash,iterations,version) VALUES(1,'synthetic-salt','synthetic-hash',100000,4)");source.sqlite.exec("INSERT INTO auth_sessions(id_hash,expires_at,account_id,auth_version) VALUES('synthetic-existing-session',9999999999,'account-patryk',4)");const sessions=source.sqlite.prepare('SELECT * FROM auth_sessions').all();const before=oldManifest(source.sqlite);const originalAccounts=source.sqlite.prepare('SELECT * FROM auth_accounts ORDER BY id').all(),credential=source.sqlite.prepare('SELECT * FROM auth_credential').all();
  assert.equal(migrateCopy(source.sqlite).to,29);compareManifest(source.sqlite,before);
  const initial='private-fixture-initial';await initializeProtectedAccount({...env,DB:wrapLocal(source.sqlite)},initial);
  const sql=[insertSql(source.sqlite,'anglers','id','system-ryby'),insertSql(source.sqlite,'auth_accounts','id','account-system-ryby'),insertSql(source.sqlite,'auth_account_credentials','account_id','account-system-ryby')].join('\n');
  assert.equal(sql.includes(initial),false);migrateCopy(target.sqlite);target.sqlite.exec(sql);
  const row=target.sqlite.prepare('SELECT protected,active FROM auth_accounts WHERE id=?').get('account-system-ryby');assert.deepEqual({...row},{protected:1,active:1});assert.equal(target.sqlite.prepare('SELECT must_change FROM auth_account_credentials').get().must_change,1);
  assert.deepEqual(source.sqlite.prepare('SELECT * FROM auth_sessions').all(),sessions);assert.deepEqual(source.sqlite.prepare('SELECT * FROM auth_credential').all(),credential);for(const old of originalAccounts){const after=source.sqlite.prepare('SELECT * FROM auth_accounts WHERE id=?').get(old.id);delete after.protected;assert.deepEqual(after,old);}
  assert.throws(()=>target.sqlite.prepare('UPDATE auth_accounts SET active=0 WHERE id=?').run('account-system-ryby'),/PROTECTED_ACCOUNT/);assert.throws(()=>target.sqlite.prepare('DELETE FROM auth_accounts WHERE id=?').run('account-system-ryby'),/PROTECTED_ACCOUNT/);
 }finally{source.close();target.close();}
});
