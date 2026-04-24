import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Users, ShieldCheck, Scroll, CheckSquare, ChatCircleText, Leaf, ArrowRight, ArrowLeft,
} from '@phosphor-icons/react';

const MODULE_CONFIG = {
  hrms:          { label: 'HRMS',                 tagline: 'Pay & people, simplified',        icon: Users,          destination: '/dashboard',                theme: 'warm',  portal: 'HR Portal' },
  vendor_audit:  { label: 'Vendor Audit',         tagline: 'Virtual statutory auditor',       icon: ShieldCheck,    destination: '/vendor-audit/dashboard',   theme: 'dark',  portal: 'Auditor Portal' },
  register_maker:{ label: 'Register Maker',       tagline: 'Registers in 60 seconds',         icon: Scroll,         destination: '/register-maker/dashboard', theme: 'warm',  portal: 'Registers Portal' },
  internal_audit:{ label: 'Internal Audit',       tagline: 'Audit-ready, always',             icon: CheckSquare,    destination: '/internal-audit/dashboard', theme: 'dark',  portal: 'Internal Audit Portal' },
  consultancy:   { label: 'Consultancy Desk',     tagline: 'Experts on speed-dial',           icon: ChatCircleText, destination: '/consultancy/dashboard',    theme: 'warm',  portal: 'Consultancy Portal' },
};

export default function ModuleLoginPage({ moduleKey }) {
  const cfg = MODULE_CONFIG[moduleKey];
  const nav = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const r = await login(email, password, 'admin');
    setBusy(false);
    if (r.success) {
      // Optimistically jump to the module's destination; ProtectedRoute will gate if not subscribed
      window.location.href = cfg.destination;
    } else {
      toast.error(r.error || 'Login failed');
    }
  }

  const Icon = cfg.icon;
  const isDark = cfg.theme === 'dark';

  return (
    <div className={`min-h-screen flex items-center justify-center p-6 ${isDark ? 'bg-[#1A1715] text-white' : 'bg-gradient-to-br from-[#FDFBF9] via-[#F9F6F0] to-[#FBE8D9] text-[#2A2624]'}`} data-testid={`${moduleKey}-login-page`}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute -top-1/3 -right-1/4 w-[600px] h-[600px] rounded-full ${isDark ? 'bg-[#D96C5B]/10' : 'bg-[#D96C5B]/8'} blur-3xl`} />
        <div className={`absolute -bottom-1/3 -left-1/4 w-[500px] h-[500px] rounded-full ${isDark ? 'bg-[#E8B25C]/10' : 'bg-[#E8B25C]/8'} blur-3xl`} />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <a href="/" className={`inline-flex items-center gap-1 text-xs mb-6 ${isDark ? 'text-white/60 hover:text-white' : 'text-[#A28B7A] hover:text-[#2A2624]'}`}><ArrowLeft size={12} /> Back to Saffron</a>
        <div className="flex items-center gap-3 mb-10">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br from-[#D96C5B] to-[#E8B25C] flex items-center justify-center shadow-lg`}><Icon size={24} weight="bold" color="white" /></div>
          <div>
            <p className={`text-[10px] uppercase tracking-[0.2em] font-bold ${isDark ? 'text-[#D96C5B]' : 'text-[#D96C5B]'}`}>{cfg.portal}</p>
            <h1 className={`text-xl font-semibold`} style={{ fontFamily: 'Outfit' }}>{cfg.label}</h1>
            <p className={`text-[11px] ${isDark ? 'text-white/50' : 'text-[#A28B7A]'}`}>Part of Saffron Services · {cfg.tagline}</p>
          </div>
        </div>

        <div className={`rounded-2xl p-8 border shadow-xl ${isDark ? 'bg-[#2A2624] border-white/5' : 'bg-white border-[#E8E2D9]'}`}>
          <h2 className="text-2xl font-semibold mb-2" style={{ fontFamily: 'Outfit' }}>Sign in</h2>
          <p className={`text-sm mb-6 ${isDark ? 'text-white/60' : 'text-[#6A625E]'}`}>Welcome back. Sign in to access your {cfg.label} workspace.</p>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1"><Label className={`text-xs ${isDark ? 'text-white/70' : 'text-[#6A625E]'}`}>Work Email</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required data-testid={`${moduleKey}-email`}
                className={isDark ? 'bg-[#1A1715] border-white/10 text-white' : ''} /></div>
            <div className="space-y-1"><Label className={`text-xs ${isDark ? 'text-white/70' : 'text-[#6A625E]'}`}>Password</Label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required data-testid={`${moduleKey}-password`}
                className={isDark ? 'bg-[#1A1715] border-white/10 text-white' : ''} /></div>
            <Button type="submit" disabled={busy} className="w-full bg-[#D96C5B] hover:bg-[#C25949] h-11" data-testid={`${moduleKey}-submit`}>
              {busy ? 'Signing in...' : <>Sign In <ArrowRight size={14} className="ml-1" /></>}
            </Button>
          </form>
          <div className={`mt-6 pt-5 border-t ${isDark ? 'border-white/10' : 'border-[#E8E2D9]'} text-center`}>
            <p className={`text-xs ${isDark ? 'text-white/50' : 'text-[#A28B7A]'}`}>
              New to Saffron? <a href="/signup" className="text-[#D96C5B] hover:underline font-semibold">Start free trial</a>
            </p>
          </div>
        </div>

        <p className={`text-center text-[11px] mt-6 ${isDark ? 'text-white/30' : 'text-[#A28B7A]'}`}>
          Want a different module? <a href="/login" className="text-[#D96C5B] hover:underline">Choose module</a>
        </p>
      </div>
    </div>
  );
}
