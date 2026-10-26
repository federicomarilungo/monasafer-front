// Cuentas del saldo (Fede, 26/10/2026): la plata del mes puede estar en varios lados
// (banco, Mercado Pago, efectivo, dólares). La principal es el saldo de siempre; las otras
// viven aparte, cada una en su moneda, y el saldo que mira el motor es la suma pasada a la
// moneda de la cuenta con la cotización de hoy. Quien no crea ninguna no ve nada distinto.
// Pagar un gasto y usar una reserva salen de la principal.
import { api } from './api.js';
import { centavos, paraEditar } from './formato.js';
import { locale, t } from './i18n.js';
import { sonar } from './sonidos.js';
import { convertirHoy } from './cajon.js';

let ctx = null;
const $ = (id) => document.getElementById(id);
const MONEDAS = ['USD', 'ARS', 'EUR', 'BRL', 'MXN', 'CLP', 'COP', 'UYU', 'PEN'];
const EMOJIS = ['💳', '🏦', '💵', '💶', '💴', '💷', '🪙', '💰', '👛', '🐷', '📱', '💙', '💜', '🟢', '🟡', '🇦🇷', '🇺🇸', '🇪🇺', '🇧🇷', '🇺🇾', '🇨🇱', '🇲🇽', '🇨🇴', '🇵🇪', '🏠', '✈️', '🍌'];

/** Grilla de emojis como la de los gastos: el elegido queda marcado. */
function pintarEmojis(elegido) {
  const f = $('form-cuenta-saldo');
  f.emoji.value = elegido;
  const lista = [...new Set([elegido, ...EMOJIS].filter(Boolean))];
  $('emojis-cuenta').replaceChildren(
    ...lista.map((e) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `emoji-boton${e === elegido ? ' activo' : ''}`;
      b.textContent = e;
      b.addEventListener('click', () => {
        sonar('pop');
        f.emoji.value = e;
        for (const x of $('emojis-cuenta').children) x.classList.toggle('activo', x === b);
      });
      return b;
    }),
  );
}

const moneda = () => ctx.estado.perfil?.moneda ?? 'USD';
export const cuentas = () => ctx.estado.datos?.cuentas ?? [];
export const hayCuentas = () => cuentas().length > 0;
export const nombrePrincipal = () => ctx.estado.perfil?.nombreCuentaPrincipal || t('Cuenta principal');
/** Lo que hay en las otras cuentas, en la moneda de la persona (ya sumado a perfil.saldo). */
export const enOtras = () => ctx.estado.datos?.enOtras ?? 0;
export const saldoPrincipal = () => ctx.estado.datos.perfil.saldo - enOtras();
export const cuentaDe = (id) => cuentas().find((c) => c.id === id) ?? null;
export const monedaDe = (id) => (id && id !== 'principal' ? cuentaDe(id)?.moneda : null) ?? moneda();

export const plataEn = (c, codigo) =>
  new Intl.NumberFormat(locale(), { style: 'currency', currency: codigo, maximumFractionDigits: 0 }).format(c / 100);

export function iniciarCuentas(contexto) {
  ctx = contexto;
}

/** Suma las otras cuentas al saldo, después de leer /datos (o de cambiarlas en la demo). */
export async function sumarCuentas(datos, perfil) {
  datos.cuentas ??= [];
  let total = 0;
  let sinCotizar = false;
  for (const c of datos.cuentas) {
    const v = await convertirHoy(c.saldo, c.moneda, perfil?.moneda ?? 'USD');
    if (v === null) sinCotizar = true;
    else total += v;
  }
  datos.enOtras = total;
  datos.cuentasSinCotizar = sinCotizar;
  datos.perfil.saldo += total;
}

/** Lo mismo que el back, en la demo en memoria. `p.saldo` es la principal. */
async function hacer(real, demo) {
  const e = ctx.estado;
  if (e.modo === 'real') {
    const r = await real();
    await ctx.recargar();
    ctx.pintar();
    return r;
  }
  const d = e.datos;
  d.cuentas ??= [];
  const p = { saldo: d.perfil.saldo - (d.enOtras ?? 0) };
  const r = demo(d, p);
  d.perfil.saldo = p.saldo;
  await sumarCuentas(d, e.perfil);
  ctx.pintar();
  return r;
}

export const accionesCuentas = {
  crear: (c) =>
    hacer(
      () => api('POST', '/cuentas', c),
      (d) => {
        const nueva = { id: `demo-c${Date.now()}`, ...c };
        d.cuentas.push(nueva);
        return nueva;
      },
    ),
  editar: (id, cambios) =>
    id === 'principal'
      ? hacer(
          () => api('PATCH', '/perfil', { nombreCuentaPrincipal: cambios.nombre, saldo: cambios.saldo }),
          (d, p) => {
            p.saldo = cambios.saldo;
            ctx.estado.perfil.nombreCuentaPrincipal = cambios.nombre;
          },
        )
      : hacer(
          () => api('PATCH', `/cuentas/${id}`, cambios),
          (d) => Object.assign(d.cuentas.find((c) => c.id === id), cambios),
        ),
  borrar: (id) =>
    hacer(
      () => api('DELETE', `/cuentas/${id}`),
      (d) => {
        if (d.cuentas.find((c) => c.id === id)?.saldo) throw new Error(t('Pasá la plata a otra cuenta antes de borrarla'));
        d.cuentas = d.cuentas.filter((c) => c.id !== id);
      },
    ),
  traspasar: (desde, hacia, monto, montoEntra) =>
    hacer(
      () => api('POST', '/cuentas/traspasar', { desde, hacia, monto, montoEntra }),
      (d, p) => {
        const mover = (id, delta) => (id === 'principal' ? (p.saldo += delta) : (d.cuentas.find((c) => c.id === id).saldo += delta));
        mover(desde, -monto);
        mover(hacia, monedaDe(desde) === monedaDe(hacia) ? monto : montoEntra);
      },
    ),
};

/**
 * Adónde entró la plata, en la hoja "¿Te entró plata?". Sin cuentas, solo un link para
 * crear una (así el novato no ve nada nuevo); con cuentas, una fila de chips.
 */
export function pintarDestinos(el, elegida, alElegir, alPedirNueva) {
  el.replaceChildren();
  if (!hayCuentas()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'boton enlace chico';
    b.textContent = t('＋ Entró a otra cuenta o en otra moneda');
    b.addEventListener('click', alPedirNueva);
    el.append(b);
    return;
  }
  const titulo = document.createElement('p');
  titulo.className = 'etiqueta';
  titulo.textContent = t('¿Adónde entró?');
  const chips = document.createElement('div');
  chips.className = 'chips';
  const opciones = [{ id: 'principal', texto: `🏦 ${nombrePrincipal()}` }, ...cuentas().map((c) => ({ id: c.id, texto: `${c.emoji || '💳'} ${c.nombre}${c.moneda !== moneda() ? ` · ${c.moneda}` : ''}` }))];
  for (const o of opciones) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `chip${o.id === elegida ? ' activo' : ''}`;
    b.textContent = o.texto;
    b.addEventListener('click', () => {
      sonar('pop');
      alElegir(o.id);
    });
    chips.append(b);
  }
  const nueva = document.createElement('button');
  nueva.type = 'button';
  nueva.className = 'chip';
  nueva.textContent = t('＋ Nueva');
  nueva.addEventListener('click', alPedirNueva);
  chips.append(nueva);
  el.append(titulo, chips);
}

/** Las cuentas en "Tu plata": cada una se toca para editarla o pasar plata. */
export function pintarListaCuentas(el, alAbrir) {
  el.replaceChildren();
  const ul = document.createElement('ul');
  ul.className = 'lista-cuentas';
  const filas = [{ id: 'principal', emoji: '🏦', nombre: nombrePrincipal(), saldo: saldoPrincipal(), moneda: moneda() }, ...cuentas()];
  for (const c of filas) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fila-cuenta';
    const n = document.createElement('span');
    n.textContent = `${c.emoji || '💳'} ${c.nombre}`;
    const v = document.createElement('b');
    v.textContent = plataEn(c.saldo, c.moneda);
    b.append(n, v);
    b.addEventListener('click', () => alAbrir(c.id));
    li.append(b);
    ul.append(li);
  }
  const total = document.createElement('p');
  total.className = 'ayuda';
  total.textContent = ctx.estado.datos.cuentasSinCotizar
    ? t('Sin cotizaciones ahora: el saldo cuenta solo lo que está en {moneda}', { moneda: moneda() })
    : t('En total: {monto}', { monto: plataEn(ctx.estado.datos.perfil.saldo, moneda()) });
  el.append(ul, total);
}

// ---------- Hoja de una cuenta: crear, editar, pasar plata, borrar ----------

let abierta = null;
let alTerminar = null;

/** `id`: null para una nueva, 'principal' o el id de una cuenta. `listo(cuenta)` al guardar o cerrar. */
export function abrirCuenta(id, listo = null) {
  const f = $('form-cuenta-saldo');
  f.reset();
  error(null);
  alTerminar = listo;
  const c = id === 'principal' ? { id, emoji: '🏦', nombre: nombrePrincipal(), saldo: saldoPrincipal(), moneda: moneda() } : id ? cuentaDe(id) : null;
  abierta = c;
  $('titulo-cuenta-saldo').textContent = c ? `${c.emoji || '💳'} ${c.nombre}` : t('Otra cuenta');
  pintarEmojis(c?.emoji || '💳');
  $('campo-emoji-cuenta').hidden = id === 'principal';
  f.nombre.value = c?.nombre ?? '';
  f.moneda.replaceChildren(...MONEDAS.map((m) => new Option(m, m, false, m === (c?.moneda ?? moneda()))));
  $('campo-moneda-cuenta').hidden = !!c;
  f.saldo.value = c ? paraEditar(c.saldo) : '';
  $('ayuda-cuenta-saldo').hidden = !!c;
  $('boton-borrar-cuenta').hidden = !c || id === 'principal';
  const otras = c ? [{ id: 'principal', nombre: nombrePrincipal(), moneda: moneda() }, ...cuentas()].filter((x) => x.id !== c.id) : [];
  $('pasar-cuenta').hidden = !otras.length;
  $('pasar-cuenta').open = false;
  f.hacia.replaceChildren(...otras.map((x) => new Option(`${x.nombre} (${x.moneda})`, x.id)));
  pintarLlega();
  $('hoja-cuenta-saldo').showModal();
  if (!c) f.nombre.focus();
}

function error(msg) {
  if (msg) sonar('error');
  $('error-cuenta-saldo').hidden = !msg;
  $('error-cuenta-saldo').textContent = msg ?? '';
}

/** Entre monedas distintas se pregunta cuánto llega, con la cotización de hoy de sugerencia. */
async function pintarLlega() {
  const f = $('form-cuenta-saldo');
  if (!abierta || !f.hacia.value) return;
  const de = abierta.moneda;
  const a = monedaDe(f.hacia.value);
  $('campo-llega').hidden = de === a;
  $('etiqueta-pasar').textContent = t('¿Cuánto pasás? ({moneda})', { moneda: de });
  $('etiqueta-llega').textContent = t('¿Cuánto llega? ({moneda})', { moneda: a });
  const monto = centavos(f.pasar.value);
  if (de !== a && monto) {
    const v = await convertirHoy(monto, de, a);
    if (v !== null) f.llega.value = paraEditar(v);
  }
}

function cerrar(c) {
  $('hoja-cuenta-saldo').close();
  const listo = alTerminar;
  alTerminar = null;
  listo?.(c);
}

export function escucharHojaCuenta() {
  const f = $('form-cuenta-saldo');
  f.hacia.addEventListener('change', pintarLlega);
  f.pasar.addEventListener('input', pintarLlega);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = f.nombre.value.trim();
    if (!nombre) return error(t('Ponele un nombre'));
    const saldo = f.saldo.value.trim() ? centavos(f.saldo.value, true) : 0;
    if (saldo === null) return error(t('Monto inválido'));
    try {
      let c;
      if (abierta) {
        await accionesCuentas.editar(abierta.id, abierta.id === 'principal' ? { nombre, saldo } : { nombre, emoji: f.emoji.value.trim(), saldo });
        c = abierta.id === 'principal' ? { id: 'principal' } : cuentaDe(abierta.id);
      } else {
        c = await accionesCuentas.crear({ nombre, emoji: f.emoji.value.trim(), moneda: f.moneda.value, saldo });
      }
      sonar('pop');
      cerrar(c);
    } catch (err) {
      error(err.message);
    }
  });
  $('boton-pasar').addEventListener('click', async () => {
    const monto = centavos(f.pasar.value);
    if (!monto) return error(t('Poné cuánto pasás'));
    const hacia = f.hacia.value;
    const otraMoneda = abierta.moneda !== monedaDe(hacia);
    const llega = otraMoneda ? centavos(f.llega.value) : null;
    if (otraMoneda && !llega) return error(t('Poné cuánto llega'));
    try {
      await accionesCuentas.traspasar(abierta.id, hacia, monto, llega);
      sonar('moneda');
      ctx.alertaSuave(t('Pasaste {monto} a {cuenta}', { monto: plataEn(monto, abierta.moneda), cuenta: hacia === 'principal' ? nombrePrincipal() : cuentaDe(hacia)?.nombre ?? '' }), '🔁');
      cerrar(abierta);
    } catch (err) {
      error(err.message);
    }
  });
  $('boton-borrar-cuenta').addEventListener('click', async () => {
    if (abierta.saldo) return error(t('Pasá la plata a otra cuenta antes de borrarla'));
    try {
      await accionesCuentas.borrar(abierta.id);
      sonar('caer');
      cerrar(null);
    } catch (err) {
      error(err.message);
    }
  });
}
