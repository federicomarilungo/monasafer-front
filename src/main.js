import './estilos.css';
import { mesDe, resumenDelMes, sumarMeses } from './motor.js';
import { animoPara, cosquillas, frases, svgMono } from './mono.js';
import { datosDemo } from './demo.js';
import { mostrarBotonGoogle, olvidarGoogle } from './google.js';
import { api, ErrorApi, guardarToken, hayToken } from './api.js';
import { centavos, plata, nombreMes, configurarMoneda } from './formato.js';
import { alternarSilencio, estaSilenciado, sonar } from './sonidos.js';
import { iniciarOnboarding } from './onboarding.js';
import { htmlMetricas } from './metricas.js';
import { aplicarIdioma, cambiarIdioma, idiomaActual, IDIOMAS, locale, t } from './i18n.js';

const $ = (id) => document.getElementById(id);
const hoy = new Date();
const mesActual = mesDe(hoy);

// modo: 'real' (API) o 'demo' (todo en memoria, mismas reglas)
const estado = { modo: 'demo', datos: null, perfil: null, mesVisto: mesActual, balanceMostrado: 0, resumenMostrado: null };

// ---------- Entrada ----------

let modoEntrada = 'login';

function mostrarEntrada() {
  $('pantalla-app').hidden = true;
  $('pantalla-onboarding').hidden = true;
  $('pantalla-entrada').hidden = false;
  $('mono-entrada').innerHTML = svgMono('feliz');
  mostrarBotonGoogle($('boton-google'), entrarConGoogle).then((hay) => ($('google-entrada').hidden = !hay));
}

async function entrarConGoogle(credencial) {
  mostrarError('error-entrada', null);
  try {
    const r = await api('POST', '/auth/google', { credencial });
    guardarToken(r.token);
    if (r.nuevo && idiomaActual() !== 'es') await api('PATCH', '/perfil', { idioma: idiomaActual() }).catch(() => {});
    await entrarConToken(r.token);
  } catch (err) {
    mostrarError('error-entrada', err.message);
  }
}

async function entrarConToken(token) {
  guardarToken(token);
  estado.modo = 'real';
  await cargar();
  entrarApp();
}

document.querySelectorAll('.pestana').forEach((b) =>
  b.addEventListener('click', () => {
    modoEntrada = b.dataset.modo;
    document.querySelectorAll('.pestana').forEach((x) => x.classList.toggle('activa', x === b));
    $('campo-nombre').hidden = modoEntrada !== 'registro';
    $('boton-entrada').textContent = modoEntrada === 'registro' ? t('Crear cuenta') : t('Entrar');
    $('form-entrada').clave.autocomplete = modoEntrada === 'registro' ? 'new-password' : 'current-password';
  }),
);

$('form-entrada').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  mostrarError('error-entrada', null);
  $('boton-entrada').disabled = true;
  try {
    const cuerpo = { email: f.email.value, clave: f.clave.value };
    if (modoEntrada === 'registro') Object.assign(cuerpo, { nombre: f.nombre.value, idioma: idiomaActual() });
    const r = await api('POST', `/auth/${modoEntrada}`, cuerpo);
    await entrarConToken(r.token);
  } catch (err) {
    const msg = err instanceof ErrorApi && err.status === 404 ? t('Las cuentas todavía no están activas. Mientras, mirá la demo.') : err.message;
    mostrarError('error-entrada', msg);
  } finally {
    $('boton-entrada').disabled = false;
  }
});

$('boton-demo').addEventListener('click', () => {
  estado.modo = 'demo';
  estado.datos = datosDemo(hoy);
  estado.perfil = { moneda: 'USD', nombre: '' };
  entrarApp();
});

// ---------- Recupero de contraseña y cuenta (L1, L2) ----------

$('boton-olvide').addEventListener('click', () => {
  const f = $('form-olvide');
  f.email.value = $('form-entrada').email.value;
  mostrarError('error-olvide', null);
  $('ok-olvide').hidden = true;
  $('hoja-olvide').showModal();
});

$('form-olvide').addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarError('error-olvide', null);
  $('boton-mandar-olvide').disabled = true;
  try {
    await api('POST', '/auth/olvide', { email: e.target.email.value });
    $('ok-olvide').hidden = false;
    sonar('pop');
  } catch (err) {
    mostrarError('error-olvide', err.message);
  } finally {
    $('boton-mandar-olvide').disabled = false;
  }
});

/** El link del email trae el código después del #, así no viaja al servidor ni queda en logs. */
function codigoRecupero() {
  const m = /^#recuperar=([\w-]+)$/.exec(location.hash);
  return m ? m[1] : null;
}

$('form-recuperar').addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarError('error-recuperar', null);
  try {
    const r = await api('POST', '/auth/recuperar', { codigo: codigoRecupero(), clave: e.target.clave.value });
    history.replaceState(null, '', location.pathname);
    $('hoja-recuperar').close();
    sonar('fanfarria');
    await entrarConToken(r.token);
  } catch (err) {
    mostrarError('error-recuperar', err.message);
  }
});
window.addEventListener('hashchange', () => {
  if (codigoRecupero() && !$('hoja-recuperar').open) {
    mostrarError('error-recuperar', null);
    $('hoja-recuperar').showModal();
  }
});
$('hoja-recuperar').addEventListener('close', () => history.replaceState(null, '', location.pathname));

$('boton-cuenta').addEventListener('click', () => {
  const f = $('form-cuenta');
  $('cuenta-email').textContent = estado.perfil?.email ?? '';
  pintarCuenta();
  f.confirmacion.value = '';
  f.querySelector('details').open = false;
  mostrarError('error-cuenta', null);
  $('hoja-cuenta').showModal();
});

$('boton-borrar-cuenta').addEventListener('click', async () => {
  mostrarError('error-cuenta', null);
  try {
    await api('DELETE', '/perfil', { confirmacion: $('form-cuenta').confirmacion.value });
    $('hoja-cuenta').close();
    salir();
  } catch (err) {
    mostrarError('error-cuenta', err.message);
  }
});

function salir() {
  guardarToken(null);
  olvidarGoogle();
  estado.datos = null;
  mostrarEntrada();
}

$('boton-salir').addEventListener('click', salir);

function entrarApp() {
  $('pantalla-entrada').hidden = true;
  $('pantalla-app').hidden = false;
  $('demo').hidden = estado.modo !== 'demo';
  $('boton-salir').textContent = estado.modo === 'demo' ? t('Entrar') : t('Salir');
  $('boton-cuenta').hidden = estado.modo !== 'real';
  cargarConfigPremium();
  configurarMoneda(estado.perfil?.moneda ?? 'USD');
  estado.mesVisto = mesActual;
  chat.length = 0;
  const nuevo = estado.modo === 'real' && estado.datos.gastos.length === 0 && estado.datos.perfil.saldo === 0 && !estado.datos.perfil.ingresoMensual;
  if (nuevo) return empezarOnboarding();
  pintar();
}

function empezarOnboarding() {
  $('pantalla-app').hidden = true;
  iniciarOnboarding({
    nombre: estado.perfil?.nombre ?? '',
    mes: mesActual,
    guardarPlata: async (saldo, ingreso) => {
      await api('PATCH', '/perfil', { saldo, ingresoMensual: ingreso });
      await cargar();
    },
    crearGasto: async (g) => {
      await api('POST', '/gastos', g);
      await cargar();
    },
    balance: () => resumenDelMes(estado.datos, hoy, mesActual).balance,
    alTerminar: () => {
      $('pantalla-app').hidden = false;
      pintar();
    },
  });
}

async function cargar() {
  const [datos, perfil] = await Promise.all([api('GET', '/datos'), api('GET', '/perfil')]);
  estado.datos = datos;
  estado.perfil = perfil;
  if (perfil.idioma && perfil.idioma !== idiomaActual()) {
    cambiarIdioma(perfil.idioma);
    pintarIdioma();
  }
}

// ---------- Acciones (real: API y recarga · demo: en memoria) ----------

async function ejecutar(real, demo) {
  if (estado.modo === 'real') {
    await real();
    await cargar();
  } else demo(estado.datos);
  pintar();
}

const acciones = {
  pagar: (l, pagar) =>
    ejecutar(
      () => api(pagar ? 'POST' : 'DELETE', `/gastos/${l.gastoId}/meses/${estado.mesVisto}/pagar`),
      (d) => {
        const e = d.estados.find((x) => x.gastoId === l.gastoId && x.mes === estado.mesVisto);
        if (e) e.pagado = pagar;
        else d.estados.push({ gastoId: l.gastoId, mes: estado.mesVisto, pagado: true });
        d.perfil.saldo += pagar ? -l.monto : l.monto;
      },
    ),
  guardarGasto: (id, g) =>
    ejecutar(
      () => (id ? api('PATCH', `/gastos/${id}`, g) : api('POST', '/gastos', g)),
      (d) => {
        if (id) Object.assign(d.gastos.find((x) => x.id === id), g);
        else d.gastos.push({ ...g, id: `demo-${Date.now()}` });
      },
    ),
  borrarGasto: (id) =>
    ejecutar(
      () => api('DELETE', `/gastos/${id}`),
      (d) => (d.gastos = d.gastos.filter((x) => x.id !== id)),
    ),
  restaurarGasto: (g) =>
    ejecutar(
      () => api('POST', `/gastos/${g.id}/restaurar`),
      (d) => d.gastos.push(g),
    ),
  montoDelMes: (gastoId, mes, montoDelMes) =>
    ejecutar(
      () => api('PUT', `/gastos/${gastoId}/meses/${mes}`, { montoDelMes }),
      (d) => {
        const e = d.estados.find((x) => x.gastoId === gastoId && x.mes === mes);
        if (e) e.montoDelMes = montoDelMes;
        else d.estados.push({ gastoId, mes, pagado: false, montoDelMes });
      },
    ),
  usar: (gastoId, monto, nota) =>
    ejecutar(
      () => api('POST', `/gastos/${gastoId}/usos`, { mes: mesActual, monto, nota }),
      (d) => {
        d.usos.push({ id: `demo-${Date.now()}`, gastoId, mes: mesActual, monto, nota });
        d.perfil.saldo -= monto;
      },
    ),
  guardarPlata: (saldo, ingresoMensual) =>
    ejecutar(
      () => api('PATCH', '/perfil', { saldo, ingresoMensual }),
      (d) => Object.assign(d.perfil, { saldo, ingresoMensual }),
    ),
  cobrar: () =>
    ejecutar(
      () => api('POST', '/perfil/cobrar-ingreso'),
      (d) => {
        d.perfil.saldo += d.perfil.ingresoMensual.monto;
        d.perfil.ingresoCobradoMes = mesActual;
      },
    ),
};

// ---------- Pantalla del mes ----------

function animarNumero(el, desde, hasta, formato = plata, dura = 600) {
  if (desde === hasta) {
    el.textContent = formato(hasta);
    return;
  }
  const inicio = performance.now();
  const paso = (ahora) => {
    const p = Math.min(1, (ahora - inicio) / dura);
    el.textContent = formato(Math.round(desde + (hasta - desde) * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

/** Un "−US$ 60" que vuela desde la fila hasta el número que cambia (M3). */
function volarMonto(desde, hacia, texto) {
  if (!desde || !hacia) return;
  const a = desde.getBoundingClientRect();
  const b = hacia.getBoundingClientRect();
  const chip = document.createElement('div');
  chip.className = 'monto-volador';
  chip.textContent = texto;
  document.body.append(chip);
  const x0 = a.left + a.width - 90;
  const y0 = a.top + a.height / 2 - 14;
  const x1 = b.left + b.width / 2 - 40;
  const y1 = b.top + b.height / 2 - 14;
  chip
    .animate(
      [
        { transform: `translate(${x0}px, ${y0}px) scale(0.6)`, opacity: 0 },
        { transform: `translate(${x0}px, ${y0 - 30}px) scale(1.15)`, opacity: 1, offset: 0.25 },
        { transform: `translate(${x1}px, ${y1}px) scale(0.9)`, opacity: 1, offset: 0.85 },
        { transform: `translate(${x1}px, ${y1}px) scale(0.4)`, opacity: 0 },
      ],
      { duration: 750, easing: 'cubic-bezier(.5,0,.3,1)' },
    )
    .finished.then(() => chip.remove());
}

function golpe(el) {
  el?.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.18)', color: 'var(--selva)' }, { transform: 'scale(1)' }],
    { duration: 420, easing: 'ease-out' },
  );
}

function etiquetaTipo(l, g) {
  const corto = (m) => nombreMes(m).split(' ')[0].toLowerCase();
  const soloEste = l.tipo === 'puntual' || (l.tipo === 'reserva' && !g?.recurrente);
  const duracion = soloEste ? t('solo este mes') : g?.mesFin ? t('hasta {mes}', { mes: corto(g.mesFin) }) : t('todos los meses');
  if (!soloEste && l.monto === 0 && g?.monto) return t('salteado este mes');
  if (l.tipo !== 'reserva') return duracion;
  return `${t('reserva')} · ${g?.modoReserva === 'manual' ? t('cargás los usos') : t('baja con los días')} · ${duracion}`;
}

function filaGasto(l) {
  const g = estado.datos.gastos.find((x) => x.id === l.gastoId);
  const li = document.createElement('li');
  li.className = `gasto gasto-${l.tipo}${l.pagado ? ' pagado' : ''}`;
  li.tabIndex = 0;
  // M1: con usos cargados a mano, si te pasaste lo que queda se muestra en negativo.
  // El balance no cambia: lo usado ya salió del saldo y la reserva no resta menos de 0.
  const quedaReal = l.tipo === 'reserva' && g?.modoReserva === 'manual' ? l.monto - (l.usado ?? 0) : l.pendiente;
  const pasada = l.tipo === 'reserva' && quedaReal < 0;
  if (pasada) li.classList.add('pasada');
  const frasco = l.tipo === 'reserva' ? `<div class="frasco"><span style="width:${l.monto ? (Math.max(0, quedaReal) / l.monto) * 100 : 0}%"></span></div>` : '';
  const puedePagar = l.tipo !== 'reserva';
  li.innerHTML = `
    <span class="emoji">${g?.emoji || '💸'}</span>
    <div class="info">
      <p class="nombre"></p>
      <p class="tipo">${etiquetaTipo(l, g)}</p>
      ${frasco}
    </div>
    <div class="montos">
      <p class="monto">${l.tipo === 'reserva' ? (pasada ? `−${plata(-quedaReal)}` : plata(quedaReal)) : plata(l.monto)}</p>
      ${l.tipo === 'reserva' ? `<p class="de">${pasada ? t('te pasaste de') : t('de')} ${plata(l.monto)}</p>` : ''}
    </div>
    ${puedePagar ? `<button class="check" aria-label="${l.pagado ? t('Desmarcar pagado') : t('Marcar pagado')}">${l.pagado ? '✓' : ''}</button>` : ''}`;
  li.querySelector('.nombre').textContent = l.nombre;
  li.querySelector('.check')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const pagar = !l.pagado;
    if (pagar) {
      // M3: la moneda vuela de la fila al saldo y a "por gastar", suena y el mono la atrapa.
      sonar('moneda');
      volarMonto(li, $('valor-saldo'), `−${plata(l.monto)}`);
      setTimeout(() => volarMonto(li, $('valor-gastar'), `−${plata(l.monto)}`), 120);
      saltoMono();
    } else sonar('toque');
    try {
      await acciones.pagar(l, pagar);
    } catch (err) {
      avisar(err);
    }
  });
  li.addEventListener('click', () => {
    sonar('toque');
    if (l.tipo === 'reserva') abrirReserva(l, g);
    else abrirGasto(g);
  });
  return li;
}

// D1: Mona sigue el dedo o el mouse con los ojos y reacciona cuando la tocás.
document.addEventListener('pointermove', (e) => {
  for (const pupilas of document.querySelectorAll('.pupilas')) {
    const r = pupilas.closest('svg').getBoundingClientRect();
    if (!r.width) continue;
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / 200) * 4;
    pupilas.setAttribute('transform', `translate(${((dx / d) * k).toFixed(1)} ${((dy / d) * k).toFixed(1)})`);
  }
});

let cosquilla = 0;
$('mono').addEventListener('click', () => {
  sonar(cosquilla % 3 === 2 ? 'fanfarria' : 'pop');
  $('frase').textContent = t(cosquillas[cosquilla++ % cosquillas.length]);
  $('mono').animate(
    [{ transform: 'rotate(0) scale(1)' }, { transform: 'rotate(-12deg) scale(1.1)' }, { transform: 'rotate(10deg) scale(1.05)' }, { transform: 'rotate(0) scale(1)' }],
    { duration: 520, easing: 'ease-out' },
  );
});

function saltoMono() {
  $('mono').animate(
    [{ transform: 'translateY(0) rotate(0)' }, { transform: 'translateY(-18px) rotate(-8deg)' }, { transform: 'translateY(0) rotate(0)' }],
    { duration: 450, easing: 'ease-out' },
  );
}

function pintar(direccion = 0) {
  const d = estado.datos;
  const r = resumenDelMes(d, hoy, estado.mesVisto);
  $('titulo-mes').textContent = estado.mesVisto === mesActual ? `${nombreMes(estado.mesVisto)} · ${t('hoy')}` : nombreMes(estado.mesVisto);
  $('mes-anterior').disabled = estado.mesVisto <= mesActual;

  const animo = animoPara(r.balance, d.perfil.ingresoMensual?.monto ?? 0);
  $('mono').innerHTML = svgMono(animo);
  const opciones = frases[animo];
  $('frase').textContent = t(opciones[(Number(r.mes.slice(5)) + r.gastos.length) % opciones.length]);
  $('tarjeta-balance').dataset.animo = animo;
  animarNumero($('balance'), estado.balanceMostrado, r.balance);
  estado.balanceMostrado = r.balance;

  const esActual = estado.mesVisto === mesActual;
  // Mismo mes que antes: los números cuentan desde el valor anterior (se nota el impacto).
  const previo = estado.resumenMostrado?.mes === r.mes ? estado.resumenMostrado : r;
  $('resumen').innerHTML = `
    <button class="celda" id="celda-saldo" ${esActual ? '' : 'disabled'}><p class="etiqueta">${esActual ? t('Saldo hoy ✎') : t('Arrancás con')}</p><p id="valor-saldo"></p></button>
    <div class="celda"><p class="etiqueta">${t('Ingreso')}</p><p class="mas">+${plata(r.ingreso)}</p></div>
    <div class="celda" id="celda-gastar"><p class="etiqueta">${t('Por gastar')}</p><p class="menos" id="valor-gastar"></p></div>`;
  $('celda-saldo').addEventListener('click', abrirPlata);
  animarNumero($('valor-saldo'), previo.inicio, r.inicio, plata, 900);
  animarNumero($('valor-gastar'), previo.totalPendiente, r.totalPendiente, (c) => `−${plata(c)}`, 900);
  if (previo.inicio !== r.inicio) golpe($('valor-saldo'));
  if (previo.totalPendiente !== r.totalPendiente) golpe($('valor-gastar'));
  estado.resumenMostrado = { mes: r.mes, inicio: r.inicio, totalPendiente: r.totalPendiente };
  pintarSugerencias(esActual);

  const ingreso = d.perfil.ingresoMensual;
  const cobrar = esActual && ingreso && d.perfil.ingresoCobradoMes !== mesActual && hoy.getDate() >= ingreso.diaCobro;
  $('aviso-cobro').hidden = !cobrar;
  if (cobrar) $('aviso-cobro').textContent = t('¿Ya cobraste los {monto} de este mes? Tocá para sumarlos al saldo 🍌', { monto: plata(ingreso.monto) });

  pintarAviso();
  const lista = $('gastos');
  lista.replaceChildren(...r.gastos.map(filaGasto));
  $('vacio').hidden = r.gastos.length > 0;
  if (direccion) {
    lista.animate([{ opacity: 0, transform: `translateX(${direccion * 40}px)` }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'ease-out' });
  }
}

$('aviso-cobro').addEventListener('click', () => {
  sonar('fanfarria');
  acciones.cobrar().then(saltoMono).catch(avisar);
});

// M2: si una reserva se pasó el mes anterior, sugerir subirla.
const CLAVE_DESCARTES = 'monasafer.sugerencias-descartadas';
function descartadas() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_DESCARTES) || '[]');
  } catch {
    return [];
  }
}
function descartar(clave) {
  try {
    localStorage.setItem(CLAVE_DESCARTES, JSON.stringify([...descartadas(), clave].slice(-50)));
  } catch {
    /* sin storage: vuelve a aparecer al recargar */
  }
}

function pintarSugerencias(esActual) {
  const caja = $('sugerencias');
  caja.replaceChildren();
  if (!esActual) return;
  const anterior = sumarMeses(mesActual, -1);
  const ya = descartadas();
  for (const g of estado.datos.gastos) {
    if (g.tipo !== 'reserva' || !g.recurrente) continue;
    const usado = estado.datos.usos.filter((u) => u.gastoId === g.id && u.mes === anterior).reduce((s, u) => s + u.monto, 0);
    const clave = `${g.id}:${anterior}`;
    if (usado <= g.monto || ya.includes(clave)) continue;
    // Redondeado para arriba a 10 unidades: si gastaste 263, sugerimos 270.
    const nuevo = Math.ceil(usado / 1000) * 1000;
    const tarjeta = document.createElement('div');
    tarjeta.className = 'sugerencia';
    tarjeta.innerHTML = `<p>${t('🐒 En {mes} usaste <b>{usado}</b> en {emoji} <b></b> y habías reservado {reservado}. ¿La subimos a <b>{nuevo}</b>?', {
      mes: nombreMes(anterior).split(' ')[0].toLowerCase(),
      usado: plata(usado),
      emoji: g.emoji || '',
      reservado: plata(g.monto),
      nuevo: plata(nuevo),
    })}</p>
      <div class="acciones"><button class="boton" data-no>${t('Así está bien')}</button><button class="boton principal" data-si>${t('Subir')}</button></div>`;
    tarjeta.querySelectorAll('b')[1].textContent = g.nombre;
    tarjeta.querySelector('[data-no]').addEventListener('click', () => {
      descartar(clave);
      sonar('toque');
      tarjeta.remove();
    });
    tarjeta.querySelector('[data-si]').addEventListener('click', () => {
      descartar(clave);
      sonar('pop');
      acciones.guardarGasto(g.id, { monto: nuevo }).catch(avisar);
    });
    caja.append(tarjeta);
  }
}

function moverMes(n) {
  const nuevo = sumarMeses(estado.mesVisto, n);
  if (nuevo < mesActual || $('pantalla-app').hidden || document.querySelector('dialog[open]')) return;
  estado.mesVisto = nuevo;
  sonar('pasar');
  pintar(n);
}

$('mes-anterior').addEventListener('click', () => moverMes(-1));
$('mes-siguiente').addEventListener('click', () => moverMes(1));
document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input')) return;
  if (e.key === 'ArrowLeft') moverMes(-1);
  if (e.key === 'ArrowRight') moverMes(1);
});
let toqueX = null;
document.addEventListener('touchstart', (e) => (toqueX = e.touches[0].clientX), { passive: true });
document.addEventListener('touchend', (e) => {
  if (toqueX === null) return;
  const dx = e.changedTouches[0].clientX - toqueX;
  if (Math.abs(dx) > 70) moverMes(dx < 0 ? 1 : -1);
  toqueX = null;
});

// ---------- Hojas ----------

document.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach((d) =>
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  }),
);

function mostrarError(id, msg) {
  if (msg) sonar('error');
  $(id).hidden = !msg;
  $(id).textContent = msg ?? '';
}

function avisar(err) {
  if (err instanceof ErrorApi && err.status === 401) {
    guardarToken(null);
    mostrarEntrada();
    return;
  }
  sonar('error');
  alertaSuave(err.message);
}

function alertaSuave(texto, emoji = '🙈') {
  const t = document.createElement('div');
  t.className = 'tostada';
  t.textContent = emoji ? `${emoji} ${texto}` : texto;
  document.body.append(t);
  setTimeout(() => t.remove(), 3500);
}

// Gasto
const EMOJIS = ['💸', '🏠', '🛒', '🚌', '⛽', '⚡', '💧', '🔥', '📶', '📱', '💳', '🏦', '👟', '👕', '🍔', '☕', '🍺', '🎁', '🎉', '💊', '🏋️', '💇', '🎓', '📚', '🐶', '👶', '🚗', '✈️', '🏖️', '🎬', '🎮', '🎵', '📺', '🛠️', '🧾', '🍌'];
let gastoEditado = null;
let emojiElegido = '💸';

$('emojis').innerHTML = EMOJIS.map((e) => `<button type="button" class="emoji-boton" data-emoji="${e}">${e}</button>`).join('');
$('emojis').addEventListener('click', (e) => {
  const b = e.target.closest('[data-emoji]');
  if (b) {
    emojiAMano = true;
    elegirEmoji(b.dataset.emoji);
  }
});
// Si no eligieron emoji a mano, Mona adivina por el nombre.
const ADIVINAR = [
  [/alquiler|expensa|casa|depto/i, '🏠'], [/s[uú]per|chino|mercado|verdu/i, '🛒'], [/nafta|combustible|ypf|shell/i, '⛽'], [/transporte|sube|colectivo|subte|uber|taxi/i, '🚌'],
  [/luz|gas|agua|edesur|edenor/i, '⚡'], [/internet|wifi|celular|tel[eé]fono/i, '📶'], [/tarjeta|cuota|visa|master/i, '💳'],
  [/zapa|ropa/i, '👟'], [/comida|delivery|resto|cena|almuerzo/i, '🍔'], [/regalo|cumple/i, '🎁'], [/farmacia|m[eé]dic|prepaga|obra social/i, '💊'],
  [/curso|facu|colegio|escuela/i, '🎓'], [/perro|gato|vete/i, '🐶'], [/viaje|vacaciones|vuelo/i, '✈️'],
];
let emojiAMano = false;
$('form-gasto').nombre.addEventListener('input', (e) => {
  if (emojiAMano) return;
  const hallado = ADIVINAR.find(([re]) => re.test(e.target.value));
  elegirEmoji(hallado ? hallado[1] : '💸');
});
function elegirEmoji(e) {
  emojiElegido = e;
  document.querySelectorAll('.emoji-boton').forEach((b) => b.classList.toggle('activo', b.dataset.emoji === e));
}

// Duración y reserva son dos cosas distintas (Fede, 20/10): cualquier gasto, sea reserva
// o no, puede ser de este mes, de varios meses o para siempre. Se traduce al modelo así:
// no reserva + este mes = puntual; no reserva + varios/siempre = fijo (mesFin o null);
// reserva + este mes = reserva no recurrente; reserva + varios/siempre = recurrente.
const forma = { duracion: 'mes', meses: 3, reserva: false, modo: 'proporcional' };

function mesInicioDelForm() {
  return gastoEditado?.mesInicio ?? estado.mesVisto;
}

function pintarForma() {
  document.querySelectorAll('[data-duracion]').forEach((b) => b.classList.toggle('activo', b.dataset.duracion === forma.duracion));
  const varios = forma.duracion === 'hasta';
  $('meses-elegir').hidden = !varios;
  $('meses-rapidos').hidden = !varios;
  $('meses-n').textContent = forma.meses;
  $('meses-palabra').textContent = forma.meses === 1 ? t('mes') : t('meses');
  $('meses-menos').disabled = forma.meses <= 2;
  document.querySelectorAll('[data-meses]').forEach((b) => b.classList.toggle('activo', Number(b.dataset.meses) === forma.meses));
  $('es-reserva').checked = forma.reserva;
  $('campo-modo').hidden = !forma.reserva;
  document.querySelectorAll('#campo-modo [data-modo]').forEach((b) => b.classList.toggle('activo', b.dataset.modo === forma.modo));

  // Resumen en palabras de lo que va a pasar
  const monto = centavos($('form-gasto').monto.value) ?? 0;
  const inicio = mesInicioDelForm();
  const mesCorto = (m) => nombreMes(m).toLowerCase();
  const cuanto = monto ? plata(monto) : t('Este gasto');
  const verbo = forma.reserva ? t('se reservan') : t('se descuentan');
  const v = { cuanto, verbo, inicio: mesCorto(inicio) };
  let texto;
  if (forma.duracion === 'mes') texto = t('{cuanto} {verbo} solo en {inicio}.', v);
  else if (forma.duracion === 'siempre') texto = t('{cuanto} {verbo} todos los meses desde {inicio}, hasta que lo borres.', v);
  else {
    const fin = mesCorto(sumarMeses(inicio, forma.meses - 1));
    texto = t('{cuanto} {verbo} por mes de {inicio} a {fin}. Último mes: {fin}.', { ...v, fin });
  }
  if (forma.reserva) texto += ' ' + (forma.modo === 'manual' ? t('Vas cargando cada uso.') : t('Baja sola a medida que pasan los días.'));
  $('resumen-gasto').textContent = texto;
}

document.querySelectorAll('[data-duracion]').forEach((b) =>
  b.addEventListener('click', () => {
    forma.duracion = b.dataset.duracion;
    sonar('toque');
    pintarForma();
  }),
);
$('meses-menos').addEventListener('click', () => {
  forma.meses = Math.max(2, forma.meses - 1);
  sonar('toque');
  pintarForma();
});
$('meses-mas').addEventListener('click', () => {
  forma.meses = Math.min(60, forma.meses + 1);
  sonar('toque');
  pintarForma();
});
document.querySelectorAll('[data-meses]').forEach((b) =>
  b.addEventListener('click', () => {
    forma.meses = Number(b.dataset.meses);
    sonar('toque');
    pintarForma();
  }),
);
$('es-reserva').addEventListener('change', (e) => {
  forma.reserva = e.target.checked;
  sonar(forma.reserva ? 'pop' : 'toque');
  pintarForma();
});
document.querySelectorAll('#campo-modo [data-modo]').forEach((b) =>
  b.addEventListener('click', () => {
    forma.modo = b.dataset.modo;
    sonar('toque');
    pintarForma();
  }),
);
$('form-gasto').monto.addEventListener('input', pintarForma);

/** Lee un gasto guardado y deja el formulario en los dos ejes. */
function formaDesdeGasto(g) {
  forma.reserva = g?.tipo === 'reserva';
  forma.modo = g?.modoReserva ?? 'proporcional';
  forma.meses = 3;
  if (!g || g.tipo === 'puntual' || (g.tipo === 'reserva' && !g.recurrente)) forma.duracion = 'mes';
  else if (!g.mesFin) forma.duracion = 'siempre';
  else {
    const [a1, m1] = g.mesInicio.split('-').map(Number);
    const [a2, m2] = g.mesFin.split('-').map(Number);
    const n = (a2 - a1) * 12 + (m2 - m1) + 1;
    forma.duracion = n <= 1 ? 'mes' : 'hasta';
    forma.meses = Math.max(2, n);
  }
}

/** De los dos ejes al modelo del back. */
function gastoDesdeForma() {
  const inicio = mesInicioDelForm();
  const mesFin = forma.duracion === 'hasta' ? sumarMeses(inicio, forma.meses - 1) : null;
  if (forma.reserva) {
    return { tipo: 'reserva', modoReserva: forma.modo, recurrente: forma.duracion !== 'mes', mesFin };
  }
  if (forma.duracion === 'mes') return { tipo: 'puntual', mesFin: null };
  return { tipo: 'fijo', mesFin };
}

function abrirGasto(g = null) {
  gastoEditado = g;
  const f = $('form-gasto');
  f.reset();
  mostrarError('error-gasto', null);
  $('titulo-hoja-gasto').textContent = g ? t('Editar gasto') : t('Nuevo gasto');
  $('boton-borrar-gasto').hidden = !g;
  f.monto.value = g ? String(g.monto / 100) : '';
  f.nombre.value = g?.nombre ?? '';
  elegirEmoji(g?.emoji || '💸');
  emojiAMano = !!g;
  formaDesdeGasto(g);
  pintarForma();
  $('hoja-gasto').showModal();
  // Primero el nombre (Fede, 21/10): con él se adivina el ícono y después va el monto.
  if (!g) f.nombre.focus();
}

$('boton-nuevo').addEventListener('click', () => {
  sonar('toque');
  abrirGasto();
});

function pintarBotonSonido() {
  $('boton-sonido').textContent = estaSilenciado() ? '🔇' : '🔊';
  $('boton-sonido').setAttribute('aria-label', estaSilenciado() ? t('Activar sonidos') : t('Silenciar sonidos'));
}
$('boton-sonido').addEventListener('click', () => {
  alternarSilencio();
  pintarBotonSonido();
});
pintarBotonSonido();

$('form-gasto').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const monto = centavos(f.monto.value);
  if (monto === null) return mostrarError('error-gasto', t('Poné un monto válido'));
  const g = { nombre: f.nombre.value.trim(), emoji: emojiElegido, monto, ...gastoDesdeForma() };
  if (!gastoEditado) g.mesInicio = estado.mesVisto;
  try {
    await acciones.guardarGasto(gastoEditado?.id, g);
    $('hoja-gasto').close();
    sonar('pop');
    saltoMono();
  } catch (err) {
    mostrarError('error-gasto', err.message);
  }
});

$('boton-borrar-gasto').addEventListener('click', () => {
  if (!gastoEditado) return;
  $('hoja-gasto').close();
  pedirBorrar(gastoEditado, estado.mesVisto);
});

// ---------- Borrar sin perder el pasado, y Deshacer ----------

const DURA_DESHACER = 6000;
let deshacerPendiente = null;

/** Un aviso abajo con "Deshacer" durante unos segundos, por si pifiaste. */
function ofrecerDeshacer(texto, deshacer) {
  const el = $('deshacer');
  // Adentro de la hoja abierta (el chat, por ejemplo): fuera de ella el botón no se puede tocar.
  const padre = document.querySelector('dialog[open]') ?? document.body;
  if (el.parentElement !== padre) padre.append(el);
  if (el.matches(':popover-open')) el.hidePopover();
  clearTimeout(deshacerPendiente?.timer);
  $('texto-deshacer').textContent = `🗑️ ${texto}`;
  el.showPopover();
  $('barra-deshacer').animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: DURA_DESHACER });
  deshacerPendiente = { deshacer, timer: setTimeout(cerrarDeshacer, DURA_DESHACER) };
}

function cerrarDeshacer() {
  clearTimeout(deshacerPendiente?.timer);
  deshacerPendiente = null;
  const el = $('deshacer');
  if (el.matches(':popover-open')) el.hidePopover();
}

$('boton-deshacer').addEventListener('click', async () => {
  const p = deshacerPendiente;
  cerrarDeshacer();
  if (!p) return;
  try {
    await p.deshacer();
    sonar('pop');
    saltoMono();
    $('frase').textContent = t('¡Uf! Ya está como antes.');
    if ($('hoja-chat').open) pintarChat();
  } catch (err) {
    avisar(err);
  }
});

/** Fijos y reservas recurrentes aparecen en varios meses: borrarlos pregunta cuáles. */
function seRepite(g) {
  return g.tipo === 'fijo' || (g.tipo === 'reserva' && !!g.recurrente);
}

/**
 * Qué se puede hacer al borrar un gasto que se repite, mirando el mes `mes`. Lo sugerido
 * es terminarlo (mesFin): los meses que ya pasaron quedan como estaban y no mienten.
 * Si ese mes ya se pagó (o tiene usos), termina después de ese mes, porque esa plata ya
 * salió del saldo.
 */
function opcionesBorrar(g, mes) {
  const d = estado.datos;
  const estadoMes = d.estados.find((e) => e.gastoId === g.id && e.mes === mes);
  const empezado = !!estadoMes?.pagado || d.usos.some((u) => u.gastoId === g.id && u.mes === mes);
  const { nombre } = g;
  // Copiado antes: en la demo guardarGasto cambia el mismo objeto.
  const finAntes = g.mesFin ?? null;
  const opciones = [];
  const ultimo = empezado ? mes : sumarMeses(mes, -1);
  if (ultimo >= g.mesInicio)
    opciones.push({
      titulo: empezado ? t('Que {mes} sea el último', { mes: nombreMes(mes) }) : t('Terminarlo desde {mes}', { mes: nombreMes(mes) }),
      detalle: t('No aparece más desde {mes}. Los meses anteriores quedan como estaban.', { mes: nombreMes(sumarMeses(ultimo, 1)) }),
      sugerida: true,
      hacer: () => acciones.guardarGasto(g.id, { mesFin: ultimo }),
      deshacer: () => acciones.guardarGasto(g.id, { mesFin: finAntes }),
      aviso: t('{nombre} ya no está desde {mes}', { nombre, mes: nombreMes(sumarMeses(ultimo, 1)) }),
    });
  if (!empezado)
    opciones.push({
      titulo: t('Solo en {mes}', { mes: nombreMes(mes) }),
      detalle: t('Ese mes no va. Los demás quedan igual.'),
      hacer: () => acciones.montoDelMes(g.id, mes, 0),
      deshacer: () => acciones.montoDelMes(g.id, mes, estadoMes?.montoDelMes ?? null),
      aviso: t('Sacaste {nombre} de {mes}', { nombre, mes: nombreMes(mes) }),
    });
  const hayPasado = g.mesInicio < mes;
  opciones.push({
    titulo: t('Borrar de todos los meses'),
    detalle: hayPasado
      ? t('También desaparece de los meses anteriores, desde {mes}. Para algo que cargaste por error.', { mes: nombreMes(g.mesInicio) })
      : t('Desaparece de todos los meses.'),
    peligro: hayPasado,
    sugerida: !opciones.some((o) => o.sugerida),
    hacer: () => acciones.borrarGasto(g.id),
    deshacer: () => acciones.restaurarGasto(g),
    aviso: t('Borraste {nombre}', { nombre }),
  });
  return opciones;
}

async function hacerConDeshacer(o) {
  await o.hacer();
  sonar('caer');
  ofrecerDeshacer(o.aviso, o.deshacer);
}

/**
 * Borra un gasto. Si es de un solo mes lo borra y ofrece deshacer; si se repite, pregunta
 * qué meses sacar. Devuelve true si se borró algo.
 */
function pedirBorrar(g, mes) {
  if (!seRepite(g)) {
    const o = { hacer: () => acciones.borrarGasto(g.id), deshacer: () => acciones.restaurarGasto(g), aviso: t('Borraste {nombre}', { nombre: g.nombre }) };
    return hacerConDeshacer(o).then(
      () => true,
      (err) => (avisar(err), false),
    );
  }
  const hoja = $('hoja-borrar');
  $('titulo-borrar').textContent = t('¿Qué hacemos con {nombre}?', { nombre: `${g.emoji || '💸'} ${g.nombre}` });
  $('ayuda-borrar').textContent = t('Se repite en varios meses. Elegí qué sacar: lo que ya pasó no tiene por qué perderse.');
  const lista = $('opciones-borrar');
  lista.replaceChildren();
  return new Promise((listo) => {
    let elegida = false;
    for (const o of opcionesBorrar(g, mes)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `opcion-borrar${o.sugerida ? ' sugerida' : ''}${o.peligro ? ' peligro' : ''}`;
      b.innerHTML = '<b></b><small></small>';
      b.querySelector('b').textContent = o.titulo;
      b.querySelector('small').textContent = o.detalle;
      b.addEventListener('click', async () => {
        elegida = true;
        hoja.close();
        try {
          await hacerConDeshacer(o);
          listo(true);
        } catch (err) {
          avisar(err);
          listo(false);
        }
      });
      lista.append(b);
    }
    hoja.addEventListener('close', () => elegida || listo(false), { once: true });
    hoja.showModal();
  });
}

// Reserva
let reservaAbierta = null;

async function abrirReserva(l, g) {
  reservaAbierta = { l, g };
  const f = $('form-uso');
  f.reset();
  mostrarError('error-uso', null);
  $('titulo-reserva').textContent = `${g?.emoji ?? ''} ${l.nombre}`;
  const manual = g?.modoReserva === 'manual';
  const esActual = estado.mesVisto === mesActual;
  const queda = manual ? l.monto - (l.usado ?? 0) : l.pendiente;
  $('frasco-reserva').style.width = `${l.monto ? (Math.max(0, queda) / l.monto) * 100 : 0}%`;
  $('texto-reserva').textContent = esActual
    ? queda < 0
      ? t('Te pasaste por {pasado} (usaste {usado} de {monto}). Ya salió de tu saldo, así que el balance está bien; capaz conviene subir la reserva.', { pasado: plata(-queda), usado: plata(l.usado), monto: plata(l.monto) })
      : `${t('Quedan {queda} de {monto}.', { queda: plata(queda), monto: plata(l.monto) })} ${manual ? t('Cargá cada uso y Mona lo resta.') : t('Baja sola con los días del mes; si gastaste distinto, ajustá tu saldo.')}`
    : t('En {mes} vas a tener {monto} reservados.', { mes: nombreMes(estado.mesVisto), monto: plata(l.monto) });
  $('carga-uso').hidden = !(manual && esActual);
  $('boton-usar').hidden = !(manual && esActual);
  $('lista-usos').replaceChildren();
  $('hoja-reserva').showModal();
  if (manual && esActual) {
    const usos = estado.modo === 'real' ? await api('GET', `/gastos/${l.gastoId}/usos?mes=${mesActual}`).catch(() => []) : estado.datos.usos.filter((u) => u.gastoId === l.gastoId && u.mes === mesActual);
    $('lista-usos').replaceChildren(
      ...usos.map((u) => {
        const li = document.createElement('li');
        li.textContent = `${u.nota || t('Uso')} · ${plata(u.monto)}`;
        return li;
      }),
    );
  }
}

$('form-uso').addEventListener('submit', async (e) => {
  e.preventDefault();
  const monto = centavos(e.target.monto.value);
  if (!monto) return mostrarError('error-uso', t('Poné cuánto usaste'));
  try {
    await acciones.usar(reservaAbierta.l.gastoId, monto, e.target.nota.value.trim());
    $('hoja-reserva').close();
    sonar('plop');
    saltoMono();
  } catch (err) {
    mostrarError('error-uso', err.message);
  }
});

$('boton-editar-reserva').addEventListener('click', () => {
  $('hoja-reserva').close();
  abrirGasto(reservaAbierta.g);
});

// Saldo e ingreso
function abrirPlata() {
  const f = $('form-plata');
  const p = estado.datos.perfil;
  mostrarError('error-plata', null);
  f.saldo.value = String(p.saldo / 100);
  f.ingreso.value = p.ingresoMensual ? String(p.ingresoMensual.monto / 100) : '';
  f.dia.value = p.ingresoMensual?.diaCobro ?? '';
  $('hoja-plata').showModal();
}

$('form-plata').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const saldo = centavos(f.saldo.value, true);
  if (saldo === null) return mostrarError('error-plata', t('Poné tu saldo'));
  const ingreso = f.ingreso.value.trim() ? centavos(f.ingreso.value) : 0;
  if (ingreso === null) return mostrarError('error-plata', t('Ingreso inválido'));
  const dia = Number(f.dia.value || 1);
  try {
    await acciones.guardarPlata(saldo, ingreso ? { monto: ingreso, diaCobro: Math.min(31, Math.max(1, dia)) } : null);
    $('hoja-plata').close();
    sonar('pop');
  } catch (err) {
    mostrarError('error-plata', err.message);
  }
});

// ---------- Idioma y moneda ----------

const MONEDAS = {
  USD: 'Dólar (USD)',
  ARS: 'Peso argentino (ARS)',
  EUR: 'Euro (EUR)',
  MXN: 'Peso mexicano (MXN)',
  CLP: 'Peso chileno (CLP)',
  COP: 'Peso colombiano (COP)',
  UYU: 'Peso uruguayo (UYU)',
  PEN: 'Sol peruano (PEN)',
  BRL: 'Real brasileño (BRL)',
};

function pintarIdioma() {
  aplicarIdioma();
  $('boton-idioma-entrada').textContent = idiomaActual() === 'es' ? 'English' : 'Español';
  $('boton-entrada').textContent = modoEntrada === 'registro' ? t('Crear cuenta') : t('Entrar');
  $('boton-salir').textContent = estado.modo === 'demo' ? t('Entrar') : t('Salir');
  configurarMoneda();
  pintarBotonSonido();
  if (!$('pantalla-app').hidden && estado.datos) pintar();
}

$('boton-idioma-entrada').addEventListener('click', () => {
  cambiarIdioma(idiomaActual() === 'es' ? 'en' : 'es');
  sonar('toque');
  pintarIdioma();
});

$('elegir-moneda').addEventListener('change', async (e) => {
  try {
    await api('PATCH', '/perfil', { moneda: e.target.value });
    await cargar();
    configurarMoneda(estado.perfil.moneda);
    sonar('pop');
    pintar();
  } catch (err) {
    avisar(err);
  }
});

$('elegir-idioma').addEventListener('change', async (e) => {
  cambiarIdioma(e.target.value);
  pintarIdioma();
  await api('PATCH', '/perfil', { idioma: e.target.value }).catch(avisar);
  if (estado.perfil) estado.perfil.idioma = e.target.value;
  pintarCuenta();
});

function pintarCuenta() {
  const p = estado.perfil;
  $('elegir-moneda').innerHTML = Object.entries(MONEDAS)
    .map(([c, n]) => `<option value="${c}" ${c === p?.moneda ? 'selected' : ''}>${t(n)}</option>`)
    .join('');
  $('elegir-idioma').innerHTML = Object.entries(IDIOMAS)
    .map(([c, n]) => `<option value="${c}" ${c === idiomaActual() ? 'selected' : ''}>${n}</option>`)
    .join('');
  const caja = $('premium-caja');
  const prem = p?.premium;
  if (prem?.activo) {
    caja.innerHTML = `<p>⭐ <b>${t('Sos Premium')}</b> · ${t('hasta el {fecha}', { fecha: new Date(prem.hasta).toLocaleDateString(locale()) })}</p>
      <button type="button" class="boton enlace chico" id="boton-cancelar-premium">${t('Cancelar la renovación')}</button>`;
    caja.querySelector('#boton-cancelar-premium').addEventListener('click', async () => {
      try {
        await api('POST', '/premium/cancelar');
        alertaSuave(t('Listo, no se renueva más. Seguís con Premium hasta el final del mes pagado.'));
      } catch (err) {
        avisar(err);
      }
    });
  } else {
    caja.innerHTML = `<button type="button" class="boton principal" id="boton-ir-premium">⭐ ${t('Hacete Premium')}</button>`;
    caja.querySelector('#boton-ir-premium').addEventListener('click', () => {
      $('hoja-cuenta').close();
      abrirPremium('');
    });
  }
}

// ---------- Premium (S1, S2, S5, S8) ----------

let configPremium = { pagos: false, asistente: false, precio: null };
async function cargarConfigPremium() {
  configPremium = await api('GET', '/premium/config').catch(() => configPremium);
}
const esPremium = () => estado.modo === 'real' && !!estado.perfil?.premium?.activo;

function abrirPremium(motivo) {
  mostrarError('error-premium', null);
  $('premium-mono').innerHTML = svgMono('rico');
  $('premium-motivo').textContent = motivo || t('Con Premium te cuido la plata el doble 🍌');
  const precio = configPremium.precio;
  $('premium-precio').innerHTML = precio
    ? t('<b>{precio}</b> por mes', { precio: new Intl.NumberFormat(locale(), { style: 'currency', currency: precio.moneda, maximumFractionDigits: 0 }).format(precio.monto) })
    : '';
  $('boton-suscribir').disabled = estado.modo !== 'real';
  $('hoja-premium').showModal();
}

$('form-premium').addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarError('error-premium', null);
  $('boton-suscribir').disabled = true;
  try {
    const r = await api('POST', '/premium/suscribir');
    if (r.url) {
      location.href = r.url;
      return;
    }
    // Si no se pudo iniciar el cobro, el back reinicia los usos gratis: no bloqueamos a nadie.
    if (r.regalo && estado.perfil) estado.perfil.usosGratis = r.usosGratis;
    $('hoja-premium').close();
    sonar('fanfarria');
    saltoMono();
    alertaSuave(t('No pudimos abrir el pago, así que te regalo más usos de Premium 🍌'), '');
  } catch (err) {
    mostrarError('error-premium', err.message);
  }
  $('boton-suscribir').disabled = false;
});

/** Al volver de Mercado Pago (#premium): se pregunta el estado sin esperar la notificación. */
async function volverDePago() {
  if (location.hash !== '#premium' || estado.modo !== 'real') return;
  history.replaceState(null, '', location.pathname);
  try {
    const r = await api('POST', '/premium/sincronizar');
    await cargar();
    pintar();
    if (r.premium) {
      sonar('fanfarria');
      saltoMono();
      alertaSuave(t('¡Ya sos Premium! Mona está feliz 🍌'), '');
    } else alertaSuave(t('Todavía no nos llegó el pago. Si ya pagaste, en unos minutos se activa.'));
  } catch (err) {
    avisar(err);
  }
}

// S5: un solo aviso liviano, propio, que se va con Premium o al cerrarlo (vuelve al otro día).
const CLAVE_AVISO = 'monasafer.aviso-cerrado';
function pintarAviso() {
  let cerrado = null;
  try {
    cerrado = localStorage.getItem(CLAVE_AVISO);
  } catch {
    /* sin storage */
  }
  $('aviso-premium').hidden = esPremium() || cerrado === hoy.toDateString();
}
$('aviso-cerrar').addEventListener('click', () => {
  try {
    localStorage.setItem(CLAVE_AVISO, hoy.toDateString());
  } catch {
    /* sin storage */
  }
  sonar('toque');
  $('aviso-premium').hidden = true;
});
$('aviso-probar').addEventListener('click', () => abrirChat());

// S2: métricas. Gratis 3 veces, después Premium. En la demo se ven siempre.
$('boton-metricas').addEventListener('click', async () => {
  sonar('toque');
  let quedan = null;
  if (estado.modo === 'real') {
    try {
      const r = await api('POST', '/premium/usar', { funcion: 'metricas' });
      if (!r.permitido) return abrirPremium(t('Ya usaste tus vistas gratis de las métricas.'));
      quedan = r.quedan;
    } catch (err) {
      return avisar(err);
    }
  }
  $('metricas').innerHTML =
    htmlMetricas(estado.datos, hoy, estado.mesVisto) +
    (quedan !== null ? `<p class="quedan-aviso">${t('Te quedan {n} vistas gratis.', { n: quedan })}</p>` : '');
  $('hoja-metricas').showModal();
});

// ---------- Chat con Mona (S3) y voz (S4) ----------

const chat = [];
function pintarChat() {
  const caja = $('chat');
  caja.replaceChildren(
    ...chat.map((m) => {
      const d = document.createElement('div');
      d.className = `burbuja ${m.rol}`;
      if (m.texto) {
        const p = document.createElement('p');
        p.textContent = m.texto;
        d.append(p);
      }
      for (const prop of m.propuestas ?? []) d.append(tarjetaPropuesta(prop));
      return d;
    }),
  );
  caja.scrollTop = caja.scrollHeight;
}

function textoPropuesta(p) {
  if (p.accion === 'pagar') return t('Marcar pagado: {nombre} ({mes})', { nombre: p.nombre, mes: nombreMes(p.mes) });
  if (p.accion === 'usar_reserva') return t('Usar {monto} de {nombre}', { monto: plata(p.monto), nombre: p.nombre });
  if (p.accion === 'editar_gasto') {
    const c = p.cambios;
    const partes = [c.emoji && c.nombre ? `${c.emoji} ${c.nombre}` : c.nombre || c.emoji, c.monto != null && plata(c.monto)].filter(Boolean);
    return t('Cambiar {nombre}: {cambios}', { nombre: p.nombre, cambios: partes.join(' · ') });
  }
  if (p.accion === 'monto_del_mes')
    return p.monto === 0
      ? t('Sacar {nombre} solo de {mes}', { nombre: p.nombre, mes: nombreMes(p.mes) })
      : t('{nombre} en {mes}: {monto}', { nombre: p.nombre, mes: nombreMes(p.mes), monto: plata(p.monto) });
  if (p.accion === 'terminar_gasto') return t('{nombre} hasta {mes} y después no va más', { nombre: p.nombre, mes: nombreMes(p.mesFin) });
  if (p.accion === 'borrar_gasto') return t('Borrar {nombre}', { nombre: p.nombre });
  if (p.accion === 'cambiar_saldo') return t('Saldo de hoy: {monto}', { monto: plata(p.saldo) });
  if (p.accion === 'cambiar_ingreso') return t('Ingreso: {monto} por mes, cobrás el día {dia}', { monto: plata(p.monto), dia: p.diaCobro });
  const g = p.gasto;
  const cuando =
    g.tipo === 'puntual'
      ? nombreMes(g.mesInicio)
      : g.mesFin
        ? t('de {desde} a {hasta}', { desde: nombreMes(g.mesInicio), hasta: nombreMes(g.mesFin) })
        : t('todos los meses');
  return `${g.emoji || '💸'} ${g.nombre} · ${plata(g.monto)}${g.tipo === 'puntual' ? '' : ` ${t('por mes')}`} · ${cuando}${g.tipo === 'reserva' ? ` · ${t('reserva')}` : ''}`;
}

function tarjetaPropuesta(p) {
  const div = document.createElement('div');
  div.className = 'propuesta';
  const txt = document.createElement('p');
  txt.textContent = textoPropuesta(p);
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'boton principal chico';
  b.textContent = p.hecha ? `✓ ${t('Listo')}` : p.accion === 'crear_gasto' ? t('Agregar') : p.accion === 'borrar_gasto' ? t('Borrar') : t('Confirmar');
  b.disabled = !!p.hecha;
  b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      if (p.accion === 'crear_gasto') await acciones.guardarGasto(null, p.gasto);
      else if (p.accion === 'pagar') {
        const l = { gastoId: p.gastoId, monto: estado.datos.gastos.find((g) => g.id === p.gastoId)?.monto ?? 0 };
        estado.mesVisto = p.mes;
        await acciones.pagar(l, true);
        sonar('moneda');
      } else if (p.accion === 'usar_reserva') await acciones.usar(p.gastoId, p.monto, p.nota);
      else if (p.accion === 'editar_gasto') await acciones.guardarGasto(p.gastoId, p.cambios);
      else if (p.accion === 'monto_del_mes') await acciones.montoDelMes(p.gastoId, p.mes, p.monto);
      else if (p.accion === 'terminar_gasto') {
        const finAntes = estado.datos.gastos.find((x) => x.id === p.gastoId)?.mesFin ?? null;
        await acciones.guardarGasto(p.gastoId, { mesFin: p.mesFin });
        ofrecerDeshacer(t('{nombre} ya no está desde {mes}', { nombre: p.nombre, mes: nombreMes(sumarMeses(p.mesFin, 1)) }), () => acciones.guardarGasto(p.gastoId, { mesFin: finAntes }));
      } else if (p.accion === 'borrar_gasto') {
        // Mismo camino que el botón Borrar: si se repite, pregunta qué meses sacar.
        const g = estado.datos.gastos.find((x) => x.id === p.gastoId);
        if (!g || !(await pedirBorrar(g, mesActual))) {
          b.disabled = false;
          return;
        }
      }
      else if (p.accion === 'cambiar_saldo') await acciones.guardarPlata(p.saldo, estado.datos.perfil.ingresoMensual ?? null);
      else if (p.accion === 'cambiar_ingreso') await acciones.guardarPlata(estado.datos.perfil.saldo, { monto: p.monto, diaCobro: p.diaCobro });
      p.hecha = true;
      sonar('pop');
      saltoMono();
      pintarChat();
    } catch (err) {
      b.disabled = false;
      avisar(err);
    }
  });
  div.append(txt, b);
  return div;
}

function abrirChat() {
  if (!chat.length) chat.push({ rol: 'mona', texto: t('¡Hola! Contame qué gastaste o qué vas a gastar y lo cargo por vos. Por ejemplo: "compré una campera en 6 cuotas".') });
  pintarChat();
  const q = estado.perfil?.usosGratis?.asistente;
  $('chat-quedan').textContent = estado.modo === 'real' && !esPremium() && q != null ? t('{n} mensajes gratis', { n: q }) : '';
  $('boton-mic').hidden = !Reconocimiento;
  $('hoja-chat').showModal();
  $('form-chat').texto.focus();
}
$('boton-chat').addEventListener('click', () => {
  sonar('toque');
  abrirChat();
});

$('form-chat').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = e.target.texto;
  const texto = input.value.trim();
  if (!texto) return;
  input.value = '';
  chat.push({ rol: 'usuario', texto });
  if (estado.modo !== 'real') {
    chat.push({ rol: 'mona', texto: t('En la demo no puedo cargar nada. Creá tu cuenta y probame gratis 🐒') });
    return pintarChat();
  }
  // Sin ANTHROPIC_API_KEY en el back, /premium/config lo dice: no llamamos para no mostrar un error crudo.
  if (!configPremium.asistente) {
    chat.push({ rol: 'mona', texto: t('Todavía estoy aprendiendo a charlar 🙈 El asistente se activa muy pronto.') });
    return pintarChat();
  }
  const pensando = { rol: 'mona', texto: '…' };
  chat.push(pensando);
  pintarChat();
  try {
    const r = await api('POST', '/asistente', {
      mensajes: chat.filter((m) => m !== pensando && m.texto && m.texto !== '…').map((m) => ({ rol: m.rol, texto: m.texto })),
    });
    chat.pop();
    if (r.requierePremium) {
      chat.push({ rol: 'mona', texto: t('Se terminaron los mensajes gratis. Con Premium seguimos charlando todo lo que quieras.') });
      pintarChat();
      $('hoja-chat').close();
      return abrirPremium(t('Se terminaron tus mensajes gratis con Mona.'));
    }
    chat.push({ rol: 'mona', texto: r.texto, propuestas: r.propuestas });
    if (r.quedan != null && estado.perfil?.usosGratis) {
      estado.perfil.usosGratis.asistente = r.quedan;
      $('chat-quedan').textContent = t('{n} mensajes gratis', { n: r.quedan });
    }
    sonar('pop');
  } catch (err) {
    chat.pop();
    chat.push({ rol: 'mona', texto: `🙈 ${err.message}` });
    sonar('error');
  }
  pintarChat();
});

const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
let escuchando = null;
$('boton-mic').addEventListener('click', () => {
  if (!Reconocimiento) return;
  if (escuchando) return escuchando.stop();
  const rec = new Reconocimiento();
  rec.lang = idiomaActual() === 'en' ? 'en-US' : 'es-AR';
  rec.interimResults = true;
  rec.onresult = (ev) => {
    $('form-chat').texto.value = Array.from(ev.results).map((r) => r[0].transcript).join(' ');
    if (ev.results[ev.results.length - 1].isFinal) $('form-chat').requestSubmit();
  };
  rec.onend = () => {
    escuchando = null;
    $('boton-mic').classList.remove('escuchando');
  };
  rec.onerror = () => alertaSuave(t('No te escuché bien. Probá de nuevo o escribilo.'));
  escuchando = rec;
  $('boton-mic').classList.add('escuchando');
  sonar('toque');
  rec.start();
});

// ---------- Arranque ----------

// PWA (C7): instalable y abre sin señal. Solo en prod, para no pelear con el dev server.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

pintarIdioma();

(async () => {
  if (codigoRecupero()) {
    mostrarEntrada();
    mostrarError('error-recuperar', null);
    return $('hoja-recuperar').showModal();
  }
  if (hayToken()) {
    try {
      estado.modo = 'real';
      await cargar();
      entrarApp();
      return volverDePago();
    } catch (err) {
      if (err instanceof ErrorApi && err.status === 401) guardarToken(null);
    }
  }
  mostrarEntrada();
})();
