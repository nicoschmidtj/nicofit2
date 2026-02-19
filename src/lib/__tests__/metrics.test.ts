import assert from 'node:assert/strict';
import { epley1RM, fmtTime, kgOrLb } from '../metrics.ts';

assert.equal(fmtTime(0), '0:00');
assert.equal(fmtTime(65), '1:05');
assert.equal(epley1RM(100, 5), 117);
assert.equal(kgOrLb(100, 'lb'), 220.5);
assert.equal(kgOrLb(100, 'kg'), 100);

console.log('metrics.test.ts: ok');
