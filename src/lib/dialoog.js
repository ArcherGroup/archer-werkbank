export function vraagtAfsluiten(huidig, begin) {
  return String(huidig ?? '') !== String(begin ?? '')
}
