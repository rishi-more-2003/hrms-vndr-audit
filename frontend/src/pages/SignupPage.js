import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { saasAPI } from '../services/api';
import { toast } from 'sonner';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Leaf, ArrowLeft, Check } from '@phosphor-icons/react';

const ALL_MODULES = [
  { key: 'hrms', label: 'HRMS' },
  { key: 'vendor_audit', label: 'Vendor Audit' },
  { key: 'register_maker', label: 'Register Maker' },
  { key: 'internal_audit', label: 'Internal Audit' },
  { key: 'consultancy', label: 'Consultancy Desk' },
];

const BUNDLES = {
  starter: ['hrms'],
  compliance: ['vendor_audit', 'register_maker', 'internal_audit'],
  complete: ['hrms', 'vendor_audit', 'register_maker', 'internal_audit', 'consultancy'],
};

export default function SignupPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const pre = params.get('bundle');
  const initial = pre && BUNDLES[pre] ? BUNDLES[pre] : BUNDLES.complete;

  const [form, setForm] = useState({
    company_name: '', admin_name: '', admin_email: '', password: '',
    phone: '', industry: 'IT Services', size: '1-10',
  });
  const [selected, setSelected] = useState(new Set(initial));
  const [busy, setBusy] = useState(false);

  function toggle(k) {
    const s = new Set(selected); s.has(k) ? s.delete(k) : s.add(k); setSelected(s);
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.company_name || !form.admin_name || !form.admin_email || form.password.length < 8) {
      toast.error('Please fill all fields (password min 8 chars)'); return;
    }
    if (selected.size === 0) { toast.error('Pick at least one module'); return; }
    setBusy(true);
    try {
      const r = await saasAPI.signup({ ...form, selected_modules: Array.from(selected) });
      localStorage.setItem('token', r.data.access_token);
      localStorage.setItem('auth_role', 'admin');
      axios.defaults.headers.common['Authorization'] = `Bearer ${r.data.access_token}`;
      toast.success('Welcome aboard! Your 14-day trial has started.');
      // Redirect to first enabled module
      const first = Array.from(selected)[0];
      const map = { hrms: '/dashboard', vendor_audit: '/vendor-audit', register_maker: '/register-maker', internal_audit: '/internal-audit', consultancy: '/consultancy' };
      // Force full page reload so AuthContext picks up token cleanly
      window.location.href = map[first] || '/dashboard';
    } catch (err) { toast.error(err.response?.data?.detail || 'Signup failed'); }
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-[#FDFBF9]" data-testid="signup-page">
      <nav className="border-b border-[#E8E2D9] bg-white/80 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#D96C5B] to-[#E8B25C] flex items-center justify-center"><Leaf size={16} color="white" weight="fill" /></div>
            <p className="text-sm font-bold" style={{ fontFamily: 'Outfit' }}>Saffron Services</p>
          </a>
          <Button variant="ghost" size="sm" onClick={() => nav('/')}><ArrowLeft size={14} className="mr-1" /> Back</Button>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-12 grid md:grid-cols-5 gap-10">
        <div className="md:col-span-3">
          <p className="text-xs uppercase tracking-[0.14em] text-[#D96C5B] font-semibold">Start free trial</p>
          <h1 className="text-3xl md:text-4xl font-semibold mt-1" style={{ fontFamily: 'Outfit' }}>Set up your organization</h1>
          <p className="text-sm text-[#6A625E] mt-2">14 days free. No card needed. Pick the modules you want — you can change them later.</p>

          <form onSubmit={submit} className="mt-6 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Fld label="Company Name *"><Input value={form.company_name} onChange={e => setForm({...form, company_name: e.target.value})} data-testid="su-company" required /></Fld>
              <Fld label="Phone"><Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></Fld>
              <Fld label="Your Name *"><Input value={form.admin_name} onChange={e => setForm({...form, admin_name: e.target.value})} data-testid="su-name" required /></Fld>
              <Fld label="Work Email *"><Input type="email" value={form.admin_email} onChange={e => setForm({...form, admin_email: e.target.value})} data-testid="su-email" required /></Fld>
              <Fld label="Password * (min 8)"><Input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} data-testid="su-password" required /></Fld>
              <Fld label="Team size">
                <select value={form.size} onChange={e => setForm({...form, size: e.target.value})} className="h-9 w-full rounded-md border border-[#E8E2D9] bg-white px-3 text-sm">
                  <option>1-10</option><option>10-50</option><option>50-200</option><option>200-1000</option><option>1000+</option>
                </select>
              </Fld>
            </div>

            <div className="pt-4">
              <p className="text-xs font-bold uppercase text-[#2A2624] mb-2">Select modules (trial includes all selected)</p>
              <div className="grid grid-cols-2 gap-2">
                {ALL_MODULES.map(m => (
                  <label key={m.key} data-testid={`su-module-${m.key}`} className={`cursor-pointer flex items-center gap-2 p-3 rounded-lg border-2 transition ${selected.has(m.key) ? 'border-[#D96C5B] bg-[#D96C5B]/5' : 'border-[#E8E2D9] bg-white'}`}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${selected.has(m.key) ? 'border-[#D96C5B] bg-[#D96C5B]' : 'border-[#E8E2D9]'}`}>
                      {selected.has(m.key) && <Check size={12} color="white" weight="bold" />}
                    </div>
                    <input type="checkbox" className="sr-only" checked={selected.has(m.key)} onChange={() => toggle(m.key)} />
                    <span className="text-sm font-medium">{m.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <Button type="submit" disabled={busy} className="w-full bg-[#D96C5B] hover:bg-[#C25949] h-11 mt-4" data-testid="su-submit">
              {busy ? 'Setting up...' : 'Create Organization & Start Trial'}
            </Button>
            <p className="text-[11px] text-[#A28B7A] text-center">Already have an account? <a href="/login" className="text-[#D96C5B] hover:underline">Sign in</a></p>
          </form>
        </div>

        <aside className="md:col-span-2">
          <div className="bg-gradient-to-br from-[#2A2624] to-[#3B3432] text-white rounded-2xl p-6 sticky top-6">
            <p className="text-xs uppercase tracking-widest text-[#D96C5B] font-semibold">What you get</p>
            <h3 className="text-xl font-semibold mt-1" style={{ fontFamily: 'Outfit' }}>Full access for 14 days</h3>
            <ul className="mt-5 space-y-2 text-sm text-white/80">
              <Li>All selected modules</Li>
              <Li>Unlimited employees</Li>
              <Li>Unlimited audits</Li>
              <Li>PDF / Excel exports</Li>
              <Li>Cancel anytime</Li>
              <Li>Priority email support</Li>
            </ul>
            <div className="mt-6 bg-white/5 rounded-lg p-3 text-xs text-white/60">
              After trial: pay monthly per module. Bundle discounts apply automatically.
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

function Fld({ label, children }) {
  return <div className="space-y-1"><Label className="text-xs text-[#6A625E]">{label}</Label>{children}</div>;
}
function Li({ children }) {
  return <li className="flex items-center gap-2"><Check size={14} weight="bold" className="text-[#7D9D85] flex-shrink-0" /> {children}</li>;
}
