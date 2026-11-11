// Bewaking tegen werkverlies. De editor meldt zich hier aan zolang er
// onbewaarde wijzigingen staan; elke navigatie en elk sluiten van het
// tabblad vraagt dan eerst om bevestiging.
//
// Bewust een module-variabele en geen React-state: de check gebeurt in
// `naar()` (buiten de render) en in beforeunload, waar geen state bij kan.

let controleur = null

export function zetVies(fn) {
  controleur = fn
}

export function wisVies() {
  controleur = null
}

export function isVies() {
  return typeof controleur === 'function' && controleur() === true
}
