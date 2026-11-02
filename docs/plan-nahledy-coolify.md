# Plán: náhledy klientů jako aplikace v Coolify (hostname na klienta, webhook)

Stav: **HOTOVO 2. 11. 2026** (GSC: Tomáš 2. 11. požádal o odstranění předpony `project.tomasganoci.cz`).

- Hotovo: krok 1 (Bender 957ef04, image `ghcr.io/tomasganoci/bender-nahled:1`
  veřejný, ověřeno `docker run` na Dellu: kompilace OK, noindex, vložené
  skripty), krok 3 (salted.cz 3dd280b: `.nahled/Dockerfile`, `.dockerignore`,
  submodul `.nahled/tg-shoptet-frontend` přes HTTPS).
- Hotovo: krok 2 (GitHub App `coolify-tomasganoci`, uuid
  `ak3wfaeqbzytw06xzzmeqti8`, App ID 5577333, instalace 177771648 na
  `salted.cz` a `tg-shoptet-frontend`, jen čtení obsahu).
- Krok 4 (2. 11.): aplikace `nahled-salted` `m5mh2sewnhpqplcq7lunicxg`
  v projektu `klientske-projekty` (production). Past: REST API Coolify
  bere `ports_mappings` jen jako `port:port` (regex v `bootstrap/helpers/api.php`),
  IP binding `127.0.0.1:3101:3020` jde uložit jen formulářem v UI
  (General > Ports Mappings).
- Krok 5 (2. 11.): Access aplikace `Náhled salted` (`fc5ff310-…`,
  `nahled-salted.tomasganoci.cz`, policy `nahled-salted`, jen OTP, Instant
  Auth, session 1 měsíc), DNS a ingress `https://127.0.0.1:3101`
  s `noTLSVerify` (Bender v kontejneru jede HTTPS). Bez přihlášení 302 i na
  `robots.txt` a `scripts.footer.js`.
- Krok 6 (2. 11.): Redirect Rule `nahled salted presmerovani` (zóna
  `tomasganoci.cz`, 302, `project.tomasganoci.cz` s `nahled=salted` ->
  `https://nahled-salted.tomasganoci.cz/`). Access na `project` odpovídá
  dřív než přesměrování, takže starý odkaz chce přihlášení dvakrát (stejný
  tým, druhé bývá bez kódu). Na Dellu `systemctl disable --now` pro
  `bender-router`, `bender@salted.cz` a timery `bender-pull@*` (unit
  soubory a `/opt/nahled/` zůstaly pro návrat), deploy keys `dell-nahled`
  smazané. Ingress `project.tomasganoci.cz` zůstal (bez něj by DNS
  záznam neměl kam vést, přesměrování se děje na hraně).
- Krok 7: viz konec souboru (ověření webhooku).

Původně: návrh, nic z toho neběželo. Navazuje na `plan-nahled-na-dellu.md` (systemd na Dellu, hotovo),
který zůstává v provozu, dokud tenhle plán neprojde krokem 6.

## Proč měnit to, co funguje

Dnešní stav (systemd na Dellu) má tři slabiny:

1. **Polling**: timer `bender-pull@` každou minutu dělá `git fetch` do
   GitHubu, i když se nic nezměnilo. Změna se projeví až do minuty.
2. **Klíč na repo**: každé privátní repo potřebuje vlastní deploy key
   (`dell-nahled` už je v `salted.cz` i `tg-shoptet-frontend`), každý nový
   klient = nový klíč, SSH alias a ruční klon.
3. **Jeden hostname pro všechny**: Access rozhoduje podle hostname, router
   podle cookie, takže přihlášený klient vidí i cizí náhled
   (`?nahled=<jiný>`).

## Cíl

- Každý klient má vlastní adresu `https://nahled-<projekt>.tomasganoci.cz`
  s vlastní Access policy. Klient A se na náhled klienta B nepřihlásí.
- Push do větve klienta = náhled se sám přestaví (webhook, žádný polling).
- K GitHubu vede **jedna** credential pro všechna repa (GitHub App
  v Coolify), žádné deploy keys na repo.
- Nový klient = jedna aplikace v Coolify (klon existující), jeden řádek
  v tunelu, jedna Access aplikace. Bez SSH na Dell.
- `https://project.tomasganoci.cz/?nahled=salted` (odkaz, který má Markéta)
  dál funguje, přesměruje na nový hostname.

## Ověřená fakta (2. 11. 2026)

- Coolify běží na Dellu, server `server-dell-optiplex-3070`
  (`d4i3rvrfqrts87cv06n7qjn6`), jediný.
- GitHub zdroje v Coolify: jen `Public GitHub` (`ui5aww25wu2yc7uv95hj5i2r`).
  Privátní repa dnes přes účtový deploy klíč `coolify-deploy-key`,
  auto-deploy přes ručně založené webhooky (brain-mcp, plaky-mcp, ...).
- `coolify.tomasganoci.cz` je veřejně za Traefikem (NAT 443 -> Dell), takže
  GitHub na webhook Coolify dosáhne.
- Traefik na Dellu je zvenku dosažitelný na 443. **Kdyby náhled šel přes
  Traefik s doménou, šlo by Access obejít** přímým dotazem na veřejnou IP
  s hlavičkou `Host: nahled-salted.tomasganoci.cz`. Proto náhledy přes
  Traefik nepouštím (viz bod C).
- Z `tg-shoptet-frontend` (privátní) importují `salted.cz`,
  `obchod-kufry.cz` a `pracuj-zdrave.cz` cestou
  `../../../../tg-shoptet-frontend/...`, tedy jako **sourozenecká složka**
  vedle repa. Build v kontejneru ji proto musí mít na stejném místě.
- Porty 31xx na Dellu nikdo nepoužívá (tabulka portů v
  `C:/GitHub/coolify/INFRASTRUKTURA.md`).

## Návrh

### A. GitHub App v Coolify (jedna credential, webhooky samy)

V Coolify: Sources > + Add > GitHub App, název `coolify-tomasganoci`,
vlastník osobní účet `tomasganoci`, **private** app. Průvodce Coolify
přesměruje do GitHubu, kde Tomáš appku vytvoří a nainstaluje (vyžaduje
jeho přihlášení, to za něj neudělám).

- Instalace: **Only select repositories**: `salted.cz`,
  `tg-shoptet-frontend`, `shoptet-bender-tg` a pak repo každého dalšího
  klienta s náhledem. (Alternativa All repositories je pohodlnější, ale
  dává Coolify čtení všech repo; doporučuji výběr.)
- Oprávnění, která Coolify chce: Contents read, Metadata read, Pull
  requests read/write (pro preview deploymenty, nevyužijeme), webhook push
  na `https://coolify.tomasganoci.cz/webhooks/source/github/events`.
- Výsledek: push do jakéhokoli nainstalovaného repa pošle GitHub App
  událost do Coolify, ten nasadí aplikace napojené na repo a větev.
  **Žádné webhooky po repech, žádné deploy keys.**

Stávající aplikace (brain-mcp, ...) můžou zůstat na deploy klíči, přepnutí
na appku je volitelné a mimo tenhle plán.

### B. Image náhledu

Dvě vrstvy, aby přestavba po pushi trvala desítky sekund, ne minuty:

1. **Základní image `bender-nahled`** s nainstalovaným Benderem
   (`npm ci --legacy-peer-deps`). Dockerfile v repu `shoptet-bender-tg`
   (`docker/Dockerfile.zaklad`). Stavba: GitHub Actions v tomhle repu,
   které je **veřejné** (Actions zdarma, self-hosted runner netřeba),
   publikuje `ghcr.io/tomasganoci/bender-nahled:<verze>` a `:latest`
   (veřejný balíček GHCR, obsahuje jen veřejný kód Benderu).
2. **Aplikace klienta** v Coolify, build pack Dockerfile, repo klienta
   přes GitHub App. Dockerfile žije v repu klienta (`.nahled/Dockerfile`,
   pár řádků, stejný u všech klientů):
   ```dockerfile
   FROM ghcr.io/tomasganoci/bender-nahled:1
   COPY . /w/projekt
   # tg-shoptet-frontend jako sourozenec, stejně jako na PC (viz C níž)
   RUN if [ -d /w/projekt/.nahled/tg-shoptet-frontend/project ]; then \
         mv /w/projekt/.nahled/tg-shoptet-frontend /w/tg-shoptet-frontend; fi
   WORKDIR /w/projekt
   ENV BENDER_LISTEN=0.0.0.0 BENDER_BEZ_ROUTERU=1
   EXPOSE 3020
   CMD ["node", "/opt/bender/index.js"]
   ```
   Bender při startu sám zkompiluje webpackem (jako dnes), watch v
   kontejneru nevadí, ale nic nesleduje: novou verzi přinese nový build.

Úprava kódu Benderu (commit do `shoptet-bender-tg`): proměnná
`BENDER_BEZ_ROUTERU=1` vypne zápis do registru a spouštění routeru
(`zaregistrujNahled`, `zajistiRouter` v `index.js`), v kontejneru nejsou
potřeba. Na PC beze změny.

### C. tg-shoptet-frontend v buildu

Coolify klonuje jen repo aplikace. Import ze sourozenecké složky proto
vyřeší **git submodule** v repu klienta na cestě
`.nahled/tg-shoptet-frontend` (Coolify klonuje se submoduly a GitHub App
na ně dosáhne, když je appka nainstalovaná i na `tg-shoptet-frontend`).

- Na PC se nic nemění: obyčejný `git clone` submodul neinicializuje,
  složka zůstane prázdná a import dál míří na sourozence
  `C:/GitHub/tg-shoptet-frontend`. Produkční build a FTP beze změny.
- Submodul je přišpendlený na commit. Když se v `tg-shoptet-frontend`
  změní něco, co klient importuje, náhled to uvidí až po posunu
  submodulu (`git submodule update --remote .nahled/tg-shoptet-frontend`
  a commit). Dnes se odtud importuje jen `domReady.js` (u kufrů ještě
  signature a statistika), mění se zřídka.
- Zamítnuté alternativy: vendorovat soubory do repa klienta (mění kód,
  který jde do produkce), stahovat při buildu (Coolify do buildu token
  nedává), péct do základního image (ten je veřejný, `tg-shoptet-frontend`
  ne).

Repa bez importu z `tg-shoptet-frontend` submodul nepotřebují.

### D. Síť: loopback port + tunel, ne Traefik

- Aplikace v Coolify **bez domény** (Traefik ji nepublikuje), jen
  Ports Mappings `127.0.0.1:31NN:3020`. Zvenku (NAT 443) na ni nic
  nevede, jediná cesta je tunel `nahled-dell`, kterému předchází Access.
- Přidělení portů: `salted` = 3101, další klient 3102, ... Zapsat do
  tabulky portů v `C:/GitHub/coolify/INFRASTRUKTURA.md`.
- `/etc/cloudflared/config.yml` na Dellu dostane řádek na klienta:
  ```yaml
  ingress:
    - hostname: nahled-salted.tomasganoci.cz
      service: https://127.0.0.1:3101
      originRequest:
        noTLSVerify: true   # BrowserSync má vlastní self-signed cert
    - hostname: project.tomasganoci.cz
      service: http://127.0.0.1:3010   # do kroku 6 router, pak smazat
    - service: http_status:404
  ```
  Reload `systemctl restart cloudflared` (krátký výpadek všech náhledů,
  jednotky sekund).

Pozn.: ingress tunelu je soubor na Dellu, takže přidání klienta je jeden
SSH krok. Kdyby to vadilo, dá se tunel převést na spravovaný z dashboardu
(pak se hostname přidává klikem), ale to je další změna účtu; nedoporučuji
teď.

### E. Cloudflare: DNS a Access na klienta

Pro klienta `salted`:

1. DNS: `cloudflared tunnel route dns nahled-dell nahled-salted.tomasganoci.cz`
   (CNAME na tunel, proxied; přes `cert.pem` na Dellu). Jedna úroveň pod
   `tomasganoci.cz`, takže ji kryje Universal SSL.
2. Access > Applications > Add > Self-hosted: název `Náhled salted`,
   hostname `nahled-salted.tomasganoci.cz`, celý host, policy
   `nahled-salted` (existuje: `info@tomasganoci.cz`,
   `marketa@salted.cz`), jen One-time PIN, Instant Auth, session 1 měsíc.
   Stejné nastavení jako dnešní `Náhled Bender`.
3. Ověření: `curl -sI https://nahled-salted.tomasganoci.cz/robots.txt`
   bez cookie -> 302 na `patient-waterfall-e402.cloudflareaccess.com`.

**Access se zakládá před DNS záznamem**, aby hostname nebyl ani chvíli
otevřený.

Pozor na limit: Zero Trust Free má 50 uživatelů (sedadel) celkem, ne na
aplikaci.

### F. Starý odkaz `project.tomasganoci.cz/?nahled=salted`

Po přechodu salted na nový hostname: Cloudflare > Rules > Redirect Rules
(Single Redirect, Free má 10):
`hostname eq project.tomasganoci.cz and query obsahuje nahled=salted` ->
302 na `https://nahled-salted.tomasganoci.cz/`. Access na
`project.tomasganoci.cz` zůstává (kdyby se pravidlo vyhodnotilo až po
Accessu, Markéta se jen jednou přihlásí navíc; ověřím curlem). Až nebude
na `project.` nic jiného, router a Access app `Náhled Bender` zrušit.

### G. Nový klient (cílový postup)

1. Do repa klienta `.nahled/Dockerfile` (kopie), případně submodul
   `tg-shoptet-frontend` (bod C). Push.
2. GitHub App: přidat repo do instalace (GitHub > Settings > Applications >
   `coolify-tomasganoci` > Configure). Tomáš, jeden klik.
3. Coolify: nová aplikace z repa, větev, build pack Dockerfile
   `.nahled/Dockerfile`, port mapping `127.0.0.1:31NN:3020`, auto deploy
   zapnutý. (Přes MCP `create_application`, udělám já.) Port mapping
   s IP jde uložit jen formulářem v UI (General > Ports Mappings), REST API
   ho odmítne.
4. Access policy `nahled-<projekt>` s e-maily klienta, Access aplikace
   `Náhled <projekt>` (formulář v dashboardu, API zápis blokuje WAF).
5. DNS a řádek v ingress tunelu (SSH na Dell, udělám já):
   `service: https://127.0.0.1:31NN` s `originRequest.noTLSVerify: true`.
6. Odkaz klientovi: `https://nahled-<projekt>.tomasganoci.cz`.

## Pořadí provedení po schválení

1. Bender: `BENDER_BEZ_ROUTERU`, `docker/Dockerfile.zaklad`, workflow
   na GHCR. Commit, push, první image. Test lokálně na Dellu
   `docker run` s checkoutem salted.cz.
2. Tomáš: GitHub App v Coolify (průvodce, instalace na 3 repa). Já ověřím
   přes MCP `list_github_apps` a `list_github_repositories`.
3. salted.cz: `.nahled/Dockerfile`, submodul `tg-shoptet-frontend`.
   Commit jen těchto souborů (rozpracované soubory jiné session
   nechávám). Push.
4. Coolify: aplikace `nahled-salted`, první nasazení, `curl -sk
   https://127.0.0.1:3101/` na Dellu vrátí HTML salted.cz s noindex.
5. Access app `Náhled salted` (formulář), pak DNS a ingress. Ověření
   curlem a přihlášení Tomáše.
6. Redirect `project.tomasganoci.cz/?nahled=salted`, ověření. Pak vypnout
   a zakázat `bender@salted.cz`, `bender-pull@*.timer`, `bender-router`;
   odebrat deploy keys `dell-nahled` z obou rep. Zápis do
   `C:/GitHub/coolify/INFRASTRUKTURA.md` a Brainu.
7. Test webhooku: prázdný commit do salted.cz, v Coolify vznikne nasazení
   do minuty a náhled ukáže novou verzi.

Návrat zpět je kdykoli do kroku 6: systemd náhled na `project.` běží dál
a nový hostname jde smazat (DNS záznam, Access app, aplikace v Coolify).

## Co potřebuje souhlas Tomáše

- **GitHub**: vytvoření a instalace GitHub App `coolify-tomasganoci`
  (Tomášovo přihlášení), výběr rep. Na konci smazání deploy keys
  `dell-nahled`.
- **GHCR**: veřejný balíček `bender-nahled` (jen kód z veřejného repa).
- **Cloudflare**: Access aplikace `Náhled salted` s existující policy
  `nahled-salted`, DNS CNAME `nahled-salted.tomasganoci.cz` na tunel
  `nahled-dell`, Redirect Rule na `project.tomasganoci.cz`, na konci
  smazání Access app `Náhled Bender`.
- **Dell**: aplikace v Coolify s portem na loopbacku, úprava ingress
  tunelu, vypnutí systemd jednotek náhledu.
- **salted.cz**: dva nové soubory a submodul v repu klienta (do produkce
  nic z toho nejde, FTP build je beze změny).

## Otevřené (ověřím při provedení, ne předem)

- Jestli Coolify u GitHub App klonuje submoduly s tokenem appky (podle
  dokumentace ano, volba Git Submodules). Když ne, záloha: submodul přes
  HTTPS URL a appka nainstalovaná i na `tg-shoptet-frontend`.
- Jestli Redirect Rule běží před Accessem (vliv jen na jedno přihlášení
  navíc).
- Doba buildu a startu (odhad: build 30 s, kompilace webpackem při startu
  20 s, výpadek náhledu při přestavbě do minuty, pokud Coolify nedělá
  rolling update; healthcheck na `/robots.txt` ho umožní).
