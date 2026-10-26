import test from 'node:test';
import assert from 'node:assert/strict';
import { gradePod } from '../src/lib/result.mjs';

test('missing pod never succeeds', () => {
  const result = gradePod(null);
  assert.equal(result.passed, 0);
  assert.equal(result.success, false);
});

test('fully ready pod passes', () => {
  const result = gradePod({
    metadata: { name: 'web', namespace: 'default' },
    spec: { containers: [{ name: 'nginx', image: 'nginx:1.27' }] },
    status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
  });
  assert.equal(result.passed, 4);
  assert.equal(result.success, true);
});

test('a running wrong image gets partial credit', () => {
  const result = gradePod({
    metadata: { name: 'web', namespace: 'default' },
    spec: { containers: [{ image: 'busybox' }] },
    status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
  });
  assert.deepEqual(result.checks.map(x => x.pass), [true, false, true, true]);
});
