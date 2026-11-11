// lees-bron: haalt een webpagina op en geeft de leesbare tekst terug,
// zodat de werkbank een bron naast je notitie kan tonen.
// Draait als Supabase edge function. Geen opslag, geen logging van inhoud.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function leesbaar(html: string): { titel: string; tekst: string } {
  let titel = "";
  const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (tm) titel = tm[1].replace(/\s+/g, " ").trim().slice(0, 300);

  let t = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // blokstructuur bewaren
  t = t.replace(/<\/(p|div|h[1-6]|li|tr|section|article|blockquote)>/gi, "\n")
       .replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<[^>]+>/g, " ");

  // entiteiten
  t = t.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
       .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
       .replace(/&euro;/g, "€").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–")
       .replace(/&#x27;/g, "'").replace(/&#x2F;/g, "/").replace(/&hellip;/g, "…")
       .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)));

  // witruimte normaliseren
  t = t.replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
  if (t.length > 400000) t = t.slice(0, 400000);
  return { titel, tekst: t };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ fout: "POST verwacht" }, 405);

  let url = "";
  try {
    const body = await req.json();
    url = String(body?.url ?? "").trim();
  } catch {
    return json({ fout: "ongeldige body" }, 400);
  }
  if (!/^https?:\/\//i.test(url)) return json({ fout: "ongeldige url" }, 400);

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 20000);
    const resp = await fetch(url, {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36 WerkbankLezer/1.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
        "Accept-Language": "nl-BE,nl;q=0.9,en;q=0.8,fr;q=0.7",
      },
    });
    clearTimeout(timer);
    const ct = resp.headers.get("content-type") || "";
    const ruw = await resp.text();

    if (ct.includes("application/json")) {
      return json({ status: resp.status, url: resp.url, titel: url, tekst: ruw.slice(0, 200000), soort: "json" });
    }
    const { titel, tekst } = leesbaar(ruw);
    return json({ status: resp.status, url: resp.url, titel: titel || url, tekst, soort: "html" });
  } catch (e) {
    return json({ fout: `ophalen mislukt: ${String(e).slice(0, 200)}` }, 502);
  }
});
