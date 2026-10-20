// Sonidos de Mona, sintetizados con Web Audio (sin archivos). Cortos, redondos y con
// rebote, estilo Tricky Towers: notas de marimba con un poco de brillo.

const CLAVE = 'monasafer.silencio';
let ctx = null;
let silencio = leer();

function leer() {
  try {
    return localStorage.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
}

export const estaSilenciado = () => silencio;

export function alternarSilencio() {
  silencio = !silencio;
  try {
    localStorage.setItem(CLAVE, silencio ? '1' : '0');
  } catch {
    /* sin storage: dura la sesión */
  }
  if (!silencio) sonar('toque');
  return silencio;
}

function contexto() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Una nota tipo marimba: onda con ataque instantáneo y caída rápida, más un armónico. */
function nota(c, frecuencia, cuando, { dura = 0.25, volumen = 0.25, tipo = 'triangle', desliz = 0 } = {}) {
  const t = c.currentTime + cuando;
  const salida = c.createGain();
  salida.gain.setValueAtTime(0.0001, t);
  salida.gain.exponentialRampToValueAtTime(volumen, t + 0.008);
  salida.gain.exponentialRampToValueAtTime(0.0001, t + dura);
  salida.connect(c.destination);
  [
    [1, tipo, 1],
    [4, 'sine', 0.18],
  ].forEach(([mult, forma, nivel]) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = forma;
    o.frequency.setValueAtTime(frecuencia * mult, t);
    if (desliz) o.frequency.exponentialRampToValueAtTime(frecuencia * mult * desliz, t + dura * 0.6);
    g.gain.value = nivel;
    o.connect(g).connect(salida);
    o.start(t);
    o.stop(t + dura + 0.05);
  });
}

function soplido(c, cuando, dura, desde, hasta, volumen = 0.12) {
  const t = c.currentTime + cuando;
  const largo = Math.floor(c.sampleRate * dura);
  const buffer = c.createBuffer(1, largo, c.sampleRate);
  const datos = buffer.getChannelData(0);
  for (let i = 0; i < largo; i++) datos[i] = Math.random() * 2 - 1;
  const fuente = c.createBufferSource();
  fuente.buffer = buffer;
  const filtro = c.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.Q.value = 1.2;
  filtro.frequency.setValueAtTime(desde, t);
  filtro.frequency.exponentialRampToValueAtTime(hasta, t + dura);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volumen, t + dura * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dura);
  fuente.connect(filtro).connect(g).connect(c.destination);
  fuente.start(t);
}

const SONIDOS = {
  // Pagar: moneda que cae en la alcancía (dos notas brillantes que suben) + golpecito.
  moneda: (c) => {
    nota(c, 1318.5, 0, { dura: 0.12, volumen: 0.18, tipo: 'square' });
    nota(c, 1975.5, 0.07, { dura: 0.35, volumen: 0.2, tipo: 'square' });
    nota(c, 196, 0.02, { dura: 0.12, volumen: 0.25, tipo: 'sine', desliz: 0.6 });
  },
  // Agregar: "pop" de bloque que encaja, con rebote.
  pop: (c) => {
    nota(c, 523.3, 0, { dura: 0.14, volumen: 0.28, desliz: 1.5 });
    nota(c, 784, 0.09, { dura: 0.22, volumen: 0.22 });
  },
  // Usar reserva: banana que se come (dos notas que bajan, como un "ñam").
  plop: (c) => {
    nota(c, 659.3, 0, { dura: 0.12, volumen: 0.25, desliz: 0.7 });
    nota(c, 440, 0.1, { dura: 0.2, volumen: 0.22, desliz: 0.8 });
  },
  // Cobrar: arpegio de fiesta.
  fanfarria: (c) => {
    [523.3, 659.3, 784, 1046.5].forEach((f, i) => nota(c, f, i * 0.08, { dura: 0.3, volumen: 0.22 }));
    nota(c, 1568, 0.34, { dura: 0.5, volumen: 0.16, tipo: 'square' });
  },
  // Cambiar de mes: soplido corto de hoja que pasa.
  pasar: (c) => soplido(c, 0, 0.22, 600, 2400, 0.1),
  // Borrar: bloque que se cae.
  caer: (c) => {
    nota(c, 392, 0, { dura: 0.25, volumen: 0.22, desliz: 0.5 });
    soplido(c, 0.05, 0.2, 1500, 300, 0.06);
  },
  // Error: dos notas graves "uh-oh".
  error: (c) => {
    nota(c, 311.1, 0, { dura: 0.16, volumen: 0.2, tipo: 'square' });
    nota(c, 233.1, 0.15, { dura: 0.28, volumen: 0.2, tipo: 'square' });
  },
  // Toque: click suave de madera.
  toque: (c) => nota(c, 880, 0, { dura: 0.08, volumen: 0.15, tipo: 'sine' }),
};

export function sonar(nombre) {
  if (silencio) return;
  const c = contexto();
  if (!c || !SONIDOS[nombre]) return;
  try {
    SONIDOS[nombre](c);
  } catch {
    /* un sonido nunca rompe la app */
  }
}
