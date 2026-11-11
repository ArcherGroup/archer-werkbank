import { useEffect, useState } from 'react'

// Toon een skelet pas als het laden echt traag is (±160 ms), anders flikkert
// het scherm bij elke snelle wissel. Geef een `bezig`-boolean mee.
export function useTraagLaden(bezig, drempel = 160) {
  const [traag, setTraag] = useState(false)

  useEffect(() => {
    if (!bezig) {
      setTraag(false)
      return
    }
    const t = setTimeout(() => setTraag(true), drempel)
    return () => clearTimeout(t)
  }, [bezig, drempel])

  return traag
}
