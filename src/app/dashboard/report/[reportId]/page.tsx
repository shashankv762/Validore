import React from 'react';
import { db } from '@/db';
import { validationReports } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import ReportView from '../ReportView';

export default async function ReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  
  const reports = await db
    .select()
    .from(validationReports)
    .where(eq(validationReports.id, reportId))
    .limit(1);

  const report = reports[0];

  if (!report) {
    notFound();
  }

  return <ReportView report={report} />;
}