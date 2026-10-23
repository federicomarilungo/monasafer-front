// "Continuar con Google" con Google Identity Services, sin Firebase ni otros terceros:
// el botón devuelve un ID token y el back lo verifica con Google (POST /auth/google).
// El Client ID lo da el back (GET /auth/config); si no hay, el botón no aparece.
import { api } from './api.js';
import { esOscuro } from './tema.js';

let listo = null;

function cargarScript() {
  return new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = ok;
    s.onerror = mal;
    document.head.appendChild(s);
  });
}

/** Muestra el botón en `contenedor`. `alEntrar(credencial)` recibe el ID token. Devuelve false si no hay login con Google. */
export async function mostrarBotonGoogle(contenedor, alEntrar) {
  try {
    listo ??= (async () => {
      const { googleClientId } = await api('GET', '/auth/config');
      if (!googleClientId) return null;
      await cargarScript();
      return googleClientId;
    })();
    const clientId = await listo;
    if (!clientId || !window.google?.accounts?.id) return false;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (r) => alEntrar(r.credential),
      auto_select: false,
      cancel_on_tap_outside: true,
    });
    contenedor.innerHTML = '';
    // Con la app en oscuro, el botón negro; en claro, el blanco con borde (pautas de Google).
    const oscuro = esOscuro();
    window.google.accounts.id.renderButton(contenedor, {
      theme: oscuro ? 'filled_black' : 'outline',
      size: 'large',
      shape: 'pill',
      text: 'continue_with',
      logo_alignment: 'left',
      locale: 'es',
      width: Math.min(contenedor.clientWidth || 320, 400),
    });
    return true;
  } catch {
    listo = null; // sin señal o bloqueado: se reintenta la próxima vez
    return false;
  }
}

/** Al salir: que Google no vuelva a entrar solo con la misma cuenta. */
export function olvidarGoogle() {
  window.google?.accounts?.id?.disableAutoSelect();
}
