// Configuration only. Existing authentication secrets and inference controls
// are preserved; adding shared policy does not grant an administrative role.
export function production31Config(base,sourceVars,{main,build,assets,fallback=false}){
 if(!/^[a-f0-9]{40}$/.test(build))throw Error('EXACT_BUILD_REQUIRED');
 return {...base,name:'dream-team',main,assets:{...base.assets,directory:assets},vars:{...sourceVars,APP_BUILD:build,ANGLER_PASSWORD_POLICY:'shared',SCHEMA_REGISTRY_CACHE:'true',RESEARCH_FREE_ONLY:'true',...(fallback?{APP_VARIANT:'schema31-fallback'}:{})}};
}
