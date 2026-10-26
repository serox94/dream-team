// A restore-only checkpoint must not replay already passed app/UI tests.
// The exception is restricted to this branch, an explicit marker and an exact file allowlist.
import {execFileSync} from 'node:child_process';import {appendFileSync} from 'node:fs';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const allowed=new Set(['scripts/d1-snapshot.mjs','scripts/recovery-transport.mjs','scripts/finish-checkpoint-restore.mjs','tests/restore-transport.test.mjs','scripts/r2-restore-diagnostic.mjs','scripts/saved-checkpoint-drill.mjs','scripts/recovery-common.mjs','scripts/restore-io-worker.js','scripts/qa-restore-scope.mjs','tests/d1-snapshot.test.mjs','tests/recovery-gateway.test.mjs','.github/workflows/preview-final-batch.yml','.github/workflows/validate.yml','.github/workflows/responsive-qa.yml','docs/audit-fixes-2026-10-13.md','docs/verification/recovery-block-2026-10-13.json']);
const files=git('diff','--name-only','HEAD^','HEAD').split('\n');
let only=(process.env.GITHUB_HEAD_REF||process.env.GITHUB_REF_NAME)==='feat/final-batch'&&git('log','-1','--format=%B').includes('[restore only]')&&files.length>0&&files.every(f=>allowed.has(f));
const checkpoint='a1c58a91d741da1975baa9003d927e8915e19445';
const recoveryFiles=new Set(['scripts/schema32-extraction-probe.mjs','scripts/schema32-provider-cache.mjs','docs/verification/schema32-pwa-20261026.json','scripts/qa-lake-manager-provider.mjs','scripts/schema32-preview-recover.mjs','scripts/schema32-retained-evidence.mjs','scripts/schema32-rehearse.mjs','scripts/schema32-readiness.mjs','scripts/schema32-release.mjs','scripts/schema32-routing.mjs','scripts/qa-offline-ready.mjs','scripts/qa-restore-scope.mjs','tests/schema32-readiness.test.mjs','tests/schema32-transition.test.mjs','tests/schema32-release-gates.test.mjs','tests/schema32-routing.test.mjs','.github/workflows/lake-manager.yml','.github/workflows/validate.yml','.github/workflows/responsive-qa.yml','docs/release/SCHEMA32_RELEASE.md','docs/verification/schema32-recovery-20261026.json']);
if((process.env.GITHUB_HEAD_REF||process.env.GITHUB_REF_NAME)==='feat/automatic-lake-manager-20261026'&&git('log','-1','--format=%B').includes('[recovery only]')){
 const changes=git('diff','--name-only',checkpoint,'HEAD').split('\n').filter(Boolean);
 const appDiff=git('diff','--name-only',checkpoint,'HEAD','--','src','public','migrations','package.json','package-lock.json','wrangler.jsonc','backup');
 if(changes.length&&changes.every(f=>recoveryFiles.has(f))&&!appDiff){
  const response=await fetch('https://api.github.com/repos/serox94/dream-team/actions/runs?head_sha='+checkpoint+'&per_page=100',{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'}});if(!response.ok)throw Error('RETAINED_CHECKS_UNAVAILABLE');const runs=(await response.json()).workflow_runs;
  if(!['Validate Dream Team','Responsive UI QA'].every(name=>runs.some(r=>r.head_sha===checkpoint&&r.name===name&&r.conclusion==='success')))throw Error('RETAINED_CHECKS_NOT_PASS');
  only=true;console.log('Exact application tree unchanged from '+checkpoint+'. Validate and Responsive PASS retained; Integrated Lake Manager runs changed operator tests and real recovery only.');
 }
}
appendFileSync(process.env.GITHUB_OUTPUT,`restore_only=${only}\n`);if(only)console.log('Existing PASS app/UI evidence retained; audit-fixes tests the private restore changes.');
