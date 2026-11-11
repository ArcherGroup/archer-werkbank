import { createClient } from '@supabase/supabase-js'

export const SB_URL = 'https://thbjzrdogebyhbkkbxzp.supabase.co'
export const SB_KEY = 'sb_publishable_gJpTKrSOJ0gjPfFIEW9mDA_w5l8eLT2'

export const sb = createClient(SB_URL, SB_KEY, {
  db: { schema: 'werkbank' },
  realtime: { params: { eventsPerSecond: 6 } },
})

export const FUNCTIES = `${SB_URL}/functions/v1`
