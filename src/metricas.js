// Métricas (S2), en pantalla completa y partidas en dos: Gastos y Ahorros (Fede, 23/10/2026:
// "cuando uno ve métricas quiere tener espacio"). En el celular se pasa de una a otra con
// pestañas; en la PC van una al lado de la otra.
// Normales: 3 meses para atrás y para adelante. Premium: 12 y 12, el gráfico de una
// categoría elegida, números destacados, los gastos más grandes y el ritmo del cajón.
// Lo que viene sale del motor; lo pasado, de GET /historial (en la demo, del mismo
// historial() del motor); lo guardado, de los movimientos del cajón.
import { historial as historialLocal, mesDe, partirBalance, proyectar, sumarMeses } from './motor.js';
import { plata, nombreMes } from './formato.js';
import { locale, t } from './i18n.js';
import { animoPara, svgMono } from './mono.js';

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
    resumen: r,
    pasado: false,
  }));
  return [...atras, ...adelante];
}


/** Fijos, reservas y de una vez: cómo se reparte el gasto de un mes. */
export function porTipo(gastos) {
  const r = { fijo: 0, reserva: 0, puntual: 0 };
  for (const l of gastos) r[l.tipo in r ? l.tipo : 'puntual'] += l.monto;
  return r;
}

/**
 * Lo que entró al cajón desde la cuenta en cada mes: lo ahorrado menos lo que volvió.
 * Los ajustes a mano y los traspasos no cuentan: no movieron plata de la cuenta.
 */
export function guardadoPorMes(movimientos, meses) {
  const mapa = new Map(meses.map((m) => [m, 0]));
  for (const m of movimientos) {
    if (!mapa.has(m.mes)) continue;
    if (m.tipo === 'ahorro') mapa.set(m.mes, mapa.get(m.mes) + (m.monto ?? 0));
    else if (m.tipo === 'retiro') mapa.set(m.mes, mapa.get(m.mes) - (m.monto ?? 0));
  }
  return meses.map((m) => mapa.get(m));
}

const corta = (c) => new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(c / 100);
const promedioDe = (vs) => (vs.length ? Math.round(vs.reduce((s, v) => s + v, 0) / vs.length) : 0);

/** Barras verticales en SVG; negativos en rojo y para abajo. Cada barra se puede tocar. */
function barras(meses, valores, { elegido, actual, promedio = null, tocable = true } = {}) {
  const paso = 30;
  const ancho = Math.max(320, meses.length * paso);
  const anchoBarra = ancho / meses.length;
  const grosor = Math.min(anchoBarra - 6, 36);
  const alto = 150;
  const max = Math.max(1, ...valores.map(Math.abs), promedio ?? 0);
  const hayNeg = valores.some((v) => v < 0);
  const cero = hayNeg ? alto / 2 : alto - 16;
  const escala = (hayNeg ? alto / 2 - 20 : alto - 34) / max;
  const cols = meses
    .map((m, i) => {
      const v = valores[i];
      const h = v ? Math.max(2, Math.abs(v) * escala) : 0;
      const y = v >= 0 ? cero - h : cero;
      const x = i * anchoBarra + anchoBarra / 2;
      const clase = [v < 0 ? 'neg' : 'pos', m.pasado && 'pasado', m.mes === elegido && 'elegido'].filter(Boolean).join(' ');
      // El valor va escrito solo arriba del mes elegido: un número en cada barra no se lee.
      const valor = m.mes === elegido && v ? `<text x="${x}" y="${(v >= 0 ? y - 4 : y + h + 10).toFixed(1)}" text-anchor="middle" class="valor">${esc(corta(v))}</text>` : '';
      return `<g${tocable ? ` data-mes="${m.mes}"` : ''}><rect class="toque" x="${i * anchoBarra}" y="0" width="${anchoBarra}" height="${alto}"><title>${esc(nombreMes(m.mes))}: ${plata(v)}</title></rect>
        <rect x="${(x - grosor / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${grosor.toFixed(1)}" height="${h.toFixed(1)}" rx="4" class="${clase}"/>${valor}
        <text x="${x}" y="${alto - 2}" text-anchor="middle" class="${m.mes === actual ? 'hoy' : ''}">${esc(corto(m.mes))}</text></g>`;
    })
    .join('');
  const media = promedio ? `<line x1="0" x2="${ancho}" y1="${(cero - promedio * escala).toFixed(1)}" y2="${(cero - promedio * escala).toFixed(1)}" class="media"/>` : '';
  const i = meses.findIndex((m) => m.mes === actual);
  return `<div class="grafico-scroll" data-hoy-x="${i < 0 ? 0 : i * anchoBarra + anchoBarra / 2}"><svg class="grafico" viewBox="0 0 ${ancho} ${alto}" style="min-width:${ancho}px" role="img"><line x1="0" x2="${ancho}" y1="${cero}" y2="${cero}" class="eje"/>${media}${cols}</svg></div>`;
}

/** Línea con área para el ahorro proyectado: se lee como algo que crece (o se hunde). */
function linea(meses, valores, actual) {
  const paso = 40;
  const ancho = Math.max(320, meses.length * paso);
  const alto = 160;
  const margen = 18;
  const min = Math.min(0, ...valores);
  const max = Math.max(1, ...valores);
  const y = (v) => margen + ((max - v) / (max - min || 1)) * (alto - margen * 2 - 12);
  const x = (i) => (meses.length === 1 ? ancho / 2 : 16 + (i * (ancho - 32)) / (meses.length - 1));
  const puntos = valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const cero = y(0);
  const area = `M${x(0).toFixed(1)},${cero.toFixed(1)} L${puntos.join(' L')} L${x(valores.length - 1).toFixed(1)},${cero.toFixed(1)} Z`;
  const ultimo = valores.length - 1;
  const marcas = valores
    .map(
      (v, i) => `<g><rect class="toque" x="${(x(i) - paso / 2).toFixed(1)}" y="0" width="${paso}" height="${alto}"><title>${esc(nombreMes(meses[i].mes))}: ${plata(v)}</title></rect>
        <circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4" class="${v < 0 ? 'neg' : 'pos'}"/>
        <text x="${x(i).toFixed(1)}" y="${alto - 2}" text-anchor="middle" class="${meses[i].mes === actual ? 'hoy' : ''}">${esc(corto(meses[i].mes))}</text></g>`,
    )
    .join('');
  const etiqueta = `<text x="${x(ultimo).toFixed(1)}" y="${(y(valores[ultimo]) - 9).toFixed(1)}" text-anchor="end" class="valor">${esc(corta(valores[ultimo]))}</text>`;
  return `<div class="grafico-scroll" data-hoy-x="0"><svg class="grafico linea" viewBox="0 0 ${ancho} ${alto}" style="min-width:${ancho}px" role="img">
    <line x1="0" x2="${ancho}" y1="${cero.toFixed(1)}" y2="${cero.toFixed(1)}" class="eje"/>
    <path d="${area}" class="area"/><polyline points="${puntos.join(' ')}" class="trazo"/>${marcas}${etiqueta}</svg></div>`;
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

const TIPOS = [
  ['fijo', 'Fijos'],
  ['reserva', 'Reservas'],
  ['puntual', 'De una vez'],
];

/** Una barra partida en fijos, reservas y de una vez, con su leyenda (y los montos). */
function barraTipos(gastos, total) {
  const tipos = porTipo(gastos);
  const hay = TIPOS.filter(([id]) => tipos[id] > 0);
  if (!total || !hay.length) return `<p class="ayuda">${t('Todavía no hay gastos en este mes.')}</p>`;
  return `<div class="barra-tipos" role="img">${hay
    .map(([id, nombre]) => `<span class="tipo-${id}" style="flex-grow:${tipos[id]}" title="${esc(t(nombre))}: ${plata(tipos[id])}"></span>`)
    .join('')}</div>
    <ul class="leyenda">${hay
      .map(([id, nombre]) => `<li><i class="tipo-${id}"></i>${t(nombre)} <b>${plata(tipos[id])}</b> <small>${Math.round((tipos[id] / total) * 100)}%</small></li>`)
      .join('')}</ul>`;
}

function candado(lista) {
  return `<div class="candado">
    <p>🔒 <b>${t('Con Premium ves mucho más')}</b></p>
    <ul>${lista.map((l) => `<li>${t(l)}</li>`).join('')}</ul>
    <button type="button" class="boton principal" data-ir-premium>⭐ ${t('Hacete Premium')}</button>
  </div>`;
}

/** Cuenta de 0 al número final la primera vez que se ve (Web Animations no anima texto). */
function contar(el) {
  const fin = Number(el.dataset.contar);
  const formato = el.dataset.formato === 'pct' ? (v) => `${v}%` : plata;
  if (!fin || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const inicio = performance.now();
  const paso = (ahora) => {
    const p = Math.min(1, (ahora - inicio) / 700);
    el.textContent = formato(Math.round(fin * (1 - (1 - p) ** 3)));
    if (p < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

/**
 * Pinta las métricas en `caja` y las deja interactivas. En Gastos, tocar un mes del gráfico
 * cambia el mes de las categorías; en Premium, tocar una categoría la grafica en el tiempo.
 * `cajon` es lo que da resumenCajon() de cajon.js (null si no cargó).
 */
export function montarMetricas(
  caja,
  datos,
  hoy,
  mesVisto,
  { premium = false, pasados = null, encabezado = '', cajon = null, pestanas = null, seccion = 'gastos', alPremium = () => {}, alCajon = () => {}, alSeccion = () => {} } = {},
) {
  const n = premium ? MESES_PREMIUM : MESES_NORMAL;
  const actual = mesDe(hoy);
  const meses = armarMeses(datos, hoy, n, pasados);
  const futuros = meses.filter((m) => !m.pasado);
  const hastaHoy = meses.filter((m) => m.mes <= actual);
  const ingreso = datos.perfil.ingresoMensual?.monto ?? 0;
  let mesCat = meses.some((m) => m.mes === mesVisto) ? mesVisto : actual;
  let catElegida = null;
  let primera = true;

  const gastosHtml = () => {
    const visto = meses.find((m) => m.mes === mesCat);
    const anterior = meses.find((m) => m.mes === sumarMeses(mesCat, -1));
    const cambio = anterior?.total ? Math.round(((visto.total - anterior.total) / anterior.total) * 100) : null;
    const cats = porCategoria(visto.gastos);
    const todas = porCategoria(meses.flatMap((m) => m.gastos)).map((c) => c.cat);
    if (!catElegida || !todas.some((c) => c.id === catElegida)) catElegida = (cats[0] ?? { cat: todas[0] ?? OTROS }).cat.id;
    const conGasto = meses.filter((m) => m.total > 0);
    const promedio = promedioDe(conGasto.map((m) => m.total));
    const pagado = visto.gastos.filter((l) => l.pagado).reduce((s, l) => s + l.monto, 0);
    const animo = cambio === null || cambio <= 0 ? 'feliz' : cambio > 30 ? 'panico' : 'nervioso';
    const mes = nombreMes(mesCat).toLowerCase();

    let html = `<h3 class="pm-titulo">💸 ${t('Gastos')}</h3>
      <div class="pm-hero hero-gastos">
        <div class="mono-chico">${svgMono(animo)}</div>
        <div>
          <small>${visto.pasado ? t('Gastaste en {mes}', { mes }) : t('Tenés anotado para {mes}', { mes })}</small>
          <b data-contar="${visto.total}">${plata(visto.total)}</b>
          ${
            cambio === null
              ? ''
              : `<span class="cambio ${cambio > 0 ? 'sube' : 'baja'}">${cambio > 0 ? '▲' : '▼'} ${Math.abs(cambio)}% ${t('vs. {mes}', { mes: nombreMes(anterior.mes).toLowerCase() })}</span>`
          }
        </div>
        ${
          !visto.pasado && visto.total
            ? `<div class="pm-pagado"><div class="frasco"><span style="width:${Math.round((pagado / visto.total) * 100)}%"></span></div>
          <small>${t('Pagaste {pagado} de {total}', { pagado: plata(pagado), total: plata(visto.total) })}</small></div>`
            : ''
        }
      </div>`;

    if (premium) {
      const caro = meses.reduce((a, b) => (b.total > a.total ? b : a), meses[0]);
      const fijos = porTipo(futuros[0].gastos).fijo;
      html += `<div class="fichas">
        <div><small>${t('Gastás por mes')}</small><b>${plata(promedio)}</b><span>${t('en promedio')}</span></div>
        <div><small>${t('Mes más caro')}</small><b>${plata(caro.total)}</b><span>${esc(nombreMes(caro.mes))}</span></div>
        <div><small>${t('Fijos por mes')}</small><b>${plata(fijos)}</b><span>${ingreso ? t('{pct}% de lo que ganás', { pct: Math.round((fijos / ingreso) * 100) }) : t('lo que no se mueve')}</span></div>
      </div>`;
    }

    html += `<div class="pm-tarjeta">
        <h4>${t('Gastos de cada mes')}</h4>
        ${barras(meses, meses.map((m) => m.total), { elegido: mesCat, actual, promedio })}
        <p class="ayuda">${t('Los meses pasados, más claros, son lo que gastaste; los que vienen, lo que tenés anotado. La línea es tu promedio. Tocá un mes para verlo.')}</p>
      </div>
      <div class="pm-tarjeta">
        <h4>${t('Fijos, reservas y de una vez')}</h4>
        ${barraTipos(visto.gastos, visto.total)}
      </div>
      <div class="pm-tarjeta">
        <h4>${t('Por categoría en {mes}', { mes })}</h4>
        ${cats.length ? `<ul class="top-gastos categorias${premium ? ' tocables' : ''}">${filasCategorias(cats, visto.total, premium, catElegida)}</ul>` : `<p class="ayuda">${t('Todavía no hay gastos en este mes.')}</p>`}
      </div>`;

    if (premium && todas.length) {
      const cat = todas.find((c) => c.id === catElegida);
      const valores = meses.map((m) => porCategoria(m.gastos).find((f) => f.cat.id === catElegida)?.monto ?? 0);
      const promedioCat = promedioDe(valores.filter((v) => v > 0));
      const esteMes = valores[meses.findIndex((m) => m.mes === mesCat)];
      const top = [...visto.gastos].sort((a, b) => b.monto - a.monto).slice(0, 5);
      html += `<div class="pm-tarjeta">
        <h4>${t('Una categoría en el tiempo')} <span class="sello-mini">👑</span></h4>
        <div class="chips">${todas.map((c) => `<button type="button" class="chip${c.id === catElegida ? ' activo' : ''}" data-cat="${c.id}">${c.emoji} ${esc(t(c.nombre))}</button>`).join('')}</div>
        ${barras(meses, valores, { elegido: mesCat, actual, promedio: promedioCat })}
        <p class="ayuda">${t('{cat}: {promedio} por mes en promedio; en {mes}, {monto}.', {
          cat: `${cat.emoji} ${esc(t(cat.nombre))}`,
          promedio: plata(promedioCat),
          mes,
          monto: plata(esteMes),
        })}</p>
      </div>
      <div class="pm-tarjeta">
        <h4>${t('Los gastos más grandes de {mes}', { mes })}</h4>
        ${top.length ? `<ul class="top-gastos">${top.map((l) => {
          const pct = visto.total ? Math.round((l.monto / visto.total) * 100) : 0;
          return `<li><span>${esc(l.emoji || '💸')} ${esc(l.nombre)}</span><b>${plata(l.monto)}</b><i style="width:${pct}%"></i><small>${pct}%</small></li>`;
        }).join('')}</ul>` : `<p class="ayuda">${t('Todavía no hay gastos en este mes.')}</p>`}
      </div>`;
    } else if (!premium) {
      html += candado(['12 meses para atrás y 12 para adelante', 'El gráfico de cada categoría mes a mes', 'Tu promedio, tu mes más caro y tus gastos más grandes']);
    }
    return html;
  };

  const ahorrosHtml = () => {
    const delActual = futuros[0];
    const meta = premium ? (futuros.find((m) => m.mes.endsWith('-12')) ?? futuros[futuros.length - 1]) : futuros[futuros.length - 1];
    const tasa = ingreso ? Math.round(((ingreso - delActual.total) / ingreso) * 100) : null;
    const delMes = partirBalance(datos, delActual.resumen, datos.ahorros ?? []).delMes;
    const guardado = cajon ? guardadoPorMes(cajon.movimientos, hastaHoy.map((m) => m.mes)) : [];
    const ritmo = promedioDe(guardado.slice(0, -1).filter((v) => v > 0));

    let html = `<h3 class="pm-titulo">🍌 ${t('Ahorros')}</h3>
      <div class="pm-hero hero-ahorros">
        <div class="mono-chico">${svgMono(animoPara(meta.balance, ingreso), premium)}</div>
        <div>
          <small>${t('En {mes} vas a tener ahorrado', { mes: nombreMes(meta.mes).toLowerCase() })}</small>
          <b class="${meta.balance < 0 ? 'menos' : ''}" data-contar="${meta.balance}">${plata(meta.balance)}</b>
          <span>${t('Si todo sale como lo anotaste.')}</span>
        </div>
      </div>
      <div class="fichas">
        <div><small>${t('Te sobra este mes')}</small><b class="${delMes < 0 ? 'menos' : 'mas'}">${plata(delMes)}</b><span>${esc(nombreMes(actual))}</span></div>
        <div><small>${t('Ahorrás')}</small><b>${tasa === null ? '—' : `${tasa}%`}</b><span>${tasa === null ? t('sin ingreso cargado') : t('de lo que ganás')}</span></div>
        <div><small>${t('Tu cajón vale')}</small><b>${cajon ? `≈ ${esc(cajon.plataBase(cajon.total))}` : '—'}</b><span>${cajon ? esc(cajon.base) : t('sin datos')}</span></div>
      </div>
      <div class="pm-tarjeta">
        <h4>${t('Ahorro proyectado, mes a mes')}</h4>
        ${linea(futuros, futuros.map((m) => m.balance), actual)}
        <p class="ayuda">${t('Lo que te sobra al final de cada mes, sumando lo de los meses anteriores.')}</p>
      </div>`;

    if (cajon) {
      const llenos = cajon.bolsillos;
      html += `<div class="pm-tarjeta">
        <h4>${t('🍌 Cajón de bananas')}</h4>
        ${
          llenos.length
            ? `<ul class="top-gastos bolsillos-metricas">${llenos
                .map((b) => {
                  const pct = cajon.total > 0 && b.valor ? Math.max(0, Math.round((b.valor / cajon.total) * 100)) : 0;
                  return b.valor === null
                    ? `<li><span>${esc(b.emoji)} ${esc(b.nombre)}</span><b>${esc(b.texto)}</b></li>`
                    : `<li><span>${esc(b.emoji)} ${esc(b.nombre)}</span><b>≈ ${esc(cajon.plataBase(b.valor))}</b><i style="width:${pct}%"></i><small>${esc(b.texto)} · ${pct}%</small></li>`;
                })
                .join('')}</ul>
              ${cajon.sinCotizar ? `<p class="ayuda">${t('{n} sin cotización', { n: cajon.sinCotizar })}</p>` : ''}`
            : `<p class="ayuda">${t('Todavía no guardaste nada. Cuando te sobre, tocá Ahorrar y Mona lo trae acá.')}</p>`
        }
        <button type="button" class="boton chico" data-abrir-cajon>${t('Abrir el cajón')}</button>
      </div>
      <div class="pm-tarjeta">
        <h4>${t('Lo que guardaste cada mes')}</h4>
        ${
          guardado.some(Boolean)
            ? `${barras(hastaHoy, guardado, { actual, elegido: actual, tocable: false, promedio: ritmo || null })}
        <p class="ayuda">${t('Lo que pasaste de la cuenta al cajón, menos lo que volvió.')}</p>`
            : `<p class="ayuda">${t('En estos meses no pasaste plata de la cuenta al cajón. Cuando te sobre, tocá Ahorrar 🍌')}</p>`
        }
        ${
          premium && ritmo
            ? `<p class="ritmo">👑 ${t('Guardás {ritmo} por mes en promedio: a este ritmo, en un año sumás {anio} al cajón.', { ritmo: plata(ritmo), anio: plata(ritmo * 12) })}</p>`
            : ''
        }
      </div>`;
    }
    if (!premium) html += candado(['12 meses de ahorro proyectado', 'Tu ritmo de ahorro y cuánto juntás en un año']);
    return html;
  };

  const pintar = () => {
    const scrolls = [...caja.querySelectorAll('.grafico-scroll')].map((s) => s.scrollLeft);
    caja.innerHTML = `${encabezado}<div class="pm-secciones" data-ver="${seccion}">
      <section class="pm-seccion" data-seccion="gastos">${gastosHtml()}</section>
      <section class="pm-seccion" data-seccion="ahorros">${ahorrosHtml()}</section></div>`;
    caja.querySelectorAll('.grafico-scroll').forEach((s, i) => {
      if (!primera && scrolls[i] != null) s.scrollLeft = scrolls[i];
      else s.scrollLeft = Math.max(0, Number(s.dataset.hoyX) - s.clientWidth / 2);
    });
    if (primera) caja.querySelectorAll('[data-contar]').forEach(contar);
    primera = false;
  };

  const elegir = (s, inicial = false) => {
    seccion = s;
    pestanas?.querySelectorAll('[data-seccion]').forEach((b) => {
      b.classList.toggle('activo', b.dataset.seccion === s);
      b.setAttribute('aria-selected', String(b.dataset.seccion === s));
    });
    caja.querySelector('.pm-secciones').dataset.ver = s;
    const el = caja.querySelector(`.pm-seccion[data-seccion="${s}"]`);
    el.animate([{ opacity: 0, transform: `translateX(${s === 'ahorros' ? 16 : -16}px)` }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
    el.querySelectorAll('.mono-chico').forEach((m) => m.animate([{ transform: 'scale(0.6) rotate(-10deg)' }, { transform: 'scale(1.1) rotate(4deg)' }, { transform: 'none' }], { duration: 420, easing: 'ease-out' }));
    // Cada sección arranca centrada en hoy, como la primera vez.
    el.querySelectorAll('.grafico-scroll').forEach((g) => (g.scrollLeft = Math.max(0, Number(g.dataset.hoyX) - g.clientWidth / 2)));
    if (!inicial) alSeccion(s);
  };

  // Un solo listener: sobrevive a cada repintada.
  caja.onclick = (e) => {
    const mes = e.target.closest('[data-mes]');
    const cat = e.target.closest('[data-cat]');
    if (e.target.closest('[data-ir-premium]')) return alPremium();
    if (e.target.closest('[data-abrir-cajon]')) return alCajon();
    if (mes) mesCat = mes.dataset.mes;
    else if (cat) catElegida = cat.dataset.cat;
    else return;
    pintar();
  };
  caja.onkeydown = (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-cat]')) e.target.click();
  };
  if (pestanas) pestanas.onclick = (e) => {
    const b = e.target.closest('[data-seccion]');
    if (b && b.dataset.seccion !== seccion) elegir(b.dataset.seccion);
  };
  caja.innerHTML = '';
  pintar();
  elegir(seccion, true);
}
