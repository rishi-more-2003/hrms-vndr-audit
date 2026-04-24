import React from 'react';
import { useNavigate } from 'react-router-dom';
import ModuleShell from '../components/ModuleShell';
import { Button } from '../components/ui/button';
import { ShieldCheck, Buildings, FileText, ClockClockwise, ArrowRight, Plus } from '@phosphor-icons/react';

export default function VendorAuditDashboard() {
  const nav = useNavigate();
  return (
    <ModuleShell
      moduleKey="vendor_audit"
      title="Vendor Labour Audit"
      subtitle="Automated statutory compliance for contractor workforces"
      dataTestId="vendor-audit-dashboard"
      rightActions={<Button onClick={() => nav('/vendor-audit')} size="sm" className="bg-[#D96C5B] hover:bg-[#C25949]"><ArrowRight size={12} className="mr-1" /> Open Auditor Console</Button>}
    >
      <div className="space-y-6">
        {/* Role-switcher hint for three VA roles */}
        <div className="bg-gradient-to-br from-[#2A2624] to-[#3B3432] text-white rounded-2xl p-8">
          <p className="text-xs uppercase tracking-widest text-[#D96C5B] font-semibold">Welcome back</p>
          <h2 className="text-2xl md:text-3xl font-semibold mt-1" style={{ fontFamily: 'Outfit' }}>Your virtual statutory auditor</h2>
          <p className="text-white/60 mt-2 max-w-2xl">Contractors upload monthly payroll + statutory PDFs. Our engine cross-checks every employee row against PF, ESIC, PT, MLWF and minimum-wage rules. You get a signed audit report.</p>
        </div>

        {/* Role cards */}
        <div className="grid md:grid-cols-3 gap-3">
          <RoleCard icon={ShieldCheck} color="#7D9D85" title="Auditor" sub="Review findings, approve/reject submissions, access all contractors across tenants" href="/vendor-audit" cta="Open audit console" />
          <RoleCard icon={Buildings} color="#D96C5B" title="Principal Employer" sub="See audits of your contractors, download registers, approve submitted reports" href="/vendor-audit" cta="View contractors" />
          <RoleCard icon={FileText} color="#E8B25C" title="Vendor / Contractor" sub="Upload your monthly Excel + 7 statutory PDFs, see audit findings, submit to principal" href="/contractor/login" cta="Contractor login" />
        </div>

        {/* Quick actions */}
        <div className="grid md:grid-cols-2 gap-4">
          <ActionCard icon={Plus} title="Start a new audit" desc="Create an audit run for any contractor + wage month" onClick={() => nav('/vendor-audit')} />
          <ActionCard icon={ClockClockwise} title="Manage audit schedules" desc="Configure per-contractor yearly audit windows with auto-open/close" onClick={() => nav('/vendor-audit')} />
        </div>
      </div>
    </ModuleShell>
  );
}

function RoleCard({ icon: I, color, title, sub, href, cta }) {
  return (
    <a href={href} className="bg-white border border-[#E8E2D9] rounded-2xl p-5 hover:border-[#D96C5B] hover:shadow-md hover:-translate-y-0.5 transition block">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: `${color}22` }}><I size={20} weight="bold" style={{ color }} /></div>
      <h3 className="text-lg font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>{title}</h3>
      <p className="text-xs text-[#6A625E] mt-1.5 leading-relaxed">{sub}</p>
      <p className="mt-3 text-xs font-semibold text-[#D96C5B] flex items-center gap-1">{cta} <ArrowRight size={12} /></p>
    </a>
  );
}

function ActionCard({ icon: I, title, desc, onClick }) {
  return (
    <button onClick={onClick} className="bg-white border border-[#E8E2D9] rounded-xl p-5 hover:border-[#D96C5B] transition text-left flex items-center gap-4">
      <div className="w-11 h-11 rounded-lg bg-[#D96C5B]/10 flex items-center justify-center flex-shrink-0"><I size={20} className="text-[#D96C5B]" /></div>
      <div><p className="font-semibold text-[#2A2624]">{title}</p><p className="text-xs text-[#6A625E] mt-0.5">{desc}</p></div>
    </button>
  );
}
