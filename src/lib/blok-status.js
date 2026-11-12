/* Definitief betekent een inhoudelijke keuze, geen automatische controle. */
export function vraagtStatusReview(huidig, gewenst) {
  return gewenst === 'Final' && huidig !== 'Final'
}
