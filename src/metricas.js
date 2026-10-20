// Métricas premium (S2): todo sale del motor con lo que ya tiene el front, sin pedir nada al back.
import { proyectar, sumarMeses, mesDe } from './motor.js';
import { plata, nombreMes } from './formato.js';
import { t } from './i18n.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const corto = (m) => nombreMes(m).slice(0, 3);

/** Barras verticales en SVG; negativos en rojo y para abajo. */
function barras(valores, etiquetas) {
  const ancho = 320;
  const alto = 140;
  const max = Math.max(1, ...valores.map(Math.abs));
  const hayNeg = valores.some((v) => v < 0);
  const cero = hayNeg ? alto / 2 : alto - 16;
  const escala = (hayNeg ? alto / 2 - 18 : alto - 30) / max;
  const paso = ancho / valores.length;
  const cols = valores
    .map((v, i) => {
      const h = Math.max(2, Math.abs(v) * escala);
      const y = v >= 0 ? cero - h : cero;
      return `<rect x="${i * paso + 3}" y="${y.toFixed(1)}" width="${(paso - 6).toFixed(1)}" height="${h.toFixed(1)}" rx="4" class="${v < 0 ? 'neg' : 'pos'}"><title>${esc(etiquetas[i])}: ${plata(v)}</title></rect>
        <text x="${i * paso + paso / 2}" y="${alto - 2}" text-anchor="middle">${esc(etiquetas[i])}</text>`;
    })
    .join('');
  return `<svg class="grafico" viewBox="0 0 ${ancho} ${alto}" role="img"><line x1="0" x2="${ancho}" y1="${cero}" y2="${cero}" class="eje"/>${cols}</svg>`;
}

export function htmlMetricas(datos, hoy, mesVisto) {
  const actual = mesDe(hoy);
  const meses = proyectar(datos, hoy, sumarMeses(actual, 11));
  const etiquetas = meses.map((r) => corto(r.mes));
  const totalMes = (r) => r.gastos.reduce((s, l) => s + l.monto, 0);

  const visto = meses.find((r) => r.mes === mesVisto) ?? meses[0];
  const total = totalMes(visto);
  const top = [...visto.gastos].sort((a, b) => b.monto - a.monto).slice(0, 6);
  const ingreso = datos.perfil.ingresoMensual?.monto ?? 0;
  const tasa = ingreso ? Math.round(((ingreso - total) / ingreso) * 100) : null;
  const diciembre = meses.find((r) => r.mes.endsWith('-12')) ?? meses[meses.length - 1];
  const ultimo = meses[meses.length - 1];

  const filasTop = top
    .map((l) => {
      const pct = total ? Math.round((l.monto / total) * 100) : 0;
      return `<li><span>${esc(l.emoji || '💸')} ${esc(l.nombre)}</span><b>${plata(l.monto)}</b><i style="width:${pct}%"></i><small>${pct}%</small></li>`;
    })
    .join('');

  return `
    <div class="metrica-destacada">
      <p>${t('En {mes} vas a tener ahorrado', { mes: nombreMes(diciembre.mes).toLowerCase() })}</p>
      <b class="${diciembre.balance < 0 ? 'menos' : 'mas'}">${plata(diciembre.balance)}</b>
      ${tasa !== null ? `<small>${t('Este mes ahorrás el {tasa}% de lo que ganás.', { tasa })}</small>` : ''}
    </div>
    <h4>${t('Ahorro proyectado, mes a mes')}</h4>
    ${barras(meses.map((r) => r.balance), etiquetas)}
    <p class="ayuda">${t('Lo que te sobra al final de cada mes, sumando lo de los meses anteriores. En un año: {monto}.', { monto: plata(ultimo.balance) })}</p>
    <h4>${t('Gastos de cada mes')}</h4>
    ${barras(meses.map(totalMes), etiquetas)}
    <h4>${t('En qué se va la plata en {mes}', { mes: nombreMes(visto.mes).toLowerCase() })}</h4>
    ${top.length ? `<ul class="top-gastos">${filasTop}</ul>` : `<p class="ayuda">${t('Todavía no hay gastos en este mes.')}</p>`}`;
}
