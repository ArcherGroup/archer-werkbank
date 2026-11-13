"""Pure schema-migratiegenerator voor het schema `werkbank` (bron thbjzrdogebyhbkkbxzp -> doel znqcljyroirxvvllhygu).

Geen netwerk, geen database, geen data: de functies zetten bronmetadata (catalogus) om in SQL-tekst
of in een payload. De aanroeper voert alle externe writes zelf uit.
"""
from __future__ import annotations

import re

BRON_PROJECT = "thbjzrdogebyhbkkbxzp"
DOEL_PROJECT = "znqcljyroirxvvllhygu"
DEELNEMERS_BRON = "pgajmjeicrwxthkwwiei"  # alleen lezen, nooit schrijfdoel
SCHEMA = "werkbank"
API_ROLLEN = ("anon", "authenticated", "service_role")


class MigratieFout(ValueError):
    """Invoer of metadata is niet toegestaan; de generator weigert (fail-closed)."""


def controleer_projecten(bron, doel):
    for rol, waarde in (("bron", bron), ("doel", doel)):
        if not isinstance(waarde, str):
            raise MigratieFout("%s moet een projectref-tekst zijn" % rol)
    if DEELNEMERS_BRON in (bron, doel):
        raise MigratieFout("deelnemersbron %s is read-only en nooit bron of schrijfdoel" % DEELNEMERS_BRON)
    if bron != BRON_PROJECT or doel != DOEL_PROJECT:
        raise MigratieFout("alleen %s -> %s is toegestaan" % (BRON_PROJECT, DOEL_PROJECT))
    return True


_SCHEMANAAM = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,62}$")


def api_schema_patch(huidige_config):
    """Payload voor PATCH /postgrest: alleen db_schema, bestaande schemata behouden, werkbank eenmaal."""
    if not isinstance(huidige_config, dict) or huidige_config.get("db_schema") is None:
        raise MigratieFout("huidige PostgREST-config met db_schema is verplicht; anders gaan schemata verloren")
    huidig = huidige_config["db_schema"]
    if isinstance(huidig, str):
        delen = [deel.strip() for deel in huidig.split(",")]
    elif isinstance(huidig, (list, tuple)):
        delen = [deel.strip() if isinstance(deel, str) else deel for deel in huidig]
    else:
        raise MigratieFout("db_schema moet tekst of lijst zijn")
    schemata = []
    for deel in delen:
        if not isinstance(deel, str) or not _SCHEMANAAM.match(deel):
            raise MigratieFout("ongeldige schemanaam in db_schema: %r" % (deel,))
        if deel not in schemata:
            schemata.append(deel)
    if not schemata:
        raise MigratieFout("db_schema is leeg; weigeren om bestaande schemata te overschrijven")
    if SCHEMA not in schemata:
        schemata.append(SCHEMA)
    return {"db_schema": ",".join(schemata)}


_NAAM = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")
# PostgreSQL gereserveerde sleutelwoorden: onge-quote niet bruikbaar als naam, dus fail-closed geweigerd.
_GERESERVEERD = frozenset("""all analyse analyze and any array as asc asymmetric authorization binary both case cast
check collate collation column concurrently constraint create cross current_catalog current_date current_role
current_schema current_time current_timestamp current_user default deferrable desc distinct do else end except false
fetch for foreign freeze from full grant group having ilike in initially inner intersect into is isnull join lateral
leading left like limit localtime localtimestamp natural not notnull null offset on only or order outer overlaps
placing primary references returning right select session_user similar some symmetric system_user table tablesample
then to trailing true union unique user using variadic verbose when where window with""".split())
_KOLOMTYPES = frozenset(["bigint", "integer", "smallint", "text", "boolean", "date", "uuid", "json", "jsonb", "bytea",
                         "real", "double precision", "timestamp with time zone", "timestamp without time zone"])
_SERIAL_DEFAULT = re.compile(r"^nextval\('werkbank\.([a-z_][a-z0-9_]*)'::regclass\)$")


def _naam(waarde, soort):
    if (not isinstance(waarde, str) or not _NAAM.match(waarde) or waarde in _GERESERVEERD
            or waarde.startswith("pg_")):
        raise MigratieFout("ongeldige %s-naam: %r" % (soort, waarde))
    return waarde


def _lijst(meta, sleutel):
    waarde = meta.get(sleutel) if isinstance(meta, dict) else None
    if not isinstance(waarde, list):
        raise MigratieFout("metadata mist lijst %r" % sleutel)
    return waarde


_TOKEN = re.compile(r"""
    (?P<comment>--[^\n]*|/\*.*?\*/)
  | (?P<dollar>\$\$.*?\$\$|\$(?P<tag>[A-Za-z_][A-Za-z0-9_]*)\$.*?\$(?P=tag)\$)
  | (?P<string>'(?:[^']|'')*')
  | (?P<qident>"(?:[^"]|"")+")
  | (?P<ident>[A-Za-z_][A-Za-z0-9_$]*)
  | (?P<number>\d+(?:\.\d+)?)
  | (?P<cast>::)
  | (?P<ws>\s+)
  | (?P<other>.)
""", re.X | re.S)
_RELATIE_SLEUTEL = frozenset(["from", "join", "into", "update", "only"])
_GEEN_FUNCTIE_ALS_DOEL = frozenset(["into", "update", "only"])
_VREEMDE_SCHEMAS = frozenset([
    "public", "auth", "storage", "extensions", "realtime", "graphql", "graphql_public", "vault", "information_schema",
    "net", "cron", "pgsodium", "pgbouncer", "supabase_functions", "supabase_migrations"])
_VERBODEN_START = frozenset("""drop alter create grant revoke copy do call execute set reset vacuum analyze analyse
reindex cluster comment lock refresh listen notify unlisten load discard prepare deallocate begin commit rollback
savepoint release truncate security import checkpoint declare fetch move close start abort end""".split())
_GEEN_ALIAS = frozenset("""and or not on where group order having limit offset union intersect except join left right
inner outer full cross natural using set values returning select from window for is in between like ilike similar
when then else end case with as do filter within over lateral only distinct all any some""".split())
_REG_SOORTEN = frozenset(["regclass", "regnamespace", "regproc", "regprocedure", "regoper", "regoperator", "regtype",
                          "regconfig", "regdictionary"])
_REG_FUNCTIES = {"nextval": "regclass", "currval": "regclass", "setval": "regclass", "to_regclass": "regclass",
                 "pg_get_serial_sequence": "regclass", "to_regnamespace": "regnamespace", "to_regtype": "regtype",
                 "to_regproc": "regproc", "to_regprocedure": "regprocedure"}


def _tokens(tekst, wat, body):
    if not isinstance(tekst, str) or "\\" in tekst:
        raise MigratieFout("%s: ongeldige SQL (backslash of geen tekst)" % wat)
    tokens = []
    for gevonden in _TOKEN.finditer(tekst):
        soort, ruw = gevonden.lastgroup, gevonden.group()
        if soort == "ws":
            continue
        if soort == "comment":
            if not body:
                raise MigratieFout("%s: commentaar is niet toegestaan" % wat)
            continue
        if soort == "dollar" and not body:
            raise MigratieFout("%s: dollar-quote is niet toegestaan" % wat)
        if soort == "other" and ruw in ("'", '"'):
            raise MigratieFout("%s: niet afgesloten quote" % wat)
        if soort == "ident":
            norm = ruw.lower()
        elif soort == "qident":
            norm = ruw[1:-1].replace('""', '"')
        elif soort == "string":
            norm = ruw[1:-1].replace("''", "'")
        elif soort == "dollar":
            soort, norm = "string", ""
        else:
            norm = ruw
        tokens.append((soort, ruw, norm))
    return tokens


def _is_naam(token):
    return token[0] in ("ident", "qident")


def _cross_schema(wat, naam):
    return MigratieFout("cross-schema verwijzing in %s: %s" % (wat, naam))


def _controleer_literal(tekst, soort, wat):
    """Tekstliteral dat als regclass/regtype/... wordt gelezen: verwijzing moet in werkbank liggen."""
    gevonden = re.match(r'^\s*("(?:[^"]|"")+"|[^."]+)\s*\.', tekst)
    if gevonden:
        schema = gevonden.group(1)
        schema = schema[1:-1].replace('""', '"') if schema.startswith('"') else schema.strip().lower()
        if schema != SCHEMA:
            raise _cross_schema(wat, tekst)
    elif soort == "regclass" or (soort == "regnamespace" and tekst.strip() != SCHEMA):
        raise MigratieFout("ongekwalificeerde %s-verwijzing in %s: %s" % (soort, wat, tekst))


_FROM_EINDE = frozenset(["where", "group", "order", "having", "limit", "offset", "union", "intersect", "except",
                         "returning", "window", "for", "select", "set", "on", "values", "fetch"])


def _relatie_posities(tokens):
    """Index van elk token waar een tabelverwijzing begint -> 'bron' (FROM/JOIN/komma) of 'doel' (INTO/UPDATE)."""
    n, posities, in_from = len(tokens), {}, [False]

    def token(i):
        return tokens[i] if 0 <= i < n else ("einde", "", "")

    for i, (soort, ruw, norm) in enumerate(tokens):
        if ruw == "(":
            in_from.append(False)
        elif ruw == ")" and len(in_from) > 1:
            in_from.pop()
        elif soort == "ident" and norm in _FROM_EINDE:
            in_from[-1] = False
        keyword = norm if soort == "ident" else ""
        if keyword == "from" and token(i - 1)[2] == "distinct":
            continue
        if keyword == "update" and (token(i - 1)[2] in ("for", "key") or token(i + 1)[2] == "set"):
            continue
        if keyword in ("from", "join", "into", "update") or (ruw == "," and in_from[-1]):
            if keyword == "from":
                in_from[-1] = True
            j = i + 1
            while token(j)[0] == "ident" and token(j)[2] in ("only", "lateral"):
                j += 1
            posities[j] = "doel" if keyword in ("into", "update") else "bron"
    return posities


def _keten(tokens, begin):
    """Naam met punten vanaf index begin: (delen, index na de keten)."""
    n, delen, j = len(tokens), [tokens[begin]], begin + 1
    while j + 1 < n and tokens[j][1] == "." and _is_naam(tokens[j + 1]):
        delen.append(tokens[j + 1])
        j += 2
    return delen, j


def _lokale_namen(tokens, posities, ctes):
    """Aliassen, tabelnamen en CTE-namen waarmee `naam.kolom` legitiem is."""
    n, lokaal = len(tokens), set(ctes)

    def alias_na(j):
        if j < n and tokens[j][2] == "as" and tokens[j][0] == "ident":
            j += 1
        if j < n and _is_naam(tokens[j]) and not (tokens[j][0] == "ident" and tokens[j][2] in _GEEN_ALIAS):
            lokaal.add(tokens[j][2].lower())

    for begin in posities:
        if begin < n and _is_naam(tokens[begin]):
            delen, einde = _keten(tokens, begin)
            if einde < n and tokens[einde][1] != "(":
                lokaal.add(delen[-1][2].lower())
                alias_na(einde)
    for i, tok in enumerate(tokens):
        if tok[1] == ")" or (tok[0] == "ident" and tok[2] == "as"):
            alias_na(i + 1)
    return lokaal


def _controleer_sql(tekst, wat, body=False):
    """Weiger verwijzingen buiten schema werkbank, schrijf/DDL-instructies elders en onzichtbare trucs.

    body=True: functie-body (meerdere statements en commentaar toegestaan); anders: één expressie."""
    tokens = _tokens(tekst, wat, body)
    n = len(tokens)

    def token(i):
        return tokens[i] if 0 <= i < n else ("einde", "", "")

    if not body and any(tok[1] == ";" for tok in tokens):
        raise MigratieFout("%s: meerdere statements zijn niet toegestaan" % wat)
    ctes = {tok[2].lower() for i, tok in enumerate(tokens) if _is_naam(tok) and token(i + 1)[2] == "as"
            and (token(i + 2)[1] == "(" or token(i + 2)[2] in ("materialized", "not"))}
    posities = _relatie_posities(tokens)
    lokaal = _lokale_namen(tokens, posities, ctes)

    nieuw = True  # begin van een statement: geen DDL, rechten of sessie-instructies
    for tok in tokens:
        if tok[1] == ";":
            nieuw = True
            continue
        if nieuw and tok[0] == "ident" and tok[2] in _VERBODEN_START:
            raise MigratieFout("instructie %s is niet toegestaan in %s" % (tok[2].upper(), wat))
        nieuw = False

    i = 0
    while i < n:
        soort, ruw, norm = tokens[i]
        vorige = token(i - 1)
        if soort == "string":
            if token(i + 1)[0] == "cast" and token(i + 2)[2].lower() in _REG_SOORTEN:
                _controleer_literal(norm, token(i + 2)[2].lower(), wat)
            if vorige[1] == "(" and token(i - 2)[2].lower() in _REG_FUNCTIES:
                _controleer_literal(norm, _REG_FUNCTIES[token(i - 2)[2].lower()], wat)
        if soort == "ident" and norm == "operator" and token(i + 1)[1] == "(":
            if _is_naam(token(i + 2)) and token(i + 3)[1] == "." and token(i + 2)[2].lower() != SCHEMA:
                raise _cross_schema(wat, "OPERATOR(%s.…)" % token(i + 2)[2])
        if i in posities and _is_naam(tokens[i]) and token(i + 1)[1] != ".":
            functie = token(i + 1)[1] == "(" and posities[i] == "bron"
            if not functie and norm.lower() not in ctes:
                raise MigratieFout("ongekwalificeerde tabelverwijzing in %s: %s (alleen %s.<naam> toegestaan)"
                                   % (wat, norm, SCHEMA))
        if _is_naam(tokens[i]) and vorige[1] != "." and token(i + 1)[1] == ".":
            keten, einde = _keten(tokens, i)
            if len(keten) >= 2:
                naam = ".".join(k[2] for k in keten)
                schema = keten[0][2] if keten[0][0] == "qident" else keten[0][2].lower()
                relatie = i in posities or vorige[0] == "cast"
                if len(keten) >= 3 or relatie or token(einde)[1] == "(":
                    if schema != SCHEMA:
                        raise _cross_schema(wat, naam)
                elif schema != SCHEMA and (schema in _VREEMDE_SCHEMAS or schema.startswith("pg_")
                                           or schema.lower() not in lokaal):
                    raise _cross_schema(wat, naam)
            i = einde
            continue
        i += 1


def _sequence_opties(seq):
    for veld in ("start_value", "increment_by", "min_value", "cache_size"):
        if not isinstance(seq.get(veld), int) or isinstance(seq.get(veld), bool):
            raise MigratieFout("sequence %s: %s moet een geheel getal zijn" % (seq.get("sequencename"), veld))
    max_waarde = seq.get("max_value")
    if isinstance(max_waarde, int) and not isinstance(max_waarde, bool):
        max_waarde = str(max_waarde)
    if not isinstance(max_waarde, str) or not re.match(r"^\d+$", max_waarde):
        raise MigratieFout("sequence %s: max_value ongeldig" % seq.get("sequencename"))
    if not isinstance(seq.get("cycle"), bool):
        raise MigratieFout("sequence %s: cycle moet boolean zijn" % seq.get("sequencename"))
    return "START WITH %d INCREMENT BY %d MINVALUE %d MAXVALUE %s CACHE %d %s" % (
        seq["start_value"], seq["increment_by"], seq["min_value"], max_waarde, seq["cache_size"],
        "CYCLE" if seq["cycle"] else "NO CYCLE")


def _kolom_sql(kolom, identity_sequences, serial_eigenaren, sequences):
    tabel = _naam(kolom.get("table_name"), "tabel")
    naam = _naam(kolom.get("column_name"), "kolom")
    soort = kolom.get("data_type")
    if kolom.get("udt_schema") != "pg_catalog" or soort not in _KOLOMTYPES:
        raise MigratieFout("kolom %s.%s: type %r niet ondersteund" % (tabel, naam, soort))
    delen = [naam, soort]
    standaard = kolom.get("column_default")
    if kolom.get("is_identity") == "YES":
        sequence = "%s_%s_seq" % (tabel, naam)
        delen.append("GENERATED %s AS IDENTITY (SEQUENCE NAME %s.%s %s)" % (
            kolom.get("identity_generation"), SCHEMA, sequence, identity_sequences[sequence]))
    elif standaard is not None:
        _controleer_sql(standaard, "default %s.%s" % (tabel, naam))
        gevonden = _SERIAL_DEFAULT.match(standaard)
        if "nextval" in standaard.lower() and not gevonden:
            raise MigratieFout("default %s.%s: alleen nextval('%s.<sequence>'::regclass) is toegestaan"
                               % (tabel, naam, SCHEMA))
        if gevonden:
            if gevonden.group(1) not in sequences:
                raise MigratieFout("default %s.%s: sequence %s ontbreekt in de metadata" % (
                    tabel, naam, gevonden.group(1)))
            serial_eigenaren.append((gevonden.group(1), tabel, naam))
        delen.append("DEFAULT " + standaard)
    if kolom.get("is_nullable") == "NO":
        delen.append("NOT NULL")
    return " ".join(delen)


_KOLOMLIJST = r"[a-z_][a-z0-9_]*(?:, [a-z_][a-z0-9_]*)*"
_PK = re.compile(r"^PRIMARY KEY \((%s)\)$" % _KOLOMLIJST)
_UNIEK = re.compile(r"^UNIQUE (?:NULLS NOT DISTINCT )?\((%s)\)$" % _KOLOMLIJST)
_ACTIE = r"(?:NO ACTION|RESTRICT|CASCADE|SET NULL|SET DEFAULT)"
_FK = re.compile(
    r"^FOREIGN KEY \((%s)\) REFERENCES (\S+?)\((%s)\)"
    r"((?: MATCH FULL)?(?: ON UPDATE %s)?(?: ON DELETE %s)?(?: (?:NOT )?DEFERRABLE(?: INITIALLY (?:DEFERRED|IMMEDIATE))?)?)$"
    % (_KOLOMLIJST, _KOLOMLIJST, _ACTIE, _ACTIE))
_INDEX = re.compile(r"^CREATE (UNIQUE )?INDEX (\S+) ON (\S+) USING (\S+) (\(.*)$", re.S)
_INDEXMETHODES = frozenset(["btree", "hash", "gin", "gist", "brin", "spgist"])


def _kolomnamen(lijst, tabel, kolommen):
    namen = lijst.split(", ")
    for naam in namen:
        if naam not in kolommen[tabel]:
            raise MigratieFout("constraint op %s verwijst naar onbekende kolom %r" % (tabel, naam))
    return namen


def _referentie(naam, beperking, tabellen):
    delen = naam.split(".")
    if len(delen) != 2:
        raise MigratieFout("foreign key %s: verwijzing %r is niet schema-gekwalificeerd" % (beperking, naam))
    if delen[0] != SCHEMA:
        raise MigratieFout("foreign key %s: cross-schema verwijzing naar %s" % (beperking, naam))
    if delen[1] not in tabellen:
        raise MigratieFout("foreign key %s: onbekende doeltabel %r in %s" % (beperking, delen[1], SCHEMA))
    return delen[1]


def _beperkingen(meta, tabellen, kolommen):
    """(inline per tabel, foreign-key-statements, namen van constraints die zelf een index maken)."""
    inline = {tabel: [] for tabel in tabellen}
    foreign = []
    index_namen = set()
    for con in _lijst(meta, "constraints"):
        tabel, naam, soort, definitie = con.get("relname"), _naam(con.get("conname"), "constraint"), \
            con.get("contype"), con.get("definitie")
        if tabel not in tabellen or not isinstance(definitie, str):
            raise MigratieFout("constraint %s hoort niet bij een werkbank-tabel" % naam)
        if soort in ("p", "u"):
            gevonden = (_PK if soort == "p" else _UNIEK).match(definitie)
            if not gevonden:
                raise MigratieFout("constraint %s: definitie niet ondersteund: %r" % (naam, definitie))
            _kolomnamen(gevonden.group(1), tabel, kolommen)
            inline[tabel].append("CONSTRAINT %s %s" % (naam, definitie))
            index_namen.add((tabel, naam))
        elif soort == "f":
            gevonden = _FK.match(definitie)
            if not gevonden:
                raise MigratieFout("constraint %s: foreign key-definitie niet ondersteund: %r" % (naam, definitie))
            doel = _referentie(gevonden.group(2), naam, tabellen)
            _kolomnamen(gevonden.group(1), tabel, kolommen)
            _kolomnamen(gevonden.group(3), doel, kolommen)
            foreign.append("ALTER TABLE %s.%s ADD CONSTRAINT %s %s" % (SCHEMA, tabel, naam, definitie))
        else:
            raise MigratieFout("constraint %s: soort %r niet ondersteund" % (naam, soort))
    return inline, foreign, index_namen


def _indexen(meta, tabellen, constraint_indexen):
    statements = []
    for index in sorted(_lijst(meta, "indexes"), key=lambda i: (str(i.get("tablename")), str(i.get("indexname")))):
        naam, tabel, definitie = _naam(index.get("indexname"), "index"), index.get("tablename"), index.get("indexdef")
        if tabel not in tabellen or not isinstance(definitie, str):
            raise MigratieFout("index %s hoort niet bij een werkbank-tabel" % naam)
        gevonden = _INDEX.match(definitie)
        if not gevonden or gevonden.group(2) != naam:
            raise MigratieFout("index %s: definitie niet ondersteund: %r" % (naam, definitie))
        if gevonden.group(3) != "%s.%s" % (SCHEMA, tabel):
            raise MigratieFout("index %s: cross-schema of afwijkende tabel %r" % (naam, gevonden.group(3)))
        if gevonden.group(4) not in _INDEXMETHODES:
            raise MigratieFout("index %s: methode %r niet ondersteund" % (naam, gevonden.group(4)))
        _controleer_sql(gevonden.group(5), "index %s" % naam)
        if (tabel, naam) in constraint_indexen:
            continue  # deze index ontstaat al door de PRIMARY KEY/UNIQUE-constraint
        statements.append(definitie)
    return statements


_FUNCTIEARG = re.compile(r"^(?:(?:IN|VARIADIC) )?[a-z_][a-z0-9_]* [a-z][a-z0-9_ ]*(?:\[\])?$")
_FUNCTIEKOP = re.compile(
    r"^RETURNS (?:SETOF )?[a-z][a-z0-9_ ]*(?:\[\])?\s+LANGUAGE sql"
    r"(?:\s+(?:STABLE|IMMUTABLE|VOLATILE|STRICT|SECURITY INVOKER|PARALLEL (?:SAFE|UNSAFE|RESTRICTED)|COST \d+|ROWS \d+))*$",
    re.I)
_FUNCTIEBODY = re.compile(r"^(.*?)\nAS (\$[A-Za-z_]*\$)(.*)$", re.S)


def _functies(meta):
    statements = []
    for functie in _lijst(meta, "functions"):
        naam, args, definitie = _naam(functie.get("proname"), "functie"), functie.get("args"), functie.get("definitie")
        if not isinstance(args, str) or not isinstance(definitie, str):
            raise MigratieFout("functie %s: args en definitie zijn verplicht" % naam)
        if args and not all(_FUNCTIEARG.match(deel) for deel in args.split(", ")):
            raise MigratieFout("functie %s: argumenten niet ondersteund: %r" % (naam, args))
        begin = "CREATE OR REPLACE FUNCTION %s.%s(%s)\n" % (SCHEMA, naam, args)
        if not definitie.startswith(begin):
            raise MigratieFout("functie %s: definitie moet met %r beginnen" % (naam, begin.strip()))
        gevonden = _FUNCTIEBODY.match(definitie[len(begin):])
        if not gevonden:
            raise MigratieFout("functie %s: body met dollar-quote ontbreekt" % naam)
        kop, tag, rest = gevonden.groups()
        if not _FUNCTIEKOP.match(kop.strip()):
            raise MigratieFout("functie %s: kop niet ondersteund (alleen LANGUAGE sql, SECURITY INVOKER): %r"
                               % (naam, kop))
        if rest.count(tag) != 1 or not rest.rstrip().endswith(tag):
            raise MigratieFout("functie %s: body is niet netjes begrensd door %s" % (naam, tag))
        _controleer_sql(rest.rstrip()[:-len(tag)], "functie %s" % naam, body=True)
        statements.append("CREATE FUNCTION " + definitie[len("CREATE OR REPLACE FUNCTION "):].rstrip())
    return statements


_POLICY_CMD = frozenset(["ALL", "SELECT", "INSERT", "UPDATE", "DELETE"])
_REPLICA = {"d": None, "f": "FULL", "n": "NOTHING"}


def _rollen(waarde, wat):
    if isinstance(waarde, str):
        if not (waarde.startswith("{") and waarde.endswith("}")):
            raise MigratieFout("%s: rollen moeten een lijst of PostgreSQL-array zijn" % wat)
        waarde = waarde[1:-1].split(",") if waarde[1:-1] else []
    if not isinstance(waarde, (list, tuple)) or not waarde:
        raise MigratieFout("%s: minstens één rol is verplicht" % wat)
    return ["PUBLIC" if rol == "public" else _naam(rol, "rol") for rol in waarde]


def _relatie_opties(meta):
    """Controleer eigenaar/opties van alle relaties en geef (ENABLE/FORCE RLS-, REPLICA IDENTITY-)statements."""
    relaties = [r for r in _lijst(meta, "relations") if r.get("relkind") in ("r", "S", "i")]
    if len(relaties) != len(_lijst(meta, "relations")):
        raise MigratieFout("alleen tabellen, sequences en indexen worden ondersteund")
    if len({r.get("eigenaar") for r in relaties}) != 1:
        raise MigratieFout("alle relaties moeten dezelfde eigenaar hebben")
    _naam(relaties[0].get("eigenaar"), "eigenaar")
    statements = []
    for r in sorted((r for r in relaties if r["relkind"] == "r"), key=lambda r: r["relname"]):
        if r.get("reloptions") is not None:
            raise MigratieFout("tabel %s: reloptions worden niet ondersteund" % r["relname"])
        if r.get("relreplident") not in _REPLICA:
            raise MigratieFout("tabel %s: replica identity %r niet ondersteund" % (r["relname"], r.get("relreplident")))
        if r.get("relrowsecurity"):
            statements.append("ALTER TABLE %s.%s ENABLE ROW LEVEL SECURITY" % (SCHEMA, r["relname"]))
        if r.get("relforcerowsecurity"):
            statements.append("ALTER TABLE %s.%s FORCE ROW LEVEL SECURITY" % (SCHEMA, r["relname"]))
        if _REPLICA[r["relreplident"]]:
            statements.append("ALTER TABLE %s.%s REPLICA IDENTITY %s" % (SCHEMA, r["relname"], _REPLICA[r["relreplident"]]))
    return statements


def _policies(meta, tabellen):
    statements, gezien = [], set()
    for pol in sorted(_lijst(meta, "policies"), key=lambda p: (str(p.get("tablename")), str(p.get("policyname")))):
        naam, tabel, cmd = _naam(pol.get("policyname"), "policy"), pol.get("tablename"), pol.get("cmd")
        if pol.get("schemaname") != SCHEMA or tabel not in tabellen:
            raise MigratieFout("policy %s hoort niet bij een tabel in %s" % (naam, SCHEMA))
        if (tabel, naam) in gezien:
            raise MigratieFout("policy %s bestaat dubbel op %s" % (naam, tabel))
        gezien.add((tabel, naam))
        if cmd not in _POLICY_CMD or pol.get("permissive") not in ("PERMISSIVE", "RESTRICTIVE"):
            raise MigratieFout("policy %s: cmd of permissive niet ondersteund" % naam)
        qual, check = pol.get("qual"), pol.get("with_check")
        if (qual is None and check is None) or (cmd in ("SELECT", "DELETE") and check is not None) or (
                cmd == "INSERT" and qual is not None):
            raise MigratieFout("policy %s: USING/WITH CHECK past niet bij %s" % (naam, cmd))
        tekst = "CREATE POLICY %s ON %s.%s AS %s FOR %s TO %s" % (
            naam, SCHEMA, tabel, pol["permissive"], cmd, ", ".join(_rollen(pol.get("roles"), "policy " + naam)))
        for woord, expressie in (("USING", qual), ("WITH CHECK", check)):
            if expressie is not None:
                _controleer_sql(expressie, "policy %s.%s" % (tabel, naam))
                tekst += " %s (%s)" % (woord, expressie)
        statements.append(tekst)
    return statements


# PostgreSQL ACL-letters per objectsoort, in de volgorde waarin ze in GRANT worden geschreven.
_RECHTEN = {
    "TABLE": (("r", "SELECT"), ("a", "INSERT"), ("w", "UPDATE"), ("d", "DELETE"), ("D", "TRUNCATE"),
              ("x", "REFERENCES"), ("t", "TRIGGER"), ("m", "MAINTAIN")),
    "SEQUENCE": (("U", "USAGE"), ("r", "SELECT"), ("w", "UPDATE")),
    "FUNCTION": (("X", "EXECUTE"),),
    "SCHEMA": (("U", "USAGE"), ("C", "CREATE")),
}
_ACL_ITEM = re.compile(r"^([a-z_][a-z0-9_]*)?=([A-Za-z]+)/([a-z_][a-z0-9_]*)$")


def _parse_acl(acl, soort, eigenaar, wat):
    """PostgreSQL-ACL-tekst -> lijst (grantee, frozenset(letters)); '' = PUBLIC, eigenaar-ingang valt weg."""
    volledig = frozenset(letter for letter, _ in _RECHTEN[soort])
    if acl is None:  # standaardrechten: alleen de eigenaar; functies zijn standaard uitvoerbaar voor PUBLIC
        return [("", volledig)] if soort == "FUNCTION" else []
    if isinstance(acl, str):
        if not (acl.startswith("{") and acl.endswith("}")):
            raise MigratieFout("%s: ACL is geen PostgreSQL-array: %r" % (wat, acl))
        acl = acl[1:-1].split(",") if len(acl) > 2 else []
    if not isinstance(acl, (list, tuple)):
        raise MigratieFout("%s: ACL ongeldig" % wat)
    rechten, eigenaar_gezien = [], False
    for item in acl:
        gevonden = _ACL_ITEM.match(item) if isinstance(item, str) else None
        if not gevonden:
            raise MigratieFout("%s: ACL-ingang niet ondersteund: %r" % (wat, item))
        grantee, letters, grantor = gevonden.groups()
        if grantor != eigenaar:
            raise MigratieFout("%s: ACL-ingang %r is niet door de eigenaar verleend" % (wat, item))
        if grantee is not None:
            _naam(grantee, "rol")
        if not set(letters) <= volledig or len(set(letters)) != len(letters):
            raise MigratieFout("%s: recht(en) %r niet ondersteund voor %s" % (wat, letters, soort))
        if grantee == eigenaar:
            if frozenset(letters) != volledig:
                raise MigratieFout("%s: eigenaar mist rechten; niet ondersteund" % wat)
            eigenaar_gezien = True
        else:
            rechten.append((grantee or "", frozenset(letters)))
    if not eigenaar_gezien:
        raise MigratieFout("%s: ACL zonder eigenaar-ingang wordt niet ondersteund" % wat)
    return rechten


def _acl_statements(soort, object_sql, rechten, revoke_lijst, wat):
    statements = ["REVOKE ALL ON %s %s FROM %s" % (soort, object_sql, revoke_lijst)]
    groepen = []  # (letters, [grantees]) in volgorde van eerste voorkomen
    for grantee, letters in rechten:
        for groep in groepen:
            if groep[0] == letters:
                groep[1].append(grantee or "PUBLIC")
                break
        else:
            groepen.append((letters, [grantee or "PUBLIC"]))
    for letters, grantees in groepen:
        namen = [naam for letter, naam in _RECHTEN[soort] if letter in letters]
        recht = "ALL" if soort == "TABLE" and len(namen) == len(_RECHTEN["TABLE"]) else ", ".join(namen)
        statements.append("GRANT %s ON %s %s TO %s" % (recht, soort, object_sql, ", ".join(grantees)))
    return statements


def _acl_alles(meta, api_rollen):
    relaties = {r["relname"]: r for r in _lijst(meta, "relations")}
    eigenaar = next(iter(relaties.values()))["eigenaar"] if relaties else "postgres"
    tabellen = sorted(n for n, r in relaties.items() if r["relkind"] == "r")
    sequences = sorted(n for n, r in relaties.items() if r["relkind"] == "S")
    if sequences != sorted(q.get("sequencename") for q in _lijst(meta, "sequences")):
        raise MigratieFout("sequences in metadata en relaties komen niet overeen")
    objecten = []  # (soort, sql-naam, rechten, label)
    for naam in tabellen:
        objecten.append(("TABLE", "%s.%s" % (SCHEMA, naam), _parse_acl(relaties[naam].get("acl"), "TABLE", eigenaar,
                                                                      "tabel " + naam)))
    for naam in sequences:
        objecten.append(("SEQUENCE", "%s.%s" % (SCHEMA, naam), _parse_acl(relaties[naam].get("acl"), "SEQUENCE",
                                                                         eigenaar, "sequence " + naam)))
    for functie in sorted(_lijst(meta, "functions"), key=lambda f: str(f.get("proname"))):
        objecten.append(("FUNCTION", "%s.%s(%s)" % (SCHEMA, functie["proname"], functie["args"]),
                         _parse_acl(functie.get("acl"), "FUNCTION", eigenaar, "functie " + functie["proname"])))
    if meta.get("schema_acl") is not None:
        schema_rechten = _parse_acl(meta["schema_acl"], "SCHEMA", eigenaar, "schema " + SCHEMA)
    else:  # geen schema-ACL in de bronmetadata: USAGE voor elke rol met rechten op een werkbank-object
        rollen = []
        for _soort, _naam_sql, rechten in objecten:
            rollen += [g for g, letters in rechten if g and letters and g not in rollen]
        schema_rechten = [(rol, frozenset("U")) for rol in rollen]
    objecten.insert(0, ("SCHEMA", SCHEMA, schema_rechten))
    rollen = {_naam(rol, "rol") for rol in api_rollen}
    for _soort, _naam_sql, rechten in objecten:
        rollen |= {g for g, _ in rechten if g}
    rollen.discard(eigenaar)
    revoke_lijst = ", ".join(["PUBLIC"] + sorted(rollen))
    statements = []
    for soort, object_sql, rechten in objecten:
        statements += _acl_statements(soort, object_sql, rechten, revoke_lijst, object_sql)
    return statements


_META_LIJSTEN = ("relations", "columns", "constraints", "indexes", "sequences", "functions", "policies", "triggers",
                 "types", "extension_dependencies")


def _valideer_meta(meta):
    if not isinstance(meta, dict):
        raise MigratieFout("metadata moet een object zijn")
    for sleutel in _META_LIJSTEN:
        if not isinstance(meta.get(sleutel), list) or not all(isinstance(item, dict) for item in meta[sleutel]):
            raise MigratieFout("metadata mist lijst %r" % sleutel)
    for sleutel in ("triggers", "types", "extension_dependencies"):
        if meta[sleutel]:
            raise MigratieFout("bron heeft %s; dat wordt niet ondersteund (geen extensies/types/triggers)" % sleutel)


def _tabelnamen(meta):
    namen = [_naam(r.get("relname"), "relatie") for r in meta["relations"]]
    if len(set(namen)) != len(namen):
        raise MigratieFout("dubbele relatienaam in de metadata")
    return sorted(r["relname"] for r in meta["relations"] if r.get("relkind") == "r")


def _sequences(meta):
    sequences = {}
    for seq in meta["sequences"]:
        naam = _naam(seq.get("sequencename"), "sequence")
        if seq.get("schemaname") != SCHEMA or naam in sequences or seq.get("data_type") not in (
                "smallint", "integer", "bigint"):
            raise MigratieFout("sequence %s hoort niet in %s of is dubbel/onbekend type" % (naam, SCHEMA))
        sequences[naam] = seq
    return sequences


def _kolommen(meta, tabellen):
    per_tabel = {}
    for kolom in meta["columns"]:
        tabel, naam = _naam(kolom.get("table_name"), "tabel"), _naam(kolom.get("column_name"), "kolom")
        if kolom.get("table_schema") != SCHEMA or tabel not in tabellen:
            raise MigratieFout("kolom %s.%s hoort niet bij een tabel in %s" % (tabel, naam, SCHEMA))
        if kolom.get("is_generated") not in (None, "NEVER") or kolom.get("generation_expression") is not None:
            raise MigratieFout("kolom %s.%s: gegenereerde kolommen worden niet ondersteund" % (tabel, naam))
        if kolom.get("is_identity") == "YES" and kolom.get("column_default") is not None:
            raise MigratieFout("kolom %s.%s: identity en default tegelijk" % (tabel, naam))
        if kolom.get("is_identity") == "YES" and kolom.get("identity_generation") not in ("ALWAYS", "BY DEFAULT"):
            raise MigratieFout("kolom %s.%s: identity_generation onbekend" % (tabel, naam))
        if not isinstance(kolom.get("ordinal_position"), int):
            raise MigratieFout("kolom %s.%s: ordinal_position ontbreekt" % (tabel, naam))
        per_tabel.setdefault(tabel, []).append(kolom)
    for tabel in tabellen:
        kolommen = sorted(per_tabel.get(tabel, []), key=lambda k: k["ordinal_position"])
        namen = [k["column_name"] for k in kolommen]
        if not kolommen or len(set(namen)) != len(namen):
            raise MigratieFout("tabel %s heeft geen kolommen of dubbele kolomnamen" % tabel)
        per_tabel[tabel] = kolommen
    return per_tabel


def _api_rollen(api_rollen):
    if not isinstance(api_rollen, (list, tuple)):
        raise MigratieFout("api_rollen moet een lijst of tuple zijn")
    return [_naam(rol, "rol") for rol in api_rollen]


def maak_schema_statements(meta, api_rollen=API_ROLLEN):
    """Geordende lijst SQL-statements (zonder puntkomma) voor een nieuw schema werkbank in één transactie."""
    _valideer_meta(meta)
    api_rollen = _api_rollen(api_rollen)
    tabellen = _tabelnamen(meta)
    sequences = _sequences(meta)
    kolommen = _kolommen(meta, tabellen)
    kolomnamen = {tabel: [k["column_name"] for k in kolommen[tabel]] for tabel in tabellen}
    identity_sequences = {}
    for lijst in kolommen.values():
        for kolom in lijst:
            if kolom.get("is_identity") == "YES":
                sequence = "%s_%s_seq" % (kolom["table_name"], kolom["column_name"])
                if sequence not in sequences:
                    raise MigratieFout("identity-kolom %s.%s mist sequence %s in de metadata" % (
                        kolom["table_name"], kolom["column_name"], sequence))
                identity_sequences[sequence] = _sequence_opties(sequences[sequence])
    inline, foreign_keys, constraint_indexen = _beperkingen(meta, tabellen, kolomnamen)

    statements = [
        "BEGIN",
        "SET LOCAL lock_timeout = '1s'",
        "SET LOCAL statement_timeout = '30s'",
        "CREATE SCHEMA %s" % SCHEMA,
    ]
    serial_eigenaren = []
    tabel_sql = []
    for tabel in tabellen:
        regels = ["    " + _kolom_sql(k, identity_sequences, serial_eigenaren, sequences) for k in kolommen[tabel]]
        regels += ["    " + beperking for beperking in inline[tabel]]
        tabel_sql.append("CREATE TABLE %s.%s (\n%s\n)" % (SCHEMA, tabel, ",\n".join(regels)))
    if len({sequence for sequence, _t, _k in serial_eigenaren}) != len(serial_eigenaren):
        raise MigratieFout("een sequence mag maar door één kolom worden gebruikt")
    for sequence, _tabel, _kolom in sorted(serial_eigenaren):
        statements.append("CREATE SEQUENCE %s.%s AS %s %s" % (
            SCHEMA, sequence, sequences[sequence]["data_type"], _sequence_opties(sequences[sequence])))
    statements.extend(tabel_sql)
    for sequence, tabel, kolom in sorted(serial_eigenaren):
        statements.append("ALTER SEQUENCE %s.%s OWNED BY %s.%s.%s" % (SCHEMA, sequence, SCHEMA, tabel, kolom))
    statements.extend(foreign_keys)
    statements.extend(_indexen(meta, tabellen, constraint_indexen))
    statements.extend(_functies(meta))
    statements.extend(_relatie_opties(meta))
    statements.extend(_policies(meta, tabellen))
    statements.extend(_acl_alles(meta, api_rollen))
    statements.append("COMMIT")
    return statements


def maak_schema_sql(meta, api_rollen=API_ROLLEN):
    return "".join(statement + ";\n" for statement in maak_schema_statements(meta, api_rollen))
