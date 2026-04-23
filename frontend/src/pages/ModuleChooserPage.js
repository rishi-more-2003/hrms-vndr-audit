import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, ShieldCheck, Scroll, CheckSquare, ChatCircleText, Leaf, ArrowLeft, ArrowRight } from '@phosphor-icons/react';

const MODULES = [
  { key: 'hrms', path: '/hrms/login', label: 'HRMS', desc: 'Payroll, attendance, employee self-service', icon: Users },
  { key: 'vendor_audit', path: '/vendor-audit/login', label: 'Vendor Audit', desc: 'Automated contractor compliance audits', icon: ShieldCheck },
  { key: 'register_maker', path: '/register-maker/login', label: 'Register Maker', desc: 'Statutory registers from a single Excel', icon: Scroll },
  { key: 'internal_audit', path: '/internal-audit/login', label: 'Internal Audit', desc: 'Continuous self-compliance engine', icon: CheckSquare },
  { key: 'consultancy', path: '/consultancy/login', label: 'Consultancy Desk', desc: 'Tickets & document vault for labour queries', icon: ChatCircleText },
];

export default function ModuleChooserPage() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FDFBF9] via-[#F9F6F0] to-[#FBE8D9] p-6" data-testid="module-chooser-page">
      <div className="max-w-4xl mx-auto pt-10">
        <a href="/" className="inline-flex items-center gap-1 text-xs text-[#A28B7A] hover:text-[#2A2624] mb-6"><ArrowLeft size={12} /> Back to home</a>
        <div className="flex items-center gap-3 mb-10">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#D96C5B] to-[#E8B25C] flex items-center justify-center shadow-lg"><Leaf size={22} color="white" weight="fill" /></div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#D96C5B] font-bold">Saffron Services</p>
            <h1 className="text-2xl font-semibold" style={{ fontFamily: 'Outfit' }}>Which module are you signing in to?</h1>
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {MODULES.map(m => {
            const I = m.icon;
            return (
              <button key={m.key} onClick={() => nav(m.path)} data-testid={`chooser-${m.key}`}
                className="group bg-white border border-[#E8E2D9] hover:border-[#D96C5B] rounded-2xl p-5 text-left transition hover:shadow-md hover:-translate-y-0.5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[#D96C5B]/10 group-hover:bg-[#D96C5B] flex items-center justify-center flex-shrink-0 transition">
                  <I size={22} className="text-[#D96C5B] group-hover:text-white transition" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#2A2624]">{m.label}</p>
                  <p className="text-xs text-[#6A625E]">{m.desc}</p>
                </div>
                <ArrowRight size={16} className="text-[#A28B7A] group-hover:text-[#D96C5B]" />
              </button>
            );
          })}
        </div>
        <p className="text-center text-xs text-[#A28B7A] mt-10">Don't have an account yet? <a href="/signup" className="text-[#D96C5B] font-semibold hover:underline">Start your free trial →</a></p>
      </div>
    </div>
  );
}
