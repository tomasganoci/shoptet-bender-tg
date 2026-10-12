#!/usr/bin/env node
/** @format */

// Router veřejného náhledu (viz nahled.js). Poslouchá na ROUTER_PORT jen na
// loopbacku, kam vede Cloudflare tunel, a podle cookie bender_nahled posílá
// požadavky na Bender vybraného projektu.
//
// - ?nahled=<projekt> nastaví cookie a přesměruje na stejnou adresu bez parametru.
// - Bez cookie: když běží právě jeden Bender, jde se na něj (stejně jako dřív,
//   kdy na 3010 běžel Bender sám). Jinak stránka "Náhled teď neběží".
// - Seznam projektů se ven nikdy neukazuje.
//
// Na stejném portu přijímá http i https (podle prvního bajtu spojení), protože
// tunel může mířit na http://localhost:3010 i na https://localhost:3010.

import fs from 'fs';
import http from 'http';
import https from 'https';
import net from 'net';
import path from 'path';
import { createRequire } from 'module';
import { HEALTH_CESTA, ROUTER_PORT, nactiRegistr, procesZije } from './nahled.js';

const require = createRequire(import.meta.url);
const httpProxy = require('http-proxy');

const COOKIE = 'bender_nahled';
const ROBOTS_TAG = 'noindex, nofollow, noarchive, nosnippet, noimageindex';

// Self-signed cert, který používá i BrowserSync.
const certSlozka = path.join(path.dirname(require.resolve('browser-sync/package.json')), 'certs');
const tls = {
  key: fs.readFileSync(path.join(certSlozka, 'server.key')),
  cert: fs.readFileSync(path.join(certSlozka, 'server.crt')),
};

const proxy = httpProxy.createProxyServer({ secure: false, ws: true, xfwd: true });

const zive = () =>
  Object.fromEntries(Object.entries(nactiRegistr()).filter(([, zaznam]) => zaznam?.port && procesZije(zaznam.pid)));

const cookieZ = req => {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([a-z0-9-]+)'));
  return m ? m[1] : null;
};

const cil = req => {
  const projekty = zive();
  const vybrany = cookieZ(req);
  if (vybrany) return projekty[vybrany] ?? null;
  const vsechny = Object.values(projekty);
  return vsechny.length === 1 ? vsechny[0] : null;
};

const nebezi = res => {
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': ROBOTS_TAG });
  res.end(
    '<!doctype html><meta charset="utf-8"><meta name="robots" content="' +
      ROBOTS_TAG +
      '"><title>Náhled neběží</title>' +
      '<p style="font-family:sans-serif;margin:3em auto;max-width:30em;text-align:center">' +
      'Náhled teď neběží. Zkuste to prosím později, nebo se ozvěte Tomášovi.</p>'
  );
};

const obsluha = (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname === HEALTH_CESTA) {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'X-Bender-Router': '1' });
    res.end('ok');
    return;
  }

  const nahled = url.searchParams.get('nahled');
  if (nahled !== null) {
    const slug = nahled.toLowerCase().replace(/[^a-z0-9-]+/g, '');
    url.searchParams.delete('nahled');
    const zbytek = url.pathname + (url.searchParams.toString() ? '?' + url.searchParams : '');
    res.writeHead(302, {
      'Set-Cookie': COOKIE + '=' + slug + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000',
      Location: zbytek,
      'X-Robots-Tag': ROBOTS_TAG,
    });
    res.end();
    return;
  }

  const zaznam = cil(req);
  if (!zaznam) return nebezi(res);

  // Host necháváme původní: podle něj BrowserSync přepisuje odkazy e-shopu.
  proxy.web(req, res, { target: 'https://localhost:' + zaznam.port }, () => {
    if (!res.headersSent) nebezi(res);
    else res.end();
  });
};

const upgrade = (req, socket, head) => {
  const zaznam = cil(req);
  if (!zaznam) return socket.destroy();
  proxy.ws(req, socket, head, { target: 'https://localhost:' + zaznam.port }, () => socket.destroy());
};

const httpServer = http.createServer(obsluha).on('upgrade', upgrade);
const httpsServer = https.createServer(tls, obsluha).on('upgrade', upgrade);

const prijem = net.createServer(socket => {
  socket.once('data', buf => {
    socket.pause();
    socket.unshift(buf);
    (buf[0] === 0x16 ? httpsServer : httpServer).emit('connection', socket);
    process.nextTick(() => socket.resume());
  });
  socket.on('error', () => socket.destroy());
});

prijem.on('error', e => {
  // Port drží jiný router nebo starý Bender: tenhle router není potřeba.
  if (e.code === 'EADDRINUSE') process.exit(0);
  throw e;
});

prijem.listen(ROUTER_PORT, '127.0.0.1', () => {
  // localhost se může v tunelu přeložit i na ::1.
  const v6 = net.createServer(s => prijem.emit('connection', s));
  v6.on('error', () => {});
  v6.listen(ROUTER_PORT, '::1');
});
