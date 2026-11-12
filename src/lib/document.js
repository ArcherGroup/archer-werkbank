/* Een download vanuit de editor moet ook onbevestigde tekst meenemen. */
export function inhoudVoorDownload(modus, klad, opgeslagen) {
  return modus === 'bewerk' ? (klad ?? '') : (opgeslagen ?? '')
}

export function valideerNotitieAnker(inhoud, selectie) {
  if (typeof inhoud !== 'string' || typeof selectie !== 'string' || !selectie.trim() || selectie.length > 2000) {
    throw new Error('Selecteer een kort fragment uit het document.')
  }
  const eerste = inhoud.indexOf(selectie)
  if (eerste < 0 || inhoud.indexOf(selectie, eerste + 1) >= 0) {
    throw new Error('Selecteer één uniek, doorlopend fragment zonder verborgen opmaak.')
  }
  return selectie
}

export function voegInterneLinkIn(tekst, begin, einde, label, route) {
  if (typeof tekst !== 'string' || !Number.isInteger(begin) || !Number.isInteger(einde) || begin < 0 || einde < begin || einde > tekst.length || !/^#\/(doc|bron)\/[1-9]\d*$/.test(route)) {
    throw new Error('De interne link of selectie is ongeldig.')
  }
  const selectie = tekst.slice(begin, einde) || String(label ?? '')
  if (!selectie.trim() || /[\r\n]/.test(selectie)) throw new Error('Selecteer tekst op één regel voor de link.')
  const veiligLabel = selectie.replace(/\\/g, '\\\\').replace(/([\[\]])/g, '\\$1')
  const invoeging = `[${veiligLabel}](${route})`
  return { tekst: tekst.slice(0, begin) + invoeging + tekst.slice(einde), positie: begin + invoeging.length }
}
