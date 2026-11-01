/* eslint-disable @next/next/no-img-element -- ImageResponse rasterizes native image elements. */
import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

const logo = readFile(join(process.cwd(), 'public/logo/validore-icon.svg'))

export default async function AppleIcon() {
  const logoSource = 'data:image/svg+xml;base64,' + (await logo).toString('base64')
  return new ImageResponse(
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', background: '#0B0E13' }}>
      <img src={logoSource} width={148} height={148} alt="" />
    </div>,
    size,
  )
}
