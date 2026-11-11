# Archer Werkbank · masterclass februari 2027

De werkbank waar Victor en Anthony samen aan de masterclass werken: alle dagdelen,
documenten en bronnen van de Vault, met notities, bewerken en een ingebouwde bronlezer.

- **App:** https://archergroup.github.io/archer-werkbank/
- **Bouw:** Vite + React (`npm run build` schrijft naar `docs/`)
- **Data:** Supabase-project `thbjzrdogebyhbkkbxzp`, schema `werkbank` (tabellen `blokken`,
  `documenten`, `bronnen`, `notities`, `beslissingen`, `validaties`, `voorstellen`,
  `documenten_historiek`). Realtime staat aan: wijzigingen verschijnen meteen bij iedereen.
- **Lezer:** edge function `lees-bron` haalt een bronpagina op en geeft de leesbare tekst terug.
- **Herimport uit de Vault:** `~/.hermes/cache/werkbank/import.py` (leest via Microsoft Graph).

## Werkwijze

1. Wijzigingen in de app gaan naar Supabase, niet terug naar de Vault-bestanden.
   De Vault blijft de bron voor de stukken zelf; de werkbank is de werklaag erbovenop.
2. Nieuwe stukken maak je aan in de app; research die terug in de Vault moet,
   laat je door Hermes wegschrijven.
3. Publiceer: `npm run build && git add -A && git commit -m "…" && git push`.
   GitHub Pages serveert de map `docs/` van `main`.
