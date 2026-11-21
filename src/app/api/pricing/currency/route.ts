import { currencyForCountry, trustedCountry } from '@/lib/pricing-currency'

export function GET(request: Request) {
  const country = trustedCountry(request.headers)
  return Response.json({ currency: country ? currencyForCountry(country) : null }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
