// Control-plane metadata only. No SQL, exports, object downloads or mutations.
import {mkdir, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const ROOT = 'https://api.cloudflare.com/client/v4';
const PREFIX = 'private-releases/code32/40531123753-179da4d9/';
const resourceName = value => typeof value === 'string' && /^dream-team(?:-[a-z0-9]+)*$/.test(value);
const numericCode = value => /^\d{1,10}$/.test(String(value ?? '')) ? Number(value) : null;

export function allowedRead(path, account) {
  const url = new URL(ROOT + path);
  if (url.origin !== 'https://api.cloudflare.com' || !url.pathname.startsWith('/client/v4/')) return false;
  const p = url.pathname.slice('/client/v4'.length), q = url.searchParams;
  if (p === '/user/tokens/verify' || /^\/user\/tokens\/[a-f0-9]{32}$/.test(p)) return !url.search;
  const base = '/accounts/' + account;
  if (p === base + '/d1/database') return [...q.keys()].every(k => ['page', 'per_page'].includes(k));
  if (p === base + '/workers/scripts') return !url.search;
  if (p.startsWith(base + '/workers/scripts/') && p.endsWith('/settings')) {
    return !url.search && resourceName(p.slice((base + '/workers/scripts/').length, -'/settings'.length));
  }
  if (p === base + '/r2/buckets') return [...q.keys()].every(k => ['cursor', 'per_page'].includes(k));
  if (p === base + '/r2/buckets/dream-team-d1-backups/objects') {
    return q.get('prefix') === PREFIX && [...q.keys()].every(k => ['prefix', 'per_page', 'cursor'].includes(k));
  }
  return false;
}

export function metadataClient({account, token, fetcher = fetch, maximumRequests = 70}) {
  let requests = 0;
  return {
    get requests() { return requests; },
    async read(path, operation) {
      if (!/^[a-f0-9]{32}$/.test(account || '') || !token || !allowedRead(path, account)) throw Error('READ_ONLY_ENDPOINT_REJECTED');
      if (++requests > maximumRequests) throw Error('METADATA_REQUEST_BUDGET');
      let response;
      try {
        response = await fetcher(ROOT + path, {
          method: 'GET', redirect: 'error',
          headers: {authorization: 'Bearer ' + token, accept: 'application/json'},
          signal: AbortSignal.timeout(15000)
        });
      } catch { throw Error('METADATA_TRANSPORT_FAILED'); }
      let data;
      try { data = await response.json(); } catch { data = null; }
      if (!response.ok || data?.success !== true) {
        const error = Error('CLOUDFLARE_READ_FAILED');
        error.safe = {operation, httpStatus: response.status, cloudflareCode: numericCode(data?.errors?.[0]?.code)};
        throw error;
      }
      return data;
    }
  };
}

export async function inventory({account, token, fetcher = fetch, maximumRequests = 70, build = null}) {
  const report = {
    result: 'BLOCKED', mode: 'READ_ONLY', build: /^[a-f0-9]{40}$/.test(build || '') ? build : null,
    productionWrites: 0, sqlQueries: 0, databaseExports: 0, databasesCreated: 0, databasesDeleted: 0,
    objectBodiesDownloaded: 0, productionApprovalChanged: false, failures: [],
    scope: 'Active Worker settings and metadata; historical version references are not certified safe to delete.'
  };
  const client = metadataClient({account, token, fetcher, maximumRequests});
  const base = '/accounts/' + account;
  const section = async (operation, task) => {
    try { return await task(); }
    catch (e) {
      report.failures.push(e.safe || {operation, error: ['READ_ONLY_ENDPOINT_REJECTED', 'METADATA_REQUEST_BUDGET', 'METADATA_TRANSPORT_FAILED', 'INCOMPLETE_PAGINATION', 'UNEXPECTED_METADATA_FORMAT'].includes(e.message) ? e.message : 'METADATA_READ_FAILED'});
      return null;
    }
  };
  if (!account || !token) { report.error = 'CLOUDFLARE_CREDENTIALS_UNAVAILABLE'; return report; }

  const databases = await section('D1_LIST', async () => {
    const all = [];
    for (let page = 1; page <= 5; page++) {
      const data = await client.read(base + '/d1/database?per_page=100&page=' + page, 'D1_LIST');
      if (!Array.isArray(data.result)) throw Error('UNEXPECTED_METADATA_FORMAT');
      all.push(...data.result);
      const total = data.result_info?.total_count;
      if ((Number.isInteger(total) && all.length >= total) || (!Number.isInteger(total) && data.result.length < 100)) return all;
    }
    throw Error('INCOMPLETE_PAGINATION');
  });
  const workers = await section('WORKER_LIST', async () => {
    const data = await client.read(base + '/workers/scripts', 'WORKER_LIST');
    if (!Array.isArray(data.result)) throw Error('UNEXPECTED_METADATA_FORMAT');
    return data.result.filter(w => resourceName(w.id));
  });
  const references = new Map();
  report.workers = [];
  let completeBindings = workers !== null && workers.length <= 40;
  for (const worker of (workers || []).slice(0, 40)) {
    const settings = await section('WORKER_SETTINGS', async () => (await client.read(base + '/workers/scripts/' + worker.id + '/settings', 'WORKER_SETTINGS')).result);
    if (!Array.isArray(settings?.bindings)) { completeBindings = false; continue; }
    const bindings = [];
    for (const b of settings.bindings) {
      if (b.type === 'd1') {
        const db = (databases || []).find(d => d.uuid === b.id);
        bindings.push({type: 'D1', database: resourceName(db?.name) ? db.name : '[unresolved]'});
        references.set(b.id, [...(references.get(b.id) || []), worker.id]);
      } else if (b.type === 'r2_bucket' && resourceName(b.bucket_name)) bindings.push({type: 'R2', bucket: b.bucket_name});
    }
    // Never retain raw settings, environment variables or secret bindings.
    report.workers.push({name: worker.id, bindings});
  }
  report.activeBindingsComplete = completeBindings;
  if (databases) report.d1 = {
    count: databases.length, ownerConfirmedPlan: 'Free', databaseLimit: 10, creationHeadroom: Math.max(0, 10 - databases.length),
    databases: databases.filter(d => resourceName(d.name)).map(d => ({
      name: d.name, sizeBytes: Number.isFinite(d.file_size) ? d.file_size : null,
      activeWorkers: references.get(d.uuid) || [], auditNamed: d.name.startsWith('dream-team-audit-'),
      safeToDelete: 'NOT_VERIFIED'
    }))
  };

  await section('R2_BUCKET_LIST', async () => {
    const all = [], seen = new Set(); let cursor;
    for (let page = 0; page < 3; page++) {
      const data = await client.read(base + '/r2/buckets?per_page=1000' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), 'R2_BUCKET_LIST');
      if (!Array.isArray(data.result?.buckets)) throw Error('UNEXPECTED_METADATA_FORMAT');
      all.push(...data.result.buckets);
      const next = data.result_info?.cursor;
      if (!next) {
        report.r2Buckets = all.filter(b => resourceName(b.name)).map(b => ({name: b.name, activeWorkers: report.workers.filter(w => w.bindings.some(x => x.type === 'R2' && x.bucket === b.name)).map(w => w.name)}));
        return;
      }
      if (seen.has(next)) break;
      seen.add(next); cursor = next;
    }
    throw Error('INCOMPLETE_PAGINATION');
  });
  await section('FAILED_RUN_BACKUP_OBJECTS', async () => {
    const data = await client.read(base + '/r2/buckets/dream-team-d1-backups/objects?per_page=100&prefix=' + encodeURIComponent(PREFIX), 'FAILED_RUN_BACKUP_OBJECTS');
    const objects = data.result?.objects ?? data.result;
    if (!Array.isArray(objects)) throw Error('UNEXPECTED_METADATA_FORMAT');
    const complete = !(data.result?.truncated || data.result_info?.is_truncated || data.result?.cursor || data.result_info?.cursor);
    report.failedRunBackup = {run: '40531123753', inventoryComplete: complete, objects: objects.filter(o => ['schema32.sql', 'receipt.json'].some(n => o.key === PREFIX + n)).map(o => ({name: o.key.slice(PREFIX.length), sizeBytes: Number.isFinite(Number(o.size)) ? Number(o.size) : null})), contentVerified: false};
    if (!complete) throw Error('INCOMPLETE_PAGINATION');
  });

  report.token = {d1Write: 'NOT_VERIFIED', writeProbePerformed: false};
  const verify = await section('TOKEN_VERIFY', async () => (await client.read('/user/tokens/verify', 'TOKEN_VERIFY')).result);
  if (verify && ['active', 'disabled', 'expired'].includes(verify.status)) report.token.status = verify.status;
  if (/^[a-f0-9]{32}$/.test(verify?.id || '')) {
    const details = await section('OWN_TOKEN_POLICY', async () => (await client.read('/user/tokens/' + verify.id, 'OWN_TOKEN_POLICY')).result);
    if (Array.isArray(details?.policies)) {
      // A named grant is evidence of policy, not a successful create or proof of resource scope.
      report.token.d1Write = details.policies.some(p => p.effect === 'allow' && p.permission_groups?.some(g => g.name === 'D1 Write')) ? 'NAMED_ALLOW_POLICY_PRESENT_SCOPE_NOT_VERIFIED' : 'NO_NAMED_ALLOW_POLICY_OBSERVED';
      report.token.policyScopeVerified = false;
    }
  }
  report.metadataRequests = client.requests;
  report.result = databases && completeBindings ? (report.failures.length ? 'PARTIAL' : 'PASS') : 'BLOCKED';
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await inventory({account: process.env.CLOUDFLARE_ACCOUNT_ID, token: process.env.CLOUDFLARE_API_TOKEN, build: process.env.DIAGNOSTIC_HEAD});
  await mkdir('readonly-status', {recursive: true});
  await writeFile('readonly-status/cloudflare-inventory.json', JSON.stringify(report, null, 2), {mode: 0o600});
  console.log('CLOUDFLARE_READONLY ' + JSON.stringify(report));
  if (report.result === 'BLOCKED') process.exitCode = 1;
}
