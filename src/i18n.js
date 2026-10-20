// Idioma (castellano o inglés). La clave de cada texto es el texto en castellano: así el
// código se sigue leyendo igual y lo que falte en EN cae en castellano.
// En el HTML: data-t (texto), data-t-html (con <b> o links), data-t-ph (placeholder) y
// data-t-aria (aria-label). En JS: t('Texto con {variable}', { variable }).
import { EN } from './i18n-en.js';

const CLAVE = 'monasafer.idioma';
export const IDIOMAS = { es: 'Español', en: 'English' };

function inicial() {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado && IDIOMAS[guardado]) return guardado;
  } catch {
    /* sin storage */
  }
  return ((typeof navigator !== 'undefined' && navigator.language) || 'es').toLowerCase().startsWith('es') ? 'es' : 'en';
}

let idioma = inicial();

export const idiomaActual = () => idioma;
export const locale = () => (idioma === 'en' ? 'en-US' : 'es-AR');

export function cambiarIdioma(nuevo) {
  if (!IDIOMAS[nuevo]) return;
  idioma = nuevo;
  try {
    localStorage.setItem(CLAVE, nuevo);
  } catch {
    /* sin storage: dura lo que la pestaña */
  }
  aplicarIdioma();
}

export function t(es, vars) {
  let s = idioma === 'en' ? (EN[es] ?? es) : es;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}

/** Traduce lo marcado en el HTML. Guarda el original para poder volver al castellano. */
export function aplicarIdioma(raiz = globalThis.document) {
  if (!raiz) return;
  document.documentElement.lang = idioma;
  for (const el of raiz.querySelectorAll('[data-t]')) {
    el.dataset.t ||= el.textContent.trim();
    el.textContent = t(el.dataset.t);
  }
  for (const el of raiz.querySelectorAll('[data-t-html]')) {
    el.dataset.tHtml ||= el.innerHTML.trim();
    el.innerHTML = t(el.dataset.tHtml);
  }
  for (const el of raiz.querySelectorAll('[data-t-ph]')) {
    el.dataset.tPh ||= el.placeholder;
    el.placeholder = t(el.dataset.tPh);
  }
  for (const el of raiz.querySelectorAll('[data-t-aria]')) {
    el.dataset.tAria ||= el.getAttribute('aria-label');
    el.setAttribute('aria-label', t(el.dataset.tAria));
  }
}
