import React from 'react';
import ModuleShell from '../components/ModuleShell';
import { Button } from '../components/ui/button';
import { ChatCircleText, Plus, FileText, Clock, CheckCircle, Info, UserCircle, Briefcase } from '@phosphor-icons/react';

export default function ConsultancyDashboard() {
  return (
    <ModuleShell
      moduleKey="consultancy"
      title="Consultancy Desk"
      subtitle="PF · ESIC · PT · Labour-law queries, answered by experts"
      dataTestId="consultancy-dashboard"
    >
      <div className="space-y-6">
        <div className="bg-gradient-to-br from-[#5A7BA8] to-[#3D5A85] text-white rounded-2xl p-8">
          <p className="text-xs uppercase tracking-widest font-semibold opacity-90">Experts on speed-dial</p>
          <h2 className="text-2xl md:text-3xl font-semibold mt-1" style={{ fontFamily: 'Outfit' }}>Every labour-law query, tracked and resolved</h2>
          <p className="text-white/80 mt-2 max-w-2xl">Raise a ticket from your dashboard. Our team handles the government-office legwork. All documents stored in one vault, per client.</p>
          <Button className="mt-5 bg-white text-[#3D5A85] hover:bg-white/90" data-testid="c-new-ticket"><Plus size={14} className="mr-1" /> Raise new ticket</Button>
        </div>

        <div className="bg-[#F9F6F0] rounded-lg p-3 flex items-start gap-2 text-xs text-[#6A625E]">
          <Info size={14} className="text-[#5A7BA8] mt-0.5" />
          <span>Consultancy Desk is in private beta. You can raise tickets and we'll respond via email until the in-app thread view lands.</span>
        </div>

        {/* Role access strip */}
        <div className="grid md:grid-cols-3 gap-3">
          <RoleCard icon={Briefcase} color="#D96C5B" title="Admin" sub="Raise tickets on behalf of the company. Track all open queries across HR and compliance." />
          <RoleCard icon={UserCircle} color="#E8B25C" title="Employee" sub="Raise a personal query — PF withdrawal, UAN correction, ESIC dispensary queries." />
          <RoleCard icon={ChatCircleText} color="#5A7BA8" title="Consultant (Saffron team)" sub="Internal view. Pick up tickets, respond, upload government-office correspondence." />
        </div>

        {/* Ticket categories */}
        <div className="bg-white border border-[#E8E2D9] rounded-xl p-5">
          <p className="text-xs font-bold uppercase text-[#2A2624] mb-3">Common ticket categories</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
            {[
              'PF Transfer / Withdrawal', 'UAN Activation / Correction', 'ESIC Dispensary / Registration',
              'Professional Tax Query', 'MLWF Registration', 'PF Grievance / 7A notice',
              'ESIC Damages / 45A', 'PT Return discrepancy', 'Shop Act License',
              'Contract Labour License', 'Form 13 / Form 11', 'Other Labour query',
            ].map(c => (
              <div key={c} className="px-3 py-2 bg-[#F9F6F0] rounded-lg text-sm text-[#2A2624] flex items-center gap-2 hover:bg-[#FBE8D9] cursor-pointer" data-testid={`c-cat-${c.replace(/\s+/g, '-').toLowerCase()}`}>
                <FileText size={14} className="text-[#A28B7A]" /> {c}
              </div>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <StatCard icon={Clock} color="#E8B25C" label="My Open Tickets" value="0" />
          <StatCard icon={CheckCircle} color="#7D9D85" label="Resolved this month" value="0" />
          <StatCard icon={FileText} color="#5A7BA8" label="Documents in vault" value="0" />
        </div>
      </div>
    </ModuleShell>
  );
}

function RoleCard({ icon: I, color, title, sub }) {
  return (
    <div className="bg-white border border-[#E8E2D9] rounded-xl p-5">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ background: `${color}22` }}><I size={20} weight="bold" style={{ color }} /></div>
      <p className="font-semibold text-[#2A2624]">{title}</p>
      <p className="text-xs text-[#6A625E] mt-1 leading-relaxed">{sub}</p>
    </div>
  );
}

function StatCard({ icon: I, color, label, value }) {
  return (
    <div className="bg-white border border-[#E8E2D9] rounded-xl p-4 flex items-center justify-between">
      <div><p className="text-xs text-[#A28B7A] uppercase tracking-wider">{label}</p><p className="text-2xl font-bold text-[#2A2624]">{value}</p></div>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${color}22` }}><I size={20} weight="bold" style={{ color }} /></div>
    </div>
  );
}
