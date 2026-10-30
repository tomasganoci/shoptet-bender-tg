# Search Console: odstranění zaindexovaných URL náhledu

Náhled `project.tomasganoci.cz` Google v minulosti indexoval. Access (viz
`plan-nahled-na-dellu.md`) zabrání dalšímu procházení, ale už zaindexované
URL zmizí z výsledků až po dalším procházení. Nástroj Odstranění je skryje
hned. Dělá Tomáš ve svém účtu Google.

## 1. Vlastnictví v Search Console

Potřeba je služba, která `project.tomasganoci.cz` pokrývá:

- nejlépe **doménová služba** `tomasganoci.cz` (ověření záznamem TXT v DNS
  na Cloudflare), pokrývá všechny subdomény i `http` a `https`,
- služba s předponou URL `https://project.tomasganoci.cz/` jde ověřit jen
  přes DNS nebo Google Analytics; HTML soubor ani meta tag za Accessem
  Google neuvidí.

Když doménová služba ještě není: Search Console > Přidat službu > Doména >
`tomasganoci.cz` > zkopírovat TXT záznam > Cloudflare > DNS > Add record
(TXT, název `@`) > zpět v Search Console Ověřit.

## 2. Žádost o odstranění

1. Search Console > služba `tomasganoci.cz` > **Indexování > Odstranění**.
2. Záložka **Dočasná odstranění** > **Nový požadavek**.
3. Zvolit **Odstranit všechny adresy URL s touto předponou**.
4. URL: `https://project.tomasganoci.cz/` > Další > Odeslat.
5. Totéž pro `http://project.tomasganoci.cz/` (Google bere protokol jako
   jinou předponu).

Skrytí platí asi 6 měsíců. Během té doby Google při procházení dostane jen
přesměrování na přihlášení Cloudflare Access (žádný obsah), takže URL
z indexu vypadnou natrvalo a po vypršení se nevrátí.

## 3. Kontrola

- Za den dva: `site:project.tomasganoci.cz` v Googlu nevrací nic.
- Indexování > Stránky: URL náhledu se postupně přesunou do "Neindexováno"
  (přesměrování nebo chyba přístupu).
- Kdyby se ve výsledcích objevil jiný hostname náhledu (třeba
  `nahled-<projekt>.tomasganoci.cz` později), stejný postup s jeho předponou.

## Proč to nestačí bez Accessu

Odstranění je jen dočasné skrytí. Bez zámku by Google stránky po 6 měsících
znovu prošel a noindex by byl jediná ochrana. S Accessem se k obsahu žádný
robot nedostane.
