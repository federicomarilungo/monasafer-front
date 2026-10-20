import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centavos } from './formato.js';

test('lee montos como los escribe la gente', () => {
  assert.equal(centavos('60'), 6000);
  assert.equal(centavos('1.234,50'), 123450);
  assert.equal(centavos('1234.5'), 123450);
  assert.equal(centavos('1.500'), 150000);
  assert.equal(centavos('US$ 200'), 20000);
  assert.equal(centavos('abc'), null);
  assert.equal(centavos('-5'), null);
  assert.equal(centavos('-5', true), -500);
});
