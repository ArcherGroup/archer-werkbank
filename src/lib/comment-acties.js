/* Eén expliciete statusovergang. Het gesprek zelf wordt nooit verwijderd. */
export async function zetCommentStatus(client, notitie, stand, wie, reden = '', nu = new Date()) {
  if (!notitie || notitie.lokaal || !/^[1-9]\d*$/.test(String(notitie.id ?? ''))) {
    throw new Error('Synchroniseer deze comment eerst met de werkbank.')
  }
  if (!['opgelost', 'afgewezen', 'open'].includes(stand)) throw new Error('Onbekende commentstatus.')
  if (stand === 'afgewezen' && !String(reden).trim()) throw new Error('Vul een reden in om dit gesprek af te wijzen.')
  const patch = {
    opgelost: stand === 'opgelost',
    opgelost_op: stand === 'opgelost' ? nu.toISOString() : null,
    opgelost_door: stand === 'opgelost' ? wie : null,
    afgewezen: stand === 'afgewezen',
    afgewezen_op: stand === 'afgewezen' ? nu.toISOString() : null,
    afgewezen_door: stand === 'afgewezen' ? wie : null,
    afwijs_reden: stand === 'afgewezen' ? String(reden).trim() : null,
  }
  const { error } = await client.from('notities').update(patch)
    .eq('id', notitie.id).eq('doel_type', notitie.doel_type).eq('doel_id', String(notitie.doel_id))
  if (error) throw error
  const { data, error: leesFout } = await client.from('notities').select('*').eq('id', notitie.id).single()
  if (leesFout) throw leesFout
  const wijktAf = (k) => {
    if (k.endsWith('_op') && patch[k] != null) {
      const tijd = Date.parse(data?.[k])
      return !Number.isFinite(tijd) || tijd !== Date.parse(patch[k])
    }
    return (data?.[k] ?? null) !== patch[k]
  }
  if (!data || String(data.id) !== String(notitie.id) || Object.keys(patch).some(wijktAf)) {
    throw new Error('De status kon niet bevestigd worden of is intussen elders gewijzigd. Ververs het gesprek.')
  }
  return data
}
