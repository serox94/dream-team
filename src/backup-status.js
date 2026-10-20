// Exhaust every page; never report a first-page object as the newest backup.
export async function latestR2Backup(bucket){
 let cursor,latest=null;const seen=new Set();
 do{
  const page=await bucket.list({prefix:'dream-team-db/',limit:100,...(cursor?{cursor}:{})});
  for(const item of page.objects||[]){if(item.size>1000&&item.uploaded instanceof Date&&Number.isFinite(+item.uploaded)&&(!latest||item.uploaded>latest.uploaded))latest=item;}
  if(!page.truncated)break;
  if(!page.cursor||seen.has(page.cursor))throw Error('INVALID_BACKUP_CURSOR');
  cursor=page.cursor;seen.add(cursor);
 }while(true);
 return latest;
}
export async function listRestR2Objects(base,headers,fetcher=fetch){
 let cursor;const objects=[],seen=new Set();
 do{
  const url=new URL(base);if(cursor)url.searchParams.set('cursor',cursor);
  const response=await fetcher(url,{headers});if(!response.ok)throw Error('R2_LIST_HTTP_'+response.status);
  const data=await response.json();if(!data.success)throw Error('R2_LIST_FAILED');
  const page=data.result?.objects??data.result;if(!Array.isArray(page))throw Error('R2_LIST_FORMAT');objects.push(...page);
  const next=data.result?.cursor??data.result_info?.cursor;
  const more=data.result?.truncated??data.result_info?.is_truncated??Boolean(next);
  if(!more)break;
  if(!next||seen.has(next))throw Error('INVALID_BACKUP_CURSOR');cursor=next;seen.add(next);
 }while(true);
 return objects;
}
