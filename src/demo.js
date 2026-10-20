// Datos de ejemplo para ver la app sin back ni login (hasta B2/B6).
import { mesDe, sumarMeses } from './motor.js';

const USD = (n) => Math.round(n * 100);

export function datosDemo(hoy = new Date()) {
  const mes = mesDe(hoy);
  return {
    perfil: { saldo: USD(1450), ingresoMensual: { monto: USD(1200), diaCobro: 1 }, ingresoCobradoMes: mes },
    gastos: [
      { id: 'alq', nombre: 'Alquiler', emoji: '🏠', monto: USD(500), tipo: 'fijo', mesInicio: sumarMeses(mes, -6) },
      { id: 'zap', nombre: 'Zapatillas en cuotas', emoji: '👟', monto: USD(60), tipo: 'fijo', mesInicio: sumarMeses(mes, -2), mesFin: sumarMeses(mes, 2) },
      { id: 'int', nombre: 'Internet', emoji: '📶', monto: USD(30), tipo: 'fijo', mesInicio: sumarMeses(mes, -12) },
      { id: 'cum', nombre: 'Regalo cumple Juli', emoji: '🎁', monto: USD(45), tipo: 'puntual', mesInicio: mes },
      { id: 'tra', nombre: 'Transporte', emoji: '🚌', monto: USD(200), tipo: 'reserva', mesInicio: sumarMeses(mes, -3), recurrente: true, modoReserva: 'proporcional' },
      { id: 'sup', nombre: 'Súper', emoji: '🛒', monto: USD(350), tipo: 'reserva', mesInicio: sumarMeses(mes, -3), recurrente: true, modoReserva: 'manual' },
    ],
    estados: [{ gastoId: 'alq', mes, pagado: true }],
    usos: [{ gastoId: 'sup', mes, monto: USD(120) }],
  };
}
