/* De zaal in cijfers.

   Dit is de vroege steekproef uit de brief van dagdeel 1.3: elf van de
   drieëntwintig deelnemers vulden hun vermogen in, samen 2,33 miljoen euro.
   Het is geen representatief zaalprofiel; dat staat er ook bij. De verdeling
   komt uit dezelfde brief en telt op tot 99,5 procent, want de bron rondt af. */

export const ZAAL = {
  bron: 'brief 1.3, vroege onboarding, 10 november 2026',
  steekproef: { ingevuld: 11, totaal: 23 },
  som: 2336538,
  verdeling: [
    { naam: 'Cash', deel: 51 },
    { naam: 'Goud en grondstoffen', deel: 12 },
    { naam: 'Losse aandelen', deel: 11 },
    { naam: 'Pensioensparen', deel: 8 },
    { naam: 'Tweede pijler', deel: 8 },
    { naam: 'Crypto', deel: 3 },
    { naam: 'VAPZ', deel: 3 },
    { naam: 'Tak 21 en 23', deel: 2.5 },
    { naam: "ETF's", deel: 1 },
    { naam: 'Private equity', deel: 0 },
  ],
}

/* Het gemiddelde van wie zijn vermogen invulde, niet van de hele zaal. */
export function gemiddeldeVanZaal(zaal = ZAAL) {
  const n = zaal?.steekproef?.ingevuld
  if (!n || !zaal?.som) return null
  return Math.round(zaal.som / n)
}

export function somVanVerdeling(verdeling) {
  return (Array.isArray(verdeling) ? verdeling : []).reduce((t, d) => t + (Number(d.deel) || 0), 0)
}

export function euro(bedrag) {
  if (!Number.isFinite(bedrag)) return ''
  return `€ ${Math.round(bedrag).toLocaleString('nl-BE')}`
}

/* De stukken van de taart: van hoek tot hoek, in graden, beginnend bovenaan.
   Nul krijgt geen stuk, anders zie je een streepje dat er niet hoort. */
export function taartStukken(verdeling) {
  const som = somVanVerdeling(verdeling)
  if (!som) return []
  let hoek = 0
  return verdeling.map((d) => {
    const deel = Number(d.deel) || 0
    const van = hoek
    hoek += (deel / som) * 360
    return { ...d, van, tot: hoek, percentage: Math.round((deel / som) * 1000) / 10 }
  })
}

/* Een donut als SVG-pad, met de buiten- en binnenstraal. */
export function donutPad(stuk, { r = 46, dik = 16, cx = 60, cy = 60 } = {}) {
  // Een post van nul procent is geen streepje in de taart maar niets.
  if (!stuk || stuk.tot - stuk.van < 0.01) return ''
  const binnen = r - dik
  const groot = stuk.tot - stuk.van > 180 ? 1 : 0
  const rad = (graden) => ((graden - 90) * Math.PI) / 180
  const p = (straal, graden) => [cx + straal * Math.cos(rad(graden)), cy + straal * Math.sin(rad(graden))]
  const [x1, y1] = p(r, stuk.van)
  const [x2, y2] = p(r, stuk.tot)
  const [x3, y3] = p(binnen, stuk.tot)
  const [x4, y4] = p(binnen, stuk.van)
  const vast = (n) => Math.round(n * 100) / 100
  return `M ${vast(x1)} ${vast(y1)} A ${r} ${r} 0 ${groot} 1 ${vast(x2)} ${vast(y2)} L ${vast(x3)} ${vast(y3)} A ${binnen} ${binnen} 0 ${groot} 0 ${vast(x4)} ${vast(y4)} Z`
}

/* Een vaste kleurenreeks, zodat dezelfde post in elke weergave dezelfde kleur heeft. */
export const KLEUREN = ['#c8a24a', '#7f8ea3', '#5c7f5a', '#a3705f', '#8a6fae', '#4f8f9d', '#c0b06a', '#9a9aa6', '#6f7a86', '#3f4753']

export function kleurVoor(index) {
  return KLEUREN[index % KLEUREN.length]
}