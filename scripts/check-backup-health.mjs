import assert from 'node:assert/strict';

const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert.ok(account&&token,'Cloudflare deployment credentials missing');
const headers={Authorization:`Bearer ${token}`};
const root=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}`;
const now=new Date(),today=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate(),3,0));
const expected=Date.now()<today.getTime()+45*60000?new Date(today.getTime()-86400000):today;
const since=Date.parse(process.env.MIN_BACKUP_TIMESTAMP||expected.toISOString());

const listing=await fetch(`${root}/r2/buckets/dream-team-d1-backups/objects?prefix=dream-team-db%2F&per_page=100`,{headers});
assert.equal(listing.status,200,`R2 listing returned ${listing.status}`);
const data=await listing.json();
assert.equal(data.success,true,'R2 listing failed');
const objects=data.result?.objects??data.result;
assert.ok(Array.isArray(objects),'Unexpected R2 object listing response');
const timestamp=item=>Date.parse(item.uploaded||item.last_modified||item.lastModified||'');
const backup=objects.filter(item=>item.key?.startsWith('dream-team-db/')&&item.size>1000&&timestamp(item)>=since).sort((a,b)=>timestamp(b)-timestamp(a))[0];
assert.ok(backup,'No nonempty scheduled backup after the expected 03:17 UTC run');
const key=backup.key.split('/').map(encodeURIComponent).join('/');
const response=await fetch(`${root}/r2/buckets/dream-team-d1-backups/objects/${key}`,{headers});
assert.equal(response.status,200,`R2 backup download returned ${response.status}`);
const sql=await response.text();
assert.ok(sql.length>1000&&/CREATE TABLE/i.test(sql)&&/checklist_items/i.test(sql)&&/trips/i.test(sql),'Backup SQL is incomplete');

const schedule=await fetch(`${root}/workers/scripts/dream-team-d1-backup/schedules`,{headers});
assert.equal(schedule.status,200,`Backup schedule check returned ${schedule.status}`);
const schedules=await schedule.json();
assert.equal(schedules.success,true,'Backup schedule check failed');
assert.ok(schedules.result?.schedules?.some(item=>item.cron==='17 3 * * *'),'03:17 UTC cron is missing');
console.log(`Scheduled backup verified: ${backup.key}, ${backup.size} bytes, ${backup.uploaded||backup.last_modified||backup.lastModified}. Cron 03:17 UTC active.`);
