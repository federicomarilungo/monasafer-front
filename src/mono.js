// El mono en SVG. Tres ánimos según el balance: feliz, nervioso y en pánico.

export function animoPara(balance, ingresoMensual) {
  if (balance < 0) return 'panico';
  const margen = Math.max(ingresoMensual * 0.1, 10000);
  return balance < margen ? 'nervioso' : 'feliz';
}

const bocas = {
  feliz: '<path d="M78 128 Q100 150 122 128" stroke="#4a2a14" stroke-width="5" fill="none" stroke-linecap="round"/>',
  nervioso: '<path d="M80 136 Q90 128 100 136 T120 136" stroke="#4a2a14" stroke-width="5" fill="none" stroke-linecap="round"/>',
  panico: '<ellipse cx="100" cy="136" rx="12" ry="15" fill="#4a2a14"/>',
};

const cejas = {
  feliz: '',
  nervioso: '<path d="M68 76 L88 82 M132 76 L112 82" stroke="#4a2a14" stroke-width="5" stroke-linecap="round"/>',
  panico: '<path d="M68 84 L88 74 M132 84 L112 74" stroke="#4a2a14" stroke-width="5" stroke-linecap="round"/>',
};

export function svgMono(animo) {
  return `
<svg viewBox="0 0 200 200" class="mono-svg mono-${animo}" role="img" aria-label="Mona está ${animo}">
  <circle cx="34" cy="96" r="24" fill="#8b5a2b"/><circle cx="34" cy="96" r="13" fill="#f2c9a0"/>
  <circle cx="166" cy="96" r="24" fill="#8b5a2b"/><circle cx="166" cy="96" r="13" fill="#f2c9a0"/>
  <circle cx="100" cy="100" r="70" fill="#8b5a2b"/>
  <path d="M100 60 C60 60 50 100 62 128 C70 160 130 160 138 128 C150 100 140 60 100 60Z" fill="#f2c9a0"/>
  <g class="ojos">
    <ellipse cx="80" cy="96" rx="9" ry="11" fill="#2b1608"/><circle cx="83" cy="92" r="3" fill="#fff"/>
    <ellipse cx="120" cy="96" rx="9" ry="11" fill="#2b1608"/><circle cx="123" cy="92" r="3" fill="#fff"/>
  </g>
  ${cejas[animo]}
  <ellipse cx="92" cy="116" rx="3" ry="2" fill="#4a2a14"/><ellipse cx="108" cy="116" rx="3" ry="2" fill="#4a2a14"/>
  ${bocas[animo]}
  ${animo === 'panico' ? '<path d="M150 60 q6 10 0 16 q-6 -6 0 -16Z" fill="#7cc6ff"/>' : ''}
</svg>`;
}

export const frases = {
  feliz: ['¡Vamos bien! Esa plata ya es ahorro.', 'Mona aprueba. Banana para vos.', 'Así se cuida la plata.'],
  nervioso: ['Ojo, vas justo este mes.', 'Mona se muerde las uñas…', 'Cuidado con los gastos sorpresa.'],
  panico: ['¡No llegás! Hay que recortar algo.', 'Mona está en modo emergencia.', 'Revisemos las reservas.'],
};
