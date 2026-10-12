// Runs sw.js in a simulated service worker global (node:vm) with in-memory
// caches and a fake network, and checks the precache list against the files
// on disk so a new module can't be forgotten.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import { VERSION } from '../js/version.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const swSource = readFileSync(join(root, 'sw.js'), 'utf8');

function walk(dir) {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
  });
}

class FakeCache {
  constructor() {
    this.map = new Map();
  }
  key(req) {
    return typeof req === 'string' ? req : req.url;
  }
  async put(req, res) {
    this.map.set(this.key(req), res);
  }
  async match(req, { ignoreSearch = false } = {}) {
    const url = new URL(this.key(req), 'https://example.github.io/iman/');
    for (const [k, v] of this.map) {
      const u = new URL(k, 'https://example.github.io/iman/');
      const same = ignoreSearch
        ? u.origin + u.pathname === url.origin + url.pathname
        : u.href === url.href;
      if (same) return v.clone();
    }
    return undefined;
  }
  async keys() {
    return [...this.map.keys()];
  }
}

/** A fresh simulated service worker. `online` controls the fake network. */
function loadWorker({ host = 'example.github.io', online = true, preCaches = [] } = {}) {
  const scope = `https://${host}/iman/`;
  const handlers = {};
  const stores = new Map(preCaches.map((n) => [n, new FakeCache()]));
  const fetched = [];
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new FakeCache());
      const c = stores.get(name);
      c.addAll = async (reqs) => {
        for (const r of reqs) {
          const res = await fakeFetch(r);
          if (!res.ok) throw new Error(`addAll failed for ${r.url ?? r}`);
          await c.put(r, res);
        }
      };
      return c;
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
    async match(req, opts) {
      for (const c of stores.values()) {
        const hit = await c.match(req, opts);
        if (hit) return hit;
      }
      return undefined;
    },
  };
  async function fakeFetch(req) {
    const url = new URL(typeof req === 'string' ? req : req.url, scope);
    fetched.push(url.pathname + url.search);
    if (!online) throw new TypeError('offline');
    let path = url.pathname.replace('/iman/', '');
    if (path === '') path = 'index.html';
    const file = join(root, path);
    if (!existsSync(file)) return new Response('not found', { status: 404 });
    const res = new Response(readFileSync(file), { status: 200 });
    Object.defineProperty(res, 'type', { value: 'basic' });
    return res;
  }
  const self = {
    location: new URL(`${scope}sw.js`),
    registration: { scope },
    clients: { claim: async () => {} },
    addEventListener: (type, fn) => (handlers[type] = fn),
    skipWaiting: () => (self.skipped = true),
  };
  const context = vm.createContext({
    self,
    caches,
    fetch: fakeFetch,
    Request: class extends Request {
      constructor(input, init) {
        super(new URL(input, scope), init);
      }
    },
    Response,
    URL,
    console,
  });
  vm.runInContext(swSource, context);

  async function dispatch(type, extra = {}) {
    let pending = null;
    let response = null;
    const event = {
      ...extra,
      waitUntil: (p) => (pending = p),
      respondWith: (p) => (response = p),
    };
    handlers[type](event);
    await pending;
    return response ? await response : null;
  }
  const request = (path, mode = 'cors') => {
    const r = new Request(new URL(path, scope));
    Object.defineProperty(r, 'mode', { value: mode });
    return r;
  };
  return { context, stores, fetched, dispatch, request, self, setOnline: (v) => (online = v) };
}

const SHELL = vm.runInNewContext(`${swSource}; SHELL`, {
  self: { location: new URL('https://x.test/sw.js'), addEventListener() {} },
});

describe('precache list', () => {
  test('every precached file exists', () => {
    for (const p of SHELL) {
      if (p === './') continue;
      assert.ok(existsSync(join(root, p)), `missing ${p}`);
    }
  });

  test('every app file is precached (so the app works offline)', () => {
    const files = [
      ...walk('js'),
      ...walk('css'),
      ...walk('data'),
      ...walk('assets/icons'),
      'assets/audio/sounds.json',
      'lib/adhan/adhan.esm.min.js',
      'index.html',
      'wake.html',
      'manifest.webmanifest',
    ].map((f) => relative(root, join(root, f)).replaceAll('\\', '/'));
    for (const f of files) assert.ok(SHELL.includes(f), `not precached: ${f}`);
  });

  test('the cache version matches the app version', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    assert.match(swSource, new RegExp(`CACHE_VERSION = '${VERSION.replaceAll('.', '\\.')}'`));
    assert.equal(pkg.version, VERSION);
  });
});

describe('service worker behaviour', () => {
  test('install precaches the shell; activate removes old Iman caches only', async () => {
    const w = loadWorker({
      preCaches: ['iman-shell-0.0.1', 'iman-model-tfjs-4.22.0-cocossd-2.2.3', 'other-app'],
    });
    await w.dispatch('install');
    const shell = [...w.stores.keys()].find((k) => k === `iman-shell-${VERSION}`);
    assert.ok(shell);
    assert.equal((await w.stores.get(shell).keys()).length, SHELL.length);
    await w.dispatch('activate');
    const keys = [...w.stores.keys()];
    assert.ok(!keys.includes('iman-shell-0.0.1'));
    assert.ok(keys.includes('iman-model-tfjs-4.22.0-cocossd-2.2.3'));
    assert.ok(keys.includes('other-app'));
  });

  test('the shell is served from cache, ignoring query strings on pages', async () => {
    const w = loadWorker();
    await w.dispatch('install');
    w.setOnline(false);
    const page = await w.dispatch('fetch', {
      request: w.request('wake.html?threshold=0.7', 'navigate'),
    });
    assert.match(await page.text(), /Wake check/);
    const js = await w.dispatch('fetch', { request: w.request('js/prayer.js') });
    assert.equal(js.status, 200);
  });

  test('offline navigation to an unknown page falls back to the app', async () => {
    const w = loadWorker();
    await w.dispatch('install');
    w.setOnline(false);
    const res = await w.dispatch('fetch', { request: w.request('some/deep/link', 'navigate') });
    assert.match(await res.text(), /<title>Iman<\/title>/);
  });

  test('model files are cached on first use in their own cache', async () => {
    const w = loadWorker();
    await w.dispatch('install');
    const req = w.request('lib/coco-ssd/model/model.json');
    await w.dispatch('fetch', { request: req });
    const model = w.stores.get('iman-model-tfjs-4.22.0-cocossd-2.2.3');
    assert.ok(model && (await model.keys()).length === 1);
    w.setOnline(false);
    const again = await w.dispatch('fetch', {
      request: w.request('lib/coco-ssd/model/model.json'),
    });
    assert.equal(again.status, 200);
  });

  test('other origins and non-GET requests are left alone', async () => {
    const w = loadWorker();
    assert.equal(
      await w.dispatch('fetch', { request: new Request('https://evil.example/x.js') }),
      null,
    );
    const post = new Request('https://example.github.io/iman/x', { method: 'POST' });
    assert.equal(await w.dispatch('fetch', { request: post }), null);
  });

  test('a new version waits until the page asks it to take over', async () => {
    const w = loadWorker();
    await w.dispatch('install');
    assert.equal(w.self.skipped, undefined);
    w.dispatch('message', { data: { type: 'SKIP_WAITING' } });
    assert.equal(w.self.skipped, true);
  });

  test('on localhost the network wins so edits show up', async () => {
    const w = loadWorker({ host: 'localhost:8080' });
    await w.dispatch('install');
    const before = w.fetched.length;
    await w.dispatch('fetch', { request: w.request('js/app.js') });
    assert.equal(w.fetched.length, before + 1);
  });
});
