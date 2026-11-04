import {digest} from './release-config-policy.mjs';
const check=(v,c)=>{if(!v)throw Error(c)};
export async function protectedEnvironment({github,environment='production',runId,operator,plan,planDigest,context=process.env,requireApproval=true}){
 check(context.GITHUB_REPOSITORY==='serox94/dream-team'&&context.GITHUB_EVENT_NAME==='workflow_dispatch'&&context.GITHUB_REF==='refs/heads/main'&&context.GITHUB_SHA===operator&&context.GITHUB_RUN_ID===String(runId),'PROTECTED_OPERATOR_CONTEXT_REQUIRED');
 check(context.GITHUB_WORKFLOW_REF===`serox94/dream-team/.github/workflows/approved-production-release.yml@refs/heads/main`&&context.GITHUB_WORKFLOW_SHA===operator,'UNTRUSTED_PRODUCTION_WORKFLOW');
 check(/^[a-f0-9]{64}$/.test(planDigest||'')&&digest(plan)===planDigest,'PLAN_DIGEST_MISMATCH');
 const env=await github('/environments/'+encodeURIComponent(environment));
 const rule=env.protection_rules?.find(r=>r.type==='required_reviewers');
 check(Number.isInteger(env.id)&&rule?.prevent_self_review===true&&Array.isArray(rule.reviewers)&&rule.reviewers.length>0,'PROTECTED_ENVIRONMENT_REQUIRED');
 check(env.deployment_branch_policy?.protected_branches===true,'PROTECTED_BRANCH_POLICY_REQUIRED');
 const branch=await github('/branches/main');check(branch.protected===true,'PROTECTED_MAIN_REQUIRED');
 const run=await github('/actions/runs/'+runId);
 check(run.event==='workflow_dispatch'&&run.head_sha===operator&&run.head_branch==='main'&&run.path==='.github/workflows/approved-production-release.yml','APPROVED_RUN_MISMATCH');
 if(requireApproval){
  const repository=await github('');check(repository.owner?.type==='User'&&Number.isInteger(repository.owner.id),'REPOSITORY_OWNER_UNVERIFIED');
  const approvals=await github('/actions/runs/'+runId+'/approvals');check(Array.isArray(approvals),'ENVIRONMENT_APPROVAL_UNAVAILABLE');
  check(approvals.some(a=>a.state==='approved'&&a.environments?.some(e=>e.id===env.id)&&a.user?.type==='User'&&a.user.id===repository.owner.id&&a.user.id!==run.actor?.id&&a.user.id!==run.triggering_actor?.id),'INDEPENDENT_ENVIRONMENT_APPROVAL_REQUIRED');
 }
 return {result:'PASS',environmentId:env.id,planDigest};
}
