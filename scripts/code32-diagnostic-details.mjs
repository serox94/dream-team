// Redacted release diagnostics. No Cloudflare response bodies, request payloads, URLs,
// account IDs, database IDs, tokens, credentials, or untrusted exception text in logs.
const safeStatus=n=>Number.isInteger(n)&&n>=100&&n<=599?n:null;
const safeCode=n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0?n:typeof n==='string'&&/^\d{1,10}$/.test(n)?Number(n):null;
const safePhase=phase=>typeof phase==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(phase)?phase:'UNKNOWN';
export function classifyCloudflareOperation(path,method='GET'){
  if(path==='/d1/database'&&method==='POST')return 'D1_CREATE_DISPOSABLE';
  if(path==='/d1/database'&&method==='GET')return 'D1_LIST';
  if(/^\/d1\/database\/[a-f0-9-]+\/query$/.test(path)&&method==='POST')return 'D1_QUERY';
  if(/^\/workers\/scripts\/.+/.test(path))return 'WORKER_CONTROL';
  if(/^\/builds\//.test(path))return 'BUILDS_CONTROL';
  if(/^\/r2\//.test(path))return 'R2_CONTROL';
  return 'OTHER_CLOUDFLARE_CONTROL';
}
export function redactedReleaseFailure(error,phase){
  const value={phase:safePhase(phase),type:error?.message==='CLOUDFLARE_ACCESS'?'CLOUDFLARE_ACCESS':'RELEASE_GATE'};
  if(safeStatus(error?.status)!==null)value.httpStatus=error.status;
  const code=safeCode(error?.code);if(code!==null)value.cloudflareCode=code;
  if(['D1_CREATE_DISPOSABLE','D1_LIST','D1_QUERY','WORKER_CONTROL','BUILDS_CONTROL','R2_CONTROL','OTHER_CLOUDFLARE_CONTROL'].includes(error?.safeOperation))value.operation=error.safeOperation;
  return value;
}
