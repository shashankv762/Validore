/* eslint-disable @next/next/no-img-element -- ImageResponse rasterizes native image elements. */
import { ImageResponse } from 'next/og'
import { readPublicAsset } from '@/lib/public-assets'

export const alt = "Validore — Know it's gold before you dig."
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OpenGraphImage() {
  const logoSource = 'data:image/svg+xml;base64,' + (await readPublicAsset('/logo/validore-logo-dark.svg')).toString('base64')
  return new ImageResponse(<div style={{ width: '100%', height: '100%', background: '#0B0E13', color: '#F4EFE6', padding: '64px 72px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
    <img src={logoSource} width={232} height={50} alt="Validore" />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 23 }}><div style={{ fontSize: 79, letterSpacing: -4, lineHeight: 1.1, display: 'flex', flexDirection: 'column' }}><span>Know it&apos;s gold</span><span>before you dig.</span></div><span style={{ color: '#BAC3CE', fontSize: 24 }}>A clearer starting point for your startup.</span></div>
    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #354150', paddingTop: 20, color: '#E0A526', fontSize: 20 }}><span>Explore. Question. Validate.</span><span>validore.tech</span></div>
  </div>, size)
}
