import test from 'node:test';import assert from 'node:assert/strict';
import {requireApproval,requireSchema} from '../scripts/ui-release-core.mjs';
test('UI release requires separate explicit approval',()=>{for(const v of [undefined,'','true','no'])assert.throws(()=>requireApproval(v),/EXPLICIT_PRODUCTION_CONFIRMATION_REQUIRED/);assert.doesNotThrow(()=>requireApproval('yes'));});
test('UI release supports only open schema30 and never asks to purge sessions',()=>{for(const n of [20,28,29,31])assert.throws(()=>requireSchema(n,'off'),/SOURCE_SCHEMA_NOT_30/);assert.throws(()=>requireSchema(30,'on'),/SOURCE_MAINTENANCE_ON/);assert.doesNotThrow(()=>requireSchema('30','off'));});
