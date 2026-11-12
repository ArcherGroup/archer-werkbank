// Bewaak alle onbewaarde velden onafhankelijk. Elke registratie krijgt zijn
// eigen cleanup; een veld mag de waarschuwing van een ander veld niet wissen.
// wisVies() is uitsluitend voor een expliciet globaal weggooi-besluit.
const controleurs = new Map()

export function zetVies(fn) {
  const sleutel = Symbol('onbewaard')
  controleurs.set(sleutel, fn)
  return () => controleurs.delete(sleutel)
}

export function wisVies() {
  controleurs.clear()
}

export function isVies() {
  return [...controleurs.values()].some((fn) => typeof fn === 'function' && fn() === true)
}
