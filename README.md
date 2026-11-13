# Archer Werkbank · masterclass februari 2027

De gedeelde werkbank voor Victor en Anthony: dagdelen, geïmporteerde stukken en
bronnen, comments met gesprekken, beslissingen, bronlezer en actualiteit.

**Live:** https://archergroup.github.io/archer-werkbank/

## Twee strikt gescheiden databronnen

De gedeelde mapping staat in `config/projecten.json`.

| Gebruik | Supabase-project | Grens |
| --- | --- | --- |
| Werkbankinhoud en alle app-wijzigingen | `znqcljyroirxvvllhygu` (Archer Intranet) | Uitsluitend schema `werkbank` |
| Gebruikers- en deelnemersbron | `pgajmjeicrwxthkwwiei` (Invest App V0) | Alleen SELECT, nooit frontendtoegang tot individuele rijen |

De bestaande intranetschema's `public`, `auth` en `storage` worden niet gebruikt
voor werkbankopslag. De gedeelde commentaaragent blijft uitgeschakeld; deze
migratie activeert geen agentrollen, loginwijzigingen of agentmigraties.

De werkbank verhuisde vanuit `thbjzrdogebyhbkkbxzp`. De oude gegevens blijven
bewaard als terugval, maar zijn niet de actieve schrijfbestemming.

## Zaalbeeld

`src/data/zaal-februari-2027.js` bevat uitsluitend gedateerde, geanonimiseerde
aggregaten uit Invest V0. De gebruikte SELECT staat in `scripts/zaalprofiel.sql`.
Het cohort volgt de V0-admin: beide editie-koppelingen samen, klanten zonder
beheerders of mentoren, scenario 0. Het zaalbeeld toont financiële activa privé
en vennootschap samen, zonder vastgoed of ondernemingswaarde. De drempel is tien
positieve invullers. Dit is een snapshot, geen continue synchronisatie.

## Lokaal bouwen en testen

1. Kopieer `.env.example` naar `.env.local` en vul alleen de publieke clientsleutel
   van het intranetproject in. Gebruik nooit een service-role sleutel.
2. `npm test` laadt `.env.local` ook voor Node-tests.
3. Bouw voor controle naar een nieuwe map: `npm run build -- --outDir <nieuw-pad>`.
   De gewone build kan bestaande bestanden in `docs/` opruimen.
4. GitHub Pages serveert `main:/docs`. Publiceer pas na de gecontroleerde kopie en
   expliciete toestemming; verifieer de werkelijk geserveerde bundel.

## Werkafspraken

* App-wijzigingen gaan naar Supabase, niet automatisch terug naar de Vault.
* `lees-bron` staat als afzonderlijke edge function in het intranetproject en
  slaat zelf geen inhoud op. Bestaande intranetfuncties blijven ongemoeid.
* De actualiteitswachters lezen dezelfde projectmapping en de lokale
  `WERKBANK_SLEUTEL`. Hun ritme en andere Archer-cronjobs veranderen niet.
* Een Vault-herimport is een afzonderlijke bulkactie en vereist expliciet akkoord.
* Schemawijzigingen worden lokaal getest, alleen binnen `werkbank` uitgevoerd en
  tegen een vooraf bewaarde intranetnulmeting gecontroleerd.
