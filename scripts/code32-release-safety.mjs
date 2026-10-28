// Pure, privacy-safe safeguards for schema32 code-only releases.
// Never log thrown exception text, Cloudflare response bodies, URLs, secrets or row data.
const check=(pass,code)=>{if(!pass)throw Error(code);};
const status=n=>Number.isInteger(n)&&n>=100&&n<=599?n:undefined;
const number=n=>(typeof n==='number'&&Number.isSafeInteger(n)&&n>=0)?n:
  (typeof n==='string'&&/^\d{1,10}$/.test(n)?Number(n):undefined);
const label=s=>typeof s==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(s)?s:'UNKNOWN';
const codes=new Set(['CLOUDFLARE_ACCESS','WRANGLER_OPERATION_FAILED','RESTORE_STATEMENT_FAILED',
  'PRIVATE_R2_RESTORE_FAILED','RELEASE_SQL_READ_BUDGET','MEDIA_BACKUP_BUDGET',
  'MEDIA_SNAPSHOT_CHANGED','RECOVERY_POINT_EXPIRED','FRESH_RECOVERY_POINT_REQUIRED',
  'SCHEMA32_GATE_FAILED','PRIVATE_MEDIA_IO_UPLOAD','PRIVATE_MEDIA_IO_NOT_READY',
  'MEDIA_BACKUP_FAILED','MEDIA_RESTORE_COUNT','RECOVERY_FAILED','NO_MANIFEST',
  'ARCHIVE_MISMATCH','RESTORE_MISMATCH','ROW_EXCEEDS_D1_VALUE_LIMIT',
  'BUILDS_ACTIVE','D1_RECOVERY_SLOT_UNAVAILABLE','SOURCE_WORKER_CHANGED']);
const recoveries=new Set(['SOURCE_CHANGED','COPY_MISMATCH','NO_MANIFEST','ARCHIVE_MISMATCH','RESTORE_MISMATCH','RECOVERY_FAILED','INVALID_RESPONSE','NON_JSON']);
export function releaseErrorSummary(error,phase,operation='UNKNOWN'){
 const result={phase:label(phase),operation:label(operation),code:codes.has(error?.message)?error.message:
   'SCHEMA32_GATE_FAILED'};
 const http=status(error?.status??error?.httpStatus);if(http!==undefined)result.httpStatus=http;
 const apiCode=number(error?.code??error?.cloudflareCode);if(apiCode!==undefined)result.cloudflareCode=apiCode;
 for(const [field,value] of [['stage',error?.stage],['safeReason',error?.safeReason],['recoveryCode',error?.recoveryCode]]){
  if(typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,63}$/.test(value)&&(field!=='recoveryCode'||recoveries.has(value)))result[field]=value;
 }
 return result;
}
export function validateMediaInventory(objects){
 check(Array.isArray(objects),'MEDIA_INVENTORY_INVALID');
 check(objects.length<=100,'MEDIA_BACKUP_BUDGET');
 let bytes=0;const keys=new Set();
 for(const object of objects){
  check(object&&typeof object.key==='string'&&object.key.length>0&&!keys.has(object.key),'MEDIA_INVENTORY_INVALID');
  check(Number.isSafeInteger(Number(object.size))&&Number(object.size)>=0,'MEDIA_INVENTORY_INVALID');
  keys.add(object.key);bytes+=Number(object.size);check(bytes<=200*1024*1024,'MEDIA_BACKUP_BUDGET');
 }
 return {objects:objects.length,totalBytes:bytes,empty:objects.length===0};
}
export function requireUnchangedEmptyMedia(previous,objects){
 check(previous?.snapshotKind==='VERIFIED_EMPTY_R2'&&previous.objects===0,'MEDIA_EMPTY_RECEIPT_REQUIRED');
 const current=validateMediaInventory(objects);
 check(current.empty,'MEDIA_SNAPSHOT_CHANGED');
 return true;
}
