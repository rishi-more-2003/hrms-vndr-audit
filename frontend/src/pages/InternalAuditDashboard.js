import React from 'react';
import ModuleShell from '../components/ModuleShell';
import { Button } from '../components/ui/button';
import { CheckSquare, PlayCircle, ChartLineUp, Warning, ShieldCheck, Info } from '@phosphor-icons/react';

export default function InternalAuditDashboard() {
  return (
    <ModuleShell
      moduleKey="internal_audit"
      title="Internal Labour Audit"
      subtitle="Continuously audit your own payroll & statutory compliance"
      dataTestId="internal-audit-dashboard"
    >
      <div className="space-y-6">
        <div className="bg-gradient-to-br from-[#7D9D85] to-[#4A6C52] text-white rounded-2xl p-8">
          <p className="text-xs uppercase tracking-widest font-semibold opacity-90">Self-audit engine</p>
          <h2 className="text-2xl md:text-3xl font-semibold mt-1" style={{ fontFamily: 'Outfit' }}>Be audit-ready, always</h2>
          <p className="text-white/80 mt-2 max-w-2xl">The same employee-level rule engine that audits your contractors — now pointed at your own payroll. Run it every month before you issue salaries.</p>
        </div>

        <div className="bg-[#F9F6F0] rounded-lg p-3 flex items-start gap-2 text-xs text-[#6A625E]">
          <Info size={14} className="text-[#E8B25C] mt-0.5" />
          <span>Internal Audit is in private beta. If your org has HRMS enabled, we'll run a compliance sweep on your active payroll run on request. Click below to schedule.</span>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <MetricCard icon={PlayCircle} color="#D96C5B" title="Run Self-Audit" desc="Sweep this month's payroll against PF, ESIC, PT, MLWF, Min Wage, Structure rules" cta="Start sweep" disabled />
          <MetricCard icon={ChartLineUp} color="#7D9D85" title="Trend Report" desc="Month-on-month finding count, compliance score, risk trajectory" cta="View trends" disabled />
          <MetricCard icon={Warning} color="#E8B25C" title="Risk Register" desc="Top 10 recurring findings across your payroll runs" cta="See risks" disabled />
        </div>

        <div className="bg-white border border-[#E8E2D9] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-2"><ShieldCheck size={18} className="text-[#D96C5B]" /><p className="font-semibold">What will be audited</p></div>
          <div className="grid md:grid-cols-2 gap-3 text-sm text-[#6A625E]">
            <Bullet>PF 12% contribution on every employee (cap ₹15k, EPS 8.33%, EDLI 0.5%, Admin 0.5%)</Bullet>
            <Bullet>ESIC 0.75% employee / 3.25% employer (threshold ₹21k)</Bullet>
            <Bullet>Professional Tax — state-wise slabs incl. Maharashtra Feb special</Bullet>
            <Bullet>MLWF (Maharashtra) — June/December ₹25 deduction rule</Bullet>
            <Bullet>Minimum Wages — state & category floor check</Bullet>
            <Bullet>Salary structure — HRA limits, Basic ≥ 50%, net salary math</Bullet>
            <Bullet>Payment of Wages — statutory payment-date compliance</Bullet>
            <Bullet>UAN / IP number completeness + format validation</Bullet>
          </div>
        </div>

        <div className="text-center">
          <Button className="bg-[#D96C5B] hover:bg-[#C25949]" data-testid="ia-request-beta">Request beta access</Button>
        </div>
      </div>
    </ModuleShell>
  );
}

function MetricCard({ icon: I, color, title, desc, cta, disabled }) {
  return (
    <div className={`bg-white border border-[#E8E2D9] rounded-xl p-5 ${disabled ? 'opacity-60' : 'hover:border-[#D96C5B] hover:shadow-md'} transition`}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ background: `${color}22` }}><I size={20} weight="bold" style={{ color }} /></div>
      <p className="font-semibold text-[#2A2624]">{title}</p>
      <p className="text-xs text-[#6A625E] mt-1">{desc}</p>
      <Button size="sm" variant="outline" className="mt-3" disabled={disabled}>{cta}</Button>
    </div>
  );
}

function Bullet({ children }) {
  return <div className="flex items-start gap-2"><CheckSquare size={14} weight="fill" className="text-[#7D9D85] flex-shrink-0 mt-0.5" /><span>{children}</span></div>;
}
