import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const code=readFileSync(new URL('../scripts/retire-402414-once.mjs',import.meta.url),'utf8');
const must=[
 "dream-team-audit-40241458807931-db",
 "fd253e14-747b-415d-8e4e-f39ffc4119b5",
 "31b6b9bd-8f0b-4566-9ced-6b5bf1c26f9d",
 "b64c7a2c-8694-41c6-b54a-857b88bf2c96",
 "5d32f54f-f953-463f-8519-745e51417986",
 "GITHUB_RUN_ATTEMPT==='1'",
 "AFTER_VERIFIED_BACKUP",
 "WORKER_HISTORY_INCOMPLETE",
 "TARGET_STILL_REFERENCED_BY_WORKER",
 "inspectSql(exported.bytes)",
 "verifySnapshot(target,snapshot,readonlyQuery)",
 "BACKUP_R2_SQL_HASH_MISMATCH",
 "RECEIPT_NOT_RETAINED",
 "D1_INVENTORY_CHANGED",
 "EXACT_SINGLE_DELETE",
 "VERIFY_GET_ONLY",
 "d1After:9"
];
test('cleanup pins exact target, safeguards and R2 roundtrip',()=>{
 for(const word of must) assert.ok(code.includes(word),'Missing gate: '+word);
});
test('only one delete, pinned at the exact D1 target',()=>{
 const matches=[...code.matchAll(/method:'DELETE'/g)];
 assert.equal(matches.length,1);
 assert.ok(code.includes("'/d1/database/'+target.uuid"),'Exact-target DELETE path');
 assert.ok(code.includes("check(!deleteIssued,'DOUBLE_DELETE_FORBIDDEN')"));
 assert.ok(code.includes("ONE_TIME_RUN_NO_RETRY"));
});
test('never deploys, downgrades or edits production D1',()=>{
 for(const s of ["method:'PUT'","method:'PATCH'","'/workers/scripts/dream-team/deployments','POST'","d1 migrations apply",
 "schema32-release.mjs","maintenance_mode', 'on'"])assert.ok(!code.includes(s),s);
 assert.ok(code.includes("id===target.uuid"),'SQL must only read the exact test D1');
 assert.ok(code.includes("READ_ONLY_SOURCE_QUERY_REQUIRED"),'Mutation SQL must fail preflight');
});
