import React from 'react'

/* Basisbouwstenen: pillen, statusstippen en het kruimelpad. */

export function Pill({ children, soort }) {
  return <span className={`pill ${soort ?? 'stil'}`}>{children}</span>
}

export function StatusStip({ status }) {
  const s = status || 'Leeg'
  return <span className={`stip-status ${s}`} role="img" aria-label={`Status: ${s}`} title={`Status: ${s}`} />
}

export function Kruimel({ delen, naar }) {
  return (
    <div className="kruimel">
      {delen.map((d, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="scheiding">›</span>}
          {d.naar ? (
            <button onClick={() => naar(d.naar)}>{d.tekst}</button>
          ) : (
            <span>{d.tekst}</span>
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

/* het ⌘K-palet: zoeken over alles en springen */
