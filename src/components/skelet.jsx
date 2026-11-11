import React from 'react'

/* Skelet: grijze vorm die de eindlayout spiegelt (met shimmer).
   Verschijnt pas na ±160 ms via useTraagLaden. */

export function Skelet({ breedte = '100%', hoogte = 13, straal = 6, className = '', style }) {
  return (
    <span
      className={`skelet ${className}`}
      style={{ width: breedte, height: hoogte, borderRadius: straal, display: 'block', ...style }}
      aria-hidden="true"
    />
  )
}

export function SkeletAlinea({ lijnen = 3 }) {
  const breedtes = ['100%', '96%', '78%', '88%', '92%']
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Array.from({ length: lijnen }, (_, i) => (
        <Skelet key={i} breedte={breedtes[i % breedtes.length]} />
      ))}
    </div>
  )
}
