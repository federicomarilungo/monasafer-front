import './estilos.css';
import { mesDe, resumenDelMes, sumarMeses } from './motor.js';
import { animoPara, frases, svgMono } from './mono.js';
import { datosDemo } from './demo.js';
import { api, ErrorApi, guardarToken, hayToken } from './api.js';
import { centavos, plata, nombreMes, configurarMoneda } from './formato.js';

const $ = (id) => document.getElementById(id);
const hoy = new Date();
const mesActual = mesDe(hoy);

// modo: 'real' (API) o 'demo' (todo en memoria, mismas reglas)
const estado = { modo: 'demo', datos: null, perfil: null, mesVisto: mesActual, balanceMostrado: 0 };

// ---------- Entrada ----------

let modoEntrada = 'login';

function mostrarEntrada() {
  $('pantalla-app').hidden = true;
  $('pantalla-entrada').hidden = false;
  $('mono-entrada').innerHTML = svgMono('feliz');
}

document.querySelectorAll('.pestana').forEach((b) =>
  b.addEventListener('click', () => {
    modoEntrada = b.dataset.modo;
    document.querySelectorAll('.pestana').forEach((x) => x.classList.toggle('activa', x === b));
    $('campo-nombre').hidden = modoEntrada !== 'registro';
    $('boton-entrada').textContent = modoEntrada === 'registro' ? 'Crear cuenta' : 'Entrar';
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
    if (modoEntrada === 'registro') cuerpo.nombre = f.nombre.value;
    const r = await api('POST', `/auth/${modoEntrada}`, cuerpo);
    guardarToken(r.token);
    estado.modo = 'real';
    await cargar();
    entrarApp();
  } catch (err) {
    const msg = err instanceof ErrorApi && err.status === 404 ? 'Las cuentas todavía no están activas. Mientras, mirá la demo.' : err.message;
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

$('boton-salir').addEventListener('click', () => {
  guardarToken(null);
  estado.datos = null;
  mostrarEntrada();
});

function entrarApp() {
  $('pantalla-entrada').hidden = true;
  $('pantalla-app').hidden = false;
  $('demo').hidden = estado.modo !== 'demo';
  $('boton-salir').textContent = estado.modo === 'demo' ? 'Entrar' : 'Salir';
  configurarMoneda(estado.perfil?.moneda ?? 'USD');
  estado.mesVisto = mesActual;
  pintar();
  if (estado.modo === 'real' && estado.datos.gastos.length === 0 && estado.datos.perfil.saldo === 0) abrirPlata();
}

async function cargar() {
  const [datos, perfil] = await Promise.all([api('GET', '/datos'), api('GET', '/perfil')]);
  estado.datos = datos;
  estado.perfil = perfil;
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

function animarNumero(desde, hasta) {
  const inicio = performance.now();
  const paso = (t) => {
    const p = Math.min(1, (t - inicio) / 600);
    $('balance').textContent = plata(Math.round(desde + (hasta - desde) * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

function etiquetaTipo(l, g) {
  if (l.tipo === 'fijo') return g?.mesFin ? `fijo hasta ${nombreMes(g.mesFin).split(' ')[0].toLowerCase()}` : 'fijo';
  if (l.tipo === 'reserva') return g?.modoReserva === 'manual' ? 'reserva · cargás los usos' : 'reserva · baja con los días';
  return 'solo este mes';
}

function filaGasto(l) {
  const g = estado.datos.gastos.find((x) => x.id === l.gastoId);
  const li = document.createElement('li');
  li.className = `gasto gasto-${l.tipo}${l.pagado ? ' pagado' : ''}`;
  li.tabIndex = 0;
  const frasco = l.tipo === 'reserva' ? `<div class="frasco"><span style="width:${l.monto ? (l.pendiente / l.monto) * 100 : 0}%"></span></div>` : '';
  const puedePagar = l.tipo !== 'reserva';
  li.innerHTML = `
    <span class="emoji">${g?.emoji || '💸'}</span>
    <div class="info">
      <p class="nombre"></p>
      <p class="tipo">${etiquetaTipo(l, g)}</p>
      ${frasco}
    </div>
    <div class="montos">
      <p class="monto">${plata(l.tipo === 'reserva' ? l.pendiente : l.monto)}</p>
      ${l.tipo === 'reserva' ? `<p class="de">de ${plata(l.monto)}</p>` : ''}
    </div>
    ${puedePagar ? `<button class="check" aria-label="${l.pagado ? 'Desmarcar pagado' : 'Marcar pagado'}">${l.pagado ? '✓' : ''}</button>` : ''}`;
  li.querySelector('.nombre').textContent = l.nombre;
  li.querySelector('.check')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!l.pagado) saltoMono();
    acciones.pagar(l, !l.pagado).catch(avisar);
  });
  li.addEventListener('click', () => (l.tipo === 'reserva' ? abrirReserva(l, g) : abrirGasto(g)));
  return li;
}

function saltoMono() {
  $('mono').animate(
    [{ transform: 'translateY(0) rotate(0)' }, { transform: 'translateY(-18px) rotate(-8deg)' }, { transform: 'translateY(0) rotate(0)' }],
    { duration: 450, easing: 'ease-out' },
  );
}

function pintar(direccion = 0) {
  const d = estado.datos;
  const r = resumenDelMes(d, hoy, estado.mesVisto);
  $('titulo-mes').textContent = estado.mesVisto === mesActual ? `${nombreMes(estado.mesVisto)} · hoy` : nombreMes(estado.mesVisto);
  $('mes-anterior').disabled = estado.mesVisto <= mesActual;

  const animo = animoPara(r.balance, d.perfil.ingresoMensual?.monto ?? 0);
  $('mono').innerHTML = svgMono(animo);
  const opciones = frases[animo];
  $('frase').textContent = opciones[(Number(r.mes.slice(5)) + r.gastos.length) % opciones.length];
  $('tarjeta-balance').dataset.animo = animo;
  animarNumero(estado.balanceMostrado, r.balance);
  estado.balanceMostrado = r.balance;

  const esActual = estado.mesVisto === mesActual;
  $('resumen').innerHTML = `
    <button class="celda" id="celda-saldo" ${esActual ? '' : 'disabled'}><p class="etiqueta">${esActual ? 'Saldo hoy ✎' : 'Arrancás con'}</p><p>${plata(r.inicio)}</p></button>
    <div class="celda"><p class="etiqueta">Ingreso</p><p class="mas">+${plata(r.ingreso)}</p></div>
    <div class="celda"><p class="etiqueta">Por gastar</p><p class="menos">−${plata(r.totalPendiente)}</p></div>`;
  $('celda-saldo').addEventListener('click', abrirPlata);

  const ingreso = d.perfil.ingresoMensual;
  const cobrar = esActual && ingreso && d.perfil.ingresoCobradoMes !== mesActual && hoy.getDate() >= ingreso.diaCobro;
  $('aviso-cobro').hidden = !cobrar;
  if (cobrar) $('aviso-cobro').textContent = `¿Ya cobraste los ${plata(ingreso.monto)} de este mes? Tocá para sumarlos al saldo 🍌`;

  const lista = $('gastos');
  lista.replaceChildren(...r.gastos.map(filaGasto));
  $('vacio').hidden = r.gastos.length > 0;
  if (direccion) {
    lista.animate([{ opacity: 0, transform: `translateX(${direccion * 40}px)` }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'ease-out' });
  }
}

$('aviso-cobro').addEventListener('click', () => acciones.cobrar().then(saltoMono).catch(avisar));

function moverMes(n) {
  const nuevo = sumarMeses(estado.mesVisto, n);
  if (nuevo < mesActual || $('pantalla-app').hidden || document.querySelector('dialog[open]')) return;
  estado.mesVisto = nuevo;
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
  $(id).hidden = !msg;
  $(id).textContent = msg ?? '';
}

function avisar(err) {
  if (err instanceof ErrorApi && err.status === 401) {
    guardarToken(null);
    mostrarEntrada();
    return;
  }
  alertaSuave(err.message);
}

function alertaSuave(texto) {
  const t = document.createElement('div');
  t.className = 'tostada';
  t.textContent = `🙈 ${texto}`;
  document.body.append(t);
  setTimeout(() => t.remove(), 3500);
}

// Gasto
const EMOJIS = ['💸', '🏠', '🛒', '🚌', '⚡', '📶', '💳', '👟', '🍔', '🎁', '💊', '🎓', '🐶', '✈️'];
let gastoEditado = null;
let tipoElegido = 'puntual';
let modoElegido = 'proporcional';
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
  [/alquiler|expensa|casa|depto/i, '🏠'], [/s[uú]per|chino|mercado|verdu/i, '🛒'], [/transporte|sube|colectivo|subte|nafta|uber|taxi/i, '🚌'],
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

const AYUDAS = {
  puntual: 'Se descuenta solo en este mes.',
  fijo: 'Se repite todos los meses. Si tiene fin (cuotas), poné el último mes.',
  reserva: 'Apartás un monto para algo difícil de estimar (transporte, súper) y lo vas gastando.',
};

function elegirTipo(t) {
  tipoElegido = t;
  document.querySelectorAll('[data-tipo]').forEach((b) => b.classList.toggle('activo', b.dataset.tipo === t));
  $('ayuda-tipo').textContent = AYUDAS[t];
  $('campo-hasta').hidden = t === 'puntual';
  $('campo-modo').hidden = t !== 'reserva';
}
function elegirModo(m) {
  modoElegido = m;
  document.querySelectorAll('[data-modo]').forEach((b) => b.classList.toggle('activo', b.dataset.modo === m));
}
document.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => elegirTipo(b.dataset.tipo)));
document.querySelectorAll('#campo-modo [data-modo]').forEach((b) => b.addEventListener('click', () => elegirModo(b.dataset.modo)));

function abrirGasto(g = null) {
  gastoEditado = g;
  const f = $('form-gasto');
  f.reset();
  mostrarError('error-gasto', null);
  $('titulo-hoja-gasto').textContent = g ? 'Editar gasto' : 'Nuevo gasto';
  $('boton-borrar-gasto').hidden = !g;
  f.monto.value = g ? String(g.monto / 100) : '';
  f.nombre.value = g?.nombre ?? '';
  f.mesFin.value = g?.mesFin ?? '';
  elegirEmoji(g?.emoji || '💸');
  emojiAMano = !!g;
  elegirTipo(g?.tipo ?? 'puntual');
  elegirModo(g?.modoReserva ?? 'proporcional');
  $('hoja-gasto').showModal();
  if (!g) f.monto.focus();
}

$('boton-nuevo').addEventListener('click', () => abrirGasto());

$('form-gasto').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const monto = centavos(f.monto.value);
  if (monto === null) return mostrarError('error-gasto', 'Poné un monto válido');
  const g = { nombre: f.nombre.value.trim(), emoji: emojiElegido, monto, tipo: tipoElegido };
  if (!gastoEditado) g.mesInicio = estado.mesVisto;
  if (tipoElegido !== 'puntual') g.mesFin = f.mesFin.value || null;
  if (tipoElegido === 'reserva') {
    g.modoReserva = modoElegido;
    g.recurrente = true;
  }
  try {
    await acciones.guardarGasto(gastoEditado?.id, g);
    $('hoja-gasto').close();
    saltoMono();
  } catch (err) {
    mostrarError('error-gasto', err.message);
  }
});

$('boton-borrar-gasto').addEventListener('click', async () => {
  if (!gastoEditado) return;
  try {
    await acciones.borrarGasto(gastoEditado.id);
    $('hoja-gasto').close();
  } catch (err) {
    mostrarError('error-gasto', err.message);
  }
});

// Reserva
let reservaAbierta = null;

async function abrirReserva(l, g) {
  reservaAbierta = { l, g };
  const f = $('form-uso');
  f.reset();
  mostrarError('error-uso', null);
  $('titulo-reserva').textContent = `${g?.emoji ?? ''} ${l.nombre}`;
  $('frasco-reserva').style.width = `${l.monto ? (l.pendiente / l.monto) * 100 : 0}%`;
  const manual = g?.modoReserva === 'manual';
  const esActual = estado.mesVisto === mesActual;
  $('texto-reserva').textContent = esActual
    ? `Quedan ${plata(l.pendiente)} de ${plata(l.monto)}. ${manual ? 'Cargá cada uso y Mona lo resta.' : 'Baja sola con los días del mes; si gastaste distinto, ajustá tu saldo.'}`
    : `En ${nombreMes(estado.mesVisto)} vas a tener ${plata(l.monto)} reservados.`;
  $('carga-uso').hidden = !(manual && esActual);
  $('boton-usar').hidden = !(manual && esActual);
  $('lista-usos').replaceChildren();
  $('hoja-reserva').showModal();
  if (manual && esActual) {
    const usos = estado.modo === 'real' ? await api('GET', `/gastos/${l.gastoId}/usos?mes=${mesActual}`).catch(() => []) : estado.datos.usos.filter((u) => u.gastoId === l.gastoId && u.mes === mesActual);
    $('lista-usos').replaceChildren(
      ...usos.map((u) => {
        const li = document.createElement('li');
        li.textContent = `${u.nota || 'Uso'} · ${plata(u.monto)}`;
        return li;
      }),
    );
  }
}

$('form-uso').addEventListener('submit', async (e) => {
  e.preventDefault();
  const monto = centavos(e.target.monto.value);
  if (!monto) return mostrarError('error-uso', 'Poné cuánto usaste');
  try {
    await acciones.usar(reservaAbierta.l.gastoId, monto, e.target.nota.value.trim());
    $('hoja-reserva').close();
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
  if (saldo === null) return mostrarError('error-plata', 'Poné tu saldo');
  const ingreso = f.ingreso.value.trim() ? centavos(f.ingreso.value) : 0;
  if (ingreso === null) return mostrarError('error-plata', 'Ingreso inválido');
  const dia = Number(f.dia.value || 1);
  try {
    await acciones.guardarPlata(saldo, ingreso ? { monto: ingreso, diaCobro: Math.min(31, Math.max(1, dia)) } : null);
    $('hoja-plata').close();
  } catch (err) {
    mostrarError('error-plata', err.message);
  }
});

// ---------- Arranque ----------

(async () => {
  if (hayToken()) {
    try {
      estado.modo = 'real';
      await cargar();
      return entrarApp();
    } catch (err) {
      if (err instanceof ErrorApi && err.status === 401) guardarToken(null);
    }
  }
  mostrarEntrada();
})();
