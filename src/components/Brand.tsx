import Image from 'next/image'
import Link from 'next/link'

export function Brand({ light = false, compact = false }: { light?: boolean; compact?: boolean }) {
  return (
    <Link href="/" prefetch={false} aria-label="Validore home" className={'brand' + (compact ? ' brand-compact' : '')}>
      <Image
        src={light ? '/logo/validore-logo-dark.svg' : '/logo/validore-logo-light.svg'}
        alt=""
        width={502}
        height={108}
        loading="eager"
        className="brand-artwork"
      />
    </Link>
  )
}
