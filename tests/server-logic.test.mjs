import assert from 'node:assert/strict';
import test from 'node:test';
import { validateMessages } from '../lib/messages.mjs';
import { checkRateLimit } from '../lib/rate-limit.mjs';

test('validates and normalizes chat messages', () => {
  assert.deepEqual(validateMessages([
    { role: 'user', content: ' hello ' },
    { role: 'assistant', content: 'hi' }
  ]), [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'hi' }
  ]);
});

test('rejects invalid chat payloads', () => {
  assert.throws(() => validateMessages(null), /messages must be an array/);
  assert.throws(() => validateMessages([]), /No message content/);
  assert.throws(() => validateMessages([{ role: 'user', content: '' }]), /no text content/);
});

test('rate limiter allows a fixed number of requests per window', () => {
  const options = { limit: 2, windowMs: 1000, now: 100 };

  assert.equal(checkRateLimit('client-a', options).allowed, true);
  assert.equal(checkRateLimit('client-a', options).allowed, true);
  assert.equal(checkRateLimit('client-a', options).allowed, false);
  assert.equal(checkRateLimit('client-a', { ...options, now: 1200 }).allowed, true);
});
