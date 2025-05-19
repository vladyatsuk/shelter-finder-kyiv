import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';

export default defineConfig({
  server: {
    host: true,
    port: 3000,
    https: true,
  },
  build: { target: 'esnext' },
  plugins: [mkcert()],
});
