import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centavos } from './formato.js';
import { cambiarIdioma } from './i18n.js';

cambiarIdioma('es');

test('lee montos como los escribe la gente', () => {
  assert.equal(centavos('60'), 6000);
  assert.equal(centavos('1.234,50'), 123450);
  assert.equal(centavos('1234.5'), 123450);
  assert.equal(centavos('1.500'), 150000);
  assert.equal(centavos('US$ 200'), 20000);
  assert.equal(centavos('abc'), null);
  assert.equal(centavos('-5'), null);
  assert.equal(centavos('-5', true), -500);
});

test('en inglés la coma es de miles', () => {
  cambiarIdioma('en');
  assert.equal(centavos('1,234.50'), 123450);
  assert.equal(centavos('60'), 6000);
  cambiarIdioma('es');
});

test('separador de miles mientras se escribe', async () => {
  const { conMiles } = await import('./formato.js');
  assert.equal(conMiles('700000', 'es'), '700.000');
  assert.equal(conMiles('700.000', 'es'), '700.000');
  assert.equal(conMiles('7000000,5', 'es'), '7.000.000,5');
  assert.equal(conMiles('-12345', 'es'), '-12.345');
  assert.equal(conMiles('0,0031', 'es'), '0,0031');
  assert.equal(conMiles(',5', 'es'), '0,5');
  assert.equal(conMiles('0700', 'es'), '700');
  assert.equal(conMiles('', 'es'), '');
  assert.equal(conMiles('1234567.89', 'en'), '1,234,567.89');
  assert.equal(conMiles('1,2345', 'en'), '12,345');
  // Lo formateado se lee igual que lo escrito.
  assert.equal(centavos(conMiles('700000', 'es')), 70000000);
  assert.equal(centavos(conMiles('-1234', 'es'), true), -123400);
});

test('moneda sugerida por país o zona horaria', async () => {
  const { monedaSugerida } = await import('./formato.js');
  assert.equal(monedaSugerida(['es-AR'], 'UTC'), 'ARS');
  assert.equal(monedaSugerida(['en-US'], 'America/Argentina/Buenos_Aires'), 'ARS');
  assert.equal(monedaSugerida(['es'], 'America/Argentina/Cordoba'), 'ARS');
  assert.equal(monedaSugerida(['es'], 'America/Montevideo'), 'UYU');
  assert.equal(monedaSugerida(['es-ES'], 'Europe/Madrid'), 'EUR');
  assert.equal(monedaSugerida(['pt-BR'], 'UTC'), 'BRL');
  assert.equal(monedaSugerida(['en'], 'UTC'), 'USD');
});

test('borrarUno: un ⌫ borra un solo dígito y salta los separadores', async () => {
  const { borrarUno } = await import('./formato.js');
  // 560.000 → 50.000 (cursor después del 6)
  assert.deepEqual(borrarUno('560.000', 2, true, 'es'), { valor: '50.000', pos: 1 });
  // Cursor después del punto: borra el 0 de antes, no el punto
  assert.deepEqual(borrarUno('560.000', 4, true, 'es'), { valor: '56.000', pos: 2 });
  // Al final
  assert.deepEqual(borrarUno('1.234.567', 9, true, 'es'), { valor: '123.456', pos: 7 });
  // Supr antes del punto borra el dígito de después
  assert.deepEqual(borrarUno('1.234', 1, false, 'es'), { valor: '134', pos: 1 });
  // Decimales
  assert.deepEqual(borrarUno('1.234,56', 8, true, 'es'), { valor: '1.234,5', pos: 7 });
  assert.deepEqual(borrarUno('1,234.56', 5, true, 'en'), { valor: '123.56', pos: 3 });
  // Nada para borrar
  assert.equal(borrarUno('560.000', 0, true, 'es'), null);
  assert.equal(borrarUno('', 0, true, 'es'), null);
});
