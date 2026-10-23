// Comentarios de mejora: quien usa la app le propone cambios a Fede. El back los guarda y
// avisa por email.
import { api } from './api.js';
import { svgMono } from './mono.js';
import { sonar } from './sonidos.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);
let tipo = 'idea';

const GLOBOS = {
  idea: '¿Qué le agregarías o cambiarías? Todo suma 🍌',
  error: 'Contame qué pasó y dónde, así lo arreglamos.',
  otro: 'Te leo. Lo que quieras contar.',
};

function elegir(nuevo) {
  tipo = nuevo;
  for (const b of document.querySelectorAll('#tipos-comentario .chip')) b.classList.toggle('activo', b.dataset.tipo === tipo);
  $('comentario-globo').textContent = t(GLOBOS[tipo]);
}

export function abrirComentarios(pantalla) {
  const f = $('form-comentario');
  f.dataset.pantalla = pantalla;
  f.texto.value = '';
  $('error-comentario').hidden = true;
  $('ok-comentario').hidden = true;
  $('comentario-campos').hidden = false;
  $('comentario-mono').innerHTML = svgMono('feliz');
  elegir('idea');
  $('hoja-comentario').showModal();
  sonar('toque');
}

export function iniciarComentarios() {
  for (const b of document.querySelectorAll('#tipos-comentario .chip'))
    b.addEventListener('click', () => (elegir(b.dataset.tipo), sonar('toque')));
  $('form-comentario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const boton = $('boton-mandar-comentario');
    $('error-comentario').hidden = true;
    boton.disabled = true;
    try {
      await api('POST', '/comentarios', { tipo, texto: f.texto.value, pantalla: f.dataset.pantalla || '' });
      $('comentario-campos').hidden = true;
      $('ok-comentario').hidden = false;
      $('comentario-mono').innerHTML = svgMono('rico');
      $('comentario-mono').animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.25) rotate(-10deg)' }, { transform: 'scale(0.95) rotate(6deg)' }, { transform: 'scale(1)' }],
        { duration: 700, easing: 'ease-out' },
      );
      $('comentario-globo').textContent = t('¡Gracias! Le llegó a quien hace Monasafer.');
      sonar('fanfarria');
    } catch (err) {
      $('error-comentario').textContent = err.message;
      $('error-comentario').hidden = false;
      sonar('error');
    } finally {
      boton.disabled = false;
    }
  });
}
