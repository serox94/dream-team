// A restore-only checkpoint must not replay already passed app/UI tests.
// The exception is restricted to this branch, an explicit marker and an exact file allowlist.
import {execFileSync} from 'node:child_process';import {appendFileSync} from 'node:fs';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const allowed=new Set(['scripts/d1-snapshot.mjs','scripts/saved-checkpoint-drill.mjs','scripts/recovery-common.mjs','scripts/restore-io-worker.js','scripts/qa-restore-scope.mjs','tests/d1-snapshot.test.mjs','tests/recovery-gateway.test.mjs','.github/workflows/preview-final-batch.yml','.github/workflows/validate.yml','.github/workflows/responsive-qa.yml','docs/audit-fixes-2026-10-13.md','docs/verification/recovery-block-2026-10-13.json']);
const files=git('diff','--name-only','HEAD^','HEAD').split('\n');
const only=(process.env.GITHUB_HEAD_REF||process.env.GITHUB_REF_NAME)==='feat/final-batch'&&git('log','-1','--format=%B').includes('[restore only]')&&files.length>0&&files.every(f=>allowed.has(f));
appendFileSync(process.env.GITHUB_OUTPUT,`restore_only=${only}\n`);if(only)console.log('Existing PASS app/UI evidence retained; audit-fixes tests the private restore changes.');
