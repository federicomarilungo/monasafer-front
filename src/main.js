import './estilos.css';
import { mesDe, resumenDelMes, sumarMeses } from './motor.js';
import { animoPara, frases, svgMono } from './mono.js';
import { datosDemo } from './demo.js';
import { api, ErrorApi, guardarToken, hayToken } from './api.js';
import { centavos, plata, nombreMes, configurarMoneda } from './formato.js';
import { alternarSilencio, estaSilenciado, sonar } from './sonidos.js';
import { iniciarOnboarding } from './onboarding.js';

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

function animarNumero(el, desde, hasta, formato = plata, dura = 600) {
  if (desde === hasta) {
    el.textContent = formato(hasta);
    return;
  }
  const inicio = performance.now();
  const paso = (t) => {
    const p = Math.min(1, (t - inicio) / dura);
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
  const duracion = soloEste ? 'solo este mes' : g?.mesFin ? `hasta ${corto(g.mesFin)}` : 'todos los meses';
  if (l.tipo !== 'reserva') return duracion;
  return `reserva · ${g?.modoReserva === 'manual' ? 'cargás los usos' : 'baja con los días'} · ${duracion}`;
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
      ${l.tipo === 'reserva' ? `<p class="de">${pasada ? 'te pasaste de' : 'de'} ${plata(l.monto)}</p>` : ''}
    </div>
    ${puedePagar ? `<button class="check" aria-label="${l.pagado ? 'Desmarcar pagado' : 'Marcar pagado'}">${l.pagado ? '✓' : ''}</button>` : ''}`;
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
  animarNumero($('balance'), estado.balanceMostrado, r.balance);
  estado.balanceMostrado = r.balance;

  const esActual = estado.mesVisto === mesActual;
  // Mismo mes que antes: los números cuentan desde el valor anterior (se nota el impacto).
  const previo = estado.resumenMostrado?.mes === r.mes ? estado.resumenMostrado : r;
  $('resumen').innerHTML = `
    <button class="celda" id="celda-saldo" ${esActual ? '' : 'disabled'}><p class="etiqueta">${esActual ? 'Saldo hoy ✎' : 'Arrancás con'}</p><p id="valor-saldo"></p></button>
    <div class="celda"><p class="etiqueta">Ingreso</p><p class="mas">+${plata(r.ingreso)}</p></div>
    <div class="celda" id="celda-gastar"><p class="etiqueta">Por gastar</p><p class="menos" id="valor-gastar"></p></div>`;
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
  if (cobrar) $('aviso-cobro').textContent = `¿Ya cobraste los ${plata(ingreso.monto)} de este mes? Tocá para sumarlos al saldo 🍌`;

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
    tarjeta.innerHTML = `<p>🐒 En ${nombreMes(anterior).split(' ')[0].toLowerCase()} usaste <b>${plata(usado)}</b> en ${g.emoji || ''} <b></b> y habías reservado ${plata(g.monto)}. ¿La subimos a <b>${plata(nuevo)}</b>?</p>
      <div class="acciones"><button class="boton" data-no>Así está bien</button><button class="boton principal" data-si>Subir</button></div>`;
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

function alertaSuave(texto) {
  const t = document.createElement('div');
  t.className = 'tostada';
  t.textContent = `🙈 ${texto}`;
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
  $('meses-palabra').textContent = forma.meses === 1 ? 'mes' : 'meses';
  $('meses-menos').disabled = forma.meses <= 2;
  document.querySelectorAll('[data-meses]').forEach((b) => b.classList.toggle('activo', Number(b.dataset.meses) === forma.meses));
  $('es-reserva').checked = forma.reserva;
  $('campo-modo').hidden = !forma.reserva;
  document.querySelectorAll('#campo-modo [data-modo]').forEach((b) => b.classList.toggle('activo', b.dataset.modo === forma.modo));

  // Resumen en palabras de lo que va a pasar
  const monto = centavos($('form-gasto').monto.value) ?? 0;
  const inicio = mesInicioDelForm();
  const mesCorto = (m) => nombreMes(m).toLowerCase();
  const cuanto = monto ? plata(monto) : 'Este gasto';
  const verbo = forma.reserva ? 'se reservan' : 'se descuentan';
  let texto;
  if (forma.duracion === 'mes') texto = `${cuanto} ${verbo} solo en ${mesCorto(inicio)}.`;
  else if (forma.duracion === 'siempre') texto = `${cuanto} ${verbo} todos los meses desde ${mesCorto(inicio)}, hasta que lo borres.`;
  else {
    const fin = sumarMeses(inicio, forma.meses - 1);
    texto = `${cuanto} ${verbo} por mes de ${mesCorto(inicio)} a ${mesCorto(fin)}. Último mes: ${mesCorto(fin)}.`;
  }
  if (forma.reserva) texto += forma.modo === 'manual' ? ' Vas cargando cada uso.' : ' Baja sola a medida que pasan los días.';
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
  $('titulo-hoja-gasto').textContent = g ? 'Editar gasto' : 'Nuevo gasto';
  $('boton-borrar-gasto').hidden = !g;
  f.monto.value = g ? String(g.monto / 100) : '';
  f.nombre.value = g?.nombre ?? '';
  elegirEmoji(g?.emoji || '💸');
  emojiAMano = !!g;
  formaDesdeGasto(g);
  pintarForma();
  $('hoja-gasto').showModal();
  if (!g) f.monto.focus();
}

$('boton-nuevo').addEventListener('click', () => {
  sonar('toque');
  abrirGasto();
});

function pintarBotonSonido() {
  $('boton-sonido').textContent = estaSilenciado() ? '🔇' : '🔊';
  $('boton-sonido').setAttribute('aria-label', estaSilenciado() ? 'Activar sonidos' : 'Silenciar sonidos');
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
  if (monto === null) return mostrarError('error-gasto', 'Poné un monto válido');
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

$('boton-borrar-gasto').addEventListener('click', async () => {
  if (!gastoEditado) return;
  try {
    await acciones.borrarGasto(gastoEditado.id);
    $('hoja-gasto').close();
    sonar('caer');
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
  const manual = g?.modoReserva === 'manual';
  const esActual = estado.mesVisto === mesActual;
  const queda = manual ? l.monto - (l.usado ?? 0) : l.pendiente;
  $('frasco-reserva').style.width = `${l.monto ? (Math.max(0, queda) / l.monto) * 100 : 0}%`;
  $('texto-reserva').textContent = esActual
    ? queda < 0
      ? `Te pasaste por ${plata(-queda)} (usaste ${plata(l.usado)} de ${plata(l.monto)}). Ya salió de tu saldo, así que el balance está bien; capaz conviene subir la reserva.`
      : `Quedan ${plata(queda)} de ${plata(l.monto)}. ${manual ? 'Cargá cada uso y Mona lo resta.' : 'Baja sola con los días del mes; si gastaste distinto, ajustá tu saldo.'}`
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
  if (saldo === null) return mostrarError('error-plata', 'Poné tu saldo');
  const ingreso = f.ingreso.value.trim() ? centavos(f.ingreso.value) : 0;
  if (ingreso === null) return mostrarError('error-plata', 'Ingreso inválido');
  const dia = Number(f.dia.value || 1);
  try {
    await acciones.guardarPlata(saldo, ingreso ? { monto: ingreso, diaCobro: Math.min(31, Math.max(1, dia)) } : null);
    $('hoja-plata').close();
    sonar('pop');
  } catch (err) {
    mostrarError('error-plata', err.message);
  }
});

// ---------- Arranque ----------

// PWA (C7): instalable y abre sin señal. Solo en prod, para no pelear con el dev server.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

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
