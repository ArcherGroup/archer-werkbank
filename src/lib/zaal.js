import { ZAAL_SNAPSHOT } from '../data/zaal-februari-2027.js'

// Een gedateerde, geanonimiseerde snapshot. De browser leest geen Invest-gebruikersrijen.
export const ZAAL = ZAAL_SNAPSHOT

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