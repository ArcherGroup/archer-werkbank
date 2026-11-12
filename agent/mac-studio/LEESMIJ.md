# Commentaarwerker op de Mac Studio

**Status: lokaal in ontwikkeling. Niet geïnstalleerd, niet gepubliceerd en niet gekoppeld aan productie.**

## Wat de werker doet

Een lid vraagt de agent bij een bestaande documentnotitie. De werker haalt één taak op en stuurt alleen de opmerking en een begrensd tekstfragment naar het ingestelde model. Hij beschikt niet over web-, shell- of bestandszoektools. Het model maakt een antwoord of een wijzigingsvoorstel; uitsluitend de vooraf vastgelegde eigenaar kan een wijziging na bevestiging toepassen. Daarvoor controleert de database een sessie met tweestapsverificatie en een vingerafdruk van het getoonde voorstel. Dat vermindert fouten en misbruik, maar bewijst niet dat iemand de tekst werkelijk heeft gelezen en voorkomt geen misbruik van een actieve browsersessie. De vorige versie wordt atomair in de historiek opgeslagen. Het model controleert zelf geen bronnen.

Documenten 30, 31, 77, 78 en 79 en de manuscriptpaden zijn standaard en ook bij foutieve toestemming geblokkeerd. Alle andere documenten zijn eveneens geblokkeerd tot ze expliciet op de toelatingslijst staan. De werker bewaart geen notities, documenttekst, sleutels of ruwe databasefouten in zijn logs.

## Eerst oplossen, vóór enige installatie

1. De huidige werkbank is anoniem lees- en wijzigbaar. Login, ledencontrole en RLS moeten de volledige werkbank en de bronfunctie echt afschermen. Dit verandert de bestaande toegang en vereist afzonderlijk akkoord.
2. Het huidige Supabase-project bevat ook andere toepassingen en publiek uitvoerbare `SECURITY DEFINER`-functies. De veiligheidscontrole laat de werker niet starten wanneer zijn databaseaccount zulke functies kan uitvoeren. Onderzoek een afzonderlijk Supabase-project voor de werkbank; wijzig geen rechten van de andere toepassingen zonder aparte beoordeling.
3. Maak voor Victor en Anthony afzonderlijke gebruikers met tweestapsverificatie en leg per toegestaan document de eigenaar vast in de private toelatingslijst. De zichtbare velden voor blok en eigenaar en de huidige naamkeuze in de app zijn géén autorisatie.
4. Laat Victor zelf een aparte OpenRouter-sleutel met een harde uitgavenlimiet aanmaken. Stel geen bestaande algemene sleutel in. Het verzoek gebruikt `data_collection: deny`, `zdr: true` en maximaal 1000 uitvoertokens; ondersteuning en kosten moeten vóór activering echt worden gecontroleerd.
5. Voer `supabase/migrations/20261112_gedeelde_agent.sql` niet live uit zonder toestemming en onafhankelijke securityreview. De migratie zet de agent standaard uit en laat de bestaande anonieme rechten ongemoeid. Zonder veilige toegangsregels en expliciete vrijgave weigert de werker werk.
6. Voeg alleen individueel goedgekeurde documenten toe aan de toelatingslijst. Het manuscript blijft verboden. Bespreek dat vooraf met Anthony.

## Installatievoorbereiding op de Mac Studio

De gebruiker moet eerst ingelogd zijn en de sleutelhanger ontgrendeld hebben. Een LaunchAgent draait niet vóór de eerste aanmelding na een herstart. Configureer ook dat de computer en netwerkverbinding niet in slaap vallen. Dit sjabloon garandeert op zichzelf geen 24/7-beschikbaarheid.

1. Plaats de gecontroleerde werkbankcode op de Studio en maak daarin een Python-virtuele omgeving. Installeer `agent/requirements.txt`.
2. Plaats zelf twee afzonderlijke generieke wachtwoorden in macOS Sleutelhangertoegang, beide met account `werkbank-agent`:
   * service `archer-werkbank-agent-database`: de afzonderlijke databaseverbinding voor de rol `werkbank_agent`, met `sslmode=verify-full` en het juiste Supabase CA-certificaat. De migratie maakt deze rol zonder LOGIN; een beheerder mag hem pas na goedkeuring rechtstreeks LOGIN geven. Verleen de rol nooit aan `authenticated` of een andere loginrol.
   * service `archer-werkbank-agent-model`: de afzonderlijke OpenRouter-sleutel met limiet.
   Deel de waarden niet in chat en zet ze niet in Git, het plist-bestand of shellgeschiedenis.
3. Controleer eerst handmatig met `python -m agent.werker --keychain --eenmaal`. Zonder alle voorwaarden start de werker niet. Laat de eerste opdracht uitsluitend met synthetische tekst en een afzonderlijke testdatabase lopen.
4. Vul in `finance.archer.werkbank-agent.plist.template` de absolute paden naar de Python in de virtuele omgeving, de werkbankmap en een eigen logmap in. Plaats de resulterende plist pas na goedkeuring in `~/Library/LaunchAgents/`; start en controleer hem vervolgens met `launchctl` op de Studio.

Na slaap, netwerkuitval of een crash kan een opdracht opnieuw worden geclaimd. De lease en een maximum van twee pogingen beperken dubbels, maar kunnen dubbele modelkosten na een crash niet volledig uitsluiten. Het externe budget blijft daarom verplicht.
