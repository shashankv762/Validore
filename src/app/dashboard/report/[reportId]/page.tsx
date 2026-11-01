'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, LayoutGrid, AlignLeft, Loader2 } from 'lucide-react';
import ReportView, { type ReportModel } from '../ReportView';
import { ExportToolbar } from '@/components/ui/ExportToolbar';

import { FullReportNarrative } from '../FullReportNarrative';

export default function ReportPageWrapper({ params }: { params: Promise<{ reportId: string }> }) {
  const [report, setReport] = useState<ReportModel | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [viewMode, setViewMode] = useState<'card' | 'narrative'>('card');
  const [ideaName, setIdeaName] = useState('Startup validation');

  useEffect(() => {
    const controller = new AbortController();
    async function loadReport() {
      try {
        const { reportId } = await params;
        const response = await fetch('/api/reports/' + encodeURIComponent(reportId), {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
        });
        if (!response.ok) throw new Error(response.status === 401 ? 'Please sign in again to view this report.'
          : response.status === 404 ? 'This report could not be found in your account.' : 'The report is temporarily unavailable. Please try again.');
        const data = await response.json();
        if (!data.report?.id) throw new Error('The report could not be loaded. Please try again.');
        if (!controller.signal.aborted) { setReport(data.report); setIdeaName(data.ideaName || 'Startup validation'); }
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error && err.name === 'Error' ? err.message : 'The report could not be loaded. Check your connection and try again.');
      }
    }
    void loadReport();
    return () => controller.abort();
  }, [params, attempt]);

  if (error) return <div className="p-8" role="alert">
    <p>{error}</p>
    <button className="mt-4 mr-4 underline" onClick={() => { setError(''); setReport(null); setAttempt(value => value + 1); }}>Try again</button>
    <Link className="underline" href="/dashboard/reports">Back to reports</Link>
  </div>;

  if (!report) {
    return <div className="workspace-loading" role="status"><Loader2 size={20} className="animate-spin" aria-hidden="true" />Loading your report…</div>;
  }

  return (
    <div className="report-workspace">
      <Link className="workspace-text-link mb-5" href="/dashboard/reports"><ArrowLeft size={15} aria-hidden="true" />All reports</Link>
      <header className="workspace-page-heading report-page-heading">
        <div><h1>{ideaName}</h1><p>Review the findings, check the evidence, and decide what to test next.</p></div>
        <ExportToolbar reportId={report.id} ideaId={report.ideaId} deckType="validation" formats={['pdf', 'docx', 'csv', 'pptx', 'white-label-pdf']} />
      </header>
      <div className="report-view-controls" role="group" aria-label="Report view">
        <button aria-pressed={viewMode === 'card'} onClick={() => setViewMode('card')}><LayoutGrid size={15} aria-hidden="true" />Overview</button>
        <button aria-pressed={viewMode === 'narrative'} onClick={() => setViewMode('narrative')}><AlignLeft size={15} aria-hidden="true" />Full report</button>
      </div>
      <div>
        {viewMode === 'card' ? (
          <ReportView report={report} hideDownloads />
        ) : (
          <FullReportNarrative report={report} />
        )}
      </div>
    </div>
  );
}
