import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyGesture,
  createHoldTracker,
  getLeftActionSpec,
  getUserHandLabel
} from '../src/gestures.js';

test('classifies broad prompt/control gestures', () => {
  assert.equal(classifyGesture(hand({ index: true, middle: true, ring: true, pinky: true })).name, 'OPEN');
  assert.equal(classifyGesture(hand({ index: true, middle: true, ring: true })).name, 'THREE');
  assert.equal(classifyGesture(hand({ index: true, middle: true })).name, 'PEACE');
  assert.equal(classifyGesture(hand({})).name, 'FIST');
});

test('classifies pinch relative to hand size', () => {
  assert.equal(classifyGesture(hand({ index: true, pinch: true })).name, 'PINCH');
});

test('maps left-hand gestures to hold actions', () => {
  assert.deepEqual(getLeftActionSpec('PINCH'), { name: 'SEND', pointIndex: 8 });
  assert.deepEqual(getLeftActionSpec('PEACE'), { name: 'SCROLL UP', pointIndex: 12 });
  assert.deepEqual(getLeftActionSpec('OPEN'), { name: 'SCROLL DOWN', pointIndex: 9 });
  assert.deepEqual(getLeftActionSpec('FIST'), { name: 'CLEAR', pointIndex: 0 });
  assert.equal(getLeftActionSpec('THREE'), null);
});

test('hold tracker fires once per held gesture', () => {
  let currentTime = 0;
  const hold = createHoldTracker({ threshold: 2000, now: () => currentTime });

  assert.deepEqual(hold.update('FIST'), {
    elapsed: 0,
    progress: 0,
    shouldFire: false,
    completed: false
  });

  currentTime = 1999;
  assert.equal(hold.update('FIST').shouldFire, false);

  currentTime = 2000;
  const fired = hold.update('FIST');
  assert.equal(fired.shouldFire, true);
  assert.equal(fired.completed, true);

  currentTime = 2500;
  assert.equal(hold.update('FIST').shouldFire, false);
});

test('hand label can be swapped as calibration override', () => {
  const result = {
    handednesses: [[{ categoryName: 'Left' }]]
  };
  assert.equal(getUserHandLabel(result, 0, hand({}), { swapHandLabels: false }), 'LEFT');
  assert.equal(getUserHandLabel(result, 0, hand({}), { swapHandLabels: true }), 'RIGHT');
});

function hand({ index = false, middle = false, ring = false, pinky = false, pinch = false }) {
  const lm = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));

  lm[0] = { x: 0.5, y: 0.82 };
  lm[3] = { x: 0.32, y: 0.58 };
  lm[4] = { x: 0.25, y: 0.58 };
  lm[5] = { x: 0.38, y: 0.58 };
  lm[9] = { x: 0.5, y: 0.52 };
  lm[13] = { x: 0.62, y: 0.58 };
  lm[17] = { x: 0.72, y: 0.64 };

  setFinger(lm, 6, 8, 0.38, index);
  setFinger(lm, 10, 12, 0.5, middle);
  setFinger(lm, 14, 16, 0.62, ring);
  setFinger(lm, 18, 20, 0.72, pinky);

  if (pinch) {
    lm[4] = { x: lm[8].x + 0.01, y: lm[8].y + 0.01 };
  }

  return lm;
}

function setFinger(lm, pipIndex, tipIndex, x, extended) {
  lm[pipIndex] = { x, y: 0.45 };
  lm[tipIndex] = {
    x,
    y: extended ? 0.23 : 0.68
  };
}
