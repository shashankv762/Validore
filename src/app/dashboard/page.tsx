"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";

export default function IdeaWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [formData, setFormData] = useState({
    name: "", industry: "", product: "", targetCustomer: "",
    location: "", businessModel: "", coreProblem: "", proposedSolution: ""
  });

  const nextStep = () => setStep(s => Math.min(s + 1, 9));
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (step < 9) nextStep();
      else handleSubmit();
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 md:px-8">
      <div className="flex gap-3 mb-12 justify-center" aria-label={`Step ${step} of 9`}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => (
          <div key={i} className="flex-1 max-w-[40px]">
            <div 
              className={`h-2 rounded transition-all duration-300 ${
                step > i ? 'bg-[#C8A860]' : step === i ? 'bg-[#0A1628] animate-pulse' : 'bg-[#E8E0D0]'
              }`}
            />
          </div>
        ))}
      </div>
      
      {loading ? (
        <div className="card-angular p-16 flex flex-col items-center justify-center bg-[#FAFAF7] shadow-sm">
          <div className="w-12 h-12 border-4 border-[#E8E0D0] border-t-[#C8A860] rounded-full animate-spin mb-6" />
          <div className="text-xl font-light text-[#0A1628]">{loadingMsg}</div>
        </div>
      ) : (
        <div className="card-angular p-8 md:p-12 bg-[#FAFAF7] shadow-sm">
          {step === 1 && (
            <div>
              <h1 className="text-2xl font-light text-[#0A1628] mb-2">Startup Name</h1>
              <p className="text-sm text-[#1C1C1C] opacity-70 mb-6">What is the working title for your startup?</p>
              <label htmlFor="name" className="sr-only">Startup Name</label>
              <input 
                id="name"
                className="w-full px-4 py-3 bg-white border border-[#E8E0D0] rounded focus:outline-none focus:border-[#C8A860] focus:ring-1 focus:ring-[#C8A860] text-[#1C1C1C] transition-colors" 
                value={formData.name} 
                onChange={e => updateForm('name', e.target.value)} 
                onKeyDown={handleKeyDown}
                autoFocus
                placeholder="e.g. Validore"
              />
            </div>
          )}
          {step === 2 && (
            <div>
              <h1 className="text-2xl font-light text-[#0A1628] mb-2">Industry</h1>
              <p className="text-sm text-[#1C1C1C] opacity-70 mb-6">Which primary industry does this operate in?</p>
              <label htmlFor="industry" className="sr-only">Industry</label>
              <input 
                id="industry"
                className="w-full px-4 py-3 bg-white border border-[#E8E0D0] rounded focus:outline-none focus:border-[#C8A860] focus:ring-1 focus:ring-[#C8A860] text-[#1C1C1C] transition-colors" 
                value={formData.industry} 
                onChange={e => updateForm('industry', e.target.value)} 
                onKeyDown={handleKeyDown}
                autoFocus
                placeholder="e.g. SaaS, FinTech, E-commerce"
              />
            </div>
          )}
          {step === 3 && (
            <div>
              <h1 className="text-2xl font-light text-[#0A1628] mb-2">Product or Service</h1>
              <p className="text-sm text-[#1C1C1C] opacity-70 mb-6">Describe what you are actually building.</p>
              <label htmlFor="product" className="sr-only">Product or Service</label>
              <textarea 
                id="product"
                className="w-full px-4 py-3 bg-white border border-[#E8E0D0] rounded focus:outline-none focus:border-[#C8A860] focus:ring-1 focus:ring-[#C8A860] text-[#1C1C1C] transition-colors min-h-[120px] resize-y" 
                value={formData.product} 
                onChange={e => updateForm('product', e.target.value)} 
                autoFocus
                placeholder="We are building an AI-powered platform that..."
              />
            </div>
          )}
          {step === 4 && (
            <div>
              <h1 className="text-2xl font-light text-[#0A1628] mb-2">Target Customer</h1>
              <p className="text-sm text-[#1C1C1C] opacity-70 mb-6">Who exactly will pay for this?</p>
              <label htmlFor="targetCustomer" className="sr-only">Target Customer</label>
              <input 
                id="targetCustomer"
                className="w-full px-4 py-3 bg-white border border-[#E8E0D0] rounded focus:outline-none focus:border-[#C8A860] focus:ring-1 focus:ring-[#C8A860] text-[#1C1C1C] transition-colors" 
                value={formData.targetCustomer} 
                onChange={e => updateForm('targetCustomer', e.target.value)} 
                onKeyDown={handleKeyDown}
                autoFocus
                placeholder="e.g. B2B enterprise sales teams"
              />
            </div>
          )}
          {step === 5 && (
            <div>
              <h1 className="text-2xl font-light text-[#0A1628] mb-2">Market / Location</h1>
              <p className="text-sm text-[#1C1C1C] opacity-70 mb-6">Where is your primary launch market?</p>
              <label htmlFor="location" className="sr-only">Location</label>
              <input 
                id="location"
                className="w-full px-4 py-3 bg-white border border-[#E8E0D0] rounded focus:outline-none focus:border-[#C8A860] focus:ring-1 focus:ring-[#C8A860] text-[#1C1C1C] transition-colors" 
                value={formData.location} 
                onChange={e => updateForm('location', e.target.value)} 
                onKeyDown={handleKeyDown}
                autoFocus
                placeholder="e.g. United States, Global, India"
              />
            </div>
          )}
          {step === 6 && (
            <div>
              <h1 className="text-2xl font-light text-[#0A1628] mb-2">Business Model</h1>
              <p className="text-sm text-[#1C1C1C] opacity-70 mb-6">How do you plan to generate revenue?</p>
              <label htmlFor="businessModel" className="sr-only">Business Model</label>
              <input 
                id="businessModel"
                className="w-full px-4 py-3 bg-white border border-[#E8E0D0] rounded focus:outline-none focus:border-[#C8A860] focus:ring-1 focus:ring-[#C8A860] text-[#1C1C1C] transition-colors" 
                value={formData.businessModel} 
                onChange={e => updateForm('businessModel', e.target.value)} 
                onKeyDown={handleKeyDown}
                autoFocus
                placeholder="e.g. B2B SaaS Subscriptions, $99/mo"
              />
            </div>
          )}
          {step === 7 && (
            <div>
              <h1 className="text-2xl font-light text-[#0A1628] mb-2">Core Problem</h1>
              <p className="text-sm text-[#1C1C1C] opacity-70 mb-6">What painful problem does this solve for the target customer?</p>
              <label htmlFor="coreProblem" className="sr-only">Core Problem</label>
              <textarea 
                id="coreProblem"
                className="w-full px-4 py-3 bg-white border border-[#E8E0D0] rounded focus:outline-none focus:border-[#C8A860] focus:ring-1 focus:ring-[#C8A860] text-[#1C1C1C] transition-colors min-h-[120px] resize-y" 
                value={formData.coreProblem} 
                onChange={e => updateForm('coreProblem', e.target.value)} 
                autoFocus
                placeholder="Founders spend too much money building products nobody wants..."
              />
            </div>
          )}
          {step === 8 && (
            <div>
              <h1 className="text-2xl font-light text-[#0A1628] mb-2">Proposed Solution</h1>
              <p className="text-sm text-[#1C1C1C] opacity-70 mb-6">How do you plan to solve this problem?</p>
              <label htmlFor="proposedSolution" className="sr-only">Proposed Solution</label>
              <textarea 
                id="proposedSolution"
                className="w-full px-4 py-3 bg-white border border-[#E8E0D0] rounded focus:outline-none focus:border-[#C8A860] focus:ring-1 focus:ring-[#C8A860] text-[#1C1C1C] transition-colors min-h-[120px] resize-y" 
                value={formData.proposedSolution} 
                onChange={e => updateForm('proposedSolution', e.target.value)} 
                autoFocus
                placeholder="We will build..."
              />
            </div>
          )}
          {step === 9 && (
            <div>
              <h1 className="text-2xl font-light text-[#0A1628] mb-2">Review & Submit</h1>
              <p className="text-sm text-[#1C1C1C] opacity-70 mb-6">Does everything look correct? We will use this to generate your validation report.</p>
              <div className="bg-[#F5F0E8] p-6 rounded-lg text-sm text-[#1C1C1C] space-y-4 mb-6">
                 <div><strong className="text-[#0A1628]">Name:</strong> {formData.name || '-'}</div>
                 <div><strong className="text-[#0A1628]">Industry:</strong> {formData.industry || '-'}</div>
                 <div><strong className="text-[#0A1628]">Product:</strong> {formData.product || '-'}</div>
                 <div><strong className="text-[#0A1628]">Customer:</strong> {formData.targetCustomer || '-'}</div>
                 <div><strong className="text-[#0A1628]">Location:</strong> {formData.location || '-'}</div>
                 <div><strong className="text-[#0A1628]">Model:</strong> {formData.businessModel || '-'}</div>
                 <div><strong className="text-[#0A1628]">Problem:</strong> {formData.coreProblem || '-'}</div>
                 <div><strong className="text-[#0A1628]">Proposed Solution:</strong> {formData.proposedSolution || '-'}</div>
              </div>
              <p className="text-xs text-[#1C1C1C] opacity-60 mb-2">
                Your startup idea data is processed by AI providers to generate your validation report. See our <a href="/legal/privacy" className="text-[#C8A860] hover:underline" target="_blank" rel="noreferrer">Privacy Policy</a> for details.
              </p>
            </div>
          )}
          
          <div className="mt-10 flex justify-between items-center border-t border-[#E8E0D0] pt-6">
            <button 
              onClick={prevStep} 
              disabled={step === 1} 
              className="px-6 py-2.5 text-sm font-medium text-[#1C1C1C] border border-[#E8E0D0] rounded hover:border-[#0A1628] transition-colors disabled:opacity-30 disabled:hover:border-[#E8E0D0] focus:outline-none focus:ring-2 focus:ring-[#0A1628]"
              aria-label="Previous step"
            >
              Back
            </button>
            {step < 9 ? (
              <button 
                onClick={nextStep} 
                className="px-8 py-2.5 text-sm font-medium text-[#FAFAF7] bg-[#0A1628] rounded hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-[#C8A860]"
                aria-label="Next step"
              >
                Continue
              </button>
            ) : (
              <button 
                onClick={handleSubmit} 
                className="px-8 py-2.5 text-sm font-medium text-[#0A1628] rounded hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-[#0A1628]"
                style={{ background: 'var(--gold-gradient)' }}
                aria-label="Submit for validation"
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