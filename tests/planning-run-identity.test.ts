import { describe, expect, it } from 'vitest'
import { PlanningRunIdentity } from '@/lib/planning/run-identity'

const storage = () => {
  const values = new Map<string, string>()
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
}
describe('planning button retry identity', () => {
  it('keeps an uncertain run key across retries and tab reloads without persisting founder text', async () => {
    const tab = storage(); const identity = new PlanningRunIdentity('owner:pricing', tab)
    const payload = { ideaId: 'idea', price: 1250, privateFounderAnswer: 'Do not store this answer in browser storage' }
    const key = await identity.keyFor(payload)
    expect(await identity.keyFor(payload)).toBe(key)
    expect(await new PlanningRunIdentity('owner:pricing', tab).keyFor(payload)).toBe(key)
    expect([...tab.values.values()].join('')).not.toContain(payload.privateFounderAnswer)
  })
  it('rotates on a submitted input change and confirmed success', async () => {
    const identity = new PlanningRunIdentity('owner:pricing', storage())
    const first = await identity.keyFor({ price: 1000 })
    const changed = await identity.keyFor({ price: 1500 }); expect(changed).not.toBe(first)
    identity.confirmed(changed)
    expect(await identity.keyFor({ price: 1500 })).not.toBe(changed)
  })
  it('binds storage to owner and module and ignores late confirmations of old keys', async () => {
    const tab = storage(); const identity = new PlanningRunIdentity('owner-a:pricing', tab)
    const first = await identity.keyFor({ price: 1000 }); const next = await identity.keyFor({ price: 2000 })
    identity.confirmed(first)
    expect(await identity.keyFor({ price: 2000 })).toBe(next)
    expect(await new PlanningRunIdentity('owner-b:pricing', tab).keyFor({ price: 2000 })).not.toBe(next)
    expect(await new PlanningRunIdentity('owner-a:pitch', tab).keyFor({ price: 2000 })).not.toBe(next)
  })
  it('reuses logically identical payloads with a different object key order', async () => {
    const identity = new PlanningRunIdentity('owner:canvas', storage())
    const first = await identity.keyFor({ ideaId: 'idea', answers: { b: 'two', a: 'one' } })
    expect(await identity.keyFor({ answers: { a: 'one', b: 'two' }, ideaId: 'idea' })).toBe(first)
  })
  it('changes request identity for a different explicitly selected validation report or no linked report',async()=>{
    const identity=new PlanningRunIdentity('owner:pricing',storage())
    const first=await identity.keyFor({ideaId:'idea',sourceReportId:'report-a'})
    const second=await identity.keyFor({ideaId:'idea',sourceReportId:'report-b'})
    const none=await identity.keyFor({ideaId:'idea'})
    expect(first).not.toBe(second);expect(none).not.toBe(second)
  })
})
