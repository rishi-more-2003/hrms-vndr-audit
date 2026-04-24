import React from 'react';
import ModuleShell from '../components/ModuleShell';
import { Button } from '../components/ui/button';
import { Scroll, Upload, FileText, Info, Rocket, Check } from '@phosphor-icons/react';

// Demo catalogue — real generators arrive as we build Phase 2 per register type.
const REGISTERS = [
  { code: 'MW-FORM-A', label: 'Form A — Register of Wages', law: 'Minimum Wages Act, 1948', scope: 'Central', status: 'coming_soon' },
  { code: 'MW-FORM-B', label: 'Form B — Register of Fines', law: 'Minimum Wages Act, 1948', scope: 'Central', status: 'coming_soon' },
  { code: 'MW-FORM-C', label: 'Form C — Register of Deductions', law: 'Minimum Wages Act, 1948', scope: 'Central', status: 'coming_soon' },
  { code: 'MW-FORM-D', label: 'Form D — Register of Overtime', law: 'Minimum Wages Act, 1948', scope: 'Central', status: 'coming_soon' },
  { code: 'CL-FORM-XIII', label: 'Form XIII — Register of Workmen (Contract Labour)', law: 'Contract Labour (R&A) Act, 1970', scope: 'Central', status: 'coming_soon' },
  { code: 'CL-FORM-XVII', label: 'Form XVII — Muster Roll', law: 'Contract Labour (R&A) Act, 1970', scope: 'Central', status: 'coming_soon' },
  { code: 'MH-WAGE', label: 'Wage Register (Maharashtra)', law: 'Maharashtra Shops & Establishments Act', scope: 'State · MH', status: 'coming_soon' },
  { code: 'PF-ECR', label: 'PF ECR (Form 5A format)', law: 'EPF Act', scope: 'Central', status: 'beta' },
  { code: 'ESIC-F32', label: 'ESIC Form 32 (Accident Book)', law: 'ESIC Act', scope: 'Central', status: 'coming_soon' },
];

export default function RegisterMakerDashboard() {
  const beta = REGISTERS.filter(r => r.status === 'beta');
  const soon = REGISTERS.filter(r => r.status === 'coming_soon');
  return (
    <ModuleShell
      moduleKey="register_maker"
      title="Register Maker"
      subtitle="Auto-generate statutory registers across central + state labour laws"
      dataTestId="register-maker-dashboard"
    >
      <div className="space-y-6">
        <div className="bg-gradient-to-br from-[#E8B25C] to-[#D96C5B] text-white rounded-2xl p-8">
          <p className="text-xs uppercase tracking-widest font-semibold opacity-90">How it works</p>
          <h2 className="text-2xl md:text-3xl font-semibold mt-1" style={{ fontFamily: 'Outfit' }}>Upload one Excel · Get every register</h2>
          <p className="text-white/90 mt-2 max-w-2xl">Fill the standard Saffron payroll template. We map your data to every applicable Central + State register format. No re-keying.</p>
          <div className="flex gap-2 mt-5">
            <Button className="bg-white text-[#2A2624] hover:bg-white/90" data-testid="rm-download-template"><FileText size={14} className="mr-1" /> Download Template</Button>
            <Button variant="outline" className="border-white/30 text-white hover:bg-white/10" data-testid="rm-upload-data"><Upload size={14} className="mr-1" /> Upload Payroll Data</Button>
          </div>
        </div>

        <div className="bg-[#F9F6F0] rounded-lg p-3 flex items-start gap-2 text-xs text-[#6A625E]">
          <Info size={14} className="text-[#E8B25C] mt-0.5" />
          <span>We're rolling out register generators progressively as we finalise each form's schema with our labour-law team. Request priority on a specific register below.</span>
        </div>

        {beta.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase text-[#2A2624] mb-2">Available now (Beta)</p>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {beta.map(r => <RegisterCard key={r.code} r={r} live />)}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-bold uppercase text-[#2A2624] mb-2">Coming soon · {soon.length} registers</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {soon.map(r => <RegisterCard key={r.code} r={r} />)}
          </div>
        </div>
      </div>
    </ModuleShell>
  );
}

function RegisterCard({ r, live = false }) {
  return (
    <div className={`bg-white border rounded-xl p-4 transition ${live ? 'border-[#7D9D85] shadow-sm' : 'border-[#E8E2D9] opacity-75 hover:opacity-100'}`} data-testid={`register-${r.code}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-mono uppercase text-[#A28B7A]">{r.code}</span>
        {live ? <span className="text-[9px] bg-[#7D9D85]/20 text-[#4A6C52] px-2 py-0.5 rounded uppercase font-bold flex items-center gap-1"><Check size={10} weight="bold" /> Beta</span> :
                <span className="text-[9px] bg-[#A28B7A]/20 text-[#A28B7A] px-2 py-0.5 rounded uppercase font-bold flex items-center gap-1"><Rocket size={10} weight="bold" /> Soon</span>}
      </div>
      <p className="text-sm font-semibold text-[#2A2624] leading-tight">{r.label}</p>
      <p className="text-[11px] text-[#6A625E] mt-1">{r.law}</p>
      <p className="text-[10px] text-[#A28B7A] mt-1">{r.scope}</p>
    </div>
  );
}
