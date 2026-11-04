import {createHash} from 'node:crypto';
const check=(v,c)=>{if(!v)throw Error(c)};
export function canonical(value){return JSON.stringify(normalize(value))}
function normalize(v){if(Array.isArray(v))return v.map(normalize);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])]));return v}
export const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
export function configuration(version){
 const resources=version?.resources;check(Array.isArray(resources?.bindings),'VERSION_BINDINGS_UNAVAILABLE');
 check(Object.keys(resources).every(k=>['bindings','script_runtime','script'].includes(k)),'UNSUPPORTED_CONFIGURATION_RESOURCE');
 const names=new Set();
 const bindings=resources.bindings.map(binding=>{
  check(binding&&typeof binding.name==='string'&&!names.has(binding.name),'DUPLICATE_BINDING');names.add(binding.name);
  // Never include secret contents, even if a provider erroneously returns them.
  if(binding.type==='secret_text')return {name:binding.name,type:'secret_text'};
  check(!/(PASSWORD|TOKEN|SECRET|API_KEY|PRIVATE_KEY)/i.test(binding.name),'SECRET_IN_UNSAFE_BINDING');
  return normalize(binding);
 }).sort((a,b)=>a.name.localeCompare(b.name));
 check(resources.script_runtime&&typeof resources.script_runtime==='object','RUNTIME_CONFIGURATION_UNAVAILABLE');
 return {bindings:Object.fromEntries(bindings.map(b=>[b.name,b])),runtime:normalize(resources.script_runtime)};
}
// Allow exact reviewed replacements only; no name-only/regex wildcard exceptions.
export function verifyConfiguration(actual,expected,approvedDifferences=[]){
 check(expected&&typeof expected==='object','APPROVED_CONFIGURATION_REQUIRED');
 const wanted=structuredClone(expected),seen=new Set();
 for(const change of approvedDifferences){
  check(change&&Array.isArray(change.path)&&change.path.length&&change.path.every(k=>typeof k==='string'&&!['__proto__','prototype','constructor'].includes(k)),'INVALID_CONFIGURATION_EXCEPTION');
  const key=canonical(change.path);check(!seen.has(key),'DUPLICATE_CONFIGURATION_EXCEPTION');seen.add(key);
  let node=wanted;for(const part of change.path.slice(0,-1)){check(node&&Object.hasOwn(node,part),'INVALID_CONFIGURATION_EXCEPTION');node=node[part]}
  const last=change.path.at(-1),op=change.op||'replace';
  if(op==='add'){check(!Object.hasOwn(node,last)&&change.fromMissing===true,'CONFIGURATION_EXCEPTION_SOURCE_CHANGED');node[last]=structuredClone(change.to)}
  else {check(['replace','remove'].includes(op)&&Object.hasOwn(node,last)&&canonical(node[last])===canonical(change.from),'CONFIGURATION_EXCEPTION_SOURCE_CHANGED');if(op==='remove')delete node[last];else node[last]=structuredClone(change.to)}
 }
 check(canonical(actual)===canonical(wanted),'UNAPPROVED_CONFIGURATION_DRIFT');
 return {result:'PASS',digest:digest(actual)};
}
// Version metadata exposes secret names, not immutable secret-value identities.
// Matching names must never be presented as proof that secret values match.
export function requireComparableSecrets(version){
 check(!version?.resources?.bindings?.some(b=>b.type==='secret_text'),'SECRET_CONFIGURATION_UNVERIFIABLE');
}
