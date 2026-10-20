import './estilos.css';
import { mesDe, resumenDelMes, sumarMeses } from './motor.js';
import { animoPara, frases, svgMono } from './mono.js';
import { datosDemo } from './demo.js';

const hoy = new Date();
const mesActual = mesDe(hoy);
const datos = datosDemo(hoy);
let mesVisto = mesActual;
let balanceMostrado = 0;

const $ = (id) => document.getElementById(id);
const moneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const plata = (centavos) => moneda.format(centavos / 100);
const nombreMes = (mes) => {
  const [a, m] = mes.split('-').map(Number);
  const texto = new Date(a, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

$('demo').hidden = false;

function animarNumero(desde, hasta) {
  const inicio = performance.now();
  const dura = 600;
  const paso = (t) => {
    const p = Math.min(1, (t - inicio) / dura);
    const suave = 1 - Math.pow(1 - p, 3);
    $('balance').textContent = plata(Math.round(desde + (hasta - desde) * suave));
    if (p < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

function etiquetaTipo(l) {
  if (l.tipo === 'fijo') return l.mesFin ? `fijo hasta ${nombreMes(l.mesFin).split(' ')[0].toLowerCase()}` : 'fijo';
  if (l.tipo === 'reserva') return l.modoReserva === 'manual' ? 'reserva · usos' : 'reserva · proporcional';
  return 'puntual';
}

function filaGasto(l) {
  const li = document.createElement('li');
  li.className = `gasto gasto-${l.tipo}${l.pagado ? ' pagado' : ''}`;
  const reserva =
    l.tipo === 'reserva'
      ? `<div class="frasco" aria-label="Queda ${plata(l.pendiente)} de ${plata(l.monto)}"><span style="width:${(l.pendiente / l.monto) * 100}%"></span></div>`
      : '';
  li.innerHTML = `
    <span class="emoji">${l.emoji ?? '💸'}</span>
    <div class="info">
      <p class="nombre">${l.nombre}</p>
      <p class="tipo">${etiquetaTipo(l)}</p>
      ${reserva}
    </div>
    <div class="montos">
      <p class="monto">${plata(l.tipo === 'reserva' ? l.pendiente : l.monto)}</p>
      ${l.tipo === 'reserva' ? `<p class="de">de ${plata(l.monto)}</p>` : ''}
    </div>
    ${
      mesVisto === mesActual && l.tipo !== 'reserva'
        ? `<button class="check" aria-label="${l.pagado ? 'Desmarcar' : 'Marcar pagado'}">${l.pagado ? '✓' : ''}</button>`
        : ''
    }`;
  li.querySelector('.check')?.addEventListener('click', () => alternarPagado(l));
  return li;
}

function alternarPagado(l) {
  // Pagar descuenta del saldo; el balance queda igual (regla P.3).
  const estado = datos.estados.find((e) => e.gastoId === l.gastoId && e.mes === mesActual);
  if (estado) estado.pagado = !estado.pagado;
  else datos.estados.push({ gastoId: l.gastoId, mes: mesActual, pagado: true });
  datos.perfil.saldo += l.pagado ? l.monto : -l.monto;
  if (!l.pagado) saltoMono();
  pintar();
}

function saltoMono() {
  $('mono').animate(
    [{ transform: 'translateY(0) rotate(0)' }, { transform: 'translateY(-18px) rotate(-8deg)' }, { transform: 'translateY(0) rotate(0)' }],
    { duration: 450, easing: 'ease-out' },
  );
}

function pintar(direccion = 0) {
  const r = resumenDelMes(datos, hoy, mesVisto);
  $('titulo-mes').textContent = mesVisto === mesActual ? `${nombreMes(mesVisto)} · hoy` : nombreMes(mesVisto);
  $('mes-anterior').disabled = mesVisto <= mesActual;

  const animo = animoPara(r.balance, datos.perfil.ingresoMensual?.monto ?? 0);
  $('mono').innerHTML = svgMono(animo);
  const opciones = frases[animo];
  $('frase').textContent = opciones[(r.mes.charCodeAt(6) + r.gastos.length) % opciones.length];
  $('tarjeta-balance').dataset.animo = animo;

  animarNumero(balanceMostrado, r.balance);
  balanceMostrado = r.balance;

  $('resumen').innerHTML = `
    <div><p class="etiqueta">${mesVisto === mesActual ? 'Saldo hoy' : 'Arrancás con'}</p><p>${plata(r.inicio)}</p></div>
    <div><p class="etiqueta">Ingreso</p><p class="mas">+${plata(r.ingreso)}</p></div>
    <div><p class="etiqueta">Por gastar</p><p class="menos">−${plata(r.totalPendiente)}</p></div>`;

  const lista = $('gastos');
  lista.replaceChildren(...r.gastos.map(filaGasto));
  if (direccion) {
    lista.animate([{ opacity: 0, transform: `translateX(${direccion * 40}px)` }, { opacity: 1, transform: 'none' }], {
      duration: 280,
      easing: 'ease-out',
    });
  }
}

function moverMes(n) {
  const nuevo = sumarMeses(mesVisto, n);
  if (nuevo < mesActual) return;
  mesVisto = nuevo;
  pintar(n);
}

$('mes-anterior').addEventListener('click', () => moverMes(-1));
$('mes-siguiente').addEventListener('click', () => moverMes(1));
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') moverMes(-1);
  if (e.key === 'ArrowRight') moverMes(1);
});
let toqueX = null;
document.addEventListener('touchstart', (e) => (toqueX = e.touches[0].clientX), { passive: true });
document.addEventListener('touchend', (e) => {
  if (toqueX === null) return;
  const dx = e.changedTouches[0].clientX - toqueX;
  if (Math.abs(dx) > 60) moverMes(dx < 0 ? 1 : -1);
  toqueX = null;
});

pintar();
