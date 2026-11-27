import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { defineConfig } from 'vite';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const reviewRoot = process.env.RYAN_STANDALONE_OUTPUT;

export default defineConfig({
  root: path.join(projectRoot, 'standalone'),
  base: './',
  publicDir: false,
  resolve: {
    alias: [
      ...(reviewRoot
        ? [
            {
              find: '../public/admissions-data.json',
              replacement: path.resolve(
                projectRoot,
                reviewRoot,
                'public',
                'admissions-data.json',
              ),
            },
          ]
        : []),
      { find: '@', replacement: projectRoot },
    ],
  },
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react()],
  build: {
    outDir: path.join(projectRoot, 'release'),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 20_000,
    rolldownOptions: {
      output: {
        codeSplitting: false,
        entryFileNames: 'assets/app.js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
