# monasafer-front

Web de **Monasafer**: HTML, CSS y JS sin framework, con Vite para el build. La API está en
`monasafer-back`; los documentos del proyecto, en `monasafer-back/proyecto/`.

```bash
npm ci
npm run dev     # http://localhost:5173
npm test        # motor de cálculo
npm run build   # dist/
```

Con cuenta usa la API (`src/api.js`); sin cuenta, "Ver la demo" usa datos de ejemplo (`src/demo.js`) con las mismas reglas. En local, `npm run dev` manda `/api` a `localhost:3001` (ver `vite.config.js`).
