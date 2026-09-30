import os

def write_file(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')

BASE_DIR = r"c:\Users\2025\IIT DELHI\entrepreneur\aurexa"

dashboard_page_tsx = """
"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";

const STEPS = [
  { title: "Startup Name", desc: "What is your startup called?" },
  { title: "Industry", desc: "What industry are you in?" },
  { title: "Product/Service", desc: "Describe your product in a few sentences." },
  { title: "Target Customer", desc: "Who is your ideal target customer?" },
  { title: "Location/Market", desc: "Where are you launching primarily?" },
  { title: "Business Model", desc: "How do you plan to make money?" },
  { title: "Core Problem", desc: "What is the primary problem you are solving?" },
  { title: "Review & Submit", desc: "Review your details before validation." }
];

export default function IdeaWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [formData, setFormData] = useState({
    name: "", industry: "", product: "", targetCustomer: "",
    location: "", businessModel: "", coreProblem: "", proposedSolution: ""
  });

  const nextStep = () => setStep(s => Math.min(s + 1, 8));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));
  const updateForm = (key: string, val: string) => setFormData(p => ({ ...p, [key]: val }));

  const handleSubmit = async () => {
    setLoading(true);
    setLoadingMsg("Analysing market...");
    setTimeout(() => setLoadingMsg("Researching competitors..."), 3000);
    setTimeout(() => setLoadingMsg("Modelling financials..."), 6000);

    try {
      const ideaRes = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      const { idea } = await ideaRes.json();

      if (idea?.id) {
        const valRes = await fetch("/api/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ideaId: idea.id })
        });
        const { reportId } = await valRes.json();
        if (reportId) {
          router.push(`/dashboard/report/${reportId}`);
          return;
        }
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto py-12">
      <div className="mb-12">
        <h1 className="text-3xl font-light text-[#0A1628] mb-2">New Idea Validation</h1>
        <p className="text-[#1C1C1C] opacity-70">Follow the wizard to input your startup idea details.</p>
      </div>

      <div className="flex gap-2 mb-12 justify-center">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
          <div key={i} className={`w-full h-1 rounded-full transition-all ${step >= i ? 'bg-[#C8A860]' : 'bg-[#E8E0D0]'} ${step === i ? 'animate-pulse' : ''}`} />
        ))}
      </div>
      
      {loading ? (
        <div className="card-angular p-16 flex flex-col items-center justify-center text-center shadow-sm">
          <div className="w-16 h-16 rounded-full border-4 border-[#E8E0D0] border-t-[#C8A860] animate-spin mb-6"></div>
          <h2 className="text-2xl font-light text-[#0A1628] mb-2">Validating Idea</h2>
          <p className="text-[#C8A860] font-medium animate-pulse">{loadingMsg}</p>
        </div>
      ) : (
        <div className="card-angular p-10 shadow-sm bg-[#FAFAF7]">
          <h2 className="text-2xl font-medium text-[#0A1628] mb-1">{STEPS[step-1].title}</h2>
          <p className="text-sm text-[#1C1C1C] opacity-60 mb-8">{STEPS[step-1].desc}</p>
          
          <div className="min-h-[120px]">
            {step === 1 && (
              <div>
                 <label htmlFor="name" className="sr-only">Startup Name</label>
                 <input id="name" className="w-full border border-[#E8E0D0] p-4 rounded focus:outline-none focus:ring-2 focus:ring-[#C8A860] bg-white text-[#1C1C1C]" placeholder="e.g. Aurexa" value={formData.name} onChange={e => updateForm('name', e.target.value)} autoFocus />
              </div>
            )}
            {step === 2 && (
              <div>
                 <label htmlFor="industry" className="sr-only">Industry</label>
                 <input id="industry" className="w-full border border-[#E8E0D0] p-4 rounded focus:outline-none focus:ring-2 focus:ring-[#C8A860] bg-white text-[#1C1C1C]" placeholder="e.g. B2B SaaS, Fintech" value={formData.industry} onChange={e => updateForm('industry', e.target.value)} autoFocus />
              </div>
            )}
            {step === 3 && (
              <div>
                 <label htmlFor="product" className="sr-only">Product/Service</label>
                 <textarea id="product" rows={4} className="w-full border border-[#E8E0D0] p-4 rounded focus:outline-none focus:ring-2 focus:ring-[#C8A860] bg-white text-[#1C1C1C]" placeholder="Describe your product or service..." value={formData.product} onChange={e => updateForm('product', e.target.value)} autoFocus />
              </div>
            )}
            {step === 4 && (
              <div>
                 <label htmlFor="targetCustomer" className="sr-only">Target Customer</label>
                 <input id="targetCustomer" className="w-full border border-[#E8E0D0] p-4 rounded focus:outline-none focus:ring-2 focus:ring-[#C8A860] bg-white text-[#1C1C1C]" placeholder="e.g. Mid-market software companies" value={formData.targetCustomer} onChange={e => updateForm('targetCustomer', e.target.value)} autoFocus />
              </div>
            )}
            {step === 5 && (
              <div>
                 <label htmlFor="location" className="sr-only">Location/Market</label>
                 <input id="location" className="w-full border border-[#E8E0D0] p-4 rounded focus:outline-none focus:ring-2 focus:ring-[#C8A860] bg-white text-[#1C1C1C]" placeholder="e.g. North America, Global" value={formData.location} onChange={e => updateForm('location', e.target.value)} autoFocus />
              </div>
            )}
            {step === 6 && (
              <div>
                 <label htmlFor="businessModel" className="sr-only">Business Model</label>
                 <input id="businessModel" className="w-full border border-[#E8E0D0] p-4 rounded focus:outline-none focus:ring-2 focus:ring-[#C8A860] bg-white text-[#1C1C1C]" placeholder="e.g. Monthly subscription, freemium" value={formData.businessModel} onChange={e => updateForm('businessModel', e.target.value)} autoFocus />
              </div>
            )}
            {step === 7 && (
              <div className="space-y-4">
                 <div>
                    <label htmlFor="coreProblem" className="block text-sm font-medium mb-1 text-[#1C1C1C]">Core Problem</label>
                    <textarea id="coreProblem" rows={3} className="w-full border border-[#E8E0D0] p-4 rounded focus:outline-none focus:ring-2 focus:ring-[#C8A860] bg-white text-[#1C1C1C]" value={formData.coreProblem} onChange={e => updateForm('coreProblem', e.target.value)} autoFocus />
                 </div>
                 <div>
                    <label htmlFor="proposedSolution" className="block text-sm font-medium mb-1 text-[#1C1C1C]">Proposed Solution (Optional)</label>
                    <textarea id="proposedSolution" rows={3} className="w-full border border-[#E8E0D0] p-4 rounded focus:outline-none focus:ring-2 focus:ring-[#C8A860] bg-white text-[#1C1C1C]" value={formData.proposedSolution} onChange={e => updateForm('proposedSolution', e.target.value)} />
                 </div>
              </div>
            )}
            {step === 8 && (
              <div>
                 <div className="bg-[#F5F0E8] p-6 rounded border border-[#E8E0D0] overflow-hidden text-sm">
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
                       <div><dt className="text-xs text-[#1C1C1C] opacity-60 uppercase mb-1">Name</dt><dd className="font-medium text-[#0A1628]">{formData.name || '-'}</dd></div>
                       <div><dt className="text-xs text-[#1C1C1C] opacity-60 uppercase mb-1">Industry</dt><dd className="font-medium text-[#0A1628]">{formData.industry || '-'}</dd></div>
                       <div className="sm:col-span-2"><dt className="text-xs text-[#1C1C1C] opacity-60 uppercase mb-1">Product</dt><dd className="font-medium text-[#0A1628]">{formData.product || '-'}</dd></div>
                    </dl>
                 </div>
                 <p className="text-xs text-[#1C1C1C] opacity-70 mt-6 text-center">
                    Your startup idea data is processed by AI providers to generate your validation report. See our <a href="/legal/privacy" className="text-[#C8A860] hover:underline focus:outline-none focus:ring-2 focus:ring-[#C8A860]">Privacy Policy</a> for details.
                 </p>
              </div>
            )}
          </div>
          
          <div className="mt-10 flex justify-between items-center pt-6 border-t border-[#E8E0D0]">
            <button 
              onClick={prevStep} 
              disabled={step === 1} 
              className={`px-6 py-2.5 rounded text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#C8A860] ${step === 1 ? 'opacity-50 cursor-not-allowed text-[#1C1C1C] bg-[#E8E0D0]' : 'text-[#1C1C1C] bg-[#E8E0D0] hover:bg-[#D4CFC9]'}`}
              aria-label="Previous Step"
            >
              Back
            </button>
            {step < 8 ? (
              <button 
                onClick={nextStep} 
                className="px-6 py-2.5 bg-[#0A1628] text-[#FAFAF7] rounded text-sm font-medium hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-[#C8A860]"
                aria-label="Next Step"
              >
                Next
              </button>
            ) : (
              <button 
                onClick={handleSubmit} 
                className="px-6 py-2.5 text-[#0A1628] rounded text-sm font-medium hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-[#0A1628]"
                style={{ background: 'var(--gold-gradient)' }}
                aria-label="Submit for Validation"
              >
                Validate Idea
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
"""

write_file(os.path.join(BASE_DIR, 'src/app/dashboard/page.tsx'), dashboard_page_tsx)
