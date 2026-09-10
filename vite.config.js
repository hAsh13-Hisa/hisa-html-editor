import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';

function monacoNlsJaPlugin() {
  return {
    name: 'monaco-nls-ja',
    enforce: 'pre',
    resolveId(source, importer) {
      if (importer && (source.endsWith('/nls.js') || source.endsWith('\\nls.js') || source === 'vs/nls.js')) {
        const importerNorm = importer.replace(/\\/g, '/');
        if (importerNorm.includes('monaco-editor')) {
          return path.resolve(__dirname, 'src/renderer/js/monaco-nls-ja.js');
        }
      }
      return null;
    },
    load(id) {
      const normalized = id.replace(/\\/g, '/');
      if (normalized.includes('monaco-editor/esm/vs/nls.js')) {
        const jaFilePath = path.resolve(__dirname, 'src/renderer/js/monaco-nls-ja.js');
        return fs.readFileSync(jaFilePath, 'utf-8');
      }
      return null;
    }
  };
}

export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [monacoNlsJaPlugin()],
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'esnext',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/renderer/index.html'),
        imageMap: path.resolve(__dirname, 'src/renderer/image-map.html')
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
