import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The client build splits React and the Supabase SDK into their own chunks so a
 * ledger change never invalidates the framework chunk. The SSR render check
 * keeps dependencies external, so it must not see manualChunks at all.
 */
export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    cssCodeSplit: true,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 260,
    rollupOptions: {
      output: isSsrBuild
        ? undefined
        : {
            manualChunks(id: string) {
              if (!id.includes('node_modules')) return undefined;
              if (id.includes('@supabase') || id.includes('/ws/') || id.includes('phoenix')) {
                return 'ledger';
              }
              if (
                id.includes('/react/') ||
                id.includes('/react-dom/') ||
                id.includes('/scheduler/')
              ) {
                return 'react';
              }
              return undefined;
            },
          },
    },
  },
}));
