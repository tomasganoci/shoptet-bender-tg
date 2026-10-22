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

const ZAMEK = REGISTR + '.lock';
const ZAMEK_ZASTARALY_MS = 10000;
// BENDER_OBNOVA_MS jen pro test.
const OBNOVA_MS = Number(process.env.BENDER_OBNOVA_MS) || 30000;

const pockej = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// Na Windows hází čtení i rename EPERM/EBUSY, když soubor zrovna drží jiný proces.
const opakuj = (fn, pokusu = 20) => {
  for (let i = 1; ; i++) {
    try {
      return fn();
    } catch (e) {
      if (i >= pokusu || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      pockej(25);
    }
  }
};

// Pro zapisovatele: chybějící registr je prázdný, ale nečitelný registr je chyba.
// Kdyby se vrátilo {}, zápis by smazal záznamy ostatních Benderů.
const nactiRegistrProZapis = () => {
  let text;
  try {
    text = opakuj(() => fs.readFileSync(REGISTR, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
  return text.trim() ? JSON.parse(text) : {};
};

const ulozRegistr = data => {
  const docasny = REGISTR + '.' + process.pid + '.tmp';
  fs.writeFileSync(docasny, JSON.stringify(data, null, 2));
  opakuj(() => fs.renameSync(docasny, REGISTR));
};

const zamkni = () => {
  fs.mkdirSync(REGISTR_SLOZKA, { recursive: true });
  const konec = Date.now() + 3000;
  for (;;) {
    try {
      fs.closeSync(fs.openSync(ZAMEK, 'wx'));
      return;
    } catch (e) {
      if (e.code !== 'EEXIST' && e.code !== 'EPERM') throw e;
    }
    try {
      // Zámek po natvrdo ukončeném procesu.
      if (Date.now() - fs.statSync(ZAMEK).mtimeMs > ZAMEK_ZASTARALY_MS) fs.unlinkSync(ZAMEK);
    } catch {}
    if (Date.now() > konec) throw new Error('Registr náhledů je zamčený: ' + ZAMEK);
    pockej(20 + Math.random() * 30);
  }
};

// Celé čtení, úprava a zápis registru pod zámkem, aby si Bendery nepřepsaly
// záznamy starým snapshotem. fn vrací true, když registr změnila.
const aktualizujRegistr = fn => {
  zamkni();
  try {
    const registr = nactiRegistrProZapis();
    if (fn(registr)) ulozRegistr(registr);
  } finally {
    try {
      fs.unlinkSync(ZAMEK);
    } catch {}
  }
};

export const procesZije = pid => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};

// Smaže záznamy mrtvých procesů a cizí záznamy s naším portem (port drží
// jen jeden proces, takže jsou zastaralé, i když jejich pid po recyklaci žije).
const uklid = (registr, slug, port) => {
  let zmena = false;
  for (const [jiny, zaznam] of Object.entries(registr)) {
    if (jiny === slug) continue;
    if (!zaznam?.port || !procesZije(zaznam.pid) || zaznam.port === port) {
      delete registr[jiny];
      zmena = true;
    }
  }
  return zmena;
};

export const zaregistrujNahled = (slug, port) => {
  const muj = { port, pid: process.pid, cwd: process.cwd(), start: new Date().toISOString() };
  const zapis = registr => {
    registr[slug] = { ...muj };
    uklid(registr, slug, port);
    return true;
  };
  try {
    aktualizujRegistr(zapis);
  } catch (e) {
    console.warn('Náhled: zápis do registru selhal, zkusím to znovu za 30 s.', e.message);
  }

  // Heartbeat: když vlastní záznam zmizí nebo ho přepsal proces, který už
  // neběží nebo nedrží náš port, vrátí ho zpátky. Živý Bender stejného projektu
  // na jiném portu má přednost (spustil se později).
  const obnova = setInterval(() => {
    try {
      aktualizujRegistr(registr => {
        const zaznam = registr[slug];
        const prepsat =
          zaznam?.pid !== process.pid && (!zaznam?.port || !procesZije(zaznam.pid) || zaznam.port === port);
        if (prepsat) registr[slug] = { ...muj };
        return uklid(registr, slug, port) || prepsat;
      });
    } catch {
      // Další pokus za OBNOVA_MS.
    }
  }, OBNOVA_MS);
  obnova.unref();

  let odhlaseno = false;
  const odhlas = () => {
    if (odhlaseno) return;
    odhlaseno = true;
    clearInterval(obnova);
    try {
      aktualizujRegistr(aktualni => {
        if (aktualni[slug]?.pid !== process.pid) return false;
        delete aktualni[slug];
        return true;
      });
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
