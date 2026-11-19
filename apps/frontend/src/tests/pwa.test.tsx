import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const publicDirectory = new URL('../../public/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.webmanifest', publicDirectory), 'utf8')) as {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  icons: Array<{ src: string; sizes: string; type: string; purpose: string }>;
};

describe('PWA — metadados e recursos do app shell', () => {
  it('define manifest instalável com escopo e apresentação standalone', () => {
    assert.equal(manifest.name, 'Bokken Estudos');
    assert.equal(manifest.short_name, 'Bokken');
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.scope, '/');
    assert.equal(manifest.display, 'standalone');
  });

  it('inclui ícones PNG válidos nos tamanhos de instalação, maskable e Apple touch', () => {
    for (const icon of manifest.icons) {
      const dimensions = icon.sizes.split('x').map(Number);
      const bytes = readFileSync(new URL(icon.src.replace(/^\//, ''), publicDirectory));
      assert.equal(icon.type, 'image/png');
      assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(bytes.readUInt32BE(16), dimensions[0]);
      assert.equal(bytes.readUInt32BE(20), dimensions[1]);
    }
    assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
    assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose === 'maskable'));
    assert.ok(manifest.icons.some(icon => icon.sizes === '180x180'));
  });

  it('mantém o HTML independente do Google Fonts e oferece favicon e ícone iOS locais', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    assert.match(html, /manifest\.webmanifest/);
    assert.match(html, /favicon\.svg/);
    assert.match(html, /apple-touch-icon\.png/);
    assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  });

  it('limita o Service Worker ao app shell e exclui API/autorização do cache', () => {
    const serviceWorker = readFileSync(new URL('../../pwa/sw-template.js', import.meta.url), 'utf8');
    assert.match(serviceWorker, /API_PATH\.test\(url\.pathname\)/);
    assert.match(serviceWorker, /request\.headers\.has\('authorization'\)/);
    assert.match(serviceWorker, /cache\.addAll\(PRECACHE_URLS\)/);
    assert.match(serviceWorker, /caches\.delete\(name\)/);
    assert.match(serviceWorker, /event\.data\?\.type === 'SKIP_WAITING'/);
    assert.doesNotMatch(serviceWorker, /runtimeCaching|NetworkFirst|StaleWhileRevalidate/);
  });

  it('registra o Service Worker somente em produção e permite atualizar a versão ativa', () => {
    const registration = readFileSync(new URL('../components/pwa/PwaShellNotice.tsx', import.meta.url), 'utf8');
    assert.match(registration, /if \(!import\.meta\.env\.PROD \|\| !\('serviceWorker' in navigator\)\) return/);
    assert.match(registration, /navigator\.serviceWorker\.register\('\/sw\.js', \{ scope: '\/' \}\)/);
    assert.match(registration, /registrationRef\.current\?\.waiting\?\.postMessage\(\{ type: 'SKIP_WAITING' \}\)/);
    assert.match(registration, /navigator\.serviceWorker\.addEventListener\('controllerchange'/);
  });
});
