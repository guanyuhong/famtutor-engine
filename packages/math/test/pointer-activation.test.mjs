import test from 'node:test';
import assert from 'node:assert/strict';
import { GEOGEBRA_DRAGGING_DELAY_MS, pointerActivationReady } from '../dist/render/pointer-activation.js';

test('reference delay has the pinned public-source value', () => {
  assert.equal(GEOGEBRA_DRAGGING_DELAY_MS, 100);
});
test('every pre-deadline move is rejected, not only the first one', () => {
  for (const now of [1000, 1001, 1025, 1050, 1099]) assert.equal(pointerActivationReady(1000, now, 100), false);
});
test('the first slow movement is accepted immediately, not discarded', () => {
  assert.equal(pointerActivationReady(1000, 1200, 100), true);
});
test('exact elapsed-time boundary is inclusive', () => {
  assert.equal(pointerActivationReady(1000, 1099, 100), false);
  assert.equal(pointerActivationReady(1000, 1100, 100), true);
  assert.equal(pointerActivationReady(1000, 1101, 100), true);
});
test('a new press starts a new time window on the return gesture', () => {
  assert.equal(pointerActivationReady(1000, 1500, 100), true);
  assert.equal(pointerActivationReady(1500, 1550, 100), false);
  assert.equal(pointerActivationReady(1500, 1600, 100), true);
});
test('decision is independent of call count, never a callback counter', () => {
  for (let i = 0; i < 500; i++) assert.equal(pointerActivationReady(1000, 1050, 100), false);
  assert.equal(pointerActivationReady(1000, 1150, 100), true);
});
test('ordinary host zero-delay policy remains immediate', () => {
  assert.equal(pointerActivationReady(1000, 1000, 0), true);
});
test('invalid times are rejected and clock reversal cannot activate input', () => {
  for (const args of [[NaN, 1, 100], [0, Infinity, 100], [0, 1, -1], [0, 1, NaN]]) {
    assert.throws(() => pointerActivationReady(...args), TypeError);
  }
  assert.equal(pointerActivationReady(1000, 900, 100), false);
});
