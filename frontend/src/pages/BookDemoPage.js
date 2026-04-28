import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  CalendarBlank, Clock, CheckCircle, ArrowLeft, Leaf, Phone, EnvelopeSimple,
  Buildings, Sparkle, ShieldCheck,
} from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

const MODULES = [
  { key: 'hrms', label: 'HRMS' },
  { key: 'vendor_audit', label: 'Vendor Labour Audit' },
  { key: 'register_maker', label: 'Register Maker' },
  { key: 'internal_audit', label: 'Internal Labour Audit' },
  { key: 'consultancy', label: 'Consultancy' },
];

const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '500+'];
const INDUSTRIES = ['Manufacturing', 'IT / ITES', 'Retail', 'Logistics', 'Construction',
  'Healthcare', 'BFSI', 'Hospitality', 'BPO / KPO', 'Other'];
const SOURCES = ['Google Search', 'LinkedIn', 'Referral', 'Industry event', 'Other'];

// Build the next 30 days for the calendar (skip Sundays).
function generateDates() {
  const out = [];
  const today = new Date();
  for (let i = 0; i <= 29; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push(d);
  }
  return out;
}

function fmtIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(d) {
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function BookDemoPage() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    name: '', email: '', phone: '', company: '', designation: '',
    company_size: '', industry: '', interested_modules: [],
    request_type: 'demo', notes: '', referral_source: '',
  });
  const [pickedDate, setPickedDate] = useState(null); // ISO yyyy-mm-dd
  const [pickedSlot, setPickedSlot] = useState('');
  const [slotsByDate, setSlotsByDate] = useState({}); // cache: { iso: [slots] }
  const [confirmed, setConfirmed] = useState(null);    // {id, message} after success
  const [busy, setBusy] = useState(false);

  const dates = useMemo(() => generateDates(), []);

  // When user picks a date, fetch availability
  useEffect(() => {
    if (!pickedDate) return;
    if (slotsByDate[pickedDate]) return;
    axios.get(`${API}/saas/demo-request/availability?date=${pickedDate}`)
      .then(r => setSlotsByDate(s => ({ ...s, [pickedDate]: r.data.slots || [] })))
      .catch(() => setSlotsByDate(s => ({ ...s, [pickedDate]: [] })));
  }, [pickedDate, slotsByDate]);

  function toggleModule(key) {
    setForm(f => ({
      ...f,
      interested_modules: f.interested_modules.includes(key)
        ? f.interested_modules.filter(x => x !== key)
        : [...f.interested_modules, key],
    }));
  }

  function validate() {
    if (!form.name.trim()) return 'Please enter your name';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Please enter a valid email';
    if (!form.phone.trim()) return 'Please enter your phone';
    if (!form.company.trim()) return 'Please enter your company';
    if (!pickedDate) return 'Please pick a preferred date';
    if (!pickedSlot) return 'Please pick a time slot';
    return null;
  }

  async function submit() {
    const err = validate();
    if (err) { toast.error(err); return; }
    setBusy(true);
    try {
      const r = await axios.post(`${API}/saas/demo-request`, {
        ...form,
        preferred_date: pickedDate,
        preferred_slot: pickedSlot,
      });
      setConfirmed({ id: r.data.id, message: r.data.message });
      toast.success('Booked!');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Could not submit — please try again');
    }
    setBusy(false);
  }

  if (confirmed) {
    return (
      <div className="min-h-screen bg-[#FDFBF9] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white border border-[#E8E2D9] rounded-2xl p-8 text-center" data-testid="demo-confirmed">
          <div className="w-16 h-16 rounded-full bg-[#7D9D85]/15 flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={28} className="text-[#7D9D85]" weight="fill" />
          </div>
          <h1 className="text-2xl font-semibold text-[#2A2624] mb-2" style={{ fontFamily: 'Outfit' }}>You're booked!</h1>
          <p className="text-sm text-[#6A625E] mb-4">{confirmed.message}</p>
          <p className="text-xs text-[#A28B7A] mb-6">A calendar invite + meeting link will land in your inbox shortly. Booking ID: <span className="font-mono">{confirmed.id?.slice(0, 8)}</span></p>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => nav('/')} variant="outline" data-testid="back-home-btn"><ArrowLeft size={14} className="mr-1" /> Back to home</Button>
            <Button onClick={() => { setConfirmed(null); setPickedDate(null); setPickedSlot(''); }} className="bg-[#D96C5B] hover:bg-[#C25949]">Book another</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF9]" data-testid="book-demo-page">
      {/* Top bar */}
      <header className="bg-white border-b border-[#E8E2D9]">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#D96C5B] to-[#E8B25C] flex items-center justify-center">
              <Leaf size={16} weight="fill" color="white" />
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-[0.18em] text-[#A28B7A] font-bold">Saffron Services</p>
              <p className="text-base font-bold" style={{ fontFamily: 'Outfit' }}>Book a demo</p>
            </div>
          </Link>
          <Link to="/" className="text-xs text-[#6A625E] hover:text-[#2A2624]">← Back to website</Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 grid lg:grid-cols-5 gap-8">
        {/* LEFT: pitch + benefits */}
        <aside className="lg:col-span-2 space-y-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-[#D96C5B]">Talk to us</p>
            <h1 className="text-3xl md:text-4xl font-semibold text-[#2A2624] mt-1" style={{ fontFamily: 'Outfit' }}>
              See Saffron in action — on your data, in 30 minutes.
            </h1>
            <p className="text-sm text-[#6A625E] mt-3">
              Our compliance specialist will walk you through the modules you care about, run a sample audit on your real (or sample) data, and answer every question — pricing, integrations, AI training, deployment, anything.
            </p>
          </div>
          <div className="space-y-3">
            {[
              { icon: Sparkle, title: 'AI-powered demo', text: 'Upload one of your statutory documents during the call — we\'ll show real-time extraction live.' },
              { icon: ShieldCheck, title: 'No sales pressure', text: 'A working session, not a pitch. If we\'re not the right fit, we\'ll tell you.' },
              { icon: Clock, title: '30 minutes', text: 'Mon–Fri 10am–6pm IST · Saturday 10am–2pm. We will send a Google Meet link.' },
            ].map((b, i) => {
              const Icon = b.icon;
              return (
                <div key={i} className="flex items-start gap-3 bg-white border border-[#E8E2D9] rounded-xl p-3">
                  <div className="w-9 h-9 rounded-lg bg-[#D96C5B]/10 flex items-center justify-center flex-shrink-0">
                    <Icon size={16} className="text-[#D96C5B]" weight="fill" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#2A2624]">{b.title}</p>
                    <p className="text-xs text-[#6A625E]">{b.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="bg-[#FBE8D9]/40 border border-[#E8B25C]/30 rounded-xl p-4 text-xs text-[#6A625E]">
            <p className="font-bold text-[#2A2624] mb-1">Or reach us directly</p>
            <p className="flex items-center gap-1.5"><EnvelopeSimple size={12} /> hello@saffronservices.in</p>
            <p className="flex items-center gap-1.5"><Phone size={12} /> +91 99999 99999</p>
          </div>
        </aside>

        {/* RIGHT: form + calendar */}
        <section className="lg:col-span-3 space-y-5 bg-white border border-[#E8E2D9] rounded-2xl p-6">
          {/* Step 1 — your details */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#A28B7A] font-bold">Step 1 of 3 · About you</p>
            <h2 className="text-xl font-semibold text-[#2A2624] mt-1 mb-3" style={{ fontFamily: 'Outfit' }}>Tell us a bit about you</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Full name *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Rohan Mehta" data-testid="bd-name" />
              </div>
              <div>
                <Label className="text-xs">Designation</Label>
                <Input value={form.designation} onChange={e => setForm({ ...form, designation: e.target.value })} placeholder="HR Head / Compliance Manager" data-testid="bd-designation" />
              </div>
              <div>
                <Label className="text-xs">Work email *</Label>
                <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="rohan@company.com" data-testid="bd-email" />
              </div>
              <div>
                <Label className="text-xs">Phone *</Label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+91 98xxxxxxxx" data-testid="bd-phone" />
              </div>
              <div>
                <Label className="text-xs flex items-center gap-1"><Buildings size={12} /> Company *</Label>
                <Input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Acme Pvt Ltd" data-testid="bd-company" />
              </div>
              <div>
                <Label className="text-xs">Company size</Label>
                <Select value={form.company_size} onValueChange={v => setForm({ ...form, company_size: v })}>
                  <SelectTrigger className="h-9" data-testid="bd-company-size"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{COMPANY_SIZES.map(s => <SelectItem key={s} value={s}>{s} employees</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Industry</Label>
                <Select value={form.industry} onValueChange={v => setForm({ ...form, industry: v })}>
                  <SelectTrigger className="h-9" data-testid="bd-industry"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{INDUSTRIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">How did you hear about us?</Label>
                <Select value={form.referral_source} onValueChange={v => setForm({ ...form, referral_source: v })}>
                  <SelectTrigger className="h-9" data-testid="bd-source"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Step 2 — interest */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#A28B7A] font-bold">Step 2 of 3 · Your interest</p>
            <h2 className="text-xl font-semibold text-[#2A2624] mt-1 mb-3" style={{ fontFamily: 'Outfit' }}>What can we show you?</h2>

            <div className="flex gap-2 mb-3">
              {[
                { v: 'demo', label: 'Product demo' },
                { v: 'consultancy', label: 'Consultancy call' },
              ].map(opt => (
                <button
                  key={opt.v}
                  onClick={() => setForm({ ...form, request_type: opt.v })}
                  data-testid={`bd-rtype-${opt.v}`}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm transition border ${
                    form.request_type === opt.v
                      ? 'border-[#D96C5B] bg-[#D96C5B]/10 text-[#A0532E] font-semibold'
                      : 'border-[#E8E2D9] text-[#6A625E] hover:bg-[#F9F6F0]'
                  }`}
                >{opt.label}</button>
              ))}
            </div>

            <Label className="text-xs">Modules you're interested in (pick any)</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1.5">
              {MODULES.map(m => {
                const active = form.interested_modules.includes(m.key);
                return (
                  <button
                    key={m.key}
                    onClick={() => toggleModule(m.key)}
                    data-testid={`bd-module-${m.key}`}
                    className={`text-xs px-2.5 py-2 rounded-lg border transition text-left ${
                      active ? 'border-[#D96C5B] bg-[#D96C5B]/5 text-[#A0532E]' : 'border-[#E8E2D9] text-[#6A625E] hover:bg-[#F9F6F0]'
                    }`}
                  >
                    {active ? '✓ ' : ''}{m.label}
                  </button>
                );
              })}
            </div>

            <Label className="text-xs mt-3 block">Anything specific you want to focus on?</Label>
            <Textarea
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={3}
              placeholder="e.g. We have 12 contractors and want to automate monthly compliance audits. Currently using Excel + emails."
              data-testid="bd-notes"
            />
          </div>

          {/* Step 3 — calendar */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#A28B7A] font-bold">Step 3 of 3 · Pick a slot</p>
            <h2 className="text-xl font-semibold text-[#2A2624] mt-1 mb-1" style={{ fontFamily: 'Outfit' }}>When works for you?</h2>
            <p className="text-[11px] text-[#A28B7A] mb-3 flex items-center gap-1"><CalendarBlank size={12} /> All times in IST · 30-minute slot</p>

            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-1.5" data-testid="bd-calendar">
              {dates.map(d => {
                const iso = fmtIso(d);
                const isSunday = d.getDay() === 0;
                const active = pickedDate === iso;
                return (
                  <button
                    key={iso}
                    disabled={isSunday}
                    onClick={() => { setPickedDate(iso); setPickedSlot(''); }}
                    data-testid={`bd-date-${iso}`}
                    className={`p-1.5 rounded-lg text-center text-xs border transition ${
                      isSunday ? 'border-transparent text-[#D9CFC4] cursor-not-allowed line-through' :
                      active ? 'border-[#D96C5B] bg-[#D96C5B] text-white font-bold' :
                      'border-[#E8E2D9] hover:bg-[#F9F6F0]'
                    }`}
                  >
                    <div className="text-[9px] uppercase opacity-75">{d.toLocaleDateString('en-IN', { weekday: 'short' })}</div>
                    <div className="font-bold text-sm">{d.getDate()}</div>
                    <div className="text-[9px] opacity-75">{d.toLocaleDateString('en-IN', { month: 'short' })}</div>
                  </button>
                );
              })}
            </div>

            {pickedDate && (
              <div className="mt-4">
                <p className="text-xs font-bold text-[#2A2624] mb-2">Available slots — {fmtDate(new Date(pickedDate))}</p>
                {!(pickedDate in slotsByDate) ? (
                  <p className="text-[11px] text-[#A28B7A]">Loading slots…</p>
                ) : slotsByDate[pickedDate].length === 0 ? (
                  <p className="text-[11px] text-[#D96C5B]">No slots available on this day. Please pick another date.</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5" data-testid="bd-slots">
                    {slotsByDate[pickedDate].map(slot => (
                      <button
                        key={slot}
                        onClick={() => setPickedSlot(slot)}
                        data-testid={`bd-slot-${slot}`}
                        className={`px-2 py-1.5 rounded-lg text-xs border transition ${
                          pickedSlot === slot ? 'border-[#D96C5B] bg-[#D96C5B] text-white font-bold' : 'border-[#E8E2D9] hover:bg-[#F9F6F0]'
                        }`}
                      >{slot}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="pt-2 border-t border-[#E8E2D9] flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] text-[#A28B7A]">By submitting, you agree to our terms. We'll never spam you.</p>
            <Button
              onClick={submit}
              disabled={busy}
              size="lg"
              className="bg-[#D96C5B] hover:bg-[#C25949] disabled:opacity-50"
              data-testid="bd-submit"
            >
              {busy ? 'Booking…' : pickedDate && pickedSlot ? `Book for ${fmtDate(new Date(pickedDate))} at ${pickedSlot}` : 'Complete the form to book'}
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#E8E2D9] bg-white mt-16">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-[#A28B7A]">
          <p>© 2026 Saffron Services</p>
          <Link to="/" className="hover:text-[#2A2624]">Back to home →</Link>
        </div>
      </footer>
    </div>
  );
}
