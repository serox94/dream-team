// Reuse exact application evidence. Only operator-only differences are accepted.
import {execFileSync} from 'node:child_process';import {mkdir,writeFile} from 'node:fs/promises';
const app='a1c58a91d741da1975baa9003d927e8915e19445',runId=40325115575,check=(x,c)=>{if(!x)throw Error(c);};
const gh=async path=>{const r=await fetch('https://api.github.com/repos/serox94/dream-team'+path,{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'}});check(r.ok,'RETAINED_EVIDENCE_ACCESS');return r.json();};
execFileSync('git',['diff','--exit-code',app,'HEAD','--','src','public','migrations','package.json','package-lock.json','wrangler.jsonc','backup'],{stdio:'pipe'});
const run=await gh('/actions/runs/'+runId),jobs=await gh('/actions/runs/'+runId+'/jobs');check(run.head_sha===app,'RETAINED_RUN_SHA_MISMATCH');
const names=['Run npm test','Complete fishery and trip workflows plus 16-screen responsive matrix','Protect and update existing isolated preview, retain all history','Real preserved-preview PL/EN, themes, archive research and offline'];
for(const name of names)check(jobs.jobs.some(j=>j.steps.some(s=>s.name===name&&s.conclusion==='success')),'RETAINED_STEP_NOT_PASS');
const runs=(await gh('/actions/runs?head_sha='+app+'&per_page=100')).workflow_runs,checks=[];for(const name of ['Validate Dream Team','Responsive UI QA']){const r=runs.find(r=>r.head_sha===app&&r.name===name&&r.conclusion==='success');check(r,'RETAINED_CHECK_NOT_PASS');checks.push({name,id:r.id});}
await mkdir('rc-status',{recursive:true});const report={result:'PASS',applicationCommit:app,applicationIdentical:true,retainedManagerRun:runId,retainedPassedSteps:names,checks,unfinishedSteps:['schema32 fallback/full/recovery','bounded real provider integration'],productionUnchanged:true};await writeFile('rc-status/retained-evidence.json',JSON.stringify(report,null,2));console.log('RETAINED_EVIDENCE '+JSON.stringify(report));
