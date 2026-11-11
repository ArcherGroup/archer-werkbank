import React from 'react'
import { Icoon } from './Icoon'

/* LegeStaat: titel — uitleg — acties, met een icoon. Nooit een dood grijs
   tekstje: altijd zeggen wat hier komt en wat je nu kunt doen. */

export function LegeStaat({ icoon, titel, uitleg, acties, compact = false }) {
  return (
    <div className={`leeg-melding ${compact ? 'compact' : ''}`}>
      {icoon && (
        <span className="leeg-icoon">
          <Icoon naam={icoon} maat={20} />
        </span>
      )}
      <div className="leeg-titel">{titel}</div>
      {uitleg && <div className="leeg-uitleg">{uitleg}</div>}
      {acties && <div className="leeg-acties">{acties}</div>}
    </div>
  )
}
