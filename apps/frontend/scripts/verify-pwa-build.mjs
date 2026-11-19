import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const distDirectory = fileURLToPath(new URL('../dist/', import.meta.url));
const indexPath = new URL('../dist/index.html', import.meta.url);
const manifestPath = new URL('../dist/manifest.webmanifest', import.meta.url);
const workerPath = new URL('../dist/sw.js', import.meta.url);

assert.ok(existsSync(indexPath), 'Build deve gerar dist/index.html');
assert.ok(existsSync(manifestPath), 'Build deve gerar o manifest');
assert.ok(existsSync(workerPath), 'Build deve gerar o Service Worker');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const index = readFileSync(indexPath, 'utf8');
const worker = readFileSync(workerPath, 'utf8');
const precacheMatch = worker.match(/const PRECACHE_URLS = (\[[\s\S]*?\]);/);
assert.ok(precacheMatch, 'Service Worker deve conter o manifesto de precache compilado');
const precacheUrls = JSON.parse(precacheMatch[1]);

assert.match(index, /manifest\.webmanifest/);
assert.match(index, /\/assets\/[^" ]+\.js/);
assert.match(index, /\/assets\/[^" ]+\.css/);
assert.ok(precacheUrls.includes('/index.html'));
assert.ok(precacheUrls.some(url => url.startsWith('/assets/') && url.endsWith('.js')));
assert.ok(precacheUrls.some(url => url.startsWith('/assets/') && url.endsWith('.css')));
assert.ok(precacheUrls.includes('/manifest.webmanifest'));
assert.ok(!precacheUrls.some(url => /^\/api(?:\/|$)/.test(url)), 'Precache não pode conter endpoints');

for (const url of precacheUrls) {
  const relativePath = url.replace(/^\//, '');
  assert.ok(existsSync(new URL(`../dist/${relativePath}`, import.meta.url)), `Recurso de precache ausente: ${url}`);
}
for (const icon of manifest.icons) {
  const iconPath = icon.src.replace(/^\//, '');
  assert.ok(existsSync(new URL(`../dist/${iconPath}`, import.meta.url)), `Ícone ausente: ${icon.src}`);
  assert.ok(precacheUrls.includes(icon.src), `Ícone não está no precache: ${icon.src}`);
}

assert.match(worker, /API_PATH = \/\^\\\/api/);
assert.match(worker, /request\.headers\.has\('authorization'\)/);
assert.match(worker, /fetch\(request\)\.catch/);
assert.match(worker, /caches\.delete\(name\)/);
assert.doesNotMatch(worker, /runtimeCaching|NetworkFirst|StaleWhileRevalidate/);

const cacheData = new Map();
const cacheStore = {
  async open(name) {
    if (!cacheData.has(name)) cacheData.set(name, new Map());
    const entries = cacheData.get(name);
    return {
      async addAll(urls) {
        for (const url of urls) entries.set(url, `cached:${url}`);
      },
      async match(url) {
        return entries.get(url);
      }
    };
  },
  async keys() {
    return [...cacheData.keys()];
  },
  async delete(name) {
    return cacheData.delete(name);
  }
};
const handlers = new Map();
let skipWaitingCalls = 0;
let claimCalls = 0;
const workerSelf = {
  location: { origin: 'http://localhost' },
  clients: { claim: async () => { claimCalls += 1; } },
  addEventListener: (type, callback) => handlers.set(type, callback),
  skipWaiting: () => { skipWaitingCalls += 1; }
};
cacheData.set('bokken-app-shell-old', new Map());
cacheData.set('another-app-cache', new Map());
runInNewContext(worker, {
  self: workerSelf,
  caches: cacheStore,
  URL,
  Response,
  fetch: async () => { throw new Error('offline'); }
});

const installTasks = [];
handlers.get('install')({ waitUntil: task => installTasks.push(task) });
await Promise.all(installTasks);
assert.ok(cacheData.get(worker.match(/const CACHE_NAME = '([^']+)'/)?.[1])?.has('/index.html'));

const activateTasks = [];
handlers.get('activate')({ waitUntil: task => activateTasks.push(task) });
await Promise.all(activateTasks);
assert.ok(!cacheData.has('bokken-app-shell-old'), 'Ativação deve limpar somente versões antigas do app shell');
assert.ok(cacheData.has('another-app-cache'), 'Ativação não deve apagar caches de outras aplicações');
assert.equal(claimCalls, 1);

handlers.get('message')({ data: { type: 'SKIP_WAITING' } });
assert.equal(skipWaitingCalls, 1, 'A nova versão deve poder assumir após a ação explícita da UI');

const fetchHandler = handlers.get('fetch');
const makeFetchEvent = (pathname, { mode = 'cors', authorization = false } = {}) => {
  let responsePromise;
  fetchHandler({
    request: {
      method: 'GET',
      url: `http://localhost${pathname}`,
      mode,
      headers: { has: name => name.toLowerCase() === 'authorization' && authorization }
    },
    respondWith: promise => { responsePromise = promise; }
  });
  return responsePromise;
};
assert.equal(makeFetchEvent('/api/private'), undefined, 'API não deve ser interceptada pelo cache');
assert.equal(makeFetchEvent('/assets/private.js', { authorization: true }), undefined, 'Requisições autenticadas não devem ser interceptadas');
assert.equal(makeFetchEvent('/not-pre-cached.json'), undefined, 'Recursos fora da lista não devem ser armazenados');
assert.equal(await makeFetchEvent('/favicon.svg'), 'cached:/favicon.svg');
assert.equal(await makeFetchEvent('/subjects/offline-id', { mode: 'navigate' }), 'cached:/index.html', 'Navegação offline deve retornar o shell da SPA');

console.log(`PWA build verificado: manifest, ${manifest.icons.length} ícones, fallback e ${precacheUrls.length} recursos estáticos.`);
