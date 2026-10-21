// Cliente de monasafer-back. En prod el back está en /api del mismo dominio.
const BASE = import.meta.env.VITE_API_URL ?? '/api';
const CLAVE_TOKEN = 'monasafer.token';

function leerToken() {
  try {
    return localStorage.getItem(CLAVE_TOKEN);
  } catch {
    return null;
  }
}

export function guardarToken(token) {
  try {
    if (token) localStorage.setItem(CLAVE_TOKEN, token);
    else localStorage.removeItem(CLAVE_TOKEN);
  } catch {
    /* sin storage: la sesión dura lo que la pestaña */
  }
  tokenEnMemoria = token;
}

let tokenEnMemoria = leerToken();
export const hayToken = () => !!tokenEnMemoria;

export class ErrorApi extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

export async function api(metodo, ruta, cuerpo) {
  const headers = { 'Content-Type': 'application/json' };
  if (tokenEnMemoria) headers.Authorization = `Bearer ${tokenEnMemoria}`;
  let r;
  try {
    r = await fetch(`${BASE}${ruta}`, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  } catch {
    throw new ErrorApi(0, 'Sin conexión. Probá de nuevo en un rato.');
  }
  const datos = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = Array.isArray(datos?.message) ? datos.message.join(', ') : datos?.message;
    throw new ErrorApi(r.status, msg || (r.status >= 500 ? 'El servidor no respondió. Probá de nuevo en un rato.' : `Error ${r.status}`));
  }
  return datos;
}
