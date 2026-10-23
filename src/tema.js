// Tema claro u oscuro. "auto" sigue al sistema (prefers-color-scheme); claro y oscuro lo
// fuerzan con data-tema en <html>. Se guarda por dispositivo: el script chico del <head>
// de index.html lo aplica antes de pintar, para que no parpadee.
const CLAVE = 'monasafer.tema';
export const TEMAS = { auto: 'Automático', claro: 'Claro', oscuro: 'Oscuro' };

function inicial() {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado && TEMAS[guardado]) return guardado;
  } catch {
    /* sin storage */
  }
  return 'auto';
}

let tema = inicial();

export const temaActual = () => tema;

export const esOscuro = () =>
  tema === 'oscuro' || (tema === 'auto' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches);

export function aplicarTema() {
  if (tema === 'auto') delete document.documentElement.dataset.tema;
  else document.documentElement.dataset.tema = tema;
}

export function cambiarTema(nuevo) {
  if (!TEMAS[nuevo]) return;
  tema = nuevo;
  try {
    if (nuevo === 'auto') localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, nuevo);
  } catch {
    /* sin storage: dura lo que la pestaña */
  }
  aplicarTema();
}
