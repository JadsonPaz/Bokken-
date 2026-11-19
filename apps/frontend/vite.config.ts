import { defineConfig } from 'vite';
import type { Plugin, ResolvedConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const PRECACHE_FILE_PATTERN = /\.(?:html|js|css|svg|png|webmanifest|woff2?|ico)$/i;

function appShellServiceWorker(): Plugin {
  let config: ResolvedConfig;

  return {
    name: 'bokken-app-shell-service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(resolved) {
      config = resolved;
    },
    generateBundle(_options, bundle) {
      const files = new Map<string, Buffer>();

      for (const item of Object.values(bundle)) {
        if (!PRECACHE_FILE_PATTERN.test(item.fileName)) continue;
        const content = item.type === 'chunk' ? Buffer.from(item.code) : Buffer.from(item.source);
        files.set(`/${item.fileName}`, content);
      }

      const publicDirectory = config.publicDir;
      const collectPublicFiles = (directory: string) => {
        if (!existsSync(directory)) return;
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const absolutePath = join(directory, entry.name);
          if (entry.isDirectory()) {
            collectPublicFiles(absolutePath);
          } else if (entry.isFile() && PRECACHE_FILE_PATTERN.test(entry.name)) {
            const publicPath = `/${relative(publicDirectory, absolutePath).replace(/\\/g, '/')}`;
            files.set(publicPath, readFileSync(absolutePath));
          }
        }
      };
      collectPublicFiles(publicDirectory);

      const precacheUrls = [...files.keys()].sort();
      const revision = createHash('sha256')
        .update(precacheUrls.map(url => `${url}:${createHash('sha256').update(files.get(url)!).digest('hex')}`).join('|'))
        .digest('hex')
        .slice(0, 16);
      const templatePath = resolve(config.root, 'pwa/sw-template.js');
      const template = readFileSync(templatePath, 'utf8');
      const source = template
        .replace('__CACHE_NAME__', `bokken-app-shell-${revision}`)
        .replace('__PRECACHE_URLS__', JSON.stringify(precacheUrls));

      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    }
  };
}

export default defineConfig({
  plugins: [react(), appShellServiceWorker()],
  server: {
    port: 5173,
    host: true
  }
});
