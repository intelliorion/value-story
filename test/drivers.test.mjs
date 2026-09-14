import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_DRIVERS, DRIVER_GROUPS, DRIVER_LABELS, isDriver, driverGroup } from '../src/drivers.mjs';

test('exposes exactly ten drivers in two groups', () => {
  assert.equal(ALL_DRIVERS.length, 10);
  assert.equal(DRIVER_GROUPS.effectiveness.length, 6);
  assert.equal(DRIVER_GROUPS.efficiency.length, 4);
});

test('every driver has a display label', () => {
  for (const id of ALL_DRIVERS) {
    assert.equal(typeof DRIVER_LABELS[id], 'string', `missing label for ${id}`);
    assert.ok(DRIVER_LABELS[id].length > 0);
  }
});

test('effectiveness drivers come before efficiency drivers', () => {
  assert.equal(ALL_DRIVERS[0], 'productivity');
  assert.equal(ALL_DRIVERS[9], 'capex-reduction');
});

test('isDriver rejects anything outside the closed enumeration', () => {
  assert.equal(isDriver('productivity'), true);
  assert.equal(isDriver('cost-savings'), false);
  assert.equal(isDriver(''), false);
  assert.equal(isDriver(undefined), false);
});

test('driverGroup classifies and returns null for unknown ids', () => {
  assert.equal(driverGroup('governance-oversight'), 'effectiveness');
  assert.equal(driverGroup('capex-reduction'), 'efficiency');
  assert.equal(driverGroup('nonsense'), null);
});
