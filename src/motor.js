// Motor de cálculo del balance. Es el mismo de monasafer-back (src/motor/): si cambia una
// regla, se cambia en los dos repos el mismo día, primero en el back. Montos en centavos y
// meses como 'AAAA-MM'.

export function mesDe(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}

export function sumarMeses(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function diasDelMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  return new Date(a, m, 0).getDate();
}

export function vigente(g, mes) {
  if (mes < g.mesInicio) return false;
  if (g.tipo === 'puntual') return mes === g.mesInicio;
  if (g.tipo === 'reserva' && !g.recurrente) return mes === g.mesInicio;
  return !g.mesFin || mes <= g.mesFin;
}

export function restanteReserva(monto, modo, usado, mes, hoy) {
  if (mes !== mesDe(hoy) || modo === 'manual') return Math.max(0, monto - usado);
  const dias = diasDelMes(mes);
  return Math.round((monto * (dias - hoy.getDate())) / dias);
}

function lineas(datos, mes, hoy) {
  return datos.gastos
    .filter((g) => vigente(g, mes))
    .map((g) => {
      const estado = datos.estados.find((e) => e.gastoId === g.id && e.mes === mes);
      const monto = estado?.montoDelMes ?? g.monto;
      const pagado = !!estado?.pagado;
      if (g.tipo !== 'reserva') {
        return { gastoId: g.id, nombre: g.nombre, emoji: g.emoji, tipo: g.tipo, mesFin: g.mesFin, monto, pagado, pendiente: pagado ? 0 : monto };
      }
      const usado = datos.usos.filter((u) => u.gastoId === g.id && u.mes === mes).reduce((s, u) => s + u.monto, 0);
      const pendiente = pagado ? 0 : restanteReserva(monto, g.modoReserva, usado, mes, hoy);
      return { gastoId: g.id, nombre: g.nombre, emoji: g.emoji, tipo: g.tipo, modoReserva: g.modoReserva, monto, pagado, pendiente, usado };
    });
}

export function proyectar(datos, hoy, hasta) {
  const actual = mesDe(hoy);
  const ingresoMensual = datos.perfil.ingresoMensual?.monto ?? 0;
  const resumenes = [];
  let inicio = datos.perfil.saldo;
  for (let mes = actual; mes <= hasta; mes = sumarMeses(mes, 1)) {
    const yaCobrado = mes === actual && datos.perfil.ingresoCobradoMes === actual;
    const ingreso = yaCobrado ? 0 : ingresoMensual;
    const gastos = lineas(datos, mes, hoy);
    const totalPendiente = gastos.reduce((s, l) => s + l.pendiente, 0);
    const balance = inicio + ingreso - totalPendiente;
    resumenes.push({ mes, inicio, ingreso, gastos, totalPendiente, balance });
    inicio = balance;
  }
  return resumenes;
}

export function resumenDelMes(datos, hoy, mes) {
  if (mes < mesDe(hoy)) return null;
  const p = proyectar(datos, hoy, mes);
  return p[p.length - 1];
}
