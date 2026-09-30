import os

files_to_write = {
    'src/app/api/ideas/route.ts': '''import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { ideas, users } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'

const CreateIdeaSchema = z.object({
  name: z.string().min(2).max(100),
  industry: z.string().min(2),
  product: z.string().min(10),
  targetCustomer: z.string().min(5),
  location: z.string().min(2),
  businessModel: z.string().min(5),
  coreProblem: z.string().min(10),
  proposedSolution: z.string().min(10),
})

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const userIdeas = await db.query.ideas.findMany({
    where: and(eq(ideas.userId, dbUser.id), eq(ideas.isActive, true)),
    orderBy: (ideas, { desc }: any) => [desc(ideas.createdAt)],
  })
  return NextResponse.json({ ideas: userIdeas })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const tierCfg = await db.query.tierConfig.findFirst({ where: (tc: any, { eq }: any) => eq(tc.tier, dbUser.tier) })
  const activeIdeas = await db.query.ideas.findMany({
    where: and(eq(ideas.userId, dbUser.id), eq(ideas.isActive, true), eq(ideas.isReadOnly, false)),
  })
  if (tierCfg && activeIdeas.length >= tierCfg.maxActiveIdeas) {
    return NextResponse.json({ error: `Your plan allows max ${tierCfg.maxActiveIdeas} active idea(s). Upgrade to add more.` }, { status: 403 })
  }

  const body = await request.json()
  const parsed = CreateIdeaSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const [idea] = await db.insert(ideas).values({ userId: dbUser.id, ...parsed.data }).returning()
  return NextResponse.json({ idea }, { status: 201 })
}''',

    'src/app/api/validate/route.ts': '''import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, ideas, validationJobs, validationReports } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { checkValidationLimit } from '@/lib/tier-gate'
import { runLiteValidation, runFullValidation } from '@/lib/validation/engine'
import { randomUUID } from 'crypto'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user: supaUser } } = await supabase.auth.getUser()
  if (!supaUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await db.query.users.findFirst({ where: eq(users.supabaseId, supaUser.id) })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const limitCheck = await checkValidationLimit(supaUser.id)
  if (!limitCheck.allowed) {
    return NextResponse.json({ error: 'Monthly validation limit reached.', remaining: 0 }, { status: 429 })
  }

  const { ideaId } = await request.json()
  if (!ideaId) return NextResponse.json({ error: 'ideaId required' }, { status: 400 })

  const idea = await db.query.ideas.findFirst({ where: eq(ideas.id, ideaId) })
  if (!idea || idea.userId !== dbUser.id) return NextResponse.json({ error: 'Idea not found' }, { status: 404 })

  const isLite = dbUser.tier === 'free'
  const ideaInput = {
    name: idea.name, industry: idea.industry, product: idea.product, targetCustomer: idea.targetCustomer,
    location: idea.location, businessModel: idea.businessModel, coreProblem: idea.coreProblem, proposedSolution: idea.proposedSolution,
  }

  const [job] = await db.insert(validationJobs).values({
    ideaId: idea.id, userId: dbUser.id, isLite, status: 'pending', totalSections: isLite ? 1 : 8, completedSections: 0,
  }).returning()

  await db.update(users).set({ validationsThisMonth: dbUser.validationsThisMonth + 1 }).where(eq(users.id, dbUser.id))

  let reportData: Record<string, unknown>
  let overallScore: number
  let decision: 'GO' | 'MODIFY' | 'TEST_FURTHER' | 'NO_GO'
  let provider: string

  if (isLite) {
    const report = await runLiteValidation(ideaInput)
    overallScore = report.overallScore
    decision = report.decision as any
    provider = report.provider
    reportData = report as unknown as Record<string, unknown>
  } else {
    const report = await runFullValidation(ideaInput, job.id)
    if (!report) return NextResponse.json({ error: 'Validation failed', jobId: job.id }, { status: 500 })
    overallScore = report.overallScore
    decision = report.decision as any
    provider = report.provider
    reportData = report as unknown as Record<string, unknown>
  }

  const shareToken = randomUUID()
  const [validationReport] = await db.insert(validationReports).values({
    jobId: job.id, ideaId: idea.id, userId: dbUser.id, shareToken, overallScore,
    problemScore: (reportData.problemScore as number) ?? null,
    customerScore: (reportData.customerScore as number) ?? null,
    marketScore: (reportData.marketScore as number) ?? null,
    competitiveScore: (reportData.competitiveScore as number) ?? null,
    wtpScore: (reportData.wtpScore as number) ?? null,
    businessModelScore: (reportData.businessModelScore as number) ?? null,
    financialScore: (reportData.financialScore as number) ?? null,
    executionScore: (reportData.executionScore as number) ?? null,
    decision, decisionReasons: (reportData.decisionReasons as string[]) ?? [], keyEvidence: (reportData.keyEvidence as string[]) ?? [],
    keyRisks: (reportData.keyRisks as string[]) ?? [], actionPlan: (reportData.actionPlan as any[]) ?? [], reportData, isLite,
  }).returning()

  await db.update(validationJobs).set({ status: 'complete', aiProvider: provider }).where(eq(validationJobs.id, job.id))

  return NextResponse.json({ reportId: validationReport.id, shareToken: validationReport.shareToken, overallScore, decision, remaining: limitCheck.remaining - 1 })
}''',

    'src/app/api/reports/[reportId]/route.ts': '''import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, validationReports } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(_: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const report = await db.query.validationReports.findFirst({ where: eq(validationReports.id, reportId) })
  if (!report || report.userId !== dbUser.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ report })
}''',

    'src/app/dashboard/page.tsx': '''"use client";
import React, { useState } from "react";
export default function IdeaWizard() { return <div>Idea Wizard</div>; }''',
    
    'src/app/dashboard/report/[reportId]/page.tsx': '''export default async function ReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  return <div>Report {reportId}</div>;
}''',

    'src/app/share/[shareToken]/page.tsx': '''export default async function SharePage({ params }: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await params;
  return <div>Share {shareToken}</div>;
}''',

    'src/app/dashboard/lean-canvas/page.tsx': '''"use client";
export default function LeanCanvas() { return <div>Lean Canvas</div>; }''',

    'src/app/api/lean-canvas/route.ts': '''import { NextResponse } from "next/server";
export async function POST() { return NextResponse.json({}); }
export async function GET() { return NextResponse.json([]); }''',

    'src/app/dashboard/pricing/page.tsx': '''"use client";
export default function Pricing() { return <div>Pricing Simulator</div>; }''',

    'src/app/api/pricing/route.ts': '''import { NextResponse } from "next/server";
export async function POST() { return NextResponse.json({}); }''',

    'src/app/dashboard/crowdfunding/page.tsx': '''"use client";
export default function Crowdfunding() { return <div>Crowdfunding</div>; }''',

    'src/app/api/crowdfunding/route.ts': '''import { NextResponse } from "next/server";
export async function POST() { return NextResponse.json({}); }''',

    'src/app/dashboard/pitch-deck/page.tsx': '''"use client";
export default function PitchDeck() { return <div>Pitch Deck</div>; }''',

    'src/app/api/pitch-deck/route.ts': '''import { NextResponse } from "next/server";
export async function POST() { return NextResponse.json({}); }''',

    'src/app/api/export/pdf/route.ts': '''import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, validationReports } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { canUserAccess } from '@/lib/tier-gate'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const allowed = await canUserAccess(user.id, 'canExportPdf')
  if (!allowed) return new NextResponse('Upgrade to Premium to export PDF', { status: 403 })

  const reportId = request.nextUrl.searchParams.get('reportId')
  if (!reportId) return new NextResponse('reportId required', { status: 400 })

  const dbUser = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  if (!dbUser) return new NextResponse('User not found', { status: 404 })

  const report = await db.query.validationReports.findFirst({ where: eq(validationReports.id, reportId) })
  if (!report || report.userId !== dbUser.id) return new NextResponse('Not found', { status: 404 })

  const { Document, Page, Text, View, StyleSheet } = await import('@react-pdf/renderer')
  const styles = StyleSheet.create({
    page: { padding: 40, backgroundColor: '#FAFAF7', fontFamily: 'Helvetica' },
    header: { marginBottom: 20 },
    title: { fontSize: 24, color: '#0A1628', marginBottom: 4 },
    subtitle: { fontSize: 12, color: '#C8A860', marginBottom: 16 },
    section: { marginBottom: 16 },
    sectionTitle: { fontSize: 14, color: '#0A1628', fontWeight: 'bold', marginBottom: 8, borderBottom: '1px solid #E8E0D0', paddingBottom: 4 },
    text: { fontSize: 10, color: '#1C1C1C', lineHeight: 1.5 },
    score: { fontSize: 36, color: '#C8A860', fontWeight: 'bold' },
    footer: { position: 'absolute', bottom: 20, left: 40, right: 40, borderTop: '1px solid #E8E0D0', paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
    footerText: { fontSize: 8, color: '#C8A860' },
    watermark: { fontSize: 8, color: '#1C1C1C', opacity: 0.4 },
  })

  const reportData = report.reportData as Record<string, unknown>
  const idea = reportData?.idea as Record<string, string> | undefined

  const PdfDoc = () => createElement(Document, null,
    createElement(Page, { size: 'A4', style: styles.page },
      createElement(View, { style: styles.header },
        createElement(Text, { style: styles.title }, `${idea?.name ?? 'Startup'} — Validation Report`),
        createElement(Text, { style: styles.subtitle }, "Aurexa AI Validation | Know it's gold before you dig.")
      ),
      createElement(View, { style: styles.section },
        createElement(Text, { style: styles.sectionTitle }, 'Validation Score'),
        createElement(Text, { style: styles.score }, `${report.overallScore ?? 0}/100`),
        createElement(Text, { style: styles.text }, `Decision: ${report.decision ?? 'N/A'}`),
      ),
      createElement(View, { style: styles.section },
        createElement(Text, { style: styles.sectionTitle }, 'Decision Rationale'),
        ...((report.decisionReasons as string[] ?? [])).map((r, i) =>
          createElement(Text, { key: i, style: styles.text }, `• ${r}`)
        ),
      ),
      createElement(View, { style: styles.section },
        createElement(Text, { style: styles.sectionTitle }, 'Key Risks'),
        ...((report.keyRisks as string[] ?? [])).map((r, i) =>
          createElement(Text, { key: i, style: styles.text }, `• ${r}`)
        ),
      ),
      createElement(View, { style: styles.section },
        createElement(Text, { style: styles.sectionTitle }, 'Integrity Note'),
        createElement(Text, { style: styles.text }, (reportData?.integrityNote as string) ?? ''),
      ),
      createElement(View, { style: styles.footer },
        createElement(Text, { style: styles.footerText }, 'aurexa.app'),
        createElement(Text, { style: styles.watermark }, 'Generated by Aurexa AI | ASSUMPTIONS and PROJECTIONS are labeled throughout'),
      ),
    )
  )

  const buffer = await renderToBuffer(createElement(PdfDoc))
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="aurexa-validation-${reportId.slice(0,8)}.pdf"`,
    },
  })
}''',

    'src/app/api/export/csv/route.ts': '''import { NextResponse } from "next/server";
export async function GET() { return new NextResponse("csv", { headers: { "Content-Type": "text/csv" } }); }''',

    'src/app/api/export/pptx/route.ts': '''import { NextRequest, NextResponse } from "next/server";
import PptxGenJS from 'pptxgenjs';
export async function GET(req: NextRequest) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Aurexa';
  const s = pptx.addSlide();
  s.addText('aurexa');
  const buffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': 'attachment; filename="aurexa-pitch-deck.pptx"',
    },
  });
}''',

    'src/app/api/export/pdf/white-label/route.ts': '''import { NextResponse } from "next/server";
export async function GET() { return new NextResponse("pdf", { headers: { "Content-Type": "application/pdf" } }); }''',

    'src/app/api/export/portfolio/route.ts': '''import { NextResponse } from "next/server";
import JSZip from "jszip";
export async function GET() {
  const zip = new JSZip();
  zip.file("index.html", "<html><body>Portfolio</body></html>");
  const content = await zip.generateAsync({ type: "nodebuffer" });
  return new NextResponse(content, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="portfolio.zip"'
    }
  });
}''',

    'src/app/dashboard/credits/page.tsx': '''"use client";
export default function Credits() { return <div>Credits</div>; }''',

    'src/app/api/credits/purchase/route.ts': '''import { NextResponse } from "next/server";
export async function POST() { return NextResponse.json({ url: "" }); }''',

    'src/app/dashboard/settings/page.tsx': '''"use client";
export default function Settings() { return <div>Settings</div>; }''',

    'scripts/seed-crowdfunding-data.ts': '''console.log("Seeding...");'''
}

for filepath, content in files_to_write.items():
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

print("Files written successfully.")
