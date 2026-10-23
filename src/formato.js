// Formato de plata y meses. Montos siempre en centavos.
import { idiomaActual, locale } from './i18n.js';

let codigoMoneda = 'USD';
let moneda = null;

export function configurarMoneda(codigo = codigoMoneda) {
  codigoMoneda = codigo;
  moneda = new Intl.NumberFormat(locale(), { style: 'currency', currency: codigo, maximumFractionDigits: 0 });
}

export const plata = (c) => (moneda ?? (configurarMoneda(), moneda)).format(c / 100);

/** "1.234,50", "1234.5" o "60" → centavos (en inglés: "1,234.50"). null si no es un número válido. */
export function centavos(texto, permitirNegativo = false) {
  let t = String(texto).trim().replace(/\s|\$|US|[A-Z]{3}|€|R/g, '');
  if (!t) return null;
  if (idiomaActual() === 'en') t = t.replace(/,/g, '');
  // Con coma decimal (es-AR): los puntos son de miles.
  else if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  if (!Number.isFinite(n) || (!permitirNegativo && n < 0)) return null;
  return Math.round(n * 100);
}

/** Centavos → texto para un input, con miles: 1234.5 → "1.234,5" (en inglés "1,234.5"). */
export const paraEditar = (c, decimales = 2) =>
  (c / 10 ** decimales).toLocaleString(locale(), { maximumFractionDigits: decimales });

/**
 * Lo que se escribe en un monto, con separador de miles: "700000" → "700.000" (en inglés
 * "700,000"). En castellano la coma es la de decimales y los puntos se ignoran: los pone
 * esto, así quien escribe "700.000" a mano también llega bien. Pedido de un amigo de
 * Fede en su primer uso (23/10/2026).
 */
export function conMiles(texto, idioma = idiomaActual()) {
  const [dec, miles] = idioma === 'en' ? ['.', ','] : [',', '.'];
  let s = String(texto).replace('−', '-');
  const menos = /^\s*-/.test(s) ? '-' : '';
  const i = s.indexOf(dec);
  const entero = (i < 0 ? s : s.slice(0, i)).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  const decimales = i < 0 ? null : s.slice(i + 1).replace(/\D/g, '');
  const agrupado = entero.replace(/\B(?=(\d{3})+(?!\d))/g, miles);
  if (decimales === null) return menos + agrupado;
  return `${menos}${agrupado || '0'}${dec}${decimales}`;
}

/** Moneda probable de quien entra, por país del navegador o zona horaria. USD si no se sabe. */
export function monedaSugerida(
  idiomas = (typeof navigator !== 'undefined' && (navigator.languages?.length ? navigator.languages : [navigator.language])) || [],
  zona = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
) {
  const PAISES = { AR: 'ARS', UY: 'UYU', CL: 'CLP', CO: 'COP', PE: 'PEN', MX: 'MXN', BR: 'BRL', US: 'USD', ES: 'EUR', DE: 'EUR', FR: 'EUR', IT: 'EUR', PT: 'EUR', NL: 'EUR', IE: 'EUR', AT: 'EUR', BE: 'EUR', FI: 'EUR', GR: 'EUR' };
  // La zona horaria manda: alguien en Buenos Aires con el navegador en inglés usa pesos.
  if (zona.startsWith('America/Argentina/') || zona === 'America/Buenos_Aires') return 'ARS';
  const ZONAS = {
    'America/Montevideo': 'UYU',
    'America/Santiago': 'CLP',
    'America/Bogota': 'COP',
    'America/Lima': 'PEN',
    'America/Mexico_City': 'MXN',
    'America/Monterrey': 'MXN',
    'America/Tijuana': 'MXN',
    'America/Cancun': 'MXN',
    'America/Merida': 'MXN',
    'America/Chihuahua': 'MXN',
    'America/Hermosillo': 'MXN',
    'America/Mazatlan': 'MXN',
    'America/Sao_Paulo': 'BRL',
    'America/Fortaleza': 'BRL',
    'America/Recife': 'BRL',
    'America/Bahia': 'BRL',
    'America/Belem': 'BRL',
    'America/Manaus': 'BRL',
    'America/Cuiaba': 'BRL',
    'America/Porto_Velho': 'BRL',
  };
  if (ZONAS[zona]) return ZONAS[zona];
  if (/^Europe\/(Madrid|Berlin|Paris|Rome|Lisbon|Amsterdam|Dublin|Vienna|Brussels|Helsinki|Athens|Luxembourg|Bratislava|Ljubljana|Tallinn|Riga|Vilnius|Valletta|Zagreb)$/.test(zona)) return 'EUR';
  for (const l of idiomas) {
    const pais = String(l).split('-')[1]?.toUpperCase();
    if (PAISES[pais]) return PAISES[pais];
  }
  return 'USD';
}

export function nombreMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  const texto = new Date(a, m - 1, 1).toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
