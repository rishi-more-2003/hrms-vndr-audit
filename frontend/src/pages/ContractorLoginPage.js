import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ShieldCheck, Lock, ArrowRight } from '@phosphor-icons/react';

export default function ContractorLoginPage() {
  const nav = useNavigate();
  const { contractorLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const r = await contractorLogin(email, password);
    setBusy(false);
    if (r.success) {
      toast.success('Signed in');
      if (r.must_change_password) {
        toast.warning('Please change your password');
        nav('/contractor/change-password');
      } else {
        nav('/contractor/dashboard');
      }
    } else {
      toast.error(r.error || 'Login failed');
    }
  }

  return (
    <div className="min-h-screen bg-[#1A1715] text-white flex items-center justify-center p-6" data-testid="contractor-login-page">
      {/* Background accent */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/4 -right-1/4 w-[600px] h-[600px] rounded-full bg-[#D96C5B]/10 blur-3xl" />
        <div className="absolute -bottom-1/4 -left-1/4 w-[500px] h-[500px] rounded-full bg-[#7D9D85]/10 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-11 h-11 rounded-xl bg-[#D96C5B] flex items-center justify-center">
            <ShieldCheck size={24} weight="bold" color="white" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#D96C5B] font-bold">Contractor Portal</p>
            <h1 className="text-xl font-semibold" style={{ fontFamily: 'Outfit' }}>Vendor Audit</h1>
          </div>
        </div>

        <div className="bg-[#2A2624] rounded-2xl p-8 border border-white/5 shadow-2xl">
          <h2 className="text-2xl font-semibold mb-2" style={{ fontFamily: 'Outfit' }}>Sign in to your audit portal</h2>
          <p className="text-sm text-white/60 mb-6">Upload your monthly payroll and statutory documents for automated compliance audit.</p>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1"><Label className="text-xs text-white/70">Email</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required data-testid="contractor-email-input"
                className="bg-[#1A1715] border-white/10 text-white placeholder:text-white/30" placeholder="you@contractor.com" /></div>
            <div className="space-y-1"><Label className="text-xs text-white/70">Password</Label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required data-testid="contractor-password-input"
                className="bg-[#1A1715] border-white/10 text-white placeholder:text-white/30" /></div>
            <Button type="submit" disabled={busy} className="w-full bg-[#D96C5B] hover:bg-[#C25949] text-white h-11" data-testid="contractor-login-submit">
              {busy ? 'Signing in...' : <>Sign In <ArrowRight size={16} className="ml-1" /></>}
            </Button>
          </form>

          <div className="mt-6 flex items-center gap-2 text-xs text-white/40">
            <Lock size={12} /> <span>Credentials issued by the principal employer. Contact your HR team if you can't access your account.</span>
          </div>
        </div>

        <p className="text-center text-xs text-white/30 mt-6">
          Principal employer? <button onClick={() => nav('/auth')} className="text-[#D96C5B] hover:underline">Go to HRMS login</button>
        </p>
      </div>
    </div>
  );
}
