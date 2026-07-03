import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Proxy de dev vers l'ENT local (traefik :8090)
const proxyTarget = { target: 'http://localhost:8090', changeOrigin: false };

export default defineConfig(({ mode }) => ({
  // Servi sous /searchengine par entcore (cf. view/index.html -> /searchengine/public/index.js)
  base: mode === 'production' ? '/searchengine' : '',
  resolve: {
    // Une seule instance des singletons (React/query/client) malgré les liens pnpm.
    dedupe: [
      'react',
      'react-dom',
      '@tanstack/react-query',
      '@open-ent/client',
      '@open-ent/react',
      '@open-ent/bootstrap',
    ],
  },
  build: {
    assetsDir: 'public',
    rollupOptions: {
      output: {
        // Noms STABLES pour l'entrée + la CSS → la vue backend référence des chemins
        // fixes (`/searchengine/public/index.js|css`) et ne change pas à chaque build.
        // Les autres assets (polices/images bootstrap) gardent un hash de contenu.
        entryFileNames: 'public/index.js',
        chunkFileNames: 'public/[name].js',
        assetFileNames: (info) =>
          info.name && info.name.endsWith('.css')
            ? 'public/index.css'
            : 'public/[name]-[hash][extname]',
      },
    },
  },
  server: {
    port: 4200,
    proxy: {
      '/searchengine': proxyTarget,
      '^/(?=assets|theme|locale|i18n|skin)': proxyTarget,
      '^/(?=auth|userbook|directory|portal|session|timeline|workspace|infra|conf|applications-list)':
        proxyTarget,
    },
  },
  plugins: [react()],
}));
