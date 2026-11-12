# Het hart van de masterclass staat in de werkbank

Dit is geen cursusarchief. De werkbank is de motor waar de vierdaagse uit gebouwd wordt en
waar het opvolgingstraject op blijft draaien. Praktijkkennis wordt hier gebundeld, getoetst,
vertaald naar de zaal en doorgegeven met de bron en de datum eraan vast. Het doel is niet dat
de deelnemer ons volgt, maar dat hij daarna in **elke** markt zijn eigen beslissing kan nemen,
met dezelfde middelen die wij gebruiken.

Daarom is de werkbank geen verzameling mooie teksten, maar een keten:
**vraag → bron → stelling → lesinhoud → oefening → feedback → bijsturing**, met onder elke
bewering een bron, een datum en een stand. Als het hart klopt, kan de rest volgen: boekjes,
slides, het scherm in de zaal, video, de opvolging na de vierdaagse.

## Waarom meerdere agents en niet één

Eén agent die alles moet weten wordt oppervlakkig. Daarom heeft elk domein zijn eigen wachter,
met zijn eigen bronnenlijst en zijn eigen ritme. Ze delen één regel: **een agent stelt voor,
een mens bevestigt.** Wat een wachter vindt is een signaal, geen feit; de werkbank toont het
met de zin, het cijfer, de bron en de datum, en pas een bevestigd signaal mag in de lesstof.

### De wachters (actualiteit, permanent)

| Agent | Domein | Bronnen (voorbeelden) | Ritme |
| --- | --- | --- | --- |
| `macro-wachter` | inflatie, groei, rente, koopkracht | Statbel, Eurostat, NBB, ECB | maandelijks |
| `schuld-wachter` | staatsschuld, tekort, rentelasten | Eurostat, Federaal Agentschap van de Schuld, Raad van de EU | per kwartaal |
| `fiscus-wachter` | tarieven, vrijstellingen, taksen | FOD Financiën, FSMA, VFB | maandelijks |
| `beleid-wachter` | begroting, hervormingen, indexering | De Tijd, VRT NWS, Kamer | dagelijks |
| `markt-wachter` | indexen, kosten, obligaties, goud | justETF, Morningstar, ECB | wekelijks |
| `grondstof-wachter` | gas, stroom, olie, grondstoffen | Statbel, Eurostat | maandelijks |

De bronnenlijst staat in `agent/actualiteit/domeinen.json`, de wacht in
`agent/actualiteit/wacht.py`, en het bord waar de mens ze beoordeelt in de werkbank onder
**Actua**.

### De dragers (per dagdeel en per doelgroep)

Bovenop de wachters staan de agents die het hart naar buiten brengen. Ze werken elk op één
dagdeel of één opdracht, zodat ze diep kunnen gaan in plaats van breed.

| Agent | Wat hij doet | Waar het landt |
| --- | --- | --- |
| `onderzoeker` | per dagdeel de vraag scherp stellen en de bronnen vinden | brief, researchdossier |
| `vertaler` | de stof naar de zaal brengen: wat zeg je, in welke volgorde | slides, spreektekst |
| `leraar` | de deelnemer het zelf laten doen, met oefening en antwoordsleutel | werkboek, eerste-gebruiker-blad |
| `stem` | het dagdeel als verhaal van 5 tot 15 minuten, auditief | podcast, video, lower third |
| `tegenspreker` | zoekt de zwakke plek in onze eigen stelling voor we de zaal in gaan | tegenwerpingen, Q&A-voorbereiding |
| `archivaris` | elk cijfer met bron, datum en stand; verouderde cijfers markeren | overal, in de voetnoot |

## De keten van een signaal tot de zaal

1. **Vinden.** Een wachter zoekt in zijn eigen bronnen, met internet, en noteert de zin, het
   cijfer, de eenheid, de URL en de datum van de bron.
2. **Voorstellen.** Het signaal komt op het Actua-bord te staan als *te controleren*. Er is nog
   niets mee gebeurd en er is niets mee beloofd.
3. **Bevestigen of wegleggen.** Een mens klikt *Klopt* of *Leg weg*, met een reden. Afgewezen
   werk verdwijnt niet: het blijft staan met de reden, zodat we niet twee keer hetzelfde hoeven
   te bespreken.
4. **Verwerken.** Een bevestigd signaal kan in een brief, een slide, een werkboek, een video of
   een oefening terechtkomen, altijd met de bron en de datum in dezelfde adem.
5. **Herzien.** Elk cijfer krijgt een houdbaarheidsdatum. Wat `TE CONTROLEREN 2027` draagt,
   wordt voor de editie opnieuw tegen de bron gelegd.

## Wat een agent nooit doet

- Geen verkooppraat, geen rendementsbelofte, geen productaanbeveling en geen persoonlijk advies.
- Geen cijfer zonder bron en datum, en geen cijfer dat niet in de bron staat.
- Geen vertrouwelijke stukken naar buiten: het manuscript van Anthony en de documenten met een
  vertrouwelijkheidsgrens blijven dicht, ook als iemand daar toestemming voor lijkt te geven.
- Geen bulk in de Vault en geen pixelposities als waarheid: de plek van een signaal is de zin.

## Waarom dit goedkoper en sterker is dan één grote agent

De wachters zijn klein en goedkoop: één bronnenlijst, één opdracht, een model dat mag meedenken
maar niets mag verzinnen. Ze draaien op een ritme, niet continu, en ze werken met een budget per
ronde. De dragers zijn duurder maar werken per dagdeel, niet op de hele vierdaagse. Zo blijft de
kost in de hand en toch houdt de werkbank zichzelf bij met de actua: de staatschuld, de macro in
België en Europa, de gesprekken in de politiek, de fiscaliteit en de belastingen.

Als dit hart klopt, kan de rest groeien zonder dat iemand elke week helemaal opnieuw begint.
