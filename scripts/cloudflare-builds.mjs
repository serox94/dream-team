// Official Workers Builds listByScript endpoint. Never treats an API failure as idle.
const check=(v,c)=>{if(!v)throw Error(c)};
const terminal=new Set(['success','fail','skipped','cancelled','terminated']);
export async function workerBuilds(workerTag,request){
 check(/^[a-zA-Z0-9_-]{1,128}$/.test(workerTag||''),'INVALID_WORKER_TAG');
 const builds=[];let previous;
 for(let page=1;page<=100;page++){
  const rows=await request(`/builds/workers/${encodeURIComponent(workerTag)}/builds?page=${page}&per_page=100`);
  check(Array.isArray(rows),'BUILDS_RESPONSE_INVALID');
  const fingerprint=JSON.stringify(rows.map(r=>r.build_uuid||r.uuid||r.id));
  check(!rows.length||fingerprint!==previous,'BUILDS_PAGINATION_STALLED');previous=fingerprint;
  builds.push(...rows);
  if(rows.length<100)return builds;
 }
 throw Error('BUILDS_PAGINATION_LIMIT');
}
export async function requireIdleWorker(workerTag,request){
 const builds=await workerBuilds(workerTag,request);
 for(const build of builds)check(build.status==='stopped'&&terminal.has(build.build_outcome),'BUILDS_ACTIVE_OR_UNKNOWN');
 return {result:'PASS',builds:builds.length};
}
