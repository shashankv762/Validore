import React from 'react';
import { db } from '@/db';
import { validationReports, ideas } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import ReportView from '@/app/dashboard/report/ReportView';

export async function generateMetadata({ params }: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await params;
  
  const reports = await db
    .select({ ideaName: ideas.name })
    .from(validationReports)
    .innerJoin(ideas, eq(validationReports.ideaId, ideas.id))
    .where(eq(validationReports.shareToken, shareToken))
    .limit(1);

  const report = reports[0];
  const title = report ? `${report.ideaName} - Validation Report` : 'Validore Validation Report';

  return {
    title,
    description: 'View this shared AI-powered startup validation report from Validore.',
    openGraph: {
      title,
      description: 'View this shared AI-powered startup validation report from Validore.',
      siteName: 'Validore',
      images: ['/og-image.svg'],
    },
    twitter: {
      card: 'summary_large_image',
      title,
    }
  }
}

export default async function SharePage({ params }: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await params;
  
  const reports = await db
    .select()
    .from(validationReports)
    .where(eq(validationReports.shareToken, shareToken))
    .limit(1);

  const report = reports[0];

  if (!report) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[#F5F0E8]">
      <ReportView report={report} isSharePage={true} />
    </div>
  );
}