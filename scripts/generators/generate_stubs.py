import os

files = {
"src/app/auth/signin/page.tsx": "export default function P() { return <div/> }",
"src/app/auth/signup/page.tsx": "export default function P() { return <div/> }",
"src/app/auth/callback/route.ts": "import { NextResponse } from 'next/server'; export function GET() { return NextResponse.json({}) }",
"src/app/dashboard/layout.tsx": "export default function L({children}:{children:React.ReactNode}) { return <div>{children}</div> }",
"src/app/dashboard/page.tsx": "export default function P() { return <div/> }",
"src/app/dashboard/report/[reportId]/page.tsx": "export default function P() { return <div/> }",
"src/app/share/[shareToken]/page.tsx": "export default function P() { return <div/> }",
"src/app/dashboard/lean-canvas/page.tsx": "export default function P() { return <div/> }",
"src/app/dashboard/pricing/page.tsx": "export default function P() { return <div/> }",
"src/app/dashboard/crowdfunding/page.tsx": "export default function P() { return <div/> }",
"src/app/dashboard/pitch-deck/page.tsx": "export default function P() { return <div/> }",
"src/app/dashboard/credits/page.tsx": "export default function P() { return <div/> }",
"src/app/dashboard/settings/page.tsx": "export default function P() { return <div/> }",

"src/app/api/ideas/route.ts": "import { NextResponse } from 'next/server'; export function POST() { return NextResponse.json({}) }; export function GET() { return NextResponse.json([]) }",
"src/app/api/validate/route.ts": "import { NextResponse } from 'next/server'; export function POST() { return NextResponse.json({}) }",
"src/app/api/reports/[reportId]/route.ts": "import { NextResponse } from 'next/server'; export function GET() { return NextResponse.json({}) }",
"src/app/api/export/pdf/route.ts": "import { NextResponse } from 'next/server'; export function GET() { return NextResponse.json({}) }",
"src/app/api/export/csv/route.ts": "import { NextResponse } from 'next/server'; export function GET() { return NextResponse.json({}) }",
"src/app/api/lean-canvas/route.ts": "import { NextResponse } from 'next/server'; export function POST() { return NextResponse.json({}) }; export function GET() { return NextResponse.json([]) }",
"src/app/api/pricing/route.ts": "import { NextResponse } from 'next/server'; export function POST() { return NextResponse.json({}) }",
"src/app/api/crowdfunding/route.ts": "import { NextResponse } from 'next/server'; export function POST() { return NextResponse.json({}) }",
"src/app/api/pitch-deck/route.ts": "import { NextResponse } from 'next/server'; export function POST() { return NextResponse.json({}) }",
"src/app/api/export/pptx/route.ts": "import { NextResponse } from 'next/server'; export function GET() { return NextResponse.json({}) }",
"src/app/api/export/pdf/white-label/route.ts": "import { NextResponse } from 'next/server'; export function GET() { return NextResponse.json({}) }",
"src/app/api/export/portfolio/route.ts": "import { NextResponse } from 'next/server'; export function GET() { return NextResponse.json({}) }",
"src/app/api/credits/purchase/route.ts": "import { NextResponse } from 'next/server'; export function POST() { return NextResponse.json({}) }",
"src/app/api/webhooks/stripe/route.ts": "import { NextResponse } from 'next/server'; export function POST() { return NextResponse.json({}) }",
"src/app/api/webhooks/razorpay/route.ts": "import { NextResponse } from 'next/server'; export function POST() { return NextResponse.json({}) }",

"src/lib/ai/providers.ts": "export const providers = {}",
"src/lib/ai/search.ts": "export function webSearch() {}",
"src/lib/ai/generate.ts": "export function generateWithFallback() {}",
"src/lib/validation/engine.ts": "export function runLiteValidation() {}; export function runFullValidation() {}",

"scripts/seed-crowdfunding-data.ts": "console.log('seeded')",
"Dockerfile": """FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/static ./.next/static
COPY --from=base /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
"""
}

for filepath, content in files.items():
    d = os.path.dirname(filepath)
    if d:
        os.makedirs(d, exist_ok=True)
    with open(filepath, 'w') as f:
        f.write(content)

print("Stubs created.")
