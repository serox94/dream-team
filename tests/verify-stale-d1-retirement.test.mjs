import {test} from 'node:test';import assert from 'node:assert/strict';import {verifyRemaining,readOnly} from '../scripts/verify-stale-d1-retirement.mjs';
const names=['dream-team-audit-4041643103232-db','dream-team-audit-40241458807931-db','dream-team-audit-3990506121731-db','dream-team-audit-2026102331-db','dream-team-audit-2026102231-db','dream-team-audit-39580535456-db','dream-team-audit-39576994645-db','dream-team-preview-db','dream-team-db'];
const data=()=>({result:names.map((name,i)=>({name,uuid:'id'+i})),result_info:{total_count:9}});
test('nine exact remaining databases are verified independently of a stale metadata counter',()=>{
 const d=data();assert.equal(verifyRemaining(d).actualCount,9);d.result_info.total_count=10;
 assert.deepEqual(verifyRemaining(d),{actualCount:9,apiCountMetadata:10,countMetadataConsistent:false});
});
test('missing, replaced, duplicated or still-present databases fail verification',()=>{
 let d=data();d.result.pop();assert.throws(()=>verifyRemaining(d),/EXPECTED_NINE_DATABASES/);
 d=data();d.result[0].name='another-db';assert.throws(()=>verifyRemaining(d),/OTHER_DATABASE_NAME_CHANGED/);
 d=data();d.result[0].uuid=d.result[1].uuid;assert.throws(()=>verifyRemaining(d),/DATABASE_IDENTITY_DUPLICATE/);
 d=data();d.result[0].name='dream-team-audit-39575383767-db';assert.throws(()=>verifyRemaining(d),/DELETED_TARGET_PRESENT/);
});
test('post-deletion verification wrapper can issue only GET',async()=>{
 const calls=[],get=readOnly({async request(...args){calls.push(args);return {};}});
 await get('/d1/database?per_page=100');assert.deepEqual(calls,[['GET','/d1/database?per_page=100']]);
});
