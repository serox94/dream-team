import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allowedRead, metadataClient, inventory} from '../scripts/cloudflare-readonly-inventory.mjs';
const account = 'a'.repeat(32), token = 'SECRET_TOKEN_NEVER_PRINT', root = '/accounts/' + account;
const response = (result, result_info) => ({ok: true, status: 200, async json() { return {success: true, result, result_info}; }});

test('endpoint allowlist excludes queries, exports, object bodies, deployments and token values', () => {
  for (const path of ['/d1/database/id/query', '/d1/database/id/export', '/workers/scripts/dream-team/deployments', '/r2/buckets/dream-team-d1-backups/objects/private.sql']) assert.equal(allowedRead(root + path, account), false);
  assert.equal(allowedRead('/user/tokens/' + 'b'.repeat(32) + '/value', account), false);
  assert.equal(allowedRead(root + '/r2/buckets/dream-team-d1-backups/objects?prefix=other', account), false);
  assert.equal(allowedRead(root + '/workers/scripts/another-app/settings', account), false);
  assert.equal(allowedRead(root + '/d1/database?per_page=100&page=1', account), true);
});

test('all permitted transport is GET, redirects are rejected and request budget is finite', async () => {
  const calls = [];
  const client = metadataClient({account, token, maximumRequests: 1, fetcher: async (url, options) => { calls.push({url, options}); return response([]); }});
  await client.read(root + '/workers/scripts', 'WORKER_LIST');
  assert.equal(calls[0].options.method, 'GET'); assert.equal(calls[0].options.redirect, 'error');
  await assert.rejects(client.read(root + '/workers/scripts', 'WORKER_LIST'), /METADATA_REQUEST_BUDGET/);
  assert.equal(calls.length, 1);
});

test('HTTP and Cloudflare code survive; raw error and response secrets do not', async () => {
  const client = metadataClient({account, token, fetcher: async () => ({ok: false, status: 403, json: async () => ({success: false, errors: [{code: 10042, message: token}]})})});
  await assert.rejects(client.read(root + '/workers/scripts', 'WORKER_LIST'), error => {
    assert.deepEqual(error.safe, {operation: 'WORKER_LIST', httpStatus: 403, cloudflareCode: 10042});
    assert.ok(!JSON.stringify(error).includes(token)); return true;
  });
});

test('inventory correlates active bindings without persisting credentials, UUIDs or account IDs', async () => {
  const dbId = 'PRIVATE_DATABASE_UUID', prefix = 'private-releases/code32/40531123753-179da4d9/';
  const fetcher = async (url, options) => {
    assert.equal(options.method, 'GET');
    const path = new URL(url).pathname;
    if (path.endsWith('/d1/database')) return response([{name: 'dream-team-db', uuid: dbId, file_size: 2048}, {name: 'dream-team-audit-1-db', uuid: 'TEMP_UUID'}], {total_count: 2});
    if (path.endsWith('/workers/scripts')) return response([{id: 'dream-team'}]);
    if (path.endsWith('/settings')) return response({bindings: [{type: 'd1', name: 'DB', id: dbId}, {type: 'plain_text', name: 'PRIVATE', text: token}, {type: 'secret_text', name: 'PASSWORD', text: token}]});
    if (path.endsWith('/r2/buckets')) return response({buckets: []});
    if (path.endsWith('/objects')) return response({objects: [{key: prefix + 'schema32.sql', size: 123}], truncated: false});
    if (path.endsWith('/verify')) return response({id: 'b'.repeat(32), status: 'active'});
    return response({policies: [{effect: 'allow', permission_groups: [{name: 'D1 Write'}]}], value: token});
  };
  const report = await inventory({account, token, fetcher});
  assert.equal(report.result, 'PASS');
  assert.deepEqual(report.d1.databases[0].activeWorkers, ['dream-team']);
  assert.equal(report.d1.databases[1].safeToDelete, 'NOT_VERIFIED');
  assert.equal(report.failedRunBackup.objects[0].name, 'schema32.sql');
  assert.equal(report.token.d1Write, 'NAMED_ALLOW_POLICY_PRESENT_SCOPE_NOT_VERIFIED');
  for (const secret of [account, token, dbId, 'TEMP_UUID']) assert.ok(!JSON.stringify(report).includes(secret));
  assert.equal(report.productionWrites, 0); assert.equal(report.sqlQueries, 0);
});

test('incomplete D1 pagination and unavailable secrets cannot produce PASS', async () => {
  let calls = 0;
  const report = await inventory({account, token, fetcher: async url => {
    calls++;
    if (url.includes('/d1/database')) return response(Array.from({length: 100}, (_, i) => ({name: 'db' + i})), {total_count: 1000});
    if (url.endsWith('/workers/scripts')) return response([]);
    if (url.includes('/r2/buckets?')) return response({buckets: []});
    if (url.includes('/objects?')) return response([]);
    return response({status: 'active'});
  }});
  assert.equal(report.result, 'BLOCKED'); assert.ok(calls <= 10);
  assert.equal((await inventory({})).error, 'CLOUDFLARE_CREDENTIALS_UNAVAILABLE');
});

test('a denied optional token-policy read remains visible as PARTIAL', async () => {
  const report = await inventory({account, token, fetcher: async url => {
    if (url.includes('/d1/database')) return response([], {total_count: 0});
    if (url.endsWith('/workers/scripts')) return response([]);
    if (url.includes('/r2/buckets?')) return response({buckets: []});
    if (url.includes('/objects?')) return response([]);
    return {ok: false, status: 403, json: async () => ({success: false, errors: [{code: 10000}]})};
  }});
  assert.equal(report.result, 'PARTIAL'); assert.equal(report.token.d1Write, 'NOT_VERIFIED');
  assert.equal(report.failures[0].operation, 'TOKEN_VERIFY');
});
