'use client'

export default function AdminError({ reset }: { reset: () => void }) {
  return <main className="admin-route-status"><h1>Command center unavailable</h1><p>The command center could not be loaded. Try again to reconnect.</p><button type="button" className="admin-button admin-button-gold" onClick={reset}>Try again</button></main>
}
