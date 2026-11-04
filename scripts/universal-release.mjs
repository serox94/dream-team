// Orchestration primitives; caller must supply a trusted, target-specific adapter.
// This module never constructs production credentials or chooses a Worker.
const assert = (condition, code) => { if (!condition) throw new Error(code); };
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const sha = /^[a-f0-9]{40}$/i;
const safeCode = e => /^[A-Z0-9_]+$/.test(e?.message || '') ? e.message : 'ADAPTER_ERROR';

export async function release(plan, adapter) {
  const report = { result: 'BLOCKED', stage: 'APPROVAL', activated: false, recovery: 'NOT_REQUIRED' };
  let previous, migrated = false;
  try {
    assert(sha.test(plan.candidate || '') && sha.test(plan.operator || ''), 'INVALID_SHA');
    assert(uuid.test(plan.targetVersion || ''), 'INVALID_TARGET');
    assert(Number.isSafeInteger(plan.sourceSchema) && Number.isSafeInteger(plan.targetSchema) && plan.targetSchema >= plan.sourceSchema, 'INVALID_SCHEMA');
    assert(plan.approval === `RELEASE:${plan.candidate}:${plan.operator}`, 'APPROVAL_MISMATCH');
    report.stage = 'PREFLIGHT';
    previous = await adapter.preflight(plan);
    assert(uuid.test(previous.activeVersion || '') && previous.schema === plan.sourceSchema && previous.maintenance === false, 'SOURCE_STATE_CHANGED');
    assert(previous.activeVersion !== plan.targetVersion, 'TARGET_ALREADY_ACTIVE');
    const changing = plan.targetSchema !== plan.sourceSchema;
    if (changing) assert(previous.fallbackSchema === plan.targetSchema && uuid.test(previous.fallbackVersion || ''), 'NO_COMPATIBLE_FALLBACK');
    report.stage = 'CHECKPOINT';
    const checkpoint = await adapter.backupAndRestore(previous, plan);
    assert(checkpoint?.databaseRestored === true && checkpoint?.mediaRestored === true && checkpoint?.integrity === true && checkpoint?.fresh === true, 'CHECKPOINT_UNVERIFIED');
    report.stage = 'ISOLATED_TESTS';
    const proof = await adapter.testIsolated(previous, plan, checkpoint);
    assert(proof?.candidate === true && proof?.fallback === true && proof?.recovery === true && (!changing || proof?.migration === true), 'ISOLATED_TESTS_FAILED');
    report.stage = 'RECHECK';
    const now = await adapter.current();
    assert(now.activeVersion === previous.activeVersion && now.schema === previous.schema && now.maintenance === false, 'SOURCE_STATE_CHANGED');
    if (changing) {
      report.stage = 'MIGRATION';
      migrated = true; // An API timeout can occur after a successful migration.
      await adapter.migrate(plan, checkpoint);
      const after = await adapter.current();
      assert(after.schema === plan.targetSchema && after.activeVersion === previous.activeVersion, 'MIGRATION_NOT_VERIFIED');
    }
    report.stage = 'ACTIVATION';
    report.activated = true; // Resolve ambiguous provider responses from control plane.
    await adapter.activate(plan.targetVersion);
    report.stage = 'READINESS';
    await adapter.ready(plan.targetVersion, plan.candidate);
    report.stage = 'VERIFY';
    await adapter.verify(plan);
    report.result = 'PASS'; report.stage = 'COMPLETE';
  } catch (e) {
    report.error = safeCode(e);
    if (report.activated || migrated) {
      try {
        report.stage = 'RECOVERY_INSPECT';
        const state = await adapter.current();
        const expectedSchema = migrated ? plan.targetSchema : plan.sourceSchema;
        assert(state.schema === expectedSchema, 'UNKNOWN_RECOVERY_SCHEMA');
        const fallback = migrated ? previous.fallbackVersion : previous.activeVersion;
        assert([previous.activeVersion, plan.targetVersion, fallback].includes(state.activeVersion), 'UNKNOWN_ACTIVE_WORKER');
        report.stage = 'RECOVERY_ACTIVATE';
        if (state.activeVersion !== fallback) await adapter.activate(fallback);
        report.stage = 'RECOVERY_VERIFY';
        await adapter.verifyRecovery(fallback, expectedSchema);
        report.recovery = 'PASS';
      } catch (re) { report.recovery = 'BLOCKED'; report.recoveryError = safeCode(re); }
    }
  }
  return report;
}
