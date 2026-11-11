/* Een klik op de huidige bestemming veroorzaakt geen hashchange. Markeer die
   daarom nooit als goedgekeurde navigatie: anders kan een latere terugknop de
   waarschuwing voor niet-bewaarde tekst overslaan. */
export function beoordeelNavigatie(doel, huidigeHash, vies) {
  if (!doel || doel === (huidigeHash || '#/')) return 'geen'
  return vies ? 'vraag' : 'ga'
}
