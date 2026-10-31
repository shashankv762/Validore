'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import ReportView, { type ReportModel } from '../ReportView';

import { FullReportNarrative } from '../FullReportNarrative';

export default function ReportPageWrapper({ params }: { params: Promise<{ reportId: string }> }) {
  const [report, setReport] = useState<ReportModel | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [viewMode, setViewMode] = useState<'card' | 'narrative'>('card');
  
  // filters
  const [customerSegment, setCustomerSegment] = useState('');
  const [geography, setGeography] = useState('');
  const [competitor, setCompetitor] = useState('');
  const [researchSource, setResearchSource] = useState('');
  const [validationStage, setValidationStage] = useState('');

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
        if (!controller.signal.aborted) setReport(data.report);
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
    return <div className="p-8">Loading report...</div>;
  }

  return (
    <div>
      <div className="bg-[#FAFAF7] border-b border-[#E8E0D0] p-4 flex gap-4 items-center flex-wrap sticky top-0 z-10 justify-between">
        <div className="flex gap-4 items-center flex-wrap">
          <span className="font-bold text-sm text-[#0A1628]">Filters:</span>
          <select className="p-1 border rounded text-sm" value={customerSegment} onChange={e => setCustomerSegment(e.target.value)}>
            <option value="">All Customer Segments</option>
            <option value="Enterprise">Enterprise</option>
            <option value="SMB">SMB</option>
          </select>
          <select className="p-1 border rounded text-sm" value={geography} onChange={e => setGeography(e.target.value)}>
            <option value="">All Geographies</option>
            <option value="US">US</option>
            <option value="EU">EU</option>
          </select>
          <select className="p-1 border rounded text-sm" value={competitor} onChange={e => setCompetitor(e.target.value)}>
            <option value="">All Competitors</option>
            <option value="Direct">Direct</option>
            <option value="Indirect">Indirect</option>
          </select>
          <select className="p-1 border rounded text-sm" value={researchSource} onChange={e => setResearchSource(e.target.value)}>
            <option value="">All Sources</option>
            <option value="Primary">Primary</option>
            <option value="Secondary">Secondary</option>
          </select>
          <select className="p-1 border rounded text-sm" value={validationStage} onChange={e => setValidationStage(e.target.value)}>
            <option value="">All Stages</option>
            <option value="Idea">Idea</option>
            <option value="MVP">MVP</option>
          </select>
        </div>
        <div className="flex gap-2 bg-gray-100 p-1 rounded">
          <button 
            onClick={() => setViewMode('card')} 
            className={`px-3 py-1 text-sm rounded ${viewMode === 'card' ? 'bg-white shadow font-medium' : 'text-gray-500'}`}
          >
            Card View
          </button>
          <button 
            onClick={() => setViewMode('narrative')} 
            className={`px-3 py-1 text-sm rounded ${viewMode === 'narrative' ? 'bg-white shadow font-medium' : 'text-gray-500'}`}
          >
            Full Narrative
          </button>
        </div>
      </div>
      <div className={customerSegment || geography || competitor || researchSource || validationStage ? 'opacity-90 transition-opacity' : ''}>
        {viewMode === 'card' ? (
          <ReportView report={report} filters={{ customerSegment, geography, competitor, researchSource, validationStage }} />
        ) : (
          <FullReportNarrative report={report} filters={{ customerSegment, geography, competitor, researchSource, validationStage }} />
        )}
      </div>
    </div>
  );
}
