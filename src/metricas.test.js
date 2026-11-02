import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ahorroProyectado, armarMeses, categoriaDe, guardadoPorMes, lineasPorTipo, porCategoria, porTipo, ritmoDeAhorro, sobraPorMes } from './metricas.js';
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
    { fijo: 53000, reserva: 20000, puntual: 4500, grupo: 0 },
  );
});

test('una reserva de "Solo este mes" cuenta como de una vez', () => {
  const todos = [
    { id: 's', tipo: 'reserva', recurrente: true },
    { id: 'r', tipo: 'reserva', recurrente: false },
  ];
  assert.deepEqual(
    porTipo([{ gastoId: 's', tipo: 'reserva', monto: 30000 }, { gastoId: 'r', tipo: 'reserva', monto: 8000 }], todos),
    { fijo: 0, reserva: 30000, puntual: 8000, grupo: 0 },
  );
});

test('un grupo se abre: cada gasto de adentro va a su tipo y lo estimado sin cargar queda aparte', () => {
  const visa = {
    gastoId: 'v',
    nombre: 'Visa',
    tipo: 'grupo',
    monto: 30000,
    items: [
      { gastoId: 'c', nombre: 'Cena', tipo: 'puntual', monto: 8000 },
      { gastoId: 'z', nombre: 'Zapatillas', tipo: 'fijo', monto: 6000 },
    ],
  };
  const l = lineasPorTipo([visa, { gastoId: 'a', nombre: 'Alquiler', tipo: 'fijo', monto: 50000 }]);
  assert.deepEqual(l.fijo.map((x) => [x.nombre, x.monto, x.en]), [['Alquiler', 50000, undefined], ['Zapatillas', 6000, 'Visa']]);
  assert.deepEqual(l.puntual.map((x) => [x.nombre, x.en]), [['Cena', 'Visa']]);
  assert.deepEqual(l.grupo.map((x) => [x.nombre, x.monto]), [['Visa', 16000]]);
});

test('lo guardado por mes: ahorros menos retiros, más los ajustes a mano valuados; los traspasos no cuentan', () => {
  const movimientos = [
    { tipo: 'ingreso', mes: '2026-08', monto: 0, cantidad: 50000, valor: 50000 },
    { tipo: 'ahorro', mes: '2026-09', monto: 10000, cantidad: 10000 },
    { tipo: 'retiro', mes: '2026-09', monto: 2500, cantidad: -2500 },
    { tipo: 'ahorro', mes: '2026-10', monto: 7000, cantidad: 700000 },
    { tipo: 'gasto', mes: '2026-10', monto: 0, cantidad: -3000, valor: -3000 },
    { tipo: 'traspaso', mes: '2026-10', monto: 0, cantidad: 5000 },
    { tipo: 'ahorro', mes: '2026-05', monto: 99999, cantidad: 99999 },
  ];
  assert.deepEqual(guardadoPorMes(movimientos, ['2026-08', '2026-09', '2026-10']), [50000, 7500, 4000]);
});

test('el ritmo de ahorro no cuenta el primer mes (la carga de golpe) ni el mes en curso', () => {
  const movimientos = [{ tipo: 'ingreso', mes: '2026-07' }, { tipo: 'ahorro', mes: '2026-08' }];
  const meses = ['2026-07', '2026-08', '2026-09', '2026-10'];
  assert.equal(ritmoDeAhorro(movimientos, meses, [500000, 10000, 20000, 90000]), 15000);
});

test('lo que sobra: sin acumular, ingreso menos gastos del mes; acumulando, el balance de fin de mes', () => {
  const datos = datosDemo(hoy);
  const meses = armarMeses(datos, hoy, 3);
  const suelto = sobraPorMes(datos, meses, false);
  const junto = sobraPorMes(datos, meses, true);
  assert.deepEqual(suelto.slice(0, 3), [null, null, null]);
  const nov = meses[4].resumen;
  assert.equal(suelto[4], nov.ingreso - nov.totalPendiente);
  assert.deepEqual(junto.slice(3), meses.slice(3).map((m) => m.balance));
  // Lo acumulado es lo que había más lo que sobra cada mes.
  assert.equal(junto[5], junto[4] + suelto[5]);
});

test('ahorro proyectado: el real crece con el ritmo; el ideal suma todo lo que sobra', () => {
  const futuros = [{ balance: 1000 }, { balance: 3000 }, { balance: 2000 }];
  assert.deepEqual(ahorroProyectado(futuros, 50000, 500), { real: [50000, 50500, 51000], ideal: [51000, 53000, 52000] });
});
