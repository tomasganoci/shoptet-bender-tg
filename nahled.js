/** @format */

// Veřejný náhled Benderu pro klienta.
//
// Cloudflare tunel vede project.tomasganoci.cz na localhost:3010. Na tom portu
// neběží Bender, ale router (router.js), který podle cookie pošle návštěvníka
// na Bender vybraného projektu. Každý Bender si po startu zapíše do registru
// svůj port a po skončení se odhlásí. Díky tomu může běžet víc Benderů naráz
// a pro nový projekt se v Cloudflare nic nezakládá.
//
// Odkaz pro klienta: https://project.tomasganoci.cz/?nahled=<projekt>

import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

// BENDER_ROUTER_PORT jen pro test, tunel míří na 3010.
export const ROUTER_PORT = Number(process.env.BENDER_ROUTER_PORT) || 3010;
export const BENDER_PORT = 3020;
export const VEREJNA_ADRESA = 'https://project.tomasganoci.cz';
export const HEALTH_CESTA = '/__bender-router';

const REGISTR_SLOZKA = path.join(os.homedir(), '.shoptet-bender');
export const REGISTR = path.join(REGISTR_SLOZKA, 'nahledy.json');

// proterasy.cz -> proterasy, kufricek.sk -> kufricek
export const slugProjektu = cwd =>
  path
    .basename(cwd)
    .toLowerCase()
    .replace(/\.(cz|sk|pl|eu|com|hu|de|at|net|org)$/, '')
    .replace(/[^a-z0-9-]+/g, '-');

export const nactiRegistr = () => {
  try {
    return JSON.parse(fs.readFileSync(REGISTR, 'utf8'));
  } catch {
    return {};
  }
};

const ulozRegistr = data => {
  fs.mkdirSync(REGISTR_SLOZKA, { recursive: true });
  const docasny = REGISTR + '.' + process.pid + '.tmp';
  fs.writeFileSync(docasny, JSON.stringify(data, null, 2));
  fs.renameSync(docasny, REGISTR);
};

export const procesZije = pid => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};

export const zaregistrujNahled = (slug, port) => {
  const registr = nactiRegistr();
  registr[slug] = { port, pid: process.pid, cwd: process.cwd(), start: new Date().toISOString() };
  ulozRegistr(registr);

  let odhlaseno = false;
  const odhlas = () => {
    if (odhlaseno) return;
    odhlaseno = true;
    try {
      const aktualni = nactiRegistr();
      if (aktualni[slug]?.pid === process.pid) {
        delete aktualni[slug];
        ulozRegistr(aktualni);
      }
    } catch {
      // Registr se uklidí i sám: router ignoruje záznamy s mrtvým pid.
    }
  };
  process.on('exit', odhlas);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    process.on(signal, () => process.exit(0));
  }
};

const routerBezi = () =>
  new Promise(resolve => {
    const req = http.get({ host: '127.0.0.1', port: ROUTER_PORT, path: HEALTH_CESTA, timeout: 1500 }, res => {
      res.resume();
      resolve(res.statusCode === 200 && res.headers['x-bender-router'] === '1');
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });

// Spustí router na pozadí, pokud ještě neběží. Router žije dál i po vypnutí
// Benderu, aby další Bender nemusel nic startovat.
export const zajistiRouter = async () => {
  if (await routerBezi()) return true;

  const routerJs = path.join(path.dirname(fileURLToPath(import.meta.url)), 'router.js');
  const child = spawn(process.execPath, [routerJs], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();

  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 300));
    if (await routerBezi()) return true;
  }
  return false;
};
