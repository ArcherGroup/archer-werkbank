#!/usr/bin/env python3
"""De actualiteitswacht van de Werkbank.

Wat dit doet: per domein de bronnen van `domeinen.json` ophalen via de bestaande
bronlezer (edge function `lees-bron`), daar de zinnen uit halen die een cijfer en
een datum bij elkaar hebben, en die als **signaal** in `werkbank.actualiteit`
zetten. Een signaal is een voorstel om te bevestigen, geen vastgesteld feit: de
mens klikt het in de werkbank goed of weg, en pas dan draagt het iets bij.

Wat dit niet doet: het verzint niets, het leest de bron, en het herhaalt zichzelf
niet: elk signaal heeft een vingerafdruk, dus dezelfde zin komt er maar één keer in.

Gebruik:
    python3 agent/actualiteit/wacht.py                 # alle domeinen
    python3 agent/actualiteit/wacht.py --domein macro  # één domein
    python3 agent/actualiteit/wacht.py --droog         # alleen tonen, niets wegschrijven
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import date, datetime
from pathlib import Path

SB_URL = "https://thbjzrdogebyhbkkbxzp.supabase.co"
SB_KEY = os.environ.get("WERKBANK_SLEUTEL", "sb_publishable_gJpTKrSOJ0gjPfFIEW9mDA_w5l8eLT2")
LEZER = SB_URL + "/functions/v1/lees-bron"
REST = SB_URL + "/rest/v1/actualiteit"
HIER = Path(__file__).resolve().parent

MAANDEN = ("januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december"
           "|january|february|march|april|may|june|july|august|september|october|november|december")

GETAL = re.compile(r"(\d{1,3}(?:[.,]\d{1,3})?)\s*(procent|%|miljard|miljoen|euro|euros)", re.I)
DATUM = re.compile(r"(\d{1,2}\s+(?:%s)\.?\s+\d{4}|(?:%s)\.?\s+\d{4}|\b(19|20)\d{2}\b)" % (MAANDEN, MAANDEN), re.I)
DATUM_ISO = re.compile(r"\b(20\d{2})-(\d{2})-(\d{2})\b")
BLOKKADE = ("human visitor", "captcha", "are you a robot", "attention required", "access denied",
            "just a moment", "checking your browser", "enable javascript")
MAX_ZIN = 320
MIN_ZIN = 45
MAX_PER_BRON = 3


def lees_tekst(url: str, timeout: int = 40) -> str:
    """De pagina door de eigen bronlezer halen: één route voor alle bronnen."""
    lichaam = json.dumps({"url": url}).encode()
    verzoek = urllib.request.Request(
        LEZER, method="POST", data=lichaam,
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + SB_KEY, "apikey": SB_KEY},
    )
    with urllib.request.urlopen(verzoek, timeout=timeout) as antwoord:
        uit = json.loads(antwoord.read().decode())
    if isinstance(uit, dict) and uit.get("fout"):
        raise RuntimeError(str(uit["fout"]))
    return str(uit.get("tekst") or "")


def geblokkeerd(tekst: str) -> bool:
    """Een muur van een botcontrole is geen bron. Zeg het, verzin niets."""
    klein = tekst[:600].lower()
    return any(woord in klein for woord in BLOKKADE)


def zinnen(tekst: str):
    schoon = re.sub(r"\s+", " ", tekst)
    for stuk in re.split(r"(?<=[.!?])\s+", schoon):
        zin = stuk.strip()
        if MIN_ZIN <= len(zin) <= MAX_ZIN:
            yield zin


def datum_uit(zin: str):
    treffer = DATUM_ISO.search(zin)
    if treffer:
        try:
            return date(int(treffer.group(1)), int(treffer.group(2)), int(treffer.group(3)))
        except ValueError:
            return None
    return None


def signalen_uit(tekst: str, maximum: int = MAX_PER_BRON):
    uit = []
    for zin in zinnen(tekst):
        getal = GETAL.search(zin)
        if not getal:
            continue
        if not DATUM.search(zin):
            continue
        uit.append({
            "zin": zin,
            "getal": getal.group(1).replace(",", "."),
            "eenheid": getal.group(2).lower(),
            "bron_datum": datum_uit(zin),
        })
        if len(uit) >= maximum:
            break
    return uit


def vingerafdruk(domein: str, url: str, zin: str) -> str:
    ruw = "%s|%s|%s" % (domein, url, re.sub(r"\s+", " ", zin).strip().lower())
    return hashlib.sha1(ruw.encode()).hexdigest()[:20]


def uit_bestand(pad: str):
    """Signalen die een agent zelf heeft opgezocht: één JSON-lijst met per signaal
    domein, bron_naam, bron_url, zin, getal, eenheid, bron_datum."""
    with open(pad, encoding="utf-8") as f:
        ruw = json.load(f)
    rijen = []
    for s in ruw:
        if not (s.get("domein") and s.get("bron_url") and s.get("zin")):
            continue
        rijen.append({
            "domein": s["domein"],
            "bron_naam": s.get("bron_naam") or s["bron_url"],
            "bron_url": s["bron_url"],
            "titel": s.get("titel") or s.get("bron_naam") or "",
            "zin": s["zin"],
            "getal": str(s.get("getal") or ""),
            "eenheid": str(s.get("eenheid") or ""),
            "bron_datum": s.get("bron_datum") or None,
            "status": "te_controleren",
            "agent": s.get("agent") or "",
            "uniek": vingerafdruk(s["domein"], s["bron_url"], s["zin"]),
        })
    return rijen


def bewaar(rijen) -> int:
    if not rijen:
        return 0
    lichaam = json.dumps(rijen).encode()
    verzoek = urllib.request.Request(
        REST, method="POST", data=lichaam,
        headers={
            "Content-Type": "application/json",
            "Authorization": "Bearer " + SB_KEY,
            "apikey": SB_KEY,
            "Accept-Profile": "werkbank",
            "Content-Profile": "werkbank",
            "Prefer": "resolution=ignore-duplicates,return=representation",
        },
    )
    with urllib.request.urlopen(verzoek, timeout=60) as antwoord:
        return len(json.loads(antwoord.read().decode() or "[]"))


def wacht(domeinen, alleen=None, droog=False, rustig=False):
    totaal_nieuw = 0
    verslag = []
    for sleutel, domein in domeinen.items():
        if alleen and sleutel != alleen:
            continue
        for bron in domein.get("bronnen", []):
            try:
                tekst = lees_tekst(bron["url"])
            except (urllib.error.URLError, RuntimeError, TimeoutError) as fout:
                verslag.append((sleutel, bron["naam"], "niet gelezen: %s" % fout, 0))
                continue
            if geblokkeerd(tekst):
                verslag.append((sleutel, bron["naam"], "botcontrole: open de bron zelf", 0))
                continue
            gevonden = signalen_uit(tekst)
            rijen = [{
                "domein": sleutel,
                "bron_naam": bron["naam"],
                "bron_url": bron["url"],
                "titel": bron["naam"],
                "zin": s["zin"],
                "getal": s["getal"],
                "eenheid": s["eenheid"],
                "bron_datum": s["bron_datum"].isoformat() if s["bron_datum"] else None,
                "status": "te_controleren",
                "agent": domein.get("agent", ""),
                "uniek": vingerafdruk(sleutel, bron["url"], s["zin"]),
            } for s in gevonden]
            nieuw = 0 if droog else bewaar(rijen)
            totaal_nieuw += nieuw
            verslag.append((sleutel, bron["naam"], "%d gevonden, %d nieuw" % (len(rijen), nieuw), nieuw))
            if not rustig and rijen:
                print("  %s: %s" % (bron["naam"], rijen[0]["zin"][:110]))
    print("\n--- verslag ---")
    for domein, bron, uit, _ in verslag:
        print("%-14s %-34s %s" % (domein, bron[:34], uit))
    print("\nnieuwe signalen: %d%s" % (totaal_nieuw, " (droog, niets bewaard)" if droog else ""))
    return totaal_nieuw


def main(argv=None):
    p = argparse.ArgumentParser(description="Actualiteitswacht van de Werkbank")
    p.add_argument("--domein", help="alleen dit domein")
    p.add_argument("--droog", action="store_true", help="alleen tonen, niets bewaren")
    p.add_argument("--stil", action="store_true", help="geen voorbeeldzinnen")
    p.add_argument("--bestand", default=str(HIER / "domeinen.json"))
    p.add_argument("--signalen", help="JSON-lijst met signalen die een agent zelf heeft opgezocht")
    p.add_argument("--lijst", action="store_true", help="toon de bronnen per domein")
    args = p.parse_args(argv)

    with open(args.bestand, encoding="utf-8") as f:
        domeinen = json.load(f)

    if args.lijst:
        for sleutel, domein in domeinen.items():
            print("%s · %s (%s)" % (sleutel, domein["naam"], domein.get("agent", "")))
            for bron in domein.get("bronnen", []):
                print("   %-38s %s" % (bron["naam"], bron["url"]))
        return 0

    if args.signalen:
        rijen = uit_bestand(args.signalen)
        nieuw = 0 if args.droog else bewaar(rijen)
        print("%d signalen gelezen, %d nieuw%s" % (len(rijen), nieuw, " (droog)" if args.droog else ""))
        return 0

    print("actualiteitswacht %s, %d domeinen" % (datetime.now().strftime("%Y-%m-%d %H:%M"), len(domeinen)))
    return 0 if wacht(domeinen, alleen=args.domein, droog=args.droog, rustig=args.stil) >= 0 else 1


if __name__ == "__main__":
    sys.exit(main())
