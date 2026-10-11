import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, ideas, validationReports, pitchDecks } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { canUserAccess } from '@/lib/tier-gate'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let dbUser = await db.query.users.findFirst({
      where: eq(users.supabaseId, user.id),
    })

    if (!dbUser && user.email) {
      try {
        const [inserted] = await db
          .insert(users)
          .values({
            email: user.email,
            supabaseId: user.id,
            tier: 'free',
          })
          .onConflictDoNothing()
          .returning()
        dbUser = inserted || (await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) }))
      } catch {
        // fallback
      }
    }

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Tier check: Portfolio export requires Max tier
    const canExport = await canUserAccess(user.id, 'canPortfolioExport')
    if (!canExport) {
      return NextResponse.json(
        { error: 'Portfolio export requires Max tier' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const specificIdeaId = searchParams.get('ideaId')
    const specificReportId = searchParams.get('reportId')

    let userIdeas: Array<typeof ideas.$inferSelect> = []

    if (specificReportId) {
      const rep = await db.query.validationReports.findFirst({
        where: and(eq(validationReports.id, specificReportId), eq(validationReports.userId, dbUser.id)),
      })
      if (rep) {
        const matchIdea = await db.query.ideas.findFirst({ where: eq(ideas.id, rep.ideaId) })
        if (matchIdea) userIdeas = [matchIdea]
      }
    } else if (specificIdeaId) {
      const matchIdea = await db.query.ideas.findFirst({
        where: and(eq(ideas.id, specificIdeaId), eq(ideas.userId, dbUser.id)),
      })
      if (matchIdea) userIdeas = [matchIdea]
    }

    if (userIdeas.length === 0) {
      userIdeas = await db.query.ideas.findMany({
        where: eq(ideas.userId, dbUser.id),
      })
    }

    const userReports = await db.query.validationReports.findMany({
      where: eq(validationReports.userId, dbUser.id),
    })

    const userDecks = await db.query.pitchDecks.findMany({
      where: eq(pitchDecks.userId, dbUser.id),
    })

    // Select primary idea or fallback
    const primaryIdea = userIdeas[0] || {
      id: 'demo-idea',
      name: 'Autonomous Startup Venture',
      industry: 'Software / SaaS',
      product: 'AI-Powered Business Intelligence Platform',
      targetCustomer: 'High-growth tech founders and venture studios',
      location: 'Global',
      businessModel: 'B2B Subscription SaaS',
      coreProblem: 'Founders spend months building products without customer and market validation.',
      proposedSolution: 'Continuous automated validation simulating real market demand and financial feasibility in seconds.',
    }

    // Find report and deck for primary idea
    const primaryReport = userReports.find((r) => r.ideaId === primaryIdea.id) || userReports[0]
    const primaryDeck = userDecks.find((d) => d.ideaId === primaryIdea.id) || userDecks[0]

    const overallScore = primaryReport?.overallScore ?? primaryDeck?.qualityScore ?? 84
    const decision = primaryReport?.decision ?? 'GO'
    const reportData = (primaryReport?.reportData || {}) as Record<string, unknown>
    const tamSamSom = reportData.tamSamSom as Record<string, unknown> | undefined
    const tamObj = tamSamSom?.tam as Record<string, unknown> | undefined
    const samObj = tamSamSom?.sam as Record<string, unknown> | undefined
    const somObj = tamSamSom?.som as Record<string, unknown> | undefined
    const tam = (tamObj?.value || reportData.tamEstimate || '$14B') as string
    const sam = (samObj?.value || reportData.samEstimate || '$3.2B') as string
    const som = (somObj?.value || reportData.somEstimate || '$480M') as string

    // Roadmap items
    const rawRoadmap = (primaryDeck?.roadmap as Array<Record<string, unknown>> | undefined) || [
      {
        phase: 'Phase 1: Foundation',
        timeframe: 'Month 1-3',
        milestones: [
          { milestone: 'Customer Problem Validation & Waitlist Launch', status: 'ACHIEVED' },
          { milestone: 'Interactive MVP Architecture & Prototype', status: 'ACHIEVED' },
        ],
      },
      {
        phase: 'Phase 2: Market Launch',
        timeframe: 'Month 4-6',
        milestones: [
          { milestone: 'Public Beta with First 100 Paying Teams', status: 'PLANNED' },
          { milestone: 'Self-serve Export Engine & Integrations', status: 'PLANNED' },
        ],
      },
      {
        phase: 'Phase 3: Scale',
        timeframe: 'Month 7-12',
        milestones: [
          { milestone: 'Enterprise Security & Multi-tenant Workspaces', status: 'PLANNED' },
          { milestone: '$1M ARR Milestone', status: 'PLANNED' },
        ],
      },
    ]

    const roadmapHtml = rawRoadmap
      .map((item) => {
        const phaseName = (item.phase || 'Milestone Phase') as string
        const timeframe = (item.timeframe || '') as string
        const milestones = (Array.isArray(item.milestones) ? item.milestones : []) as Array<Record<string, unknown>>
        const milestonesList = milestones
          .map((m) => {
            const mText = (m.milestone || 'Milestone') as string
            const isAchieved = m.status === 'ACHIEVED'
            return `<li class="milestone-item ${isAchieved ? 'achieved' : 'planned'}">
              <span class="status-indicator">${isAchieved ? '✓' : '○'}</span>
              <span class="milestone-title">${mText}</span>
              <span class="status-badge">${isAchieved ? 'Achieved' : 'Planned'}</span>
            </li>`
          })
          .join('')

        return `<div class="roadmap-card">
          <div class="roadmap-header">
            <h3>${phaseName}</h3>
            ${timeframe ? `<span class="timeframe">${timeframe}</span>` : ''}
          </div>
          <ul class="milestones-list">${milestonesList}</ul>
        </div>`
      })
      .join('')

    // Multiple ideas showcase cards (if more than one idea)
    const ideasGalleryHtml = userIdeas.length > 1
      ? `<section id="ventures" class="ventures-section">
          <div class="container">
            <h2 class="section-title">Validated Ventures Portfolio</h2>
            <div class="ideas-grid">
              ${userIdeas
                .map((idea) => {
                  const rep = userReports.find((r) => r.ideaId === idea.id)
                  const score = rep?.overallScore ?? 80
                  const dec = rep?.decision ?? 'GO'
                  return `<div class="venture-card">
                    <div class="venture-card-header">
                      <h3>${idea.name}</h3>
                      <span class="score-pill">${score}/100</span>
                    </div>
                    <p class="industry-tag">${idea.industry} • ${idea.businessModel}</p>
                    <p class="venture-desc">${idea.proposedSolution}</p>
                    <div class="venture-footer">
                      <span class="decision-tag ${dec.toLowerCase()}">${dec}</span>
                    </div>
                  </div>`
                })
                .join('')}
            </div>
          </div>
        </section>`
      : ''

    const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${primaryIdea.name} — Startup Portfolio Showcase</title>
  <link rel="stylesheet" href="styles.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body>
  <!-- Navigation Bar -->
  <nav class="navbar">
    <div class="container nav-container">
      <a href="#hero" class="brand-logo">
        <span class="brand-accent">${primaryIdea.name}</span>
      </a>
      <div class="nav-links">
        <a href="#hero">Overview</a>
        <a href="#problem">Problem</a>
        <a href="#solution">Solution</a>
        <a href="#market">Market Opportunity</a>
        <a href="#roadmap">Roadmap</a>
        <a href="#contact" class="btn btn-sm btn-primary">Connect</a>
      </div>
    </div>
  </nav>

  <!-- Hero Section -->
  <section id="hero" class="hero-section">
    <div class="container">
      <div class="hero-badge-wrap">
        <span class="badge score-badge">Validation Score: ${overallScore}/100</span>
        <span class="badge decision-badge decision-${decision.toLowerCase()}">${decision} Recommendation</span>
      </div>
      <h1 class="hero-title">${primaryIdea.name}</h1>
      <p class="hero-tagline">${primaryIdea.product}</p>
      <p class="hero-description">${primaryIdea.proposedSolution}</p>
      
      <div class="hero-metrics">
        <div class="metric-card">
          <span class="metric-value">${tam}</span>
          <span class="metric-label">Addressable Market (TAM)</span>
        </div>
        <div class="metric-card">
          <span class="metric-value">${overallScore}%</span>
          <span class="metric-label">Validation Confidence</span>
        </div>
        <div class="metric-card">
          <span class="metric-value">${primaryIdea.businessModel}</span>
          <span class="metric-label">Monetization Model</span>
        </div>
      </div>

      <div class="hero-actions">
        <a href="#roadmap" class="btn btn-primary">Explore Strategic Roadmap</a>
        <a href="#contact" class="btn btn-secondary">Inquire / Invest</a>
      </div>
    </div>
  </section>

  <!-- Problem Section -->
  <section id="problem" class="section problem-section">
    <div class="container">
      <div class="section-header">
        <span class="section-tag">Market Friction</span>
        <h2 class="section-title">The Core Problem</h2>
        <p class="section-subtitle">Why traditional solutions fail to address the core customer pain points.</p>
      </div>
      <div class="problem-card">
        <div class="problem-content">
          <h3>Unaddressed Market Opportunity</h3>
          <p>${primaryIdea.coreProblem}</p>
          <div class="problem-points">
            <div class="point-item">
              <span class="point-icon">⚠</span>
              <div>
                <strong>High Friction & Cost:</strong>
                <p>Target customer (${primaryIdea.targetCustomer}) suffers from inefficient workflows and prohibitive costs.</p>
              </div>
            </div>
            <div class="point-item">
              <span class="point-icon">⏱</span>
              <div>
                <strong>Slow Decision Velocity:</strong>
                <p>Lack of automation delays execution and hampers competitive market responsiveness.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Solution Section -->
  <section id="solution" class="section solution-section">
    <div class="container">
      <div class="section-header">
        <span class="section-tag">Product Architecture</span>
        <h2 class="section-title">The Solution & Advantage</h2>
        <p class="section-subtitle">Automated, verified, and architected for rapid scalability.</p>
      </div>
      <div class="solution-grid">
        <div class="solution-card featured">
          <span class="feature-icon">⚡</span>
          <h3>Autonomous Delivery</h3>
          <p>${primaryIdea.proposedSolution}</p>
        </div>
        <div class="solution-card">
          <span class="feature-icon">🎯</span>
          <h3>Target Precision</h3>
          <p>Specifically engineered for <strong>${primaryIdea.targetCustomer}</strong> in the <strong>${primaryIdea.industry}</strong> sector.</p>
        </div>
        <div class="solution-card">
          <span class="feature-icon">📈</span>
          <h3>Defensible Economics</h3>
          <p>High gross margin structure with rapid CAC recovery payback timeline.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Market Opportunity Section -->
  <section id="market" class="section market-section">
    <div class="container">
      <div class="section-header">
        <span class="section-tag">Market Size [PROJECTION]</span>
        <h2 class="section-title">Total Addressable Market</h2>
        <p class="section-subtitle">Significant market headroom supported by secular industry growth drivers.</p>
      </div>
      <div class="market-grid">
        <div class="market-card">
          <span class="market-tier">TAM</span>
          <span class="market-number">${tam}</span>
          <p class="market-desc">Total Addressable Market worldwide</p>
        </div>
        <div class="market-card highlight">
          <span class="market-tier">SAM</span>
          <span class="market-number">${sam}</span>
          <p class="market-desc">Serviceable Addressable Market in primary geography</p>
        </div>
        <div class="market-card">
          <span class="market-tier">SOM</span>
          <span class="market-number">${som}</span>
          <p class="market-desc">Realistic Obtainable Market over 36-month horizon</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Roadmap Section -->
  <section id="roadmap" class="section roadmap-section">
    <div class="container">
      <div class="section-header">
        <span class="section-tag">Execution Timeline</span>
        <h2 class="section-title">Milestones & Product Roadmap</h2>
        <p class="section-subtitle">Structured execution plan driving toward long-term defensibility.</p>
      </div>
      <div class="roadmap-grid">
        ${roadmapHtml}
      </div>
    </div>
  </section>

  ${ideasGalleryHtml}

  <!-- Contact / Inquiry Section -->
  <section id="contact" class="section contact-section">
    <div class="container">
      <div class="contact-card">
        <h2>Inquire / Connect With The Founder</h2>
        <p>Interested in partnerships, pilot opportunities, or investment?</p>
        <div class="contact-details">
          <span class="contact-badge">${primaryIdea.industry}</span>
          <span class="contact-badge">${primaryIdea.location}</span>
          <span class="contact-badge">Status: Validated (${decision})</span>
        </div>
        <a href="mailto:founder@example.com?subject=Inquiry%20regarding%20${encodeURIComponent(primaryIdea.name)}" class="btn btn-primary btn-lg">Send Founder Inquiry</a>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="footer">
    <div class="container footer-content">
      <p>&copy; ${new Date().getFullYear()} ${primaryIdea.name}. All rights reserved.</p>
      <p class="footer-note">Autonomous Venture Portfolio • Independent Commercial Validation</p>
    </div>
  </footer>
</body>
</html>`

    const stylesCss = `:root {
  --primary: #0A1628;
  --primary-light: #1E293B;
  --gold: #C8A860;
  --gold-hover: #D4B672;
  --accent: #3B82F6;
  --dark: #0F172A;
  --text: #334155;
  --text-muted: #64748B;
  --light: #FAFAF7;
  --white: #FFFFFF;
  --border: #E2E8F0;
  --card-bg: #FFFFFF;
  --success: #166534;
  --success-bg: #DCFCE7;
  --warning: #854D0E;
  --warning-bg: #FEF9C3;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background-color: var(--light);
  color: var(--text);
  line-height: 1.6;
}

.container {
  max-width: 1140px;
  margin: 0 auto;
  padding: 0 24px;
}

/* Navbar */
.navbar {
  position: sticky;
  top: 0;
  background: rgba(10, 22, 40, 0.95);
  backdrop-filter: blur(8px);
  z-index: 100;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding: 16px 0;
}

.nav-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.brand-logo {
  font-size: 20px;
  font-weight: 800;
  color: var(--white);
  text-decoration: none;
  letter-spacing: -0.5px;
}

.brand-accent {
  color: var(--gold);
}

.nav-links {
  display: flex;
  gap: 20px;
  align-items: center;
}

.nav-links a {
  color: #94A3B8;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: color 0.2s;
}

.nav-links a:hover {
  color: var(--white);
}

/* Buttons */
.btn {
  display: inline-block;
  padding: 12px 24px;
  font-size: 14px;
  font-weight: 600;
  border-radius: 8px;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-sm {
  padding: 8px 16px;
  font-size: 13px;
}

.btn-lg {
  padding: 14px 32px;
  font-size: 16px;
}

.btn-primary {
  background: var(--gold);
  color: var(--primary);
  border: 1px solid var(--gold);
}

.btn-primary:hover {
  background: var(--gold-hover);
  transform: translateY(-1px);
}

.btn-secondary {
  background: transparent;
  color: var(--white);
  border: 1px solid rgba(255, 255, 255, 0.25);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.1);
}

/* Hero */
.hero-section {
  background: linear-gradient(180deg, #0A1628 0%, #111E33 100%);
  color: var(--white);
  padding: 90px 0 70px;
  text-align: center;
}

.hero-badge-wrap {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-bottom: 24px;
}

.badge {
  display: inline-block;
  padding: 6px 14px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.score-badge {
  background: rgba(200, 168, 96, 0.2);
  color: var(--gold);
  border: 1px solid var(--gold);
}

.decision-badge {
  background: rgba(34, 197, 94, 0.2);
  color: #4ADE80;
  border: 1px solid #22C55E;
}

.hero-title {
  font-size: 48px;
  font-weight: 800;
  letter-spacing: -1px;
  margin-bottom: 12px;
  line-height: 1.15;
}

.hero-tagline {
  font-size: 20px;
  color: var(--gold);
  font-weight: 600;
  margin-bottom: 16px;
}

.hero-description {
  max-width: 720px;
  margin: 0 auto 36px;
  font-size: 16px;
  color: #94A3B8;
  line-height: 1.6;
}

.hero-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  max-width: 800px;
  margin: 0 auto 40px;
}

.metric-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 20px;
}

.metric-value {
  display: block;
  font-size: 28px;
  font-weight: 800;
  color: var(--white);
  margin-bottom: 4px;
}

.metric-label {
  font-size: 12px;
  color: #94A3B8;
  text-transform: uppercase;
  font-weight: 600;
}

.hero-actions {
  display: flex;
  justify-content: center;
  gap: 16px;
}

/* Sections Common */
.section {
  padding: 80px 0;
}

.section-header {
  text-align: center;
  max-width: 680px;
  margin: 0 auto 50px;
}

.section-tag {
  display: inline-block;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--gold);
  margin-bottom: 8px;
}

.section-title {
  font-size: 32px;
  font-weight: 800;
  color: var(--dark);
  letter-spacing: -0.5px;
  margin-bottom: 12px;
}

.section-subtitle {
  font-size: 15px;
  color: var(--text-muted);
}

/* Problem Card */
.problem-card {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
}

.problem-content h3 {
  font-size: 22px;
  color: var(--dark);
  margin-bottom: 14px;
}

.problem-points {
  margin-top: 24px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.point-item {
  display: flex;
  gap: 12px;
  background: var(--light);
  padding: 16px;
  border-radius: 8px;
  border-left: 3px solid var(--gold);
}

.point-icon {
  font-size: 20px;
}

/* Solution Grid */
.solution-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.solution-card {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 30px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
}

.solution-card.featured {
  border-color: var(--gold);
  background: linear-gradient(180deg, #FFFFFF 0%, #FAF7F0 100%);
}

.feature-icon {
  font-size: 32px;
  display: block;
  margin-bottom: 16px;
}

.solution-card h3 {
  font-size: 18px;
  color: var(--dark);
  margin-bottom: 10px;
}

/* Market Grid */
.market-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.market-card {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 30px;
  text-align: center;
}

.market-card.highlight {
  border: 2px solid var(--gold);
  box-shadow: 0 8px 24px rgba(200, 168, 96, 0.15);
}

.market-tier {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-muted);
  text-transform: uppercase;
}

.market-number {
  display: block;
  font-size: 38px;
  font-weight: 800;
  color: var(--dark);
  margin: 12px 0;
}

.market-desc {
  font-size: 13px;
  color: var(--text-muted);
}

/* Roadmap Grid */
.roadmap-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.roadmap-card {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
}

.roadmap-header {
  border-bottom: 1px solid var(--border);
  padding-bottom: 12px;
  margin-bottom: 16px;
}

.roadmap-header h3 {
  font-size: 18px;
  color: var(--dark);
}

.timeframe {
  font-size: 12px;
  color: var(--gold);
  font-weight: 700;
  text-transform: uppercase;
}

.milestones-list {
  list-style: none;
}

.milestone-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  margin-bottom: 12px;
  padding: 6px 0;
}

.milestone-title {
  flex: 1;
}

.status-indicator {
  font-weight: bold;
}

.achieved .status-indicator {
  color: var(--success);
}

.planned .status-indicator {
  color: var(--text-muted);
}

.status-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
}

.achieved .status-badge {
  background: var(--success-bg);
  color: var(--success);
}

.planned .status-badge {
  background: var(--light);
  color: var(--text-muted);
}

/* Ventures Showcase */
.ventures-section {
  background: #F1F5F9;
  padding: 70px 0;
}

.ideas-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  margin-top: 30px;
}

.venture-card {
  background: var(--white);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
}

.venture-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.score-pill {
  font-size: 12px;
  font-weight: 800;
  background: rgba(200, 168, 96, 0.15);
  color: #8C6D23;
  padding: 2px 8px;
  border-radius: 12px;
}

.industry-tag {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.venture-desc {
  font-size: 13px;
  color: var(--text);
  margin-bottom: 16px;
}

.decision-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 4px;
  text-transform: uppercase;
}

.decision-tag.go {
  background: var(--success-bg);
  color: var(--success);
}

/* Contact */
.contact-section {
  background: linear-gradient(180deg, #111E33 0%, #0A1628 100%);
  color: var(--white);
  text-align: center;
}

.contact-card {
  max-width: 600px;
  margin: 0 auto;
}

.contact-card h2 {
  font-size: 32px;
  margin-bottom: 12px;
}

.contact-card p {
  color: #94A3B8;
  margin-bottom: 24px;
}

.contact-details {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-bottom: 30px;
}

.contact-badge {
  background: rgba(255, 255, 255, 0.08);
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
}

/* Footer */
.footer {
  background: #060E1A;
  color: #64748B;
  padding: 30px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 13px;
}

.footer-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* Responsive */
@media (max-width: 768px) {
  .hero-title { font-size: 32px; }
  .hero-metrics { grid-template-columns: 1fr; }
  .solution-grid { grid-template-columns: 1fr; }
  .market-grid { grid-template-columns: 1fr; }
  .roadmap-grid { grid-template-columns: 1fr; }
  .problem-points { grid-template-columns: 1fr; }
  .footer-content { flex-direction: column; gap: 10px; text-align: center; }
  .nav-links { display: none; }
}
`

    const readmeMd = `# ${primaryIdea.name} — Startup Portfolio Showcase

This repository contains a standalone, fully responsive static portfolio website showcasing the validated business model, market opportunity, and strategic milestones for **${primaryIdea.name}**.

## Package Structure
\`\`\`
startup-portfolio/
├── index.html     # Responsive single-page application portfolio
├── styles.css     # Modern responsive design system & layout styles
└── README.md      # Deployment and local preview instructions
\`\`\`

## Key Highlights
- **Validation Score**: ${overallScore}/100 (${decision} Recommendation)
- **Target Market (TAM)**: ${tam}
- **Business Model**: ${primaryIdea.businessModel}
- **Responsive Architecture**: Optimized for desktop, tablet, and mobile browsers

---

## Deployment Instructions

### 1. GitHub Pages (Free)
1. Push this directory to a GitHub repository.
2. In the repository settings, navigate to **Settings > Pages**.
3. Under **Build and deployment**, select **Deploy from a branch** and pick \`main\` / \`/root\`.
4. Click **Save**. Your portfolio site will be published at \`https://<your-username>.github.io/<repo-name>/\`.

### 2. Vercel
1. Install Vercel CLI (\`npm i -g vercel\`) or connect the repo on [vercel.com](https://vercel.com).
2. Run \`vercel\` in this folder and accept defaults.
3. Your site is live on a global CDN.

### 3. Netlify
1. Drag and drop this folder directly into the Netlify Drop dashboard at [app.netlify.com/drop](https://app.netlify.com/drop).
2. Or run \`npx netlify-cli deploy --prod\` from this directory.

---

## Local Testing
To preview the website locally without any build step:
\`\`\`bash
# Option A: Open directly in your browser
double-click index.html

# Option B: Run a local static file server
npx serve .
\`\`\`
`

    const zip = new JSZip()
    zip.file('index.html', indexHtml)
    zip.file('styles.css', stylesCss)
    zip.file('README.md', readmeMd)

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="startup-portfolio.zip"',
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}