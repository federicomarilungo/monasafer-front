// Formato de plata y meses. Montos siempre en centavos.

let moneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function configurarMoneda(codigo) {
  moneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: codigo, maximumFractionDigits: 0 });
}

export const plata = (c) => moneda.format(c / 100);

/** "1.234,50", "1234.5" o "60" → centavos. null si no es un número válido. */
export function centavos(texto, permitirNegativo = false) {
  let t = String(texto).trim().replace(/\s|\$|US/g, '');
  if (!t) return null;
  // Con coma decimal (es-AR): los puntos son de miles.
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  if (!Number.isFinite(n) || (!permitirNegativo && n < 0)) return null;
  return Math.round(n * 100);
}

export function nombreMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  const texto = new Date(a, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
