import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The client build splits React, the ledger client and the Vercel instrumentation
 * into their own chunks, so a ledger change never invalidates the framework chunk
 * and the cost of real-user metrics is visible as a line in the build output
 * rather than buried inside the app bundle. The SSR render check keeps
 * dependencies external, so it must not see manualChunks at all.
 */

/**
 * The package a module id belongs to, matched on the package boundary.
 *
 * Substring matching is not enough here: `id.includes('/react/')` also matches
 * `node_modules/@vercel/analytics/react/`, which silently pulled the
 * instrumentation into the framework chunk and made React look 5 kB heavier than
 * it is. Scoped packages are two path segments, everything else is one.
 */
function packageName(id: string): string | null {
  const marker = 'node_modules/';
  const at = id.lastIndexOf(marker);
  if (at === -1) return null;
  const segments = id.slice(at + marker.length).split('/');
  const first = segments[0];
  if (first === undefined) return null;
  if (!first.startsWith('@')) return first;
  const second = segments[1];
  return second === undefined ? null : `${first}/${second}`;
}
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
              const pkg = packageName(id);
              if (pkg === null) return undefined;
              // The ledger client is two Supabase sub-packages plus the socket
              // helpers realtime-js pulls in. Bucketed by scope rather than by
              // name so dropping the umbrella package did not silently move half
              // the client into the app chunk.
              if (pkg.startsWith('@supabase/') || pkg === 'ws' || pkg === 'phoenix') {
                return 'ledger';
              }
              if (pkg === 'react' || pkg === 'react-dom' || pkg === 'scheduler') {
                return 'react';
              }
              if (pkg === '@vercel/analytics' || pkg === '@vercel/speed-insights') {
                return 'insights';
              }
              return undefined;
            },
          },
    },
  },
}));
