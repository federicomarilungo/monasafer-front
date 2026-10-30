// Onboarding guiado por Mona (C6): saldo, ingreso y primeros fijos, en cuatro pasos cortos.
import { svgMono } from './mono.js';
import { centavos, plata, configurarMoneda } from './formato.js';
import { sonar } from './sonidos.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);

const FIJOS_COMUNES = [
  { nombre: 'Alquiler', emoji: '🏠' },
  { nombre: 'Expensas', emoji: '🏢' },
  { nombre: 'Internet', emoji: '📶' },
  { nombre: 'Celular', emoji: '📱' },
  { nombre: 'Luz', emoji: '⚡' },
  { nombre: 'Gas', emoji: '🔥' },
  { nombre: 'Gimnasio', emoji: '🏋️' },
  { nombre: 'Streaming', emoji: '📺' },
  { nombre: 'Prepaga', emoji: '💊' },
];
const RESERVAS_COMUNES = [
  { nombre: 'Súper', emoji: '🛒' },
  { nombre: 'Transporte', emoji: '🚌' },
  { nombre: 'Salidas', emoji: '🍺' },
];

/**
 * @param {object} op
 * @param {string} op.nombre
 * @param {string} op.mes  mes actual 'AAAA-MM'
 * @param {string} op.moneda  la sugerida (por país o zona horaria), editable en el primer paso
 * @param {Record<string,string>} op.monedas  código → nombre
 * @param {(moneda:string)=>Promise} op.guardarMoneda
 * @param {(saldo:number, ingreso:object|null)=>Promise} op.guardarPlata
 * @param {(g:object)=>Promise} op.crearGasto
 * @param {()=>number} op.balance  balance del mes actual con lo cargado
 * @param {()=>void} op.alTerminar
 */
export function iniciarOnboarding(op) {
  const form = $('onb-form');
  const pasos = [pasoSaldo, pasoIngreso, pasoFijos, pasoReservas, pasoFinal];
  let actual = 0;

  $('pantalla-onboarding').hidden = false;

  function decir(texto, animo = 'feliz') {
    $('mono-onb').innerHTML = svgMono(animo);
    $('mono-onb').animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-10px)' }, { transform: 'translateY(0)' }], { duration: 380 });
    $('onb-globo').textContent = texto;
    $('onb-globo').animate([{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 250, easing: 'ease-out' });
  }

  function ir(n) {
    actual = n;
    $('onb-progreso').style.width = `${((n + 1) / pasos.length) * 100}%`;
    form.onsubmit = null;
    form.replaceChildren();
    pasos[n]();
  }

  function error(msg) {
    sonar('error');
    let p = form.querySelector('.error');
    if (!p) {
      p = document.createElement('p');
      p.className = 'error';
      form.append(p);
    }
    p.textContent = msg;
  }

  function botones(principal, saltar) {
    const div = document.createElement('div');
    div.className = 'acciones';
    if (saltar) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'boton';
      b.textContent = saltar.texto;
      b.addEventListener('click', saltar.accion);
      div.append(b);
    }
    const ok = document.createElement('button');
    ok.type = 'submit';
    ok.className = 'boton principal';
    ok.textContent = principal;
    div.append(ok);
    form.append(div);
  }

  let saldo = 0;
  let moneda = op.moneda;
  configurarMoneda(moneda);
  // La moneda va en el primer paso y a la vista: antes quedaba en USD sin preguntar
  // (feedback del primer uso de un amigo de Fede, 23/10/2026).
  function pasoSaldo() {
    decir(t('¡Hola{nombre}! Soy Mona y te voy a cuidar la plata 🍌 Para arrancar: ¿cuánta plata tenés hoy en tu cuenta?', { nombre: op.nombre ? ` ${op.nombre}` : '' }));
    const opciones = Object.entries(op.monedas)
      .map(([c, n]) => `<option value="${c}" ${c === moneda ? 'selected' : ''}>${t(n)}</option>`)
      .join('');
    form.innerHTML = `<label class="campo">${t('Tu moneda')}<select name="moneda" class="onb-moneda">${opciones}</select></label>
      <label class="campo monto-campo"><span class="onb-saldo"></span><input name="saldo" inputmode="decimal" placeholder="0" required /></label>
      <p class="ayuda">${t('Lo que tenés en el banco o en efectivo ahora. Después lo podés corregir tocando "Saldo hoy".')}</p>`;
    const etiqueta = () => (form.querySelector('.onb-saldo').textContent = `${t('Saldo de hoy')} (${moneda})`);
    etiqueta();
    form.moneda.addEventListener('change', () => {
      moneda = form.moneda.value;
      configurarMoneda(moneda);
      etiqueta();
      sonar('toque');
    });
    botones(t('Seguir'));
    form.onsubmit = async (e) => {
      e.preventDefault();
      const c = centavos(form.saldo.value, true);
      if (c === null) return error(t('Poné un número, aunque sea 0'));
      try {
        await op.guardarMoneda(moneda);
      } catch (err) {
        return error(err.message);
      }
      saldo = c;
      sonar('pop');
      ir(1);
    };
  }

  function pasoIngreso() {
    decir(t('¿Cobrás algo todos los meses? Así puedo calcular cómo te va a ir en los meses que vienen.'));
    form.innerHTML = `<label class="campo monto-campo">${t('Ingreso por mes')} (${moneda})<input name="ingreso" inputmode="decimal" placeholder="0" /></label>
      <label class="campo">${t('¿Qué día cobrás?')}<input name="dia" type="number" min="1" max="31" placeholder="1" /></label>`;
    botones(t('Seguir'), { texto: t('No tengo fijo'), accion: () => guardar(null) });
    async function guardar(ingreso) {
      try {
        await op.guardarPlata(saldo, ingreso);
        sonar('pop');
        ir(2);
      } catch (err) {
        error(err.message);
      }
    }
    form.onsubmit = (e) => {
      e.preventDefault();
      const c = centavos(form.ingreso.value);
      if (!c) return error(t('Poné cuánto cobrás, o tocá "No tengo fijo"'));
      const dia = Math.min(31, Math.max(1, Number(form.dia.value || 1)));
      guardar({ monto: c, diaCobro: dia });
    };
  }

  /** Grilla de chips: tocás uno, ponés el monto y queda cargado. */
  function elegirVarios({ lista, texto, ayuda, crear, siguiente, animo }) {
    decir(texto, animo);
    const cargados = [];
    form.innerHTML = `<p class="ayuda">${ayuda}</p><div class="chips onb-chips"></div>
      <div class="onb-monto" hidden><label class="campo monto-campo"><span class="onb-que"></span><input name="monto" inputmode="decimal" placeholder="0" /></label>
      <div class="acciones"><button type="button" class="boton" data-cancelar>${t('Cancelar')}</button><button type="button" class="boton principal" data-agregar>${t('Agregar')}</button></div></div>
      <ul class="onb-cargados"></ul>`;
    const chips = form.querySelector('.onb-chips');
    const caja = form.querySelector('.onb-monto');
    let elegido = null;
    for (const item of lista) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = `${item.emoji} ${t(item.nombre)}`;
      b.addEventListener('click', () => {
        if (b.classList.contains('activo')) return;
        elegido = { item, boton: b };
        sonar('toque');
        caja.hidden = false;
        form.querySelector('.onb-que').textContent = t('¿Cuánto es {que} por mes?', { que: t(item.nombre).toLowerCase() });
        form.monto.value = '';
      });
      chips.append(b);
    }
    form.querySelector('[data-cancelar]').addEventListener('click', () => {
      caja.hidden = true;
      elegido = null;
    });
    async function agregar() {
      const c = centavos(form.monto.value);
      if (!c || !elegido) return error(t('Poné un monto'));
      try {
        await crear(elegido.item, c);
        cargados.push(`${elegido.item.emoji} ${t(elegido.item.nombre)} · ${plata(c)}`);
        elegido.boton.classList.add('activo');
        form.querySelector('.onb-cargados').innerHTML = cargados.map((t) => `<li>${t}</li>`).join('');
        caja.hidden = true;
        elegido = null;
        form.querySelector('.error')?.remove();
        sonar('pop');
        decir(t('¡Anotado! Te sobran {monto} a fin de mes. ¿Algo más?', { monto: plata(op.balance()) }), op.balance() < 0 ? 'panico' : 'feliz');
      } catch (err) {
        error(err.message);
      }
    }
    form.querySelector('[data-agregar]').addEventListener('click', agregar);
    botones(t('Seguir'), { texto: t('Saltear'), accion: siguiente });
    form.onsubmit = (e) => {
      e.preventDefault();
      if (!caja.hidden && form.monto.value) return agregar();
      siguiente();
    };
  }

  function pasoFijos() {
    elegirVarios({
      lista: FIJOS_COMUNES,
      texto: t('Ahora tus gastos fijos, los que pagás todos los meses. Tocá los que tengas.'),
      ayuda: t('Los que no estén acá los cargás después con el botón +.'),
      crear: (item, monto) => op.crearGasto({ nombre: t(item.nombre), emoji: item.emoji, monto, tipo: 'fijo', mesInicio: op.mes, mesFin: null }),
      siguiente: () => ir(3),
    });
  }

  function pasoReservas() {
    elegirVarios({
      lista: RESERVAS_COMUNES,
      texto: t('Último: las reservas. Es plata que apartás para cosas difíciles de calcular, como el súper, y la vas gastando.'),
      ayuda: t('Se repiten todos los meses y bajan solas con los días. Después podés cambiar a "cargo cada uso".'),
      crear: (item, monto) =>
        op.crearGasto({ nombre: t(item.nombre), emoji: item.emoji, monto, tipo: 'reserva', modoReserva: 'proporcional', recurrente: true, mesInicio: op.mes, mesFin: null }),
      siguiente: () => ir(4),
    });
  }

  function pasoFinal() {
    const b = op.balance();
    sonar(b >= 0 ? 'fanfarria' : 'error');
    decir(
      b >= 0
        ? t('¡Listo! Con lo que cargaste, a fin de mes te sobran {monto}. Ese es tu ahorro y mi trabajo es que crezca 🐒', { monto: plata(b) })
        : t('Uy, con lo que cargaste te faltan {monto} para llegar a fin de mes. Tranqui, lo vamos a ordenar juntos.', { monto: plata(-b) }),
      b >= 0 ? 'feliz' : 'nervioso',
    );
    form.innerHTML = `<p class="ayuda">${t('Tip: cuando pagues algo, tocá el círculo al lado del gasto. Mona lo descuenta del saldo y el balance no se mueve.')}</p>`;
    botones(t('¡Vamos!'));
    form.onsubmit = (e) => {
      e.preventDefault();
      $('pantalla-onboarding').hidden = true;
      op.alTerminar();
    };
  }

  ir(0);
}
