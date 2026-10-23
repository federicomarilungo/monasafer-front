// Cajón de bananas (K1): adonde va lo que sobra. Cada bolsillo guarda lo suyo en su unidad
// (230 USD, 0,0031 BTC) y los movimientos son la auditoría, aparte de los gastos de los
// meses. En la demo, `demoApi` imita en memoria los endpoints del back (src/cajon/).
import { api } from './api.js';
import { centavos, plata } from './formato.js';
import { idiomaActual, locale, t } from './i18n.js';
import { sonar } from './sonidos.js';

let ctx = null;
let cajon = { bolsillos: [], movimientos: [] };
/** Cotizaciones del día del back: unidades de cada código por 1 USD (null si no hay). */
let cotizaciones = null;
const MONEDAS_BASE = ['USD', 'ARS', 'EUR', 'BRL', 'MXN', 'CLP', 'COP', 'UYU', 'PEN'];
const GRAMOS_POR_ONZA = 31.1035;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const monedaCuenta = () => ctx.estado.perfil?.moneda ?? 'USD';
const nombreDe = (b) => (b.generico ? t('Sin asignar') : b.nombre);
const enMoneda = (b) => b.unidad === monedaCuenta() && b.decimales === 2;
const monedaBase = () => ctx.estado.perfil?.monedaCajon ?? monedaCuenta();

function porUsd(unidad) {
  const p = cotizaciones?.porUsd;
  if (!p) return null;
  const u = unidad.toUpperCase();
  // Un bolsillo en gramos se valúa como oro (la cotización es por onza troy).
  if (u === 'G') return p.XAU ? p.XAU * GRAMOS_POR_ONZA : null;
  if (u === 'OZ') return p.XAU ?? null;
  return p[u] ?? null;
}

/** Cuánto vale una cantidad del bolsillo en la moneda base, en centavos (null: sin cotización). */
function enBase(cantidad, b) {
  const base = monedaBase();
  const n = cantidad / 10 ** b.decimales;
  // El valor puesto a mano manda sobre el de mercado.
  if (b.cotizacion) {
    const enSuMoneda = n * b.cotizacion.valor;
    if (b.cotizacion.moneda === base) return Math.round(enSuMoneda);
    const de = porUsd(b.cotizacion.moneda);
    const a = porUsd(base);
    return de && a ? Math.round((enSuMoneda / de) * a) : null;
  }
  if (b.unidad === base) return Math.round(n * 100);
  const de = porUsd(b.unidad);
  const a = porUsd(base);
  return de && a ? Math.round((n / de) * a * 100) : null;
}

const plataBase = (c) =>
  new Intl.NumberFormat(locale(), { style: 'currency', currency: monedaBase(), maximumFractionDigits: 0 }).format(c / 100);

// Lo que se ofrece en "¿Dónde lo guardás?". Acciones y plazo fijo se anotan en la moneda
// de la cuenta (lo que valen), el resto en su unidad.
const PRESETS = [
  { nombre: 'Dólar', emoji: '💵', unidad: 'USD', decimales: 2 },
  { nombre: 'Euro', emoji: '💶', unidad: 'EUR', decimales: 2 },
  { nombre: 'Oro', emoji: '🪙', unidad: 'g', decimales: 2 },
  { nombre: 'Bitcoin', emoji: '₿', unidad: 'BTC', decimales: 8 },
  { nombre: 'Ethereum', emoji: '💠', unidad: 'ETH', decimales: 8 },
  { nombre: 'Solana', emoji: '🟣', unidad: 'SOL', decimales: 8 },
  { nombre: 'USDT', emoji: '💲', unidad: 'USDT', decimales: 2 },
  { nombre: 'USDC', emoji: '🔵', unidad: 'USDC', decimales: 2 },
  { nombre: 'Acciones', emoji: '📈', unidad: null, decimales: 2 },
  { nombre: 'Plazo fijo', emoji: '🏦', unidad: null, decimales: 2 },
];
const EMOJIS = ['🐷', '💵', '💶', '₿', '💠', '💲', '🪙', '📈', '🏦', '✈️', '🏠', '🚗', '🎓', '💍', '🎁', '🆘', '💎', '🍌'];
const CRIPTO = /^(BTC|ETH|SOL|XRP|ADA|DOGE|LTC|DOT|AVAX|BNB)$/i;

/** 230 USD → 23000 si la unidad tiene 2 decimales. Mismas reglas que `centavos`. */
export function leerCantidad(texto, decimales, negativo = false) {
  let s = String(texto).trim().replace(/\s|\$/g, '').replace('−', '-');
  const menos = negativo && s.startsWith('-');
  if (menos) s = s.slice(1);
  if (!s) return null;
  if (idiomaActual() === 'en') s = s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return (menos ? -1 : 1) * Math.round(n * 10 ** decimales);
}

const paraInput = (c, decimales = 2) =>
  (c / 10 ** decimales).toLocaleString(locale(), { useGrouping: false, maximumFractionDigits: decimales });

export function cantidadTexto(c, b) {
  if (enMoneda(b)) return plata(c);
  const n = new Intl.NumberFormat(locale(), { maximumFractionDigits: b.decimales }).format(c / 10 ** b.decimales);
  return `${n} ${b.unidad}`;
}

// ---------- Datos ----------

const llamar = (metodo, ruta, cuerpo) => (ctx.estado.modo === 'real' ? api : demoApi)(metodo, ruta, cuerpo);

async function cargarCotizaciones() {
  if (cotizaciones && Date.now() - Date.parse(cotizaciones.fecha) < 60 * 60 * 1000) return;
  // Públicas: la demo también las usa.
  cotizaciones = await api('GET', '/cajon/cotizaciones').catch(() => cotizaciones);
}

export async function cargarCajon() {
  try {
    cajon = await llamar('GET', '/cajon');
  } catch {
    cajon = { bolsillos: [], movimientos: [] }; // el cajón no frena la app
  }
  pintarResumen();
}

/** Después de cada cambio: recarga el cajón (y los datos del mes si tocó el saldo). */
async function refrescar(tocoSaldo) {
  if (ctx.estado.modo === 'real') {
    await Promise.all([llamar('GET', '/cajon').then((c) => (cajon = c)), tocoSaldo ? ctx.recargar() : null]);
  } else cajon = await demoApi('GET', '/cajon');
  ctx.pintar();
  pintarResumen();
  if (document.getElementById('hoja-cajon').open) pintarCajon();
}

const demo = { bolsillos: [], movimientos: [], n: 0 };
async function demoApi(metodo, ruta, c = {}) {
  const d = ctx.estado.datos;
  const nuevoId = () => `demo-${++demo.n}`;
  const cant = (id) => demo.movimientos.filter((m) => m.bolsilloId === id).reduce((s, m) => s + m.cantidad, 0);
  const mov = (m) => {
    const x = { id: nuevoId(), monto: 0, origen: null, detalle: '', grupo: null, mes: ctx.mesActual, fecha: new Date().toISOString(), ...m };
    demo.movimientos.unshift(x);
    return x;
  };
  const [, recurso, id, accion] = ruta.split('/').filter(Boolean);
  let r;
  if (metodo === 'GET') {
    r = { bolsillos: demo.bolsillos.map((b) => ({ ...b, cantidad: cant(b.id) })), movimientos: demo.movimientos };
  } else if (ruta === '/cajon/bolsillos') {
    r = { id: nuevoId(), generico: false, ...c, cantidad: 0 };
    demo.bolsillos.push(r);
  } else if (ruta === '/cajon/ahorrar') {
    let b = c.bolsilloId ? demo.bolsillos.find((x) => x.id === c.bolsilloId) : demo.bolsillos.find((x) => x.generico);
    if (!b) {
      b = { id: nuevoId(), nombre: 'Sin asignar', emoji: '🍌', unidad: monedaCuenta(), decimales: 2, generico: true };
      demo.bolsillos.push(b);
    }
    const cantidad = c.bolsilloId && !b.generico ? c.cantidad : c.monto;
    r = mov({ bolsilloId: b.id, tipo: 'ahorro', cantidad, monto: c.monto, origen: c.origen, detalle: c.detalle ?? '' });
    d.perfil.saldo -= c.monto;
  } else if (accion === 'ajustar') {
    const dif = c.cantidad - cant(id);
    r = mov({ bolsilloId: id, tipo: dif < 0 ? 'gasto' : 'ingreso', cantidad: dif, detalle: c.detalle });
  } else if (accion === 'retirar') {
    if (c.cantidad > cant(id)) throw new Error(t('No tenés tanto en ese bolsillo'));
    r = mov({ bolsilloId: id, tipo: 'retiro', cantidad: -c.cantidad, monto: c.monto, detalle: c.detalle });
    d.perfil.saldo += c.monto;
  } else if (ruta === '/cajon/traspasar') {
    if (c.cantidad > cant(c.desde)) throw new Error(t('No tenés tanto en ese bolsillo'));
    const grupo = nuevoId();
    r = [
      mov({ bolsilloId: c.desde, tipo: 'traspaso', cantidad: -c.cantidad, grupo, detalle: c.detalle }),
      mov({ bolsilloId: c.hacia, tipo: 'traspaso', cantidad: c.cantidadEntra ?? c.cantidad, grupo, detalle: c.detalle }),
    ];
  } else if (ruta === '/cajon/orden') {
    demo.bolsillos.sort((a, b) => (c.ids.indexOf(a.id) + 1 || 999) - (c.ids.indexOf(b.id) + 1 || 999));
    r = { ok: true };
  } else if (recurso === 'bolsillos' && metodo === 'PATCH') {
    r = Object.assign(demo.bolsillos.find((b) => b.id === id), c);
  } else if (recurso === 'bolsillos' && metodo === 'DELETE') {
    if (cant(id)) throw new Error(t('Primero vaciá el bolsillo'));
    demo.bolsillos = demo.bolsillos.filter((b) => b.id !== id);
    r = { ok: true };
  } else if (recurso === 'movimientos') {
    const m = demo.movimientos.find((x) => x.id === id);
    if (metodo === 'DELETE') {
      const todos = m.grupo ? demo.movimientos.filter((x) => x.grupo === m.grupo) : [m];
      if (todos.some((x) => x.cantidad > 0 && !['gasto', 'ingreso'].includes(x.tipo) && cant(x.bolsilloId) < x.cantidad)) throw new Error(t('Ese ahorro ya se usó: el bolsillo quedaría en negativo'));
      demo.movimientos = demo.movimientos.filter((x) => !todos.includes(x));
      for (const x of todos) d.perfil.saldo += x.tipo === 'ahorro' ? x.monto : x.tipo === 'retiro' ? -x.monto : 0;
      r = { ok: true };
    } else {
      if (c.monto !== undefined) {
        d.perfil.saldo += (m.tipo === 'ahorro' ? -1 : 1) * (c.monto - m.monto);
        m.monto = c.monto;
      }
      if (c.cantidad !== undefined) m.cantidad = m.cantidad < 0 ? -c.cantidad : c.cantidad;
      if (c.detalle !== undefined) m.detalle = c.detalle;
      r = m;
    }
  }
  d.ahorros = demo.movimientos.filter((m) => m.tipo === 'ahorro' && m.mes >= ctx.mesActual).map((m) => ({ mes: m.mes, monto: m.monto, origen: m.origen }));
  return structuredClone(r);
}

// ---------- Inicio y home ----------

export function iniciarCajon(contexto) {
  ctx = contexto;
  document.body.insertAdjacentHTML(
    'beforeend',
    `<dialog class="hoja" id="hoja-cajon"><form method="dialog" id="form-cajon" class="cajon"></form></dialog>
     <dialog class="hoja" id="hoja-ahorro"><form method="dialog" id="form-ahorro" class="cajon"></form></dialog>`,
  );
  for (const id of ['hoja-cajon', 'hoja-ahorro']) {
    const d = document.getElementById(id);
    d.addEventListener('click', (e) => {
      if (e.target === d) d.close();
    });
  }
}

function pintarResumen() {
  const el = document.getElementById('resumen-cajon');
  if (!el) return;
  const llenos = cajon.bolsillos.filter((b) => b.cantidad);
  el.textContent = llenos.length ? llenos.map((b) => `${b.emoji} ${cantidadTexto(b.cantidad, b)}`).join(' · ') : t('Vacío por ahora. Lo que sobra va acá.');
}

/** M5 del cajón: al arrancar el mes, Mona propone guardar lo que sobró de antes. */
export function sugerenciaCajon(acumulado, descartadas, descartar) {
  const clave = `cajon:${ctx.mesActual}`;
  const yaAhorro = (ctx.estado.datos.ahorros ?? []).some((a) => a.mes === ctx.mesActual);
  if (acumulado <= 0 || yaAhorro || descartadas.includes(clave)) return null;
  const tarjeta = document.createElement('div');
  tarjeta.className = 'sugerencia';
  tarjeta.innerHTML = `<p>${t('🐒 De los meses anteriores te sobraron <b>{monto}</b>. ¿Los guardamos en el cajón de bananas?', { monto: plata(acumulado) })}</p>
    <div class="acciones"><button type="button" class="boton" data-no>${t('Ahora no')}</button><button type="button" class="boton principal" data-si>${t('Al cajón 🍌')}</button></div>`;
  tarjeta.querySelector('[data-no]').addEventListener('click', () => {
    descartar(clave);
    sonar('toque');
    tarjeta.remove();
  });
  tarjeta.querySelector('[data-si]').addEventListener('click', () => abrirAhorrar('acumulado'));
  return tarjeta;
}

// ---------- Pasos (una hoja que se redibuja) ----------

let flujo = null;

function paso(html, alMostrar) {
  const f = document.getElementById('form-ahorro');
  f.innerHTML = `${html}<p class="error" id="error-ahorro" hidden></p>`;
  f.onsubmit = null;
  f.querySelectorAll('[data-cerrar-ahorro]').forEach((b) => b.addEventListener('click', () => document.getElementById('hoja-ahorro').close()));
  alMostrar?.(f);
  const d = document.getElementById('hoja-ahorro');
  if (!d.open) d.showModal();
  f.animate([{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'ease-out' });
  f.querySelector('input:not([type=hidden])')?.focus();
}

function error(msg) {
  const el = document.getElementById('error-ahorro');
  if (msg) sonar('error');
  el.hidden = !msg;
  el.textContent = msg ?? '';
}

async function enviar(boton, accion) {
  error(null);
  boton.disabled = true;
  try {
    await accion();
  } catch (err) {
    if (err?.status === 401) return ctx.avisar(err);
    error(err.message);
  } finally {
    boton.disabled = false;
  }
}

// ---------- Ahorrar ----------

/** origen: 'mes' (lo que sobra este mes) o 'acumulado' (lo que viene de antes). */
export function abrirAhorrar(origen) {
  flujo = {};
  elegirOrigen(origen);
  pasoMonto();
}

function elegirOrigen(origen) {
  const p = ctx.partido();
  const disponible = Math.max(0, origen === 'mes' ? p.delMes : p.acumulado);
  Object.assign(flujo, { origen, disponible, monto: disponible, ambos: p.delMes > 0 && p.acumulado > 0, partes: p });
}

function pasoMonto() {
  const saldo = ctx.estado.datos.perfil.saldo;
  paso(
    `<h3>${t('🍌 ¿Cuánto guardás?')}</h3>
     ${
       flujo.ambos
         ? `<div class="segmentos dos" role="radiogroup">
         <button type="button" class="segmento${flujo.origen === 'mes' ? ' activo' : ''}" data-origen="mes">${t('Del mes')}<small>${plata(flujo.partes.delMes)}</small></button>
         <button type="button" class="segmento${flujo.origen === 'acumulado' ? ' activo' : ''}" data-origen="acumulado">${t('De meses anteriores')}<small>${plata(flujo.partes.acumulado)}</small></button>
       </div>`
         : ''
     }
     <p class="ayuda">${flujo.origen === 'mes' ? t('Este mes te sobran {monto}.', { monto: plata(flujo.disponible) }) : t('De meses anteriores tenés {monto}.', { monto: plata(flujo.disponible) })}</p>
     <label class="campo monto-campo"><span>${t('Plata que sacás de tu cuenta')}</span><input name="monto" inputmode="decimal" autocomplete="off" /></label>
     <div class="chips"><button type="button" class="chip" data-parte="1">${t('Todo')}</button><button type="button" class="chip" data-parte="0.5">${t('La mitad')}</button></div>
     <label class="campo"><span>${t('O decime cuánto te queda en la cuenta')}</span><input name="queda" inputmode="decimal" autocomplete="off" /></label>
     <p class="cajon-cuenta" id="ahorro-cuenta"></p>
     <div class="acciones"><button type="button" class="boton" data-cerrar-ahorro>${t('Cancelar')}</button><button type="submit" class="boton principal">${t('Seguir')}</button></div>`,
    (f) => {
      const cuenta = () => {
        const m = centavos(f.monto.value) ?? 0;
        const queda = flujo.disponible - m;
        const el = document.getElementById('ahorro-cuenta');
        el.classList.toggle('alerta', queda < 0);
        el.textContent =
          queda < 0
            ? t('Es {pasa} más de lo que te sobra: tu balance queda en {queda}. Si igual lo tenés, dale.', { pasa: plata(-queda), queda: plata(queda) })
            : t('Tu balance queda en {queda}.', { queda: plata(queda) });
        f.querySelectorAll('[data-origen]').forEach((c) =>
        c.addEventListener('click', () => {
          sonar('toque');
          elegirOrigen(c.dataset.origen);
          pasoMonto();
        }),
      );
      f.querySelectorAll('[data-parte]').forEach((c) => c.classList.toggle('activo', Math.round(flujo.disponible * Number(c.dataset.parte)) === m));
      };
      const ponerMonto = (m) => {
        f.monto.value = paraInput(m);
        f.queda.value = paraInput(saldo - m);
        cuenta();
      };
      ponerMonto(flujo.monto);
      f.monto.addEventListener('input', () => {
        const m = centavos(f.monto.value);
        if (m !== null) f.queda.value = paraInput(saldo - m);
        cuenta();
      });
      f.queda.addEventListener('input', () => {
        const q = centavos(f.queda.value, true);
        if (q !== null) f.monto.value = paraInput(Math.max(0, saldo - q));
        cuenta();
      });
      f.querySelectorAll('[data-parte]').forEach((c) =>
        c.addEventListener('click', () => {
          sonar('toque');
          ponerMonto(Math.round(flujo.disponible * Number(c.dataset.parte)));
        }),
      );
      f.onsubmit = (e) => {
        e.preventDefault();
        const m = centavos(f.monto.value);
        if (!m) return error(t('Poné cuánto guardás'));
        flujo.monto = m;
        sonar('pop');
        pasoDonde();
      };
    },
  );
}

function opcionesDonde() {
  const propios = cajon.bolsillos.filter((b) => !b.generico);
  const ya = (p) => propios.some((b) => b.nombre === t(p.nombre));
  return [
    ...propios.map((b) => ({ bolsillo: b, emoji: b.emoji, nombre: b.nombre, unidad: b.unidad })),
    ...PRESETS.filter((p) => !ya(p)).map((p) => ({ preset: p, emoji: p.emoji, nombre: t(p.nombre), unidad: p.unidad ?? monedaCuenta() })),
  ];
}

function pasoDonde() {
  const opciones = opcionesDonde();
  paso(
    `<h3>${t('¿Dónde lo guardás?')}</h3>
     <p class="ayuda">${t('{monto} van al cajón. Si los pasaste a otra cosa, elegila y te pregunto cuánto te quedó.', { monto: plata(flujo.monto) })}</p>
     <div class="cajon-opciones">
       ${opciones.map((o, i) => `<button type="button" class="cajon-opcion" data-i="${i}"><span>${esc(o.emoji)}</span><b>${esc(o.nombre)}</b><small>${esc(o.unidad)}</small></button>`).join('')}
       <button type="button" class="cajon-opcion nueva" data-nueva><span>➕</span><b>${t('Crear categoría')}</b></button>
     </div>
     <div class="acciones"><button type="button" class="boton" data-atras>${t('Atrás')}</button><button type="button" class="boton" data-omitir>${t('Omitir')}</button></div>
     <p class="ayuda centro">${t('Omitir lo deja en "Sin asignar" y lo repartís cuando quieras.')}</p>`,
    (f) => {
      f.querySelector('[data-atras]').addEventListener('click', pasoMonto);
      f.querySelector('[data-nueva]').addEventListener('click', () => pasoNuevaCategoria((b) => elegir({ preset: b })));
      f.querySelector('[data-omitir]').addEventListener('click', (e) => enviar(e.target, () => guardarAhorro(null, null)));
      f.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => elegir(opciones[Number(b.dataset.i)])));
    },
  );
}

function elegir(o) {
  sonar('toque');
  const b = o.bolsillo ?? { ...o.preset, nombre: t(o.preset.nombre), unidad: o.preset.unidad ?? monedaCuenta() };
  flujo.destino = { existente: o.bolsillo ?? null, datos: b };
  // En la moneda de la cuenta no hace falta preguntar: es lo mismo que sacaste.
  if (enMoneda(b)) return enviar(document.querySelector('#form-ahorro .boton'), () => guardarAhorro(flujo.destino, flujo.monto));
  pasoCantidad();
}

function pasoCantidad() {
  const b = flujo.destino.datos;
  paso(
    `<h3>${t('¿Cuántos {unidad} son?', { unidad: esc(b.unidad) })}</h3>
     <p class="ayuda">${t('Sacaste {monto}. Poné lo que te quedó en {nombre}: así solo te ocupás de lo que guardás.', { monto: plata(flujo.monto), nombre: `${esc(b.emoji)} ${esc(b.nombre)}` })}</p>
     <label class="campo monto-campo"><span>${esc(b.unidad)}</span><input name="cantidad" inputmode="decimal" autocomplete="off" placeholder="0" /></label>
     <div class="acciones"><button type="button" class="boton" data-atras>${t('Atrás')}</button><button type="submit" class="boton principal">${t('Guardar 🍌')}</button></div>`,
    (f) => {
      f.querySelector('[data-atras]').addEventListener('click', pasoDonde);
      f.onsubmit = (e) => {
        e.preventDefault();
        const c = leerCantidad(f.cantidad.value, b.decimales);
        if (!c) return error(t('Poné cuánto te quedó'));
        enviar(e.submitter ?? f.querySelector('[type=submit]'), () => guardarAhorro(flujo.destino, c));
      };
    },
  );
}

async function guardarAhorro(destino, cantidad) {
  let bolsilloId = destino?.existente?.id ?? null;
  if (destino && !bolsilloId) {
    const { nombre, emoji, unidad, decimales, cotizacion = null } = destino.datos;
    bolsilloId = (await llamar('POST', '/cajon/bolsillos', { nombre, emoji, unidad, decimales, cotizacion })).id;
  }
  const m = await llamar('POST', '/cajon/ahorrar', { monto: flujo.monto, origen: flujo.origen, bolsilloId, cantidad });
  document.getElementById('hoja-ahorro').close();
  sonar('fanfarria');
  volarBanana();
  ctx.saltoMono();
  await refrescar(true);
  const donde = destino ? destino.datos : { emoji: '🍌', nombre: t('Sin asignar') };
  tostadaDeshacer(t('{monto} al cajón, en {donde}', { monto: plata(flujo.monto), donde: `${donde.emoji} ${donde.nombre}` }), async () => {
    await llamar('DELETE', `/cajon/movimientos/${m.id}`);
    sonar('caer');
    await refrescar(true);
  });
}

function volarBanana() {
  const desde = document.getElementById('balance')?.getBoundingClientRect();
  const hacia = document.getElementById('boton-cajon')?.getBoundingClientRect();
  if (!desde || !hacia || !hacia.width) return;
  for (let i = 0; i < 5; i++) {
    const b = document.createElement('div');
    b.className = 'banana-voladora';
    b.textContent = '🍌';
    document.body.append(b);
    const x0 = desde.left + desde.width / 2 + (i - 2) * 14;
    const y0 = desde.top + desde.height / 2;
    const x1 = hacia.left + 28;
    const y1 = hacia.top + hacia.height / 2 - 12;
    b.animate(
      [
        { transform: `translate(${x0}px, ${y0}px) scale(0.4) rotate(0)`, opacity: 0 },
        { transform: `translate(${x0 + (i - 2) * 10}px, ${y0 - 60}px) scale(1.2) rotate(${(i - 2) * 30}deg)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${x1}px, ${y1}px) scale(0.7) rotate(360deg)`, opacity: 1, offset: 0.9 },
        { transform: `translate(${x1}px, ${y1}px) scale(0.2)`, opacity: 0 },
      ],
      { duration: 900 + i * 90, easing: 'cubic-bezier(.5,0,.3,1)' },
    ).finished.then(() => b.remove());
  }
  setTimeout(() => document.getElementById('boton-cajon')?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 300 }), 950);
}

function tostadaDeshacer(texto, deshacer) {
  document.querySelector('.cajon-tostada')?.remove();
  const el = document.createElement('div');
  el.className = 'tostada cajon-tostada';
  el.innerHTML = `<span></span><button type="button">${t('Deshacer')}</button>`;
  el.querySelector('span').textContent = texto;
  const chau = setTimeout(() => el.remove(), 7000);
  el.querySelector('button').addEventListener('click', async () => {
    clearTimeout(chau);
    el.remove();
    try {
      await deshacer();
    } catch (err) {
      ctx.avisar(err);
    }
  });
  document.body.append(el);
}

// ---------- Crear o editar un bolsillo ----------

// Con `b` edita ese bolsillo: nombre, emoji, unidad y cuánto vale cada unidad.
function pasoNuevaCategoria(listo, volver = pasoDonde, b = null) {
  let emoji = b?.emoji ?? '🐷';
  const unidades = [...new Set([monedaCuenta(), 'USD', 'EUR', 'BTC', 'ETH', 'USDT', 'g'])];
  let unidad = b ? (unidades.includes(b.unidad) ? b.unidad : null) : monedaCuenta();
  const etiqueta = (u) => (u === 'g' ? t('Oro (g)') : u);
  // Para lo que no es una moneda se puede poner el valor a mano (si cotiza, es opcional).
  const conValor = (u) => !MONEDAS_BASE.includes(u);
  paso(
    `<h3>${b ? t('Editar bolsillo') : t('Nueva categoría')}</h3>
     <label class="campo"><span>${t('¿Cómo se llama?')}</span><input name="nombre" maxlength="40" autocomplete="off" placeholder="${t('Viaje, dólares del colchón, ETH…')}" required /></label>
     <div class="emojis cajon-emojis">${[...new Set([emoji, ...EMOJIS])].map((e) => `<button type="button" class="emoji-boton${e === emoji ? ' activo' : ''}" data-emoji="${esc(e)}">${esc(e)}</button>`).join('')}</div>
     <fieldset class="grupo"><legend>${t('¿En qué lo contás?')}</legend>
       <div class="chips">${unidades.map((u) => `<button type="button" class="chip${u === unidad ? ' activo' : ''}" data-unidad="${u}">${etiqueta(u)}</button>`).join('')}<button type="button" class="chip${unidad ? '' : ' activo'}" data-otra>${t('Otra')}</button></div>
       <label class="campo" id="campo-unidad"${unidad ? ' hidden' : ''}><span>${t('Unidad (ETH, acciones, figuritas…)')}</span><input name="unidad" maxlength="10" autocomplete="off" /></label>
       <div id="campo-valor">${htmlValorUnidad(b)}</div>
     </fieldset>
     ${b?.cantidad ? `<p class="ayuda">${t('Lo guardado no cambia: si pasás de una moneda a otra, corregí el total después.')}</p>` : ''}
     <div class="acciones"><button type="button" class="boton" data-atras>${t('Atrás')}</button><button type="submit" class="boton principal">${b ? t('Guardar') : t('Seguir')}</button></div>`,
    (f) => {
      if (b) {
        f.nombre.value = b.nombre;
        if (!unidad) f.unidad.value = b.unidad;
        if (b.cotizacion) f.valorUnidad.value = paraInput(b.cotizacion.valor);
      }
      const elegida = () => (unidad ?? f.unidad.value.trim()).replace(/^G$/, 'g');
      const mostrarValor = () => {
        const u = elegida();
        const caja = document.getElementById('campo-valor');
        caja.hidden = !u || !conValor(u);
        if (caja.hidden) return;
        const mercado = enBase(10 ** 8, { unidad: u, decimales: 8 });
        caja.querySelector('span').textContent = t('¿Cuánto vale 1 {unidad}?', { unidad: u });
        f.valorUnidad.placeholder = mercado ? t('Hoy {valor} (mercado)', { valor: plataBase(mercado) }) : '0';
        caja.querySelector('.ayuda').textContent = mercado ? t('Vacío: uso la cotización del mercado.') : t('Con esto el cajón puede sumarlo al total.');
      };
      mostrarValor();
      f.unidad.addEventListener('input', mostrarValor);
      f.querySelector('[data-atras]').addEventListener('click', volver);
      f.querySelectorAll('[data-emoji]').forEach((x) =>
        x.addEventListener('click', () => {
          emoji = x.dataset.emoji;
          f.querySelectorAll('[data-emoji]').forEach((y) => y.classList.toggle('activo', y === x));
        }),
      );
      const chips = f.querySelectorAll('[data-unidad], [data-otra]');
      chips.forEach((x) =>
        x.addEventListener('click', () => {
          chips.forEach((y) => y.classList.toggle('activo', y === x));
          document.getElementById('campo-unidad').hidden = !('otra' in x.dataset);
          unidad = x.dataset.unidad ?? null;
          mostrarValor();
          if (!unidad) f.unidad.focus();
        }),
      );
      f.onsubmit = (e) => {
        e.preventDefault();
        const nombre = f.nombre.value.trim();
        const u = elegida();
        if (!nombre) return error(t('Ponele un nombre'));
        if (!u) return error(t('Elegí en qué lo contás'));
        const cotizacion = conValor(u) ? leerValorUnidad(f) : null;
        if (cotizacion === false) return error(t('Poné un valor válido'));
        const decimales = CRIPTO.test(u) ? 8 : 2;
        // Los decimales solo cambian con el bolsillo vacío (si no, cambiaría lo guardado).
        listo({ nombre, emoji, unidad: u, ...(b?.cantidad ? {} : { decimales }), cotizacion });
      };
    },
  );
}

// Cuánto vale 1 unidad, puesto a mano (para lo que no cotiza o para usar tu propio valor).
// Los textos los completa `mostrarValor` según la unidad elegida.
function htmlValorUnidad(b) {
  const moneda = b?.cotizacion?.moneda ?? monedaBase();
  return `<div class="valor-unidad">
      <label class="campo"><span></span><input name="valorUnidad" inputmode="decimal" autocomplete="off" /></label>
      <label class="campo"><span>${t('en')}</span><select name="monedaUnidad">${MONEDAS_BASE.map((m) => `<option${m === moneda ? ' selected' : ''}>${m}</option>`).join('')}</select></label>
    </div>
    <p class="ayuda"></p>`;
}

/** null si está vacío, false si es inválido. */
function leerValorUnidad(f) {
  if (!f.valorUnidad.value.trim()) return null;
  const valor = centavos(f.valorUnidad.value);
  return valor ? { moneda: f.monedaUnidad.value, valor } : false;
}

// ---------- El cajón ----------

export function abrirCajon() {
  sonar('pop');
  ordenando = false;
  pintarCajon();
  document.getElementById('hoja-cajon').showModal();
  Promise.all([cargarCajon(), cargarCotizaciones()]).then(() => document.getElementById('hoja-cajon').open && pintarCajon());
}

const TIPOS = {
  ahorro: ['🍌', 'Ahorro'],
  retiro: ['↩️', 'Volvió a la cuenta'],
  gasto: ['🛍️', 'Usaste'],
  ingreso: ['✨', 'Sumaste'],
  traspaso: ['↔️', 'Traspaso'],
};

let ordenando = false;

function pintarCajon() {
  const f = document.getElementById('form-cajon');
  const porId = new Map(cajon.bolsillos.map((b) => [b.id, b]));
  const visibles = cajon.bolsillos.filter((b) => !b.generico || b.cantidad);
  const fecha = (m) => (m.fecha ? new Date(m.fecha).toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) : '');
  f.innerHTML = `
    <h3>${t('🍌 Cajón de bananas')}</h3>
    ${htmlTotal(visibles)}
    <p class="ayuda">${t('Lo que guardaste y en qué. Tocá un bolsillo para editarlo: si lo cambiás, te pregunto en qué se usó.')}</p>
    ${visibles.length > 1 ? `<button type="button" class="chip chip-ordenar${ordenando ? ' activo' : ''}" data-ordenar>${ordenando ? t('✓ Listo') : t('↕️ Ordenar')}</button>` : ''}
    <ul class="bolsillos${ordenando ? ' ordenando' : ''}">${visibles
      .map(
        (b, i) => `<li>${
          ordenando
            ? `<span class="bolsillo-mover"><button type="button" class="mover" data-subir="${i}" aria-label="${t('Subir')}"${i ? '' : ' disabled'}>▲</button><button type="button" class="mover" data-bajar="${i}" aria-label="${t('Bajar')}"${i < visibles.length - 1 ? '' : ' disabled'}>▼</button></span>`
            : ''
        }<button type="button" class="bolsillo${b.generico ? ' generico' : ''}" data-b="${b.id}">
          <span class="bolsillo-emoji">${esc(b.emoji)}</span>
          <span class="bolsillo-info"><b>${esc(nombreDe(b))}</b>${b.generico ? `<small>${t('Tocá para repartirlo')}</small>` : ''}</span>
          <span class="bolsillo-cantidad${b.cantidad < 0 ? ' menos' : ''}">${esc(cantidadTexto(b.cantidad, b))}${equivalente(b)}</span></button></li>`,
      )
      .join('')}</ul>
    ${visibles.length ? '' : `<p class="vacio">${t('Todavía no guardaste nada. Cuando te sobre, tocá Ahorrar y Mona lo trae acá.')}</p>`}
    ${
      cajon.movimientos.length
        ? `<h4 class="subtitulo">${t('Historial')}</h4>
    <ul class="historial">${cajon.movimientos
      .slice(0, 60)
      .map((m) => {
        const b = porId.get(m.bolsilloId);
        if (!b) return '';
        const [icono, nombre] = TIPOS[m.tipo] ?? ['•', m.tipo];
        const signo = m.cantidad > 0 ? '+' : '−';
        return `<li><button type="button" class="movimiento" data-m="${m.id}">
          <span>${icono}</span>
          <span class="movimiento-info"><b>${t(nombre)} · ${esc(b.emoji)} ${esc(nombreDe(b))}</b><small>${esc(fecha(m))}${m.detalle ? ` · ${esc(m.detalle)}` : ''}${m.monto ? ` · ${plata(m.monto)}` : ''}</small></span>
          <span class="${m.cantidad > 0 ? 'mas' : 'menos'}">${signo}${esc(cantidadTexto(Math.abs(m.cantidad), b))}</span></button></li>`;
      })
      .join('')}</ul>`
        : ''
    }
    <div class="acciones">
      <button type="button" class="boton" data-nuevo>${t('Nuevo bolsillo')}</button>
      <button type="button" class="boton" data-cerrar-cajon>${t('Cerrar')}</button>
      ${ctx.estado.mesVisto === ctx.mesActual ? `<button type="button" class="boton principal" data-ahorrar>${t('Ahorrar 🍌')}</button>` : ''}
    </div>`;
  f.querySelector('#cajon-base')?.addEventListener('change', (e) => cambiarBase(e.target.value));
  f.querySelector('[data-cerrar-cajon]').addEventListener('click', () => document.getElementById('hoja-cajon').close());
  f.querySelector('[data-ahorrar]')?.addEventListener('click', () => {
    const p = ctx.partido();
    abrirAhorrar(p.acumulado > 0 || p.delMes <= 0 ? 'acumulado' : 'mes');
  });
  f.querySelector('[data-nuevo]').addEventListener('click', () =>
    pasoNuevaCategoria(
      (b) =>
        enviar(document.querySelector('#form-ahorro [type=submit]'), async () => {
          await llamar('POST', '/cajon/bolsillos', b);
          document.getElementById('hoja-ahorro').close();
          sonar('pop');
          await refrescar(false);
        }),
      () => document.getElementById('hoja-ahorro').close(),
    ),
  );
  f.querySelectorAll('[data-b]').forEach((el) => el.addEventListener('click', () => !ordenando && abrirBolsillo(porId.get(el.dataset.b))));
  f.querySelector('[data-ordenar]')?.addEventListener('click', () => {
    sonar('toque');
    ordenando = !ordenando;
    pintarCajon();
  });
  const mover = (i, j) => {
    sonar('pop');
    const ids = visibles.map((b) => b.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    // Se ve al instante; los que no están visibles (un "Sin asignar" vacío) quedan al final.
    cajon.bolsillos.sort((a, b) => (ids.indexOf(a.id) + 1 || 999) - (ids.indexOf(b.id) + 1 || 999));
    pintarCajon();
    llamar('PUT', '/cajon/orden', { ids }).catch(ctx.avisar);
  };
  f.querySelectorAll('[data-subir]').forEach((el) => el.addEventListener('click', () => mover(+el.dataset.subir, +el.dataset.subir - 1)));
  f.querySelectorAll('[data-bajar]').forEach((el) => el.addEventListener('click', () => mover(+el.dataset.bajar, +el.dataset.bajar + 1)));
  f.querySelectorAll('[data-m]').forEach((el) => el.addEventListener('click', () => abrirMovimiento(cajon.movimientos.find((m) => m.id === el.dataset.m))));
}

function htmlTotal(visibles) {
  if (!visibles.length) return '';
  const valores = visibles.map((b) => enBase(b.cantidad, b));
  const total = valores.reduce((s, v) => s + (v ?? 0), 0);
  const sinCotizar = valores.filter((v) => v === null).length;
  const hora = cotizaciones ? new Date(cotizaciones.fecha).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : '';
  return `<div class="cajon-total">
      <small>${t('Tu cajón vale')}</small>
      <b>≈ ${plataBase(total)}</b>
      <small>${
        cotizaciones ? t('Con la cotización de hoy ({hora})', { hora }) : t('Sin cotizaciones ahora: cuento solo lo que está en {moneda}', { moneda: monedaBase() })
      }${sinCotizar ? ` · ${t('{n} sin cotización', { n: sinCotizar })}` : ''}</small>
      <label class="cajon-base">${t('Ver en')} <select id="cajon-base">${MONEDAS_BASE.map((m) => `<option${m === monedaBase() ? ' selected' : ''}>${m}</option>`).join('')}</select></label>
    </div>`;
}

function equivalente(b) {
  if (b.unidad === monedaBase() || !b.cantidad) return '';
  const v = enBase(b.cantidad, b);
  return v === null ? '' : `<small>≈ ${esc(plataBase(v))}</small>`;
}

async function cambiarBase(moneda) {
  sonar('toque');
  ctx.estado.perfil = { ...(ctx.estado.perfil ?? {}), monedaCajon: moneda };
  pintarCajon();
  if (ctx.estado.modo === 'real') await api('PATCH', '/perfil', { monedaCajon: moneda }).catch(ctx.avisar);
}

// ---------- Un bolsillo: editar el total, volver a la cuenta, pasar a otro ----------

function abrirBolsillo(b) {
  sonar('toque');
  if (b.generico) return pasoTraspaso(b);
  paso(
    `<h3>${esc(b.emoji)} ${esc(b.nombre)}</h3>
     <label class="campo monto-campo"><span>${t('¿Cuánto tenés? ({unidad})', { unidad: esc(b.unidad) })}</span><input name="cantidad" inputmode="text" autocomplete="off" data-monto /></label>
     <p class="ayuda">${t('Si cambiás el total, te pregunto en qué se usó o de dónde salió. Queda en el historial y no toca los gastos del mes.')}</p>
     <p class="ayuda">${t('¿Es plata de otro que tenés guardada? Ponela en negativo (-200) y resta del total.')}</p>
     <div class="chips">
       <button type="button" class="chip" data-editar>${t('✏️ Nombre, moneda y valor')}</button>
       ${b.cantidad > 0 ? `<button type="button" class="chip" data-retirar>${t('↩️ Volver a la cuenta')}</button>` : ''}
       ${b.cantidad > 0 && cajon.bolsillos.length > 1 ? `<button type="button" class="chip" data-pasar>${t('↔️ Pasar a otro bolsillo')}</button>` : ''}
       ${b.cantidad ? '' : `<button type="button" class="chip peligro" data-borrar>${t('🗑️ Borrar bolsillo')}</button>`}
     </div>
     <div class="acciones"><button type="button" class="boton" data-cerrar-ahorro>${t('Cerrar')}</button><button type="submit" class="boton principal">${t('Guardar')}</button></div>`,
    (f) => {
      f.cantidad.value = paraInput(b.cantidad, b.decimales);
      f.querySelector('[data-editar]').addEventListener('click', () => pasoEditarBolsillo(b));
      f.querySelector('[data-retirar]')?.addEventListener('click', () => pasoRetirar(b));
      f.querySelector('[data-pasar]')?.addEventListener('click', () => pasoTraspaso(b));
      f.querySelector('[data-borrar]')?.addEventListener('click', (e) =>
        enviar(e.target, async () => {
          await llamar('DELETE', `/cajon/bolsillos/${b.id}`);
          document.getElementById('hoja-ahorro').close();
          sonar('caer');
          await refrescar(false);
        }),
      );
      f.onsubmit = (e) => {
        e.preventDefault();
        const nueva = leerCantidad(f.cantidad.value, b.decimales, true);
        if (nueva === null) return error(t('Poné cuánto tenés'));
        if (nueva !== b.cantidad) return pasoDetalle(b, nueva);
        document.getElementById('hoja-ahorro').close();
      };
    },
  );
}

function pasoEditarBolsillo(b) {
  pasoNuevaCategoria(
    (cambios) =>
      enviar(document.querySelector('#form-ahorro [type=submit]'), async () => {
        await llamar('PATCH', `/cajon/bolsillos/${b.id}`, cambios);
        document.getElementById('hoja-ahorro').close();
        sonar('pop');
        await refrescar(false);
      }),
    () => abrirBolsillo(b),
    b,
  );
}

function pasoDetalle(b, nueva) {
  const dif = nueva - b.cantidad;
  const sugerencias = dif < 0 ? ['Viaje', 'Emergencia', 'Regalo', 'Compra grande', 'Salud'] : ['Intereses', 'Regalo', 'Aguinaldo', 'Venta', 'Me había olvidado'];
  paso(
    `<h3>${dif < 0 ? t('¿En qué se fueron los {dif}?', { dif: esc(cantidadTexto(-dif, b)) }) : t('¿De dónde salieron los {dif}?', { dif: esc(cantidadTexto(dif, b)) })}</h3>
     <p class="ayuda">${t('Así después ves cómo fueron cambiando tus ahorros.')}</p>
     <div class="chips">${sugerencias.map((s) => `<button type="button" class="chip" data-s="${t(s)}">${t(s)}</button>`).join('')}</div>
     <label class="campo"><span>${t('Detalle')}</span><input name="detalle" maxlength="120" autocomplete="off" /></label>
     <div class="acciones"><button type="button" class="boton" data-atras>${t('Atrás')}</button><button type="submit" class="boton principal">${t('Listo')}</button></div>`,
    (f) => {
      f.querySelector('[data-atras]').addEventListener('click', () => abrirBolsillo(b));
      f.querySelectorAll('[data-s]').forEach((c) =>
        c.addEventListener('click', () => {
          f.detalle.value = c.dataset.s;
          f.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('activo', x === c));
        }),
      );
      f.onsubmit = (e) => {
        e.preventDefault();
        enviar(f.querySelector('[type=submit]'), async () => {
          await llamar('POST', `/cajon/bolsillos/${b.id}/ajustar`, { cantidad: nueva, detalle: f.detalle.value.trim() });
          document.getElementById('hoja-ahorro').close();
          sonar(dif < 0 ? 'moneda' : 'fanfarria');
          await refrescar(false);
        });
      };
    },
  );
}

function pasoRetirar(b) {
  const misma = enMoneda(b);
  paso(
    `<h3>${t('↩️ Volver a la cuenta')}</h3>
     <p class="ayuda">${t('Para cuando el ahorro tiene que salvar el mes: sale de {nombre} y entra a tu saldo.', { nombre: `${esc(b.emoji)} ${esc(b.nombre)}` })}</p>
     <label class="campo monto-campo"><span>${t('¿Cuánto sacás? ({unidad})', { unidad: esc(b.unidad) })}</span><input name="cantidad" inputmode="decimal" autocomplete="off" /></label>
     ${misma ? '' : `<label class="campo monto-campo"><span>${t('¿Cuánta plata entra a tu cuenta?')}</span><input name="monto" inputmode="decimal" autocomplete="off" placeholder="0" /></label>`}
     <div class="acciones"><button type="button" class="boton" data-atras>${t('Atrás')}</button><button type="submit" class="boton principal">${t('Volver a la cuenta')}</button></div>`,
    (f) => {
      f.cantidad.value = paraInput(b.cantidad, b.decimales);
      f.querySelector('[data-atras]').addEventListener('click', () => abrirBolsillo(b));
      f.onsubmit = (e) => {
        e.preventDefault();
        const cantidad = leerCantidad(f.cantidad.value, b.decimales);
        const monto = misma ? cantidad : centavos(f.monto.value);
        if (!cantidad) return error(t('Poné cuánto sacás'));
        if (cantidad > b.cantidad) return error(t('No tenés tanto en ese bolsillo'));
        if (!monto) return error(t('Poné cuánta plata entra'));
        enviar(f.querySelector('[type=submit]'), async () => {
          await llamar('POST', `/cajon/bolsillos/${b.id}/retirar`, { cantidad, monto });
          document.getElementById('hoja-ahorro').close();
          sonar('moneda');
          await refrescar(true);
          ctx.alertaSuave(t('Entraron {monto} a tu saldo', { monto: plata(monto) }), '↩️');
        });
      };
    },
  );
}

function pasoTraspaso(desde) {
  const otros = cajon.bolsillos.filter((b) => b.id !== desde.id && !b.generico);
  let hacia = otros[0] ?? null;
  paso(
    `<h3>${desde.generico ? t('🍌 Repartir lo sin asignar') : t('↔️ Pasar a otro bolsillo')}</h3>
     <p class="ayuda">${t('Tenés {cantidad} en {nombre}.', { cantidad: esc(cantidadTexto(desde.cantidad, desde)), nombre: `${esc(desde.emoji)} ${esc(nombreDe(desde))}` })}</p>
     <div class="cajon-opciones">
       ${otros.map((b) => `<button type="button" class="cajon-opcion" data-h="${b.id}"><span>${esc(b.emoji)}</span><b>${esc(b.nombre)}</b><small>${esc(b.unidad)}</small></button>`).join('')}
       <button type="button" class="cajon-opcion nueva" data-nueva><span>➕</span><b>${t('Crear categoría')}</b></button>
     </div>
     <label class="campo monto-campo"><span>${t('¿Cuánto sacás? ({unidad})', { unidad: esc(desde.unidad) })}</span><input name="cantidad" inputmode="decimal" autocomplete="off" /></label>
     <label class="campo monto-campo" id="campo-entra"><span id="etiqueta-entra"></span><input name="entra" inputmode="decimal" autocomplete="off" placeholder="0" /></label>
     <div class="acciones">${desde.generico ? `<button type="button" class="boton" data-cerrar-ahorro>${t('Cerrar')}</button>` : `<button type="button" class="boton" data-atras>${t('Atrás')}</button>`}<button type="submit" class="boton principal">${t('Pasar')}</button></div>`,
    (f) => {
      f.cantidad.value = paraInput(desde.cantidad, desde.decimales);
      const marcar = () => {
        f.querySelectorAll('[data-h]').forEach((x) => x.classList.toggle('activo', x.dataset.h === hacia?.id));
        const distinta = hacia && (hacia.unidad !== desde.unidad || hacia.decimales !== desde.decimales);
        document.getElementById('campo-entra').hidden = !distinta;
        if (distinta) document.getElementById('etiqueta-entra').textContent = t('¿Cuántos {unidad} te quedaron?', { unidad: hacia.unidad });
      };
      marcar();
      f.querySelector('[data-atras]')?.addEventListener('click', () => abrirBolsillo(desde));
      f.querySelectorAll('[data-h]').forEach((el) =>
        el.addEventListener('click', () => {
          sonar('toque');
          hacia = otros.find((b) => b.id === el.dataset.h);
          marcar();
        }),
      );
      f.querySelector('[data-nueva]').addEventListener('click', () =>
        pasoNuevaCategoria(
          (nuevo) =>
            enviar(document.querySelector('#form-ahorro [type=submit]'), async () => {
              const creado = await llamar('POST', '/cajon/bolsillos', nuevo);
              await refrescar(false);
              pasoTraspaso({ ...desde });
              hacia = creado;
              const f2 = document.getElementById('form-ahorro');
              f2.querySelector(`[data-h="${creado.id}"]`)?.click();
            }),
          () => pasoTraspaso(desde),
        ),
      );
      f.onsubmit = (e) => {
        e.preventDefault();
        if (!hacia) return error(t('Elegí adónde va'));
        const cantidad = leerCantidad(f.cantidad.value, desde.decimales);
        if (!cantidad) return error(t('Poné cuánto sacás'));
        if (cantidad > desde.cantidad) return error(t('No tenés tanto en ese bolsillo'));
        const distinta = hacia.unidad !== desde.unidad || hacia.decimales !== desde.decimales;
        const cantidadEntra = distinta ? leerCantidad(f.entra.value, hacia.decimales) : null;
        if (distinta && !cantidadEntra) return error(t('Poné cuánto te quedó'));
        enviar(f.querySelector('[type=submit]'), async () => {
          await llamar('POST', '/cajon/traspasar', { desde: desde.id, hacia: hacia.id, cantidad, cantidadEntra });
          document.getElementById('hoja-ahorro').close();
          sonar('pop');
          await refrescar(false);
        });
      };
    },
  );
}

// ---------- Corregir un movimiento ----------

function abrirMovimiento(m) {
  const b = cajon.bolsillos.find((x) => x.id === m.bolsilloId);
  if (!b) return;
  sonar('toque');
  const tocaSaldo = m.tipo === 'ahorro' || m.tipo === 'retiro';
  const conCantidad = m.tipo !== 'traspaso' && !(tocaSaldo && enMoneda(b) && m.cantidad === (m.tipo === 'ahorro' ? m.monto : -m.monto));
  const [icono, nombre] = TIPOS[m.tipo] ?? ['•', m.tipo];
  paso(
    `<h3>${icono} ${t(nombre)} · ${esc(b.emoji)} ${esc(nombreDe(b))}</h3>
     ${tocaSaldo ? `<label class="campo monto-campo"><span>${m.tipo === 'ahorro' ? t('Plata que salió de tu cuenta') : t('Plata que entró a tu cuenta')}</span><input name="monto" inputmode="decimal" autocomplete="off" /></label>` : ''}
     ${conCantidad ? `<label class="campo monto-campo"><span>${esc(b.unidad)}</span><input name="cantidad" inputmode="decimal" autocomplete="off" /></label>` : ''}
     ${m.tipo === 'traspaso' ? `<p class="ayuda">${t('Un traspaso no se edita: borralo y hacelo de nuevo.')}</p>` : ''}
     <label class="campo"><span>${t('Detalle')}</span><input name="detalle" maxlength="120" autocomplete="off" /></label>
     ${tocaSaldo ? `<p class="ayuda">${t('Si cambiás o borrás esto, tu saldo se corrige solo.')}</p>` : ''}
     <div class="acciones"><button type="button" class="boton peligro" data-borrar>${t('Borrar')}</button><button type="button" class="boton" data-cerrar-ahorro>${t('Cancelar')}</button><button type="submit" class="boton principal">${t('Guardar')}</button></div>`,
    (f) => {
      if (f.monto) f.monto.value = paraInput(m.monto);
      if (f.cantidad) f.cantidad.value = paraInput(Math.abs(m.cantidad), b.decimales);
      f.detalle.value = m.detalle ?? '';
      f.querySelector('[data-borrar]').addEventListener('click', (e) =>
        enviar(e.target, async () => {
          await llamar('DELETE', `/cajon/movimientos/${m.id}`);
          document.getElementById('hoja-ahorro').close();
          sonar('caer');
          await refrescar(tocaSaldo);
        }),
      );
      f.onsubmit = (e) => {
        e.preventDefault();
        const cambios = { detalle: f.detalle.value.trim() };
        if (f.monto) {
          cambios.monto = centavos(f.monto.value);
          if (!cambios.monto) return error(t('Poné un monto válido'));
          // En la moneda de la cuenta, cantidad y monto van juntos.
          if (!conCantidad && m.tipo !== 'traspaso') cambios.cantidad = cambios.monto;
        }
        if (f.cantidad) {
          cambios.cantidad = leerCantidad(f.cantidad.value, b.decimales);
          if (!cambios.cantidad) return error(t('Poné cuánto'));
        }
        enviar(f.querySelector('[type=submit]'), async () => {
          await llamar('PATCH', `/cajon/movimientos/${m.id}`, cambios);
          document.getElementById('hoja-ahorro').close();
          sonar('pop');
          await refrescar(tocaSaldo);
        });
      };
    },
  );
}
