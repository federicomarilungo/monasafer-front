import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montoBase, proyectar, restanteReserva, sumarMeses } from './motor.js';

const USD = (n) => Math.round(n * 100);
const hoy = new Date(2026, 9, 15);

test('suma meses cruzando el año', () => {
  assert.equal(sumarMeses('2026-11', 3), '2027-02');
});

test('reserva proporcional a mitad de mes', () => {
  assert.equal(restanteReserva(USD(200), 'proporcional', 0, '2026-10', hoy), Math.round((USD(200) * 16) / 31));
});

test('mismos números que el motor del back', () => {
  const datos = {
    perfil: { saldo: USD(1000), ingresoMensual: { monto: USD(800), diaCobro: 5 }, ingresoCobradoMes: '2026-10' },
    gastos: [
      { id: 'alq', nombre: 'Alquiler', monto: USD(400), tipo: 'fijo', mesInicio: '2026-01' },
      { id: 'z', nombre: 'Zapatillas', monto: USD(60), tipo: 'fijo', mesInicio: '2026-06', mesFin: '2026-11' },
      { id: 'cena', nombre: 'Cena', monto: USD(40), tipo: 'puntual', mesInicio: '2026-10' },
      { id: 'tr', nombre: 'Transporte', monto: USD(200), tipo: 'reserva', mesInicio: '2026-10', recurrente: true, modoReserva: 'manual' },
    ],
    estados: [{ gastoId: 'alq', mes: '2026-10', pagado: true }],
    usos: [{ gastoId: 'tr', mes: '2026-10', monto: USD(50) }],
  };
  const [oct, nov, dic] = proyectar(datos, hoy, '2026-12');
  assert.equal(oct.balance, USD(750));
  assert.equal(nov.balance, USD(890));
  assert.equal(dic.balance, USD(1090));
});

test('cambios de monto desde un mes: mismos casos que el back', () => {
  const tarjeta = {
    id: 't',
    nombre: 'Tarjeta',
    monto: USD(300),
    tipo: 'fijo',
    mesInicio: '2026-03',
    cambiosMonto: [
      { desde: '2027-02', monto: USD(150) },
      { desde: '2026-12', monto: USD(200) },
    ],
  };
  assert.equal(montoBase(tarjeta, '2026-05'), USD(300));
  assert.equal(montoBase(tarjeta, '2026-11'), USD(300));
  assert.equal(montoBase(tarjeta, '2026-12'), USD(200));
  assert.equal(montoBase(tarjeta, '2027-01'), USD(200));
  assert.equal(montoBase(tarjeta, '2027-02'), USD(150));
  const datos = {
    perfil: { saldo: USD(1000), ingresoMensual: null },
    gastos: [tarjeta],
    estados: [{ gastoId: 't', mes: '2027-01', pagado: false, montoDelMes: USD(250) }],
    usos: [],
  };
  const [oct, nov, dic, ene] = proyectar(datos, hoy, '2027-01');
  assert.equal(oct.totalPendiente, USD(300));
  assert.equal(nov.totalPendiente, USD(300));
  assert.equal(dic.totalPendiente, USD(200));
  assert.equal(ene.totalPendiente, USD(250));
  assert.equal(ene.balance, USD(1000 - 300 - 300 - 200 - 250));
});
