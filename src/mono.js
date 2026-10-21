// El mono en SVG. Tres ánimos según el balance: feliz, nervioso y en pánico.

export function animoPara(balance, ingresoMensual) {
  if (balance < 0) return 'panico';
  const margen = Math.max(ingresoMensual * 0.1, 10000);
  if (balance < margen) return 'nervioso';
  // Ahorro de más de un sueldo: Mona se pone los anteojos de sol.
  if (ingresoMensual > 0 && balance >= ingresoMensual) return 'rico';
  return 'feliz';
}

const bocas = {
  rico: '<path d="M76 126 Q100 156 124 126 Z" fill="#4a2a14"/><path d="M84 130 Q100 140 116 130" stroke="#fff" stroke-width="4" fill="none"/>',
  feliz: '<path d="M78 128 Q100 150 122 128" stroke="#4a2a14" stroke-width="5" fill="none" stroke-linecap="round"/>',
  nervioso: '<path d="M80 136 Q90 128 100 136 T120 136" stroke="#4a2a14" stroke-width="5" fill="none" stroke-linecap="round"/>',
  panico: '<ellipse cx="100" cy="136" rx="12" ry="15" fill="#4a2a14"/>',
};

const cejas = {
  rico: '',
  feliz: '',
  nervioso: '<path d="M68 76 L88 82 M132 76 L112 82" stroke="#4a2a14" stroke-width="5" stroke-linecap="round"/>',
  panico: '<path d="M68 84 L88 74 M132 84 L112 74" stroke="#4a2a14" stroke-width="5" stroke-linecap="round"/>',
};

// Premium: Mona con corona (y brillito).
const corona = `<g class="corona">
    <path d="M70 38 L74 8 L88 24 L100 2 L112 24 L126 8 L130 38 Z" fill="#ffd23f" stroke="#c98a00" stroke-width="3" stroke-linejoin="round"/>
    <rect x="68" y="34" width="64" height="9" rx="4" fill="#f5b800" stroke="#c98a00" stroke-width="3"/>
    <circle cx="100" cy="24" r="5" fill="#e5484d"/><circle cx="84" cy="30" r="3.5" fill="#2f9e6b"/><circle cx="116" cy="30" r="3.5" fill="#2f9e6b"/>
    <path class="brillo" d="M80 14 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z" fill="#fff"/>
  </g>`;

export function svgMono(animo, conCorona = false) {
  return `
<svg viewBox="0 0 200 200" class="mono-svg mono-${animo}" role="img" aria-label="Mona está ${animo}">
  <circle cx="34" cy="96" r="24" fill="#8b5a2b"/><circle cx="34" cy="96" r="13" fill="#f2c9a0"/>
  <circle cx="166" cy="96" r="24" fill="#8b5a2b"/><circle cx="166" cy="96" r="13" fill="#f2c9a0"/>
  <circle cx="100" cy="100" r="70" fill="#8b5a2b"/>
  <path d="M100 60 C60 60 50 100 62 128 C70 160 130 160 138 128 C150 100 140 60 100 60Z" fill="#f2c9a0"/>
  <g class="ojos"><g class="pupilas">
    <ellipse cx="80" cy="96" rx="9" ry="11" fill="#2b1608"/><circle cx="83" cy="92" r="3" fill="#fff"/>
    <ellipse cx="120" cy="96" rx="9" ry="11" fill="#2b1608"/><circle cx="123" cy="92" r="3" fill="#fff"/>
  </g></g>
  ${
    animo === 'rico'
      ? '<g class="anteojos"><rect x="62" y="84" width="34" height="22" rx="8" fill="#1d1d1d"/><rect x="104" y="84" width="34" height="22" rx="8" fill="#1d1d1d"/><path d="M96 92 h8" stroke="#1d1d1d" stroke-width="4"/><path d="M68 89 l8 0" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/></g>'
      : ''
  }
  ${cejas[animo]}
  <ellipse cx="92" cy="116" rx="3" ry="2" fill="#4a2a14"/><ellipse cx="108" cy="116" rx="3" ry="2" fill="#4a2a14"/>
  ${bocas[animo]}
  ${animo === 'panico' ? '<path d="M150 60 q6 10 0 16 q-6 -6 0 -16Z" fill="#7cc6ff"/>' : ''}
  ${conCorona ? corona : ''}
</svg>`;
}

export const frases = {
  rico: ['¡Ahorraste más de un sueldo! 😎', 'Mona está de vacaciones mentales.', 'Esto ya es colchón de verdad.'],
  feliz: ['¡Vamos bien! Esa plata ya es ahorro.', 'Mona aprueba. Banana para vos.', 'Así se cuida la plata.'],
  nervioso: ['Ojo, vas justo este mes.', 'Mona se muerde las uñas…', 'Cuidado con los gastos sorpresa.'],
  panico: ['¡No llegás! Hay que recortar algo.', 'Mona está en modo emergencia.', 'Revisemos las reservas.'],
};

/** Lo que dice Mona cuando la tocás. */
export const cosquillas = [
  '¡Jaja, cosquillas!',
  '¿Ya anotaste lo de hoy?',
  'Una banana por cada peso ahorrado 🍌',
  'Si pagás algo, tocá el círculo y yo lo resto.',
  'Mirá los meses que vienen con la flecha →',
  'Ojo con los gastos hormiga…',
  'Soy Mona, tu mono ahorrador.',
];
