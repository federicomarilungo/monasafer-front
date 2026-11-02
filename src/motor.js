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
  // Un grupo dura como un fijo (`mesFin = mesInicio` si es de un mes).
  return !g.mesFin || mes <= g.mesFin;
}

/** Monto de un gasto en un mes: el último cambio que ya rige (cambiosMonto), o el monto con que nació. */
export function montoBase(g, mes) {
  let vigenteDesde = '';
  let monto = g.monto;
  for (const c of g.cambiosMonto ?? [])
    if (c.desde <= mes && c.desde > vigenteDesde) {
      vigenteDesde = c.desde;
      monto = c.monto;
    }
  return monto;
}

export function restanteReserva(monto, modo, usado, mes, hoy) {
  if (mes !== mesDe(hoy) || modo === 'manual') return Math.max(0, monto - usado);
  const dias = diasDelMes(mes);
  return Math.round((monto * (dias - hoy.getDate())) / dias);
}

function linea(datos, g, mes, hoy) {
  const estado = datos.estados.find((e) => e.gastoId === g.id && e.mes === mes);
  const monto = estado?.montoDelMes ?? montoBase(g, mes);
  const pagado = !!estado?.pagado;
  if (g.tipo !== 'reserva') {
    return { gastoId: g.id, nombre: g.nombre, emoji: g.emoji, tipo: g.tipo, mesFin: g.mesFin, monto, pagado, pendiente: pagado ? 0 : monto };
  }
  const usado = datos.usos.filter((u) => u.gastoId === g.id && u.mes === mes).reduce((s, u) => s + u.monto, 0);
  const pendiente = pagado ? 0 : restanteReserva(monto, g.modoReserva, usado, mes, hoy);
  return { gastoId: g.id, nombre: g.nombre, emoji: g.emoji, tipo: g.tipo, modoReserva: g.modoReserva, monto, pagado, pendiente, usado };
}

/**
 * Un grupo (la Visa) vale lo que suman sus gastos, o lo estimado si es más. Lo que falta
 * es eso menos lo ya pagado de adentro; pagado entero, no falta nada. Igual que el back.
 */
export function lineaGrupo(g, items) {
  const deAdentro = g.pagado ? items.map((i) => ({ ...i, pagado: true, pendiente: 0 })) : items;
  const sumaItems = items.reduce((s, i) => s + i.monto, 0);
  const pagadoItems = items.reduce((s, i) => s + (i.pagado ? i.monto : 0), 0);
  const monto = Math.max(g.monto, sumaItems);
  return { ...g, estimado: g.monto, monto, pendiente: g.pagado ? 0 : monto - pagadoItems, items: deAdentro, sumaItems };
}

/** Gastos que caen adentro de un grupo vigente ese mes, por id de grupo. */
export function itemsPorGrupo(gastos, mes) {
  const grupos = new Set(gastos.filter((g) => g.tipo === 'grupo' && vigente(g, mes)).map((g) => g.id));
  const porGrupo = new Map();
  for (const g of gastos) if (g.grupoId && grupos.has(g.grupoId) && vigente(g, mes)) porGrupo.set(g.grupoId, [...(porGrupo.get(g.grupoId) ?? []), g]);
  return porGrupo;
}

function lineas(datos, mes, hoy) {
  const porGrupo = itemsPorGrupo(datos.gastos, mes);
  const adentro = new Set([...porGrupo.values()].flat().map((g) => g.id));
  return datos.gastos
    .filter((g) => vigente(g, mes) && !adentro.has(g.id))
    .map((g) => {
      const l = linea(datos, g, mes, hoy);
      if (g.tipo !== 'grupo') return l;
      return lineaGrupo(l, (porGrupo.get(g.id) ?? []).map((i) => linea(datos, i, mes, hoy)));
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

/**
 * Lo gastado en meses pasados (mismo historial() del back, que es el que usa la cuenta
 * real vía GET /historial; acá sirve para la demo). Monto del mes, reservas manuales por
 * lo usado (desde `manualDesde` si antes bajaban solas) y gastos borrados hasta el mes en que se borraron.
 */
export function historial(datos, desde, hasta) {
  const meses = [];
  for (let mes = desde; mes <= hasta; mes = sumarMeses(mes, 1)) {
    const vivos = datos.gastos.filter((g) => vigente(g, mes) && !(g.mesArchivo && mes > g.mesArchivo));
    const porGrupo = itemsPorGrupo(vivos, mes);
    const adentro = new Set([...porGrupo.values()].flat().map((g) => g.id));
    const gastos = [];
    for (const g of vivos) {
      if (adentro.has(g.id)) continue;
      const l = lineaHistorial(datos, g, mes);
      if (g.tipo === 'grupo') {
        // Un grupo cuenta lo que sumaron sus gastos, o lo estimado si era más.
        const items = (porGrupo.get(g.id) ?? []).map((i) => lineaHistorial(datos, i, mes)).filter(Boolean);
        const suma = items.reduce((s, i) => s + i.monto, 0);
        if (g.mesArchivo === mes && !l.pagado && !items.length) continue;
        const monto = Math.max(l.monto, suma);
        if (monto > 0) gastos.push({ ...l, monto, items });
        continue;
      }
      if (l) gastos.push(l);
    }
    meses.push({ mes, gastos, total: gastos.reduce((s, l) => s + l.monto, 0) });
  }
  return meses;
}

function lineaHistorial(datos, g, mes) {
  const estado = datos.estados.find((e) => e.gastoId === g.id && e.mes === mes);
  const pagado = !!estado?.pagado;
  const usado = datos.usos.filter((u) => u.gastoId === g.id && u.mes === mes).reduce((s, u) => s + u.monto, 0);
  const manual = g.tipo === 'reserva' && g.modoReserva === 'manual' && !(g.manualDesde && mes < g.manualDesde);
  const monto = manual && !pagado ? usado : (estado?.montoDelMes ?? montoBase(g, mes));
  const l = { gastoId: g.id, nombre: g.nombre, emoji: g.emoji ?? '', tipo: g.tipo, monto, pagado };
  if (g.tipo === 'grupo') return l;
  if (g.mesArchivo === mes && !pagado && !usado) return null;
  return monto > 0 ? l : null;
}

/**
 * Parte el balance de un mes: lo que da el mes solo (ingreso menos gastos enteros y lo
 * ahorrado "del mes") y el acumulado que viene de antes. Igual que motor/ahorro.ts del back.
 */
export function partirBalance(datos, r, ahorros = []) {
  const ingreso = datos.perfil.ingresoMensual?.monto ?? 0;
  const gastos = r.gastos.reduce((s, l) => s + (l.tipo === 'reserva' ? Math.max(l.monto, l.usado ?? 0) : l.monto), 0);
  // Un ingreso extra del mes (ya sumado al saldo) cuenta como del mes.
  const extras = (datos.ingresosExtra ?? []).filter((i) => i.mes === r.mes).reduce((s, i) => s + i.monto, 0);
  const ahorrado = ahorros.filter((a) => a.mes === r.mes && a.origen === 'mes').reduce((s, a) => s + a.monto, 0);
  // Nunca negativo: si el mes da más de lo que tenés (gastos sin cargar), todo cuenta del mes.
  const acumulado = Math.max(0, r.balance - (ingreso + extras - gastos - ahorrado));
  return { delMes: r.balance - acumulado, acumulado, total: r.balance };
}
