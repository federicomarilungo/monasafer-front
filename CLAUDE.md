# monasafer-front — para la IA que trabaje en este repositorio

Web de **Monasafer**. HTML, CSS y JS puros con Vite (Fede, 20/10/2026: sin React ni otro
framework). La API es `monasafer-back`, que además guarda el backlog y los documentos del
proyecto en `proyecto/`: empezá por ahí.

## Reglas

1. **`main` es producción** (static site de DO con `deploy_on_push`). Antes de pushear:
   `npm test` y `npm run build`.
2. **`src/motor.js` es copia del motor del back** (`monasafer-back/src/motor/`). Sirve
   para que el balance se recalcule al instante. Si cambia una regla, se cambia en los dos
   el mismo día, primero en el back, y el test "mismos números que el motor del back" se
   actualiza con los mismos casos.
3. **Montos en centavos** y meses `AAAA-MM`, igual que el back.
4. **Estilo**: divertido, dinámico, el mono (Mona) siempre reacciona. Animaciones con CSS
   y la Web Animations API, sin librerías. Mobile primero (ancho base 480 px).
5. `VITE_API_URL` apunta al back (se lee en el build).
