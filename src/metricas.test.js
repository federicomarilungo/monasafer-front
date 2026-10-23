import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armarMeses, categoriaDe, guardadoPorMes, porCategoria, porTipo } from './metricas.js';
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

test('el gasto de un mes se parte en fijos, reservas y de una vez', () => {
  assert.deepEqual(
    porTipo([
      { tipo: 'fijo', monto: 50000 },
      { tipo: 'reserva', monto: 20000 },
      { tipo: 'puntual', monto: 4500 },
      { tipo: 'fijo', monto: 3000 },
    ]),
    { fijo: 53000, reserva: 20000, puntual: 4500 },
  );
});

test('lo guardado por mes es lo ahorrado menos lo que volvió; ajustes y traspasos no cuentan', () => {
  const movimientos = [
    { tipo: 'ahorro', mes: '2026-09', monto: 10000, cantidad: 10000 },
    { tipo: 'retiro', mes: '2026-09', monto: 2500, cantidad: -2500 },
    { tipo: 'ahorro', mes: '2026-10', monto: 7000, cantidad: 700000 },
    { tipo: 'gasto', mes: '2026-10', monto: 0, cantidad: -3000 },
    { tipo: 'traspaso', mes: '2026-10', monto: 0, cantidad: 5000 },
    { tipo: 'ahorro', mes: '2026-05', monto: 99999, cantidad: 99999 },
  ];
  assert.deepEqual(guardadoPorMes(movimientos, ['2026-08', '2026-09', '2026-10']), [0, 7500, 7000]);
});
