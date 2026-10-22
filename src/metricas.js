// Métricas (S2). Normales: 3 meses para atrás y para adelante y el gasto por categoría del
// mes. Premium: 12 y 12, el gráfico de una categoría elegida, números destacados y los
// gastos más grandes. Lo que viene sale del motor; lo pasado, de GET /historial (en la
// demo, del mismo historial() del motor).
import { historial as historialLocal, mesDe, proyectar, sumarMeses } from './motor.js';
import { plata, nombreMes } from './formato.js';
import { t } from './i18n.js';

export const MESES_NORMAL = 3;
export const MESES_PREMIUM = 12;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const corto = (m) => nombreMes(m).slice(0, 3) + (m.endsWith('-01') ? ` ${m.slice(2, 4)}` : '');

// No hay campo de categoría: sale del ícono que se elige (o que Mona adivina) al cargar el gasto.
const CATEGORIAS = [
  { id: 'casa', emoji: '🏠', nombre: 'Casa', iconos: ['🏠', '🛠️'] },
  { id: 'comida', emoji: '🛒', nombre: 'Súper y comida', iconos: ['🛒', '🍔', '☕', '🍌'] },
  { id: 'transporte', emoji: '🚌', nombre: 'Transporte', iconos: ['🚌', '⛽', '🚗'] },
  { id: 'servicios', emoji: '⚡', nombre: 'Servicios', iconos: ['⚡', '💧', '🔥', '📶', '📱', '📺'] },
  { id: 'finanzas', emoji: '💳', nombre: 'Tarjetas y bancos', iconos: ['💳', '🏦', '🧾'] },
  { id: 'ropa', emoji: '👕', nombre: 'Ropa', iconos: ['👟', '👕'] },
  { id: 'salud', emoji: '💊', nombre: 'Salud y cuidado', iconos: ['💊', '🏋️', '💇'] },
  { id: 'educacion', emoji: '🎓', nombre: 'Educación', iconos: ['🎓', '📚'] },
  { id: 'familia', emoji: '🐶', nombre: 'Familia y mascotas', iconos: ['🐶', '👶'] },
  { id: 'ocio', emoji: '🎉', nombre: 'Salidas y ocio', iconos: ['🍺', '🎁', '🎉', '🎬', '🎮', '🎵'] },
  { id: 'viajes', emoji: '✈️', nombre: 'Viajes', iconos: ['✈️', '🏖️'] },
];
const OTROS = { id: 'otros', emoji: '💸', nombre: 'Otros', iconos: [] };
const limpio = (e) => String(e ?? '').replace(/️/g, '');

export function categoriaDe(emoji) {
  const e = limpio(emoji);
  return CATEGORIAS.find((c) => c.iconos.some((i) => limpio(i) === e)) ?? OTROS;
}

/** Suma de un mes por categoría, de mayor a menor. */
export function porCategoria(gastos) {
  const mapa = new Map();
  for (const l of gastos) {
    const c = categoriaDe(l.emoji);
    const fila = mapa.get(c.id) ?? { cat: c, monto: 0, gastos: [] };
    fila.monto += l.monto;
    fila.gastos.push(l);
    mapa.set(c.id, fila);
  }
  return [...mapa.values()].sort((a, b) => b.monto - a.monto);
}

/**
 * Los meses que se miran: `n` para atrás (cerrados) y el actual más `n` para adelante.
 * `pasados` es la respuesta de GET /historial; sin ella se calcula con los datos locales.
 */
export function armarMeses(datos, hoy, n, pasados = null) {
  const actual = mesDe(hoy);
  const desde = sumarMeses(actual, -n);
  const atras = (pasados ?? historialLocal(datos, desde, sumarMeses(actual, -1)))
    .filter((m) => m.mes >= desde && m.mes < actual)
    .map((m) => ({ mes: m.mes, gastos: m.gastos, total: m.total, balance: null, pasado: true }));
  const adelante = proyectar(datos, hoy, sumarMeses(actual, n)).map((r) => ({
    mes: r.mes,
    gastos: r.gastos.filter((l) => l.monto > 0),
    total: r.gastos.reduce((s, l) => s + l.monto, 0),
    balance: r.balance,
    pasado: false,
  }));
  return [...atras, ...adelante];
}

/** Barras verticales en SVG; negativos en rojo y para abajo. Cada barra se puede tocar. */
function barras(meses, valores, { elegido, actual } = {}) {
  const paso = 28;
  const ancho = Math.max(320, meses.length * paso);
  const anchoBarra = ancho / meses.length;
  const grosor = Math.min(anchoBarra - 6, 36);
  const alto = 140;
  const max = Math.max(1, ...valores.map(Math.abs));
  const hayNeg = valores.some((v) => v < 0);
  const cero = hayNeg ? alto / 2 : alto - 16;
  const escala = (hayNeg ? alto / 2 - 18 : alto - 30) / max;
  const cols = meses
    .map((m, i) => {
      const v = valores[i];
      const h = v ? Math.max(2, Math.abs(v) * escala) : 0;
      const y = v >= 0 ? cero - h : cero;
      const clase = [v < 0 ? 'neg' : 'pos', m.pasado && 'pasado', m.mes === elegido && 'elegido'].filter(Boolean).join(' ');
      return `<g data-mes="${m.mes}"><rect class="toque" x="${i * anchoBarra}" y="0" width="${anchoBarra}" height="${alto}"/>
        <rect x="${(i * anchoBarra + (anchoBarra - grosor) / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${grosor.toFixed(1)}" height="${h.toFixed(1)}" rx="4" class="${clase}"><title>${esc(nombreMes(m.mes))}: ${plata(v)}</title></rect>
        <text x="${i * anchoBarra + anchoBarra / 2}" y="${alto - 2}" text-anchor="middle" class="${m.mes === actual ? 'hoy' : ''}">${esc(corto(m.mes))}</text></g>`;
    })
    .join('');
  const i = meses.findIndex((m) => m.mes === actual);
  return `<div class="grafico-scroll" data-hoy-x="${i < 0 ? 0 : i * anchoBarra + anchoBarra / 2}"><svg class="grafico" viewBox="0 0 ${ancho} ${alto}" style="min-width:${ancho}px" role="img"><line x1="0" x2="${ancho}" y1="${cero}" y2="${cero}" class="eje"/>${cols}</svg></div>`;
}

function filasCategorias(cats, total, premium, catElegida) {
  return cats
    .map(({ cat, monto }) => {
      const pct = total ? Math.round((monto / total) * 100) : 0;
      const atributos = premium ? ` data-cat="${cat.id}" role="button" tabindex="0"` : '';
      return `<li class="${cat.id === catElegida ? 'elegida' : ''}"${atributos}><span>${cat.emoji} ${esc(t(cat.nombre))}</span><b>${plata(monto)}</b><i style="width:${pct}%"></i><small>${pct}%</small></li>`;
    })
    .join('');
}

/**
 * Pinta las métricas en `caja` y las deja interactivas: tocar un mes del gráfico cambia el
 * mes de las categorías; en Premium, tocar una categoría la grafica en el tiempo.
 */
export function montarMetricas(caja, datos, hoy, mesVisto, { premium = false, pasados = null, encabezado = '', alPremium = () => {} } = {}) {
  const n = premium ? MESES_PREMIUM : MESES_NORMAL;
  const actual = mesDe(hoy);
  const meses = armarMeses(datos, hoy, n, pasados);
  const futuros = meses.filter((m) => !m.pasado);
  let mesCat = meses.some((m) => m.mes === mesVisto) ? mesVisto : actual;
  let catElegida = null;

  const pintar = () => {
    const visto = meses.find((m) => m.mes === mesCat);
    const cats = porCategoria(visto.gastos);
    const todas = porCategoria(meses.flatMap((m) => m.gastos)).map((c) => c.cat);
    if (!catElegida || !todas.some((c) => c.id === catElegida)) catElegida = (cats[0] ?? { cat: todas[0] ?? OTROS }).cat.id;
    const ingreso = datos.perfil.ingresoMensual?.monto ?? 0;
    const delActual = meses.find((m) => m.mes === actual);
    const tasa = ingreso ? Math.round(((ingreso - delActual.total) / ingreso) * 100) : null;
    const meta = premium ? (futuros.find((m) => m.mes.endsWith('-12')) ?? futuros[futuros.length - 1]) : futuros[futuros.length - 1];

    let html = `${encabezado}
      <div class="metrica-destacada">
        <p>${t('En {mes} vas a tener ahorrado', { mes: nombreMes(meta.mes).toLowerCase() })}</p>
        <b class="${meta.balance < 0 ? 'menos' : 'mas'}">${plata(meta.balance)}</b>
        ${tasa !== null ? `<small>${t('Este mes ahorrás el {tasa}% de lo que ganás.', { tasa })}</small>` : ''}
      </div>`;

    if (premium) {
      const conGasto = meses.filter((m) => m.total > 0);
      const promedio = conGasto.length ? Math.round(conGasto.reduce((s, m) => s + m.total, 0) / conGasto.length) : 0;
      const caro = meses.reduce((a, b) => (b.total > a.total ? b : a), meses[0]);
      const anterior = meses.find((m) => m.mes === sumarMeses(actual, -1));
      const cambio = anterior?.total ? Math.round(((delActual.total - anterior.total) / anterior.total) * 100) : null;
      html += `<div class="fichas">
        <div><small>${t('Gastás por mes')}</small><b>${plata(promedio)}</b><span>${t('en promedio')}</span></div>
        <div><small>${t('Mes más caro')}</small><b>${plata(caro.total)}</b><span>${esc(nombreMes(caro.mes))}</span></div>
        <div><small>${t('Vs. el mes pasado')}</small><b class="${cambio > 0 ? 'menos' : 'mas'}">${cambio === null ? '—' : `${cambio > 0 ? '+' : ''}${cambio}%`}</b><span>${cambio === null ? t('sin datos') : cambio > 0 ? t('gastás más') : t('gastás menos')}</span></div>
      </div>`;
    }

    html += `<h4>${t('Gastos de cada mes')}</h4>
      ${barras(meses, meses.map((m) => m.total), { elegido: mesCat, actual })}
      <p class="ayuda">${t('Los meses pasados, más claros, son lo que gastaste; los que vienen, lo que tenés anotado. Tocá un mes para ver sus categorías.')}</p>
      <h4>${t('Ahorro proyectado, mes a mes')}</h4>
      ${barras(futuros, futuros.map((m) => m.balance), { actual })}
      <p class="ayuda">${t('Lo que te sobra al final de cada mes, sumando lo de los meses anteriores.')}</p>
      <h4>${t('Por categoría en {mes}', { mes: nombreMes(mesCat).toLowerCase() })}</h4>
      ${cats.length ? `<ul class="top-gastos categorias${premium ? ' tocables' : ''}">${filasCategorias(cats, visto.total, premium, catElegida)}</ul>` : `<p class="ayuda">${t('Todavía no hay gastos en este mes.')}</p>`}`;

    if (premium && todas.length) {
      const cat = todas.find((c) => c.id === catElegida);
      const valores = meses.map((m) => porCategoria(m.gastos).find((f) => f.cat.id === catElegida)?.monto ?? 0);
      const conValor = valores.filter((v) => v > 0);
      const promedio = conValor.length ? Math.round(conValor.reduce((s, v) => s + v, 0) / conValor.length) : 0;
      const esteMes = valores[meses.findIndex((m) => m.mes === mesCat)];
      const top = [...visto.gastos].sort((a, b) => b.monto - a.monto).slice(0, 5);
      html += `<h4>${t('Una categoría en el tiempo')} <span class="sello-mini">👑</span></h4>
        <div class="chips">${todas.map((c) => `<button type="button" class="chip${c.id === catElegida ? ' activo' : ''}" data-cat="${c.id}">${c.emoji} ${esc(t(c.nombre))}</button>`).join('')}</div>
        ${barras(meses, valores, { elegido: mesCat, actual })}
        <p class="ayuda">${t('{cat}: {promedio} por mes en promedio; en {mes}, {monto}.', {
          cat: `${cat.emoji} ${esc(t(cat.nombre))}`,
          promedio: plata(promedio),
          mes: nombreMes(mesCat).toLowerCase(),
          monto: plata(esteMes),
        })}</p>
        <h4>${t('Los gastos más grandes de {mes}', { mes: nombreMes(mesCat).toLowerCase() })}</h4>
        ${top.length ? `<ul class="top-gastos">${top.map((l) => {
          const pct = visto.total ? Math.round((l.monto / visto.total) * 100) : 0;
          return `<li><span>${esc(l.emoji || '💸')} ${esc(l.nombre)}</span><b>${plata(l.monto)}</b><i style="width:${pct}%"></i><small>${pct}%</small></li>`;
        }).join('')}</ul>` : `<p class="ayuda">${t('Todavía no hay gastos en este mes.')}</p>`}`;
    } else if (!premium) {
      html += `<div class="candado">
        <p>🔒 <b>${t('Con Premium ves mucho más')}</b></p>
        <ul>
          <li>${t('12 meses para atrás y 12 para adelante')}</li>
          <li>${t('El gráfico de cada categoría mes a mes')}</li>
          <li>${t('Tu promedio, tu mes más caro y tus gastos más grandes')}</li>
        </ul>
        <button type="button" class="boton principal" data-ir-premium>⭐ ${t('Hacete Premium')}</button>
      </div>`;
    }

    const scrolls = [...caja.querySelectorAll('.grafico-scroll')].map((s) => s.scrollLeft);
    caja.innerHTML = html;
    caja.querySelectorAll('.grafico-scroll').forEach((s, i) => {
      if (scrolls[i] != null) s.scrollLeft = scrolls[i];
      else s.scrollLeft = Math.max(0, Number(s.dataset.hoyX) - s.clientWidth / 2);
    });
  };

  // Un solo listener: sobrevive a cada repintada.
  caja.onclick = (e) => {
    const mes = e.target.closest('[data-mes]');
    const cat = e.target.closest('[data-cat]');
    if (e.target.closest('[data-ir-premium]')) return alPremium();
    if (mes) mesCat = mes.dataset.mes;
    else if (cat) catElegida = cat.dataset.cat;
    else return;
    pintar();
  };
  caja.onkeydown = (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-cat]')) e.target.click();
  };
  caja.innerHTML = '';
  pintar();
}
