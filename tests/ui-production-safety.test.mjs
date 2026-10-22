import test from 'node:test';import assert from 'node:assert/strict';
import {requireApproval,requireSchema} from '../scripts/ui-release-core.mjs';
test('UI release requires separate explicit approval',()=>{for(const v of [undefined,'','true','no'])assert.throws(()=>requireApproval(v),/EXPLICIT_PRODUCTION_CONFIRMATION_REQUIRED/);assert.doesNotThrow(()=>requireApproval('yes'));});
test('UI release supports only open schema30 and never asks to purge sessions',()=>{for(const n of [20,28,29,31])assert.throws(()=>requireSchema(n,'off'),/SOURCE_SCHEMA_NOT_30/);assert.throws(()=>requireSchema(30,'on'),/SOURCE_MAINTENANCE_ON/);assert.doesNotThrow(()=>requireSchema('30','off'));});

import {verifyRows} from '../scripts/ui-production-release.mjs';
test('UI preservation detects loss or mutation of original sessions despite equal counts',async()=>{
 const snapshot={tables:[{name:'trips',rows:[{id:'trip',name:'Original'}]},{name:'auth_account_credentials',rows:[{account_id:'a',password_hash:'original'}]},{name:'auth_sessions',rows:[{id_hash:'existing',expires_at:123}]},{name:'auth_login_limits',rows:[]}]};
 const live=Object.fromEntries(snapshot.tables.map(t=>[t.name,structuredClone(t.rows)]));
 const read=async sql=>{assert.match(sql,/^SELECT \* FROM /);return live[sql.replace(/^SELECT \* FROM /,'').replaceAll('"','')];};
 await verifyRows(snapshot,{operational:true,read});
 live.auth_sessions=[{id_hash:'replacement',expires_at:123}];await assert.rejects(verifyRows(snapshot,{operational:true,read}),/PREEXISTING_SESSION_CHANGED/);
 live.auth_sessions=structuredClone(snapshot.tables[2].rows);live.auth_account_credentials[0].password_hash='changed';await assert.rejects(verifyRows(snapshot,{operational:true,read}),/PRESERVATION_AUTH_ACCOUNT_CREDENTIALS/);
 live.auth_account_credentials=structuredClone(snapshot.tables[1].rows);live.trips[0].name='Changed';await assert.rejects(verifyRows(snapshot,{operational:true,read}),/PRESERVATION_TRIPS/);
});
