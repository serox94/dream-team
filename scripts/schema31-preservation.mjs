import {rowsDigest} from './d1-snapshot.mjs';
export async function verifyPreservedRows(read,baseline,{onTable=()=>{}}={}){
 for(const table of ['auth_accounts','auth_credential','auth_account_credentials','auth_sessions','trips','catches','checklist_items','content_translations']){
  onTable(table);if(!Object.hasOwn(baseline,table)||!Array.isArray(baseline[table]))throw Error('PRESERVATION_BASELINE_MISSING');
  const rows=await read(table);if(!Array.isArray(rows))throw Error('PRESERVATION_READ_INVALID');
  if(rowsDigest(rows)!==rowsDigest(baseline[table]))throw Error('PRODUCTION_PRESERVATION_CHANGED');
 }
 return 'PASS';
}
