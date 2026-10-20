import { defineConfig } from 'vite';

// En local, /api va al back (npm run start:dev en monasafer-back), igual que en DO.
const proxy = {
  '/api': { target: 'http://localhost:3001', rewrite: (p) => p.replace(/^\/api/, '') },
};

export default defineConfig({ server: { proxy }, preview: { proxy } });
