import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { saasAPI } from '../services/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Users, ShieldCheck, Scroll, CheckSquare, ChatCircleText, ArrowRight, Check,
  Leaf, Certificate, Buildings, Lightning,
} from '@phosphor-icons/react';

const ICONS = { Users, ShieldCheck, Scroll, CheckSquare, ChatCircleText };

export default function LandingPage() {
  const nav = useNavigate();
  const [meta, setMeta] = useState(null);
  const [contact, setContact] = useState({ name: '', email: '', phone: '', company: '', message: '', interested_modules: [] });
  const [contactBusy, setContactBusy] = useState(false);

  useEffect(() => { saasAPI.getMeta().then(r => setMeta(r.data)).catch(() => {}); }, []);

  async function submitContact(e) {
    e.preventDefault();
    if (!contact.name || !contact.email || !contact.message) { toast.error('Name, email, and message are required'); return; }
    setContactBusy(true);
    try {
      await saasAPI.submitContact(contact);
      toast.success("Got it! We'll reach out within one business day.");
      setContact({ name: '', email: '', phone: '', company: '', message: '', interested_modules: [] });
    } catch (err) { toast.error('Submission failed — please try again'); }
    setContactBusy(false);
  }

  const modules = meta?.modules || [];
  const bundles = meta?.bundles || [];

  return (
    <div className="min-h-screen bg-[#FDFBF9] text-[#2A2624]" data-testid="landing-page">
      {/* ═════ NAV ═════ */}
      <nav className="sticky top-0 z-50 backdrop-blur-lg bg-[#FDFBF9]/85 border-b border-[#E8E2D9]">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <a href="#hero" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#D96C5B] to-[#E8B25C] flex items-center justify-center">
              <Leaf size={18} color="white" weight="fill" />
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>Saffron Services</p>
              <p className="text-[9px] uppercase tracking-[0.14em] text-[#A28B7A]">Labour-law compliance</p>
            </div>
          </a>
          <div className="hidden md:flex items-center gap-6 text-sm text-[#6A625E]">
            <a href="#modules" className="hover:text-[#D96C5B]">Modules</a>
            <a href="#pricing" className="hover:text-[#D96C5B]">Pricing</a>
            <a href="#about" className="hover:text-[#D96C5B]">About</a>
            <a href="#contact" className="hover:text-[#D96C5B]">Contact</a>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => nav('/login')} data-testid="nav-login-btn">Sign in</Button>
            <Button size="sm" onClick={() => nav('/signup')} className="bg-[#D96C5B] hover:bg-[#C25949]" data-testid="nav-signup-btn">Start Free Trial</Button>
          </div>
        </div>
      </nav>

      {/* ═════ HERO ═════ */}
      <section id="hero" className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-1/3 -right-1/4 w-[700px] h-[700px] rounded-full bg-[#D96C5B]/8 blur-3xl" />
          <div className="absolute top-1/3 -left-1/4 w-[500px] h-[500px] rounded-full bg-[#E8B25C]/8 blur-3xl" />
        </div>
        <div className="relative max-w-6xl mx-auto px-6 py-24 md:py-32 text-center">
          <div className="inline-flex items-center gap-2 bg-[#D96C5B]/10 rounded-full px-3 py-1 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D96C5B] animate-pulse" />
            <span className="text-xs text-[#D96C5B] font-semibold tracking-wide uppercase">Built by labour-law consultants</span>
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.05]" style={{ fontFamily: 'Outfit' }}>
            India's unified <span className="text-[#D96C5B]">labour-law</span><br />compliance platform
          </h1>
          <p className="text-lg text-[#6A625E] mt-6 max-w-2xl mx-auto">
            From payroll to vendor audits to statutory registers — one platform, five modules, built for Indian labour laws. Bundle what you need.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-10">
            <Button size="lg" onClick={() => nav('/signup')} className="bg-[#D96C5B] hover:bg-[#C25949] h-12 px-6" data-testid="hero-signup-btn">
              Start 14-day Free Trial <ArrowRight size={16} className="ml-2" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => document.getElementById('modules').scrollIntoView({ behavior: 'smooth' })} className="h-12 px-6">
              Explore Modules
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-6 mt-10 text-xs text-[#A28B7A]">
            <span className="flex items-center gap-1.5"><Check size={14} weight="bold" className="text-[#7D9D85]" /> No credit card</span>
            <span className="flex items-center gap-1.5"><Check size={14} weight="bold" className="text-[#7D9D85]" /> PF / ESIC / PT / MLWF ready</span>
            <span className="flex items-center gap-1.5"><Check size={14} weight="bold" className="text-[#7D9D85]" /> 100% employee-level audit</span>
          </div>
        </div>
      </section>

      {/* ═════ STATS BAR ═════ */}
      <section className="bg-[#2A2624] text-white py-8">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <Stat value="5" label="Integrated Modules" />
          <Stat value="100+" label="Compliance Rules" />
          <Stat value="7" label="Govt PDFs Parsed" />
          <Stat value="₹199/mo" label="Starting Price" />
        </div>
      </section>

      {/* ═════ MODULES ═════ */}
      <section id="modules" className="max-w-6xl mx-auto px-6 py-24">
        <SectionHeader eyebrow="THE PLATFORM" title="Five modules, one login" sub="Each module stands alone. Bundle multiple modules and they share employee data, audit context, and consultant access — seamlessly." />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mt-12">
          {modules.map((m, i) => {
            const Icon = ICONS[m.icon] || Users;
            return (
              <div key={m.key} data-testid={`module-card-${m.key}`} className="group bg-white border border-[#E8E2D9] hover:border-[#D96C5B] rounded-2xl p-6 transition-all hover:shadow-lg hover:-translate-y-0.5" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="w-11 h-11 rounded-xl bg-[#D96C5B]/10 flex items-center justify-center mb-4 group-hover:bg-[#D96C5B] transition-colors">
                  <Icon size={22} className="text-[#D96C5B] group-hover:text-white transition-colors" />
                </div>
                <p className="text-[10px] uppercase tracking-[0.14em] text-[#A28B7A] font-semibold">{m.tagline}</p>
                <h3 className="text-xl font-semibold text-[#2A2624] mt-1" style={{ fontFamily: 'Outfit' }}>{m.label}</h3>
                <p className="text-sm text-[#6A625E] mt-2 leading-relaxed">{m.description}</p>
                <div className="flex items-center justify-between mt-5 pt-4 border-t border-[#E8E2D9]">
                  <span className="text-sm font-bold text-[#2A2624]">₹{m.price_monthly}<span className="text-xs text-[#A28B7A] font-normal">/mo</span></span>
                  <a href={`/${m.key.replace('_','-')}/login`} className="text-xs font-semibold text-[#D96C5B] hover:underline flex items-center gap-1" data-testid={`module-login-link-${m.key}`}>Open portal <ArrowRight size={12} /></a>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═════ PRICING ═════ */}
      <section id="pricing" className="bg-gradient-to-b from-[#FDFBF9] to-[#F9F6F0] py-24">
        <div className="max-w-6xl mx-auto px-6">
          <SectionHeader eyebrow="PRICING" title="Pick modules or bundle & save" sub="Transparent monthly pricing per module. Bundle discounts scale with you." />
          <div className="grid md:grid-cols-3 gap-4 mt-12">
            {bundles.map(b => (
              <div key={b.key} data-testid={`bundle-${b.key}`} className={`relative bg-white rounded-2xl p-7 border-2 ${b.featured ? 'border-[#D96C5B] shadow-xl' : 'border-[#E8E2D9]'}`}>
                {b.featured && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#D96C5B] text-white text-[10px] font-bold uppercase px-3 py-1 rounded-full tracking-wider">Most popular</span>}
                <h3 className="text-lg font-semibold" style={{ fontFamily: 'Outfit' }}>{b.label}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-[#2A2624]">₹{b.price_monthly}</span>
                  <span className="text-sm text-[#A28B7A]">/month</span>
                </div>
                {b.save > 0 && <p className="text-xs text-[#7D9D85] font-semibold mt-1">Save ₹{b.save}/mo vs individual</p>}
                <ul className="mt-6 space-y-2">
                  {b.modules.map(mk => {
                    const m = modules.find(x => x.key === mk);
                    return <li key={mk} className="flex items-center gap-2 text-sm text-[#2A2624]"><Check size={14} weight="bold" className="text-[#7D9D85] flex-shrink-0" /> {m?.label || mk}</li>;
                  })}
                </ul>
                <Button onClick={() => nav('/signup?bundle=' + b.key)} className={`mt-6 w-full ${b.featured ? 'bg-[#D96C5B] hover:bg-[#C25949]' : 'bg-[#2A2624] hover:bg-[#3B3432]'}`} data-testid={`bundle-cta-${b.key}`}>Start Free Trial</Button>
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-[#A28B7A] mt-8">All plans include 14-day free trial · No credit card required · Cancel anytime</p>
        </div>
      </section>

      {/* ═════ WHY US ═════ */}
      <section id="about" className="max-w-6xl mx-auto px-6 py-24">
        <SectionHeader eyebrow="WHY SAFFRON" title="Consultants. Coders. One platform." sub="We're labour-law consultants who got tired of juggling spreadsheets. So we built this." />
        <div className="grid md:grid-cols-3 gap-4 mt-12">
          {[
            { icon: Certificate, t: 'Built by experts', d: "Every rule, every slab, every register format is vetted by practicing labour-law consultants — not generic payroll engineers." },
            { icon: Lightning, t: 'Employee-level audit', d: "We don't just check totals. Every single employee row is validated against PF, ESIC, PT, Min Wages & Structure rules." },
            { icon: Buildings, t: 'Enterprise-grade, SMB pricing', d: "Multi-tenant, SOC-grade security, govt-portal PDF parsing — starting at ₹199/month per module." },
          ].map(({ icon: I, t, d }) => (
            <div key={t} className="bg-white border border-[#E8E2D9] rounded-2xl p-6">
              <I size={28} className="text-[#D96C5B]" />
              <h3 className="text-lg font-semibold mt-3" style={{ fontFamily: 'Outfit' }}>{t}</h3>
              <p className="text-sm text-[#6A625E] mt-2 leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═════ CONTACT ═════ */}
      <section id="contact" className="bg-[#2A2624] text-white py-24">
        <div className="max-w-4xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-start">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[#D96C5B] font-semibold">Get in touch</p>
            <h2 className="text-4xl font-semibold mt-2" style={{ fontFamily: 'Outfit' }}>Need a custom plan or have a question?</h2>
            <p className="text-white/60 mt-4">Tell us about your compliance needs. We'll design a bundle that fits your business — or just answer your questions.</p>
            <div className="mt-8 space-y-2 text-sm text-white/70">
              <p><b>Email:</b> hello@saffronservices.in</p>
              <p><b>Response time:</b> Within 1 business day</p>
            </div>
          </div>
          <form onSubmit={submitContact} className="bg-[#3B3432] rounded-2xl p-6 space-y-3" data-testid="contact-form">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name *"><Input value={contact.name} onChange={e => setContact({...contact, name: e.target.value})} className="bg-[#1A1715] border-white/10 text-white" required data-testid="contact-name" /></Field>
              <Field label="Email *"><Input type="email" value={contact.email} onChange={e => setContact({...contact, email: e.target.value})} className="bg-[#1A1715] border-white/10 text-white" required data-testid="contact-email" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone"><Input value={contact.phone} onChange={e => setContact({...contact, phone: e.target.value})} className="bg-[#1A1715] border-white/10 text-white" /></Field>
              <Field label="Company"><Input value={contact.company} onChange={e => setContact({...contact, company: e.target.value})} className="bg-[#1A1715] border-white/10 text-white" /></Field>
            </div>
            <Field label="Message *"><Textarea rows={4} value={contact.message} onChange={e => setContact({...contact, message: e.target.value})} className="bg-[#1A1715] border-white/10 text-white" required data-testid="contact-message" /></Field>
            <Button type="submit" disabled={contactBusy} className="w-full bg-[#D96C5B] hover:bg-[#C25949]" data-testid="contact-submit">{contactBusy ? 'Sending...' : 'Send message'}</Button>
          </form>
        </div>
      </section>

      {/* ═════ FOOTER ═════ */}
      <footer className="bg-[#1A1715] text-white/60 py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#D96C5B] to-[#E8B25C] flex items-center justify-center"><Leaf size={14} color="white" weight="fill" /></div>
            <p className="text-sm text-white">Saffron Services</p>
          </div>
          <p className="text-xs">© 2026 Saffron Services · India's unified labour-law compliance platform</p>
          <div className="flex gap-4 text-xs">
            <a href="/platform-admin/login" className="hover:text-white/90">Platform Admin</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Stat({ value, label }) {
  return <div><p className="text-3xl md:text-4xl font-bold" style={{ fontFamily: 'Outfit' }}>{value}</p><p className="text-xs text-white/60 mt-1 uppercase tracking-wider">{label}</p></div>;
}

function SectionHeader({ eyebrow, title, sub }) {
  return (
    <div className="text-center max-w-2xl mx-auto">
      <p className="text-xs uppercase tracking-[0.14em] text-[#D96C5B] font-semibold">{eyebrow}</p>
      <h2 className="text-3xl md:text-5xl font-semibold mt-2 leading-tight" style={{ fontFamily: 'Outfit' }}>{title}</h2>
      <p className="text-[#6A625E] mt-4">{sub}</p>
    </div>
  );
}

function Field({ label, children }) {
  return <div className="space-y-1"><Label className="text-xs text-white/70">{label}</Label>{children}</div>;
}
