// Tocar "Guardar" varias veces mientras la API tardaba creaba 3 gastos, 3 bolsillos, etc.
// (Fede, 2/11/2026). Todo lo que guarda pasa por acá: mientras corre, ese form o botón no
// vuelve a disparar y sus botones de guardar quedan apagados. El back además ignora un pedido
// idéntico a otro que sigue en curso (src/auth/sin-duplicados.interceptor.ts).

const enCurso = new WeakSet();

/**
 * Corre `accion` con `el` (un form o un botón) ocupado. Si ya estaba ocupado no hace nada.
 * Apaga los botones de enviar del form (o el botón mismo) y `otros`, y al terminar los
 * prende de nuevo (salvo los que ya estaban apagados).
 */
export async function mientrasGuarda(el, accion, ...otros) {
  if (!el || enCurso.has(el)) return undefined;
  enCurso.add(el);
  const botones = new Set(el instanceof HTMLFormElement ? el.querySelectorAll('button[type=submit], button:not([type])') : [el]);
  for (const b of otros) if (b) botones.add(b);
  const apagados = [...botones].filter((b) => !b.disabled);
  for (const b of apagados) {
    b.disabled = true;
    b.classList.add('guardando');
  }
  try {
    return await accion();
  } finally {
    enCurso.delete(el);
    for (const b of apagados) {
      b.disabled = false;
      b.classList.remove('guardando');
    }
  }
}

/** Para `submit` o `click`: el handler no vuelve a correr hasta que termina el anterior. */
export function unaVez(handler) {
  return function (e) {
    const el = e.currentTarget;
    if (enCurso.has(el)) {
      e.preventDefault();
      return undefined;
    }
    return mientrasGuarda(el, () => handler.call(this, e));
  };
}
