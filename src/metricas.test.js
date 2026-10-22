import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armarMeses, categoriaDe, porCategoria } from './metricas.js';
import { datosDemo } from './demo.js';

const hoy = new Date(2026, 9, 15);

test('la categoría sale del ícono, con o sin selector de variante', () => {
  assert.equal(categoriaDe('🏠').id, 'casa');
  assert.equal(categoriaDe('🏋️').id, 'salud');
  assert.equal(categoriaDe('🏋').id, 'salud');
  assert.equal(categoriaDe('🦄').id, 'otros');
  assert.equal(categoriaDe('').id, 'otros');
});

test('suma por categoría de mayor a menor', () => {
  const cats = porCategoria([
    { nombre: 'Súper', emoji: '🛒', monto: 300 },
    { nombre: 'Delivery', emoji: '🍔', monto: 200 },
    { nombre: 'Alquiler', emoji: '🏠', monto: 400 },
  ]);
  assert.deepEqual(cats.map((c) => [c.cat.id, c.monto]), [['comida', 500], ['casa', 400]]);
});

test('normal: 3 meses para atrás, el actual y 3 para adelante', () => {
  const meses = armarMeses(datosDemo(hoy), hoy, 3);
  assert.deepEqual(meses.map((m) => m.mes), ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01']);
  assert.deepEqual(meses.map((m) => m.pasado), [true, true, true, false, false, false, false]);
  assert.equal(meses[0].balance, null);
});

test('premium: 12 y 12, y lo pasado puede venir del back', () => {
  const pasados = [{ mes: '2026-09', gastos: [{ nombre: 'Luz', emoji: '⚡', monto: 100 }], total: 100 }];
  const meses = armarMeses(datosDemo(hoy), hoy, 12, pasados);
  assert.equal(meses.filter((m) => !m.pasado).length, 13);
  assert.deepEqual(meses.filter((m) => m.pasado).map((m) => m.total), [100]);
});
