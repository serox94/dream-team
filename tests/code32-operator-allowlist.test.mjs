import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const source=readFileSync(new URL('../scripts/code32-release.mjs',import.meta.url),'utf8');
const match=source.match(/const allowedOperatorFiles=new Set\(\[([\s\S]*?)\]\);/);
assert.ok(match,'Explicit operator allowlist must exist');
const allowed=[...match[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);
const allowedSet=new Set(allowed);
const expected=[
 'scripts/d1-snapshot.mjs','scripts/code32-release.mjs','scripts/code32-release-safety.mjs',
 'scripts/recovery-transport.mjs','scripts/code32-transition.mjs','scripts/qa-lake-manager-live.mjs',
 'tests/d1-snapshot-large-row.test.mjs','tests/code32-release.test.mjs',
 'tests/code32-release-safety.test.mjs','tests/restore-transport.test.mjs',
 'tests/code32-transition-diagnostics.test.mjs','tests/code32-operator-allowlist.test.mjs',
 '.github/workflows/code32-release.yml','docs/release/CODE32_RELEASE.md'
];

test('explicit operator-only allowlist is exact, with no wildcard or duplicates',()=>{
 assert.equal(allowed.length,allowedSet.size,'Duplicate entries weaken review');
 assert.deepEqual([...allowed].sort(),[...expected].sort(),'Review required for every allowlisted change');
 assert.ok(allowed.every(p=>!/[?*\[\]]/.test(p)),'No glob patterns');
});

test('candidate to current branch changes touch only explicitly allowlisted operator/test files',()=>{
 const candidate='179da4d917e1968f35c2ddf063790e8a0428b0a9';
 const diff=execFileSync('git',['diff','--name-only',candidate,'HEAD'],{encoding:'utf8'})
  .trim().split('\n').filter(Boolean);
 assert.ok(diff.length>=4,'Diagnostic patch files must be present');
 assert.ok(diff.every(file=>allowedSet.has(file)),JSON.stringify(diff.filter(file=>!allowedSet.has(file))));
 for(const file of ['scripts/code32-transition.mjs','scripts/qa-lake-manager-live.mjs',
  'tests/code32-transition-diagnostics.test.mjs','tests/code32-operator-allowlist.test.mjs'])
  assert.ok(diff.includes(file),'Missing expected review file: '+file);
});

test('allowlist rejects unrelated application, migration, configuration and secret changes',()=>{
 const notAllowed=['src/worker.js','public/pages/wyjazdy.html','public/lake-manager.js',
  'migrations/0033.sql','wrangler.jsonc','backup/wrangler.jsonc',
  '.github/workflows/deploy-production.yml','scripts/credential-rotation.mjs',
  'tests/unreviewed-operator.test.mjs'];
 for(const file of notAllowed)assert.equal(allowedSet.has(file),false,file);
 assert.match(source,/UNREVIEWED_OPERATOR_CHANGE/);
 assert.match(source,/APPLICATION_TREE_CHANGED/);
 assert.match(source,/NEW_COMMIT_SCOPED_APPROVAL_REQUIRED/);
 assert.match(source,/EXPLICIT_PRODUCTION_APPROVAL_REQUIRED/);
});
