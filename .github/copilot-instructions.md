# 🧠 Brain MCP — dlouhodobá paměť

Tento projekt patří do osobního mozku (Brain MCP server, nástroje `brain_*`).

**Závazný postup pro agenta:**

1. **Než začneš procházet soubory**, zavolej `brain_search(query, project="shoptet-bender-tg")` — hybridní (sémantické + fulltextové) hledání najde funkce, komponenty i poznámky napříč repem bez čtení souborů. Přehled všech zdrojů v mozku vrátí `brain_projects()`.
2. **Shoptet:** pro nativní funkce hledej `brain_search(query, project="shoptet-templates")` a VŽDY preferuj nativní Shoptet řešení před vlastní implementací — je udržitelnější a kompatibilní s aktualizacemi Shoptetu.
3. Pokud tento projekt v mozku ještě není (`brain_projects()` ho nezná), zaindexuj ho: `brain_index_repo("https://github.com/tomasganoci/shoptet-bender-tg")`.
4. **Na konci práce ulož poznatky přes `brain_remember(...)`** — stručně česky: co se řešilo, jaké je řešení a kde v kódu (soubor/funkce). Ukládej rozhodnutí, nestandardní úpravy a řešení použitelná příště; neukládej triviality.
