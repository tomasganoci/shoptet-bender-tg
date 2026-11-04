/** @format */

// Porovnání před a po v náhledu Benderu.
//
// /__porovnani?url=/kategorie/ ukáže vedle sebe živý e-shop bez našich úprav
// (vlevo, "Před") a e-shop s úpravami z Benderu (vpravo, "Po"). Obě strany
// sledují stejnou stránku a posouvají se spolu.
//
// Živý e-shop posílá X-Frame-Options: SAMEORIGIN, do rámečku z jiné domény
// nejde. Proto i stranu "Před" servíruje Bender: cesta s předponou
// /__puvodni/ jde na e-shop stejně jako každá jiná, jen se do ní nevloží
// naše CSS a JS a HTML kódy záhlaví a zápatí zůstanou tak, jak jsou na
// produkci (včetně produkčního bundlu). Oba rámečky jsou pak ze stejného
// původu jako stránka porovnání a ta je může řídit.

export const PREDPONA_PUVODNI = '/__puvodni';
export const CESTA_POROVNANI = '/__porovnani';

const ROBOTS_TAG = 'noindex, nofollow, noarchive, nosnippet, noimageindex';

// Požadavek z předponou /__puvodni/ označí a předponu odebere, takže proxy
// e-shopu dostane obyčejnou cestu. Pravidla přepisu HTML pak podle
// jePuvodni(req) nic nevkládají.
export const porovnaniMiddleware = (req, res, next) => {
  const url = req.url || '/';
  const cesta = url.split('?')[0];

  if (cesta === CESTA_POROVNANI || cesta === CESTA_POROVNANI + '/') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': ROBOTS_TAG,
      'Cache-Control': 'no-store',
    });
    res.end(STRANKA);
    return;
  }

  if (cesta === PREDPONA_PUVODNI || cesta.startsWith(PREDPONA_PUVODNI + '/')) {
    req.url = url.slice(PREDPONA_PUVODNI.length) || '/';
    if (req.url[0] !== '/') req.url = '/' + req.url;
    req.tgPuvodni = true;
  }
  next();
};

export const jePuvodni = req => Boolean(req && req.tgPuvodni);

const STRANKA = `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="${ROBOTS_TAG}">
<title>Porovnání před a po</title>
<style>
  :root { --pozadi: #f2f2f2; --lista: #ffffff; --text: #222; --okraj: #d0d0d0; --akcent: #1a73e8; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: var(--pozadi); color: var(--text);
    font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
  body { display: flex; flex-direction: column; }
  .lista { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 8px 12px;
    background: var(--lista); border-bottom: 1px solid var(--okraj); }
  .lista form { display: flex; gap: 6px; flex: 1 1 260px; }
  .lista input[type=text] { flex: 1; min-width: 0; padding: 6px 8px; border: 1px solid var(--okraj); border-radius: 4px; font: inherit; }
  .lista button, .lista select { padding: 6px 10px; border: 1px solid var(--okraj); border-radius: 4px; background: #fff; font: inherit; cursor: pointer; }
  .lista button[aria-pressed=true] { background: var(--akcent); border-color: var(--akcent); color: #fff; }
  .skupina { display: flex; align-items: center; gap: 6px; }
  .plocha { flex: 1; display: flex; gap: 8px; padding: 8px; min-height: 0; }
  .panel { flex: 1 1 0; display: flex; flex-direction: column; min-width: 0; }
  .panel h2 { margin: 0 0 4px; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
  .ramec { position: relative; flex: 1; overflow: hidden; background: #fff; border: 1px solid var(--okraj); }
  .ramec iframe { position: absolute; top: 0; left: 0; border: 0; transform-origin: 0 0; background: #fff; }
  body.prepinat .plocha { position: relative; }
  body.prepinat .panel { position: absolute; inset: 8px; }
  body.prepinat .panel.skryty { visibility: hidden; }
  .napoveda { color: #666; font-size: 12px; }
  @media (max-width: 700px) {
    body:not(.prepinat) .plocha { flex-direction: column; }
  }
</style>
</head>
<body>
<div class="lista">
  <form id="formular">
    <input type="text" id="adresa" aria-label="Adresa stránky" placeholder="/kategorie/ nebo celá adresa e-shopu">
    <button type="submit">Otevřít</button>
  </form>
  <div class="skupina" role="group" aria-label="Zobrazení">
    <button type="button" id="rezimVedle" aria-pressed="true">Vedle sebe</button>
    <button type="button" id="rezimPrepinat" aria-pressed="false">Přepínat</button>
    <button type="button" id="prepnout" hidden>Ukázat Před</button>
  </div>
  <label class="skupina">Šířka stránky
    <select id="sirka">
      <option value="0">podle okna</option>
      <option value="390">mobil 390 px</option>
      <option value="820">tablet 820 px</option>
      <option value="1180">tablet na šířku 1180 px</option>
      <option value="1440">notebook 1440 px</option>
      <option value="1920">monitor 1920 px</option>
    </select>
  </label>
  <label class="skupina"><input type="checkbox" id="posun" checked> Posouvat spolu</label>
  <span class="napoveda">Klávesa P přepne Před a Po.</span>
</div>
<div class="plocha">
  <section class="panel" id="panelPred"><h2>Před (živý web)</h2><div class="ramec"><iframe id="pred" title="Před úpravami"></iframe></div></section>
  <section class="panel" id="panelPo"><h2>Po (s úpravami)</h2><div class="ramec"><iframe id="po" title="Po úpravách"></iframe></div></section>
</div>
<script>
(function () {
  var PREDPONA = '${PREDPONA_PUVODNI}';
  var pred = document.getElementById('pred');
  var po = document.getElementById('po');
  var adresa = document.getElementById('adresa');
  var sirka = document.getElementById('sirka');
  var posun = document.getElementById('posun');
  var prepnout = document.getElementById('prepnout');
  var panelPred = document.getElementById('panelPred');
  var panelPo = document.getElementById('panelPo');
  var rezimPrepinat = false;
  var ukazPred = false;
  var cesta = '/';

  function ulozeno(klic, vychozi) { try { var h = localStorage.getItem('tg-porovnani-' + klic); return h === null ? vychozi : h; } catch (e) { return vychozi; } }
  function uloz(klic, h) { try { localStorage.setItem('tg-porovnani-' + klic, h); } catch (e) {} }

  // Celou adresu e-shopu i cestu převede na cestu v náhledu.
  function naCestu(text) {
    text = (text || '').trim();
    if (!text) return '/';
    try { var u = new URL(text, location.origin); text = u.pathname + u.search + u.hash; } catch (e) {}
    if (text === PREDPONA || text.indexOf(PREDPONA + '/') === 0) text = text.slice(PREDPONA.length) || '/';
    return text;
  }

  // Jen cesta na tomhle náhledu. Cesta začínající // (třeba po normalizaci
  // /a/..//cizi.cz/) by v src rámečku načetla cizí web.
  function bezpecna(text) {
    text = '/' + String(text || '').replace(/^[\/\]+/, '');
    try { if (new URL(text, location.origin).origin !== location.origin) return '/'; } catch (e) { return '/'; }
    return text;
  }

  function cestaRamce(ramec) {
    try { var l = ramec.contentWindow.location; return l.pathname + l.search + l.hash; } catch (e) { return null; }
  }

  function otevri(nova, zapsat) {
    cesta = bezpecna(nova);
    adresa.value = cesta;
    if (cestaRamce(po) !== cesta) po.src = cesta;
    if (cestaRamce(pred) !== PREDPONA + cesta) pred.src = PREDPONA + cesta;
    if (zapsat !== false) history.replaceState(null, '', location.pathname + '?url=' + encodeURIComponent(cesta));
  }

  // Klik na odkaz ve straně Po: Před jde za ním. Klik ve straně Před vede
  // na adresu bez předpony (odkazy e-shopu ji neznají), takže se vrátí
  // na původní verzi a Po jde za ní.
  po.addEventListener('load', function () {
    var c = cestaRamce(po);
    if (c !== null && c !== cesta) otevri(c);
    napoj(po, pred);
    zmer();
  });
  pred.addEventListener('load', function () {
    var c = cestaRamce(pred);
    if (c === null) return;
    if (c !== PREDPONA && c.indexOf(PREDPONA + '/') !== 0) { otevri(c); return; }
    var bez = c.slice(PREDPONA.length) || '/';
    if (bez !== cesta) otevri(bez);
    napoj(pred, po);
    zmer();
  });

  // Společný posun podle poměru výšky stránky (Před a Po bývají různě dlouhé).
  // Posun, který nastavila tahle stránka, se do druhé strany nevrací
  // (jinak by se strany přetahovaly a posun by ujížděl).
  function napoj(zdroj, cil) {
    var w;
    try { w = zdroj.contentWindow; w.document; } catch (e) { return; }
    if (w.__tgPorovnani) return;
    w.__tgPorovnani = true;
    w.addEventListener('keydown', klavesa);
    w.addEventListener('scroll', function () {
      if (w.__tgNastaveno !== undefined) {
        var nase = Math.abs(w.scrollY - w.__tgNastaveno) <= 2;
        w.__tgNastaveno = undefined;
        if (nase) return;
      }
      if (!posun.checked) return;
      try {
        var d = w.document.documentElement, cw = cil.contentWindow, cd = cw.document.documentElement;
        var max = d.scrollHeight - w.innerHeight, cmax = cd.scrollHeight - cw.innerHeight;
        var pomer = max > 0 ? w.scrollY / max : 0;
        var y = Math.round(pomer * Math.max(cmax, 0));
        if (Math.abs(cw.scrollY - y) <= 2) return;
        cw.__tgNastaveno = y;
        // Šablona má scroll-behavior: smooth, plynulý posun by po cestě
        // posílal další události a strany by se přetahovaly.
        cw.scrollTo({ top: y, left: 0, behavior: 'instant' });
      } catch (e) {}
    }, { passive: true });
  }

  // Šířka stránky: rámeček dostane zvolenou šířku a zmenší se, aby se vešel.
  function zmer() {
    var s = Number(sirka.value);
    [pred, po].forEach(function (ramec) {
      var box = ramec.parentNode;
      var bw = box.clientWidth, bh = box.clientHeight;
      var w = s || bw;
      var meritko = Math.min(1, bw / w);
      ramec.style.width = w + 'px';
      ramec.style.height = Math.ceil(bh / meritko) + 'px';
      ramec.style.transform = meritko < 1 ? 'scale(' + meritko + ')' : '';
    });
  }

  function nastavRezim(prepinat) {
    rezimPrepinat = prepinat;
    document.body.classList.toggle('prepinat', prepinat);
    document.getElementById('rezimVedle').setAttribute('aria-pressed', String(!prepinat));
    document.getElementById('rezimPrepinat').setAttribute('aria-pressed', String(prepinat));
    prepnout.hidden = !prepinat;
    ukaz(ukazPred);
    uloz('rezim', prepinat ? 'prepinat' : 'vedle');
    zmer();
  }

  function ukaz(predVidet) {
    ukazPred = predVidet;
    panelPred.classList.toggle('skryty', rezimPrepinat && !predVidet);
    panelPo.classList.toggle('skryty', rezimPrepinat && predVidet);
    prepnout.textContent = predVidet ? 'Ukázat Po' : 'Ukázat Před';
  }

  document.getElementById('formular').addEventListener('submit', function (e) { e.preventDefault(); otevri(naCestu(adresa.value)); });
  document.getElementById('rezimVedle').addEventListener('click', function () { nastavRezim(false); });
  document.getElementById('rezimPrepinat').addEventListener('click', function () { nastavRezim(true); });
  prepnout.addEventListener('click', function () { ukaz(!ukazPred); });
  sirka.addEventListener('change', function () { uloz('sirka', sirka.value); zmer(); });
  posun.addEventListener('change', function () { uloz('posun', posun.checked ? '1' : '0'); });
  window.addEventListener('resize', zmer);
  // Klávesa P i s fokusem na tlačítku nebo v rámečku, jen ne při psaní.
  function klavesa(e) {
    if (e.key !== 'p' && e.key !== 'P') return;
    if (e.ctrlKey || e.metaKey || e.altKey || !rezimPrepinat) return;
    var t = e.target;
    if (t && t.closest && t.closest('input, select, textarea, [contenteditable]')) return;
    ukaz(!ukazPred);
  }
  document.addEventListener('keydown', klavesa);

  // Výchozí šířka: na velké obrazovce notebook 1440 px (zmenšený), jinak podle okna.
  sirka.value = ulozeno('sirka', window.innerWidth >= 1000 ? '1440' : '0');
  posun.checked = ulozeno('posun', '1') === '1';
  nastavRezim(ulozeno('rezim', 'vedle') === 'prepinat');
  otevri(naCestu(new URLSearchParams(location.search).get('url') || '/'), false);
})();
</script>
</body>
</html>
`;
