# Plán: veřejný náhled Benderu na Dellu za Cloudflare Access

Stav: **HOTOVO 2. 11. 2026** (zbývá jen F, GSC dělá Tomáš).

- Hotovo (2. 11.): A (Dell: `bender-router`, `bender@salted.cz`, timery
  `bender-pull@{salted.cz,tg-shoptet-frontend,shoptet-bender}`, kompiluje
  bez chyb), tunel `nahled-dell` (`eac0b9f6-e7cd-4c37-9d39-004f9e2dfee8`)
  běží s `/etc/cloudflared/config.yml`, DNS zatím **nepřepnuté**.
  Deploy keys `dell-nahled` (read-only) v `salted.cz` a
  `tg-shoptet-frontend` (salted.cz z něj importuje `domReady.js`, klon
  v `/opt/nahled/tg-shoptet-frontend`, alias `gh-tsf` v
  `/var/lib/nahled/.ssh/config`). `npm ci` Benderu chce `--legacy-peer-deps`.
- Hotovo (2. 11.): C (Access app `Náhled Bender`, policy `nahled-salted`
  `info@tomasganoci.cz` a `marketa@salted.cz`, tým `patient-waterfall-e402`, curl bez
  přihlášení 302 i na `robots.txt` a `favicon.ico`), B3 (DNS na
  `nahled-dell`), B4 (PC tunel `Shoptet-Bender` už nevede nic; služba Windows
  běží dál, zastavit jde jen s právy správce).
- Hotovo (2. 11.): e-mail klientky v policy, Tomáš ověřil přihlášení z jiné
  sítě. Zápis do policy jde jen přes formulář v dashboardu, API ze skriptu
  v prohlížeči (PUT) blokuje WAF Cloudflare.
- Čeká: F (GSC, Tomáš).

## Cíl

Odkaz pro klienta `https://project.tomasganoci.cz/?nahled=<projekt>` funguje
z libovolné sítě po přihlášení e-mailem (Cloudflare Access, One-time PIN),
bez přihlášení neprojde žádná stránka (ani `robots.txt` a statika) a PC
Tomáše může být vypnuté.

Hotovo je, když:

1. `curl -sI https://project.tomasganoci.cz/robots.txt` (bez cookie) vrátí
   jen `302` na `https://<tým>.cloudflareaccess.com/...`,
2. klient (nebo Tomáš z mobilu mimo domácí síť) se přihlásí kódem z e-mailu
   a vidí náhled salted.cz,
3. totéž platí s vypnutou službou `cloudflared` na PC.

## Výchozí stav (ověřeno 30. 10. 2026)

- PC: služba Windows `cloudflared` (vzdáleně spravovaný tunel
  `89ffc815-d1db-4052-9dad-029421849a32`, token v příkazové řádce služby)
  vede `project.tomasganoci.cz` na `localhost:3010`. Tam běží `router.js`,
  který podle cookie `bender_nahled` posílá na Bender projektu (porty od
  3020, registr `~/.shoptet-bender/nahledy.json`).
- Bender posílá noindex (X-Robots-Tag, `robots.txt`, meta robots, d9254e7).
  Přihlášení žádné.
- Dell (VM 100, Debian 13): Node ani `cloudflared` nejsou nainstalované,
  `/root/.cloudflared/cert.pem` je (umí zakládat tunely a DNS záznamy
  v zóně `tomasganoci.cz`). Port 3001 drží docker-proxy na Tailscale IP,
  porty 3010 a 3020 jsou volné. Přístup jen přes NAT (443 na Traefik),
  takže nic kromě tunelu se na náhled zvenku nedostane.
- `tomasganoci/salted.cz` je soukromé repo, `tomasganoci/shoptet-bender-tg`
  veřejné.

## Návrh

### A. Dell: router + Bender jako služby systemd (bez Dockeru)

Docker by tu jen překážel: router hledá živé Bendery podle PID v registru,
takže router a Bendery musí vidět stejné procesy a stejný domov. Systemd
na hostiteli je nejjednodušší.

- Balíčky z Debianu: `nodejs` (20.19), `npm`. Bender chce Node >= 18.
- Systémový uživatel `nahled` (bez shellu, domov `/var/lib/nahled`, tam je
  registr `~/.shoptet-bender/`).
- Checkouty v `/opt/nahled/`:
  - `shoptet-bender` z `https://github.com/tomasganoci/shoptet-bender-tg`
    (veřejné, bez klíče), `npm ci`,
  - `salted.cz` z `git@github.com:tomasganoci/salted.cz.git` přes
    **read-only deploy key** (klíč vznikne na Dellu, veřejná část se přidá
    do repa `gh repo deploy-key add --title dell-nahled`), větev `main`.
- Unity:
  - `bender-router.service`: `node /opt/nahled/shoptet-bender/router.js`,
    `Restart=always`. Poslouchá jen na `127.0.0.1:3010`.
  - `bender@.service` (šablona, instance = složka projektu, tedy
    `bender@salted.cz`): `WorkingDirectory=/opt/nahled/%i`,
    `ExecStart=node /opt/nahled/shoptet-bender/index.js`,
    `After=/Wants=bender-router.service`, `Restart=always`,
    `Environment=BENDER_LISTEN=127.0.0.1`.
  - `bender-pull@.service` + `bender-pull@.timer` (každou minutu):
    `git fetch` a jen při změně `git reset --hard origin/<větev>`. Bender
    (webpack watch) si změnu převezme sám, restart netřeba. Větev se nastaví
    v `/etc/nahled/<projekt>.env` (`VETEV=main`), výchozí `main`.
  - Totéž (`bender-pull@shoptet-bender`) pro samotný Bender; po změně
    restart routeru a Benderů (`ExecStartPost`), protože Node kód se za běhu
    nepřenačte.
- Malá úprava kódu v `shoptet-bender` (commit sem): BrowserSync na Dellu
  poslouchá jen na loopbacku a bez UI (`listen`/`ui: false`, když je
  nastavené `BENDER_LISTEN`). Na PC se chování nemění.

Pozor: náhled na Dellu ukazuje **pushnutý stav větve**, ne rozpracovaný
pracovní strom na PC. Kdo chce klientovi ukázat změnu, pushne.

### B. Tunel z Dellu (nový, lokálně spravovaný)

Stávající tunel `89ffc815...` na PC nepřesouvám: je spravovaný z dashboardu
a nevidím, jestli nevede ještě jiné hostname. Místo toho:

1. Na Dell nainstalovat `cloudflared` z oficiálního apt repa Cloudflare
   (`pkg.cloudflare.com`).
2. `cloudflared tunnel create nahled-dell` (přes `cert.pem`),
   `/etc/cloudflared/config.yml`:
   ```yaml
   tunnel: <id>
   credentials-file: /etc/cloudflared/<id>.json
   ingress:
     - hostname: project.tomasganoci.cz
       service: http://127.0.0.1:3010
     - service: http_status:404
   ```
   `cloudflared service install` -> systemd `cloudflared.service`.
3. Přepnutí = `cloudflared tunnel route dns --overwrite-dns nahled-dell
   project.tomasganoci.cz` (přepíše CNAME z PC tunelu na Dell). Vratné
   stejným příkazem s ID PC tunelu.
4. Na PC potom v Zero Trust > Networks > Tunnels u tunelu `89ffc815...`
   smazat public hostname `project.tomasganoci.cz`. Když tunel nevede nic
   jiného, službu `cloudflared` na PC zastavit a odinstalovat.

### C. Cloudflare Access (Zero Trust Free, do 50 uživatelů)

Dělá se v dashboardu (token v `cert.pem` na Access nemá právo). Buď Tomáš,
nebo já přes Chrome MCP v jeho přihlášeném prohlížeči, po jeho souhlasu.
**Access se zakládá jako první**, chrání hostname bez ohledu na to, kam vede
tunel, takže náhled je zamčený i během přesunu.

1. `one.dash.cloudflare.com` > Zero Trust. Pokud ještě není: zvolit název
   týmu (např. `tomasganoci` -> `tomasganoci.cloudflareaccess.com`) a plán
   **Free** (Cloudflare může chtít platební kartu i u Free, nic se neúčtuje).
2. Settings > Authentication > Login methods: **One-time PIN** (je tam
   výchozí, jiné metody nepřidávat).
3. Access > Policies > Add a policy (opakovaně použitelná):
   - název `nahled-salted`, Action **Allow**, Session duration **1 month**,
   - Include > **Emails**: `info@tomasganoci.cz`, e-mail(y) klientky Salted.
4. Access > Applications > Add an application > **Self-hosted**:
   - název `Náhled Bender`, Public hostname `project.tomasganoci.cz`, path
     prázdná (celý host včetně `robots.txt`, statiky a websocketu),
   - policy `nahled-salted`, Identity providers jen One-time PIN, zapnout
     **Instant Auth** (přeskočí výběr metody),
   - Session duration 1 month, ostatní výchozí. Žádná Bypass policy, žádná
     "Everyone".
5. Ověření hned po uložení (ještě s PC tunelem):
   `curl -sI https://project.tomasganoci.cz/robots.txt` -> `302` na
   `tomasganoci.cloudflareaccess.com`.

Přidání klienta: Access > Policies > `nahled-salted` > Include Emails > přidat.

### D. Oddělení klientů (rozhodnutí pro Tomáše)

Access rozhoduje podle hostname, router podle cookie. Na jednom hostname
proto každý přihlášený vidí každý projekt, který na Dellu běží
(`?nahled=<jiný>`). Dokud na Dellu běží jen salted.cz, je to jedno.
Pro druhý projekt dvě možnosti:

- **(doporučeno) hostname na projekt**: `nahled-<projekt>.tomasganoci.cz`
  (jedna úroveň, kryje ji Universal SSL), vlastní Access aplikace s vlastní
  policy; router vybere projekt podle Host (malá úprava `router.js`), tunel
  dostane řádek v ingress a DNS záznam. Klient jiného projektu se tam
  nepřihlásí.
- jeden hostname a jedna policy se všemi klienty: jednodušší, ale klienti
  vidí náhledy navzájem.

`project.tomasganoci.cz/?nahled=salted` zůstává funkční v obou variantách.

### E. Noindex v Benderu

Beze změny jako druhá pojistka (X-Robots-Tag, `robots.txt`, meta robots).

### F. Google Search Console

Viz `docs/search-console-odstraneni-nahledu.md`.

## Pořadí provedení po schválení

1. C (Access) a ověření curlem: od té chvíle je náhled zamčený.
2. A (Dell) a test zevnitř Dellu `curl -sk https://127.0.0.1:3010/`.
3. B (tunel, přepnutí DNS) a test zvenku: bez přihlášení 302, po přihlášení
   náhled salted.cz.
4. Zastavit `cloudflared` na PC a zopakovat test. Zápis do
   `C:/GitHub/coolify/INFRASTRUKTURA.md` (tunel `nahled-dell`, služby).
5. F podle návodu (Tomáš ve svém účtu Google).

## Co potřebuje souhlas Tomáše

- Cloudflare: Zero Trust tým a plán Free, Access policy a aplikace, nový
  tunel `nahled-dell`, přepsání DNS `project.tomasganoci.cz`, smazání
  hostname z PC tunelu.
- Dell: instalace `nodejs`, `npm`, `cloudflared`, uživatel `nahled`,
  systemd unity výš.
- GitHub: read-only deploy key `dell-nahled` v repu `salted.cz`.
- E-mail(y) klientky Salted pro policy.
