import { createClient } from '@supabase/supabase-js'
import projecten from '../../config/projecten.json' with { type: 'json' }

// Werkbankinhoud leeft alleen in het eigen intranetschema.
// Invest V0 is een afzonderlijke read-only bron en wordt niet vanuit de browser bevraagd.
export const SB_URL = projecten.werkbank.url
export const SB_KEY = import.meta.env?.VITE_WERKBANK_SLEUTEL
  || (typeof process !== 'undefined' ? process.env.VITE_WERKBANK_SLEUTEL : '')

if (!SB_KEY) throw new Error('De publieke werkbanksleutel ontbreekt. Vul VITE_WERKBANK_SLEUTEL in .env.local in.')

export const sb = createClient(SB_URL, SB_KEY, {
  db: { schema: projecten.werkbank.schema },
  realtime: { params: { eventsPerSecond: 6 } },
})

export const FUNCTIES = `${SB_URL}/functions/v1`
