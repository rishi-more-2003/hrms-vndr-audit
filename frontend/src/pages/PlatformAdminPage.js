import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { platformAdminAPI } from '../services/api';
import { toast } from 'sonner';
import axios from 'axios';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Switch } from '../components/ui/switch';
import { Leaf, SignOut, Buildings, Users, Envelope, Rocket, Check } from '@phosphor-icons/react';

export function PlatformAdminLoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState('founder@saffronservices.in');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await platformAdminAPI.login(email, password);
      localStorage.setItem('token', r.data.access_token);
      localStorage.setItem('auth_role', 'platform_admin');
      axios.defaults.headers.common['Authorization'] = `Bearer ${r.data.access_token}`;
      toast.success('Welcome, founder');
      window.location.href = '/platform-admin';
    } catch (e) { toast.error(e.response?.data?.detail || 'Login failed'); }
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-[#1A1715] text-white flex items-center justify-center p-6" data-testid="platform-admin-login">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#D96C5B] to-[#E8B25C] flex items-center justify-center"><Leaf size={20} weight="fill" color="white" /></div>
          <div><p className="text-[10px] uppercase tracking-[0.2em] text-[#D96C5B] font-bold">Platform Admin</p>
            <h1 className="text-xl font-semibold" style={{ fontFamily: 'Outfit' }}>Saffron Services</h1></div>
        </div>
        <form onSubmit={submit} className="bg-[#2A2624] rounded-2xl p-8 border border-white/5 shadow-2xl space-y-4">
          <h2 className="text-2xl font-semibold" style={{ fontFamily: 'Outfit' }}>Founder sign-in</h2>
          <div className="space-y-1"><Label className="text-xs text-white/70">Email</Label>
            <Input value={email} onChange={e => setEmail(e.target.value)} className="bg-[#1A1715] border-white/10 text-white" required data-testid="pa-email" /></div>
          <div className="space-y-1"><Label className="text-xs text-white/70">Password</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} className="bg-[#1A1715] border-white/10 text-white" required data-testid="pa-password" /></div>
          <Button type="submit" disabled={busy} className="w-full bg-[#D96C5B] hover:bg-[#C25949] h-11" data-testid="pa-submit">{busy ? 'Signing in...' : 'Sign In'}</Button>
        </form>
      </div>
    </div>
  );
}

const MODULE_KEYS = [
  { key: 'hrms', label: 'HRMS' },
  { key: 'vendor_audit', label: 'Vendor Audit' },
  { key: 'register_maker', label: 'Register Maker' },
  { key: 'internal_audit', label: 'Internal Audit' },
  { key: 'consultancy', label: 'Consultancy' },
];

export default function PlatformAdminPage() {
  const nav = useNavigate();
  const [stats, setStats] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [leads, setLeads] = useState([]);
  const [tab, setTab] = useState('orgs');
  const [editOrg, setEditOrg] = useState(null);

  useEffect(() => { fetchAll(); }, []);
  async function fetchAll() {
    try {
      const [s, o, l] = await Promise.all([platformAdminAPI.stats(), platformAdminAPI.listOrgs(), platformAdminAPI.listLeads()]);
      setStats(s.data); setOrgs(o.data || []); setLeads(l.data || []);
    } catch (e) {
      if (e.response?.status === 401 || e.response?.status === 403) {
        nav('/platform-admin/login');
      } else { toast.error('Load failed'); }
    }
  }

  function logout() {
    localStorage.removeItem('token'); localStorage.removeItem('auth_role');
    delete axios.defaults.headers.common['Authorization'];
    nav('/platform-admin/login');
  }

  async function saveOrg() {
    try {
      await platformAdminAPI.updateModules(editOrg.id, editOrg.modules);
      await platformAdminAPI.updateSubscription(editOrg.id, {
        subscription_status: editOrg.subscription_status,
        plan: editOrg.plan,
        trial_ends_at: editOrg.trial_ends_at,
      });
      toast.success('Saved'); setEditOrg(null); fetchAll();
    } catch (e) { toast.error('Save failed'); }
  }

  return (
    <div className="min-h-screen bg-[#FDFBF9]" data-testid="platform-admin-page">
      <header className="bg-[#1A1715] text-white px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#D96C5B] to-[#E8B25C] flex items-center justify-center"><Leaf size={14} weight="fill" color="white" /></div>
            <div><p className="text-[9px] uppercase tracking-[0.2em] text-[#D96C5B] font-bold">Platform Admin</p><p className="text-sm font-semibold" style={{ fontFamily: 'Outfit' }}>Saffron Services</p></div>
          </div>
          <Button size="sm" variant="ghost" className="text-white/70 hover:bg-white/10" onClick={logout} data-testid="pa-logout"><SignOut size={14} className="mr-1" /> Logout</Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Orgs" value={stats.total_organizations} icon={<Buildings size={20} className="text-[#D96C5B]" />} />
            <StatCard label="Trial" value={stats.trial} icon={<Rocket size={20} className="text-[#E8B25C]" />} />
            <StatCard label="Active" value={stats.active} icon={<Check size={20} className="text-[#7D9D85]" />} />
            <StatCard label="New Leads" value={stats.new_leads} icon={<Envelope size={20} className="text-[#5A7BA8]" />} />
          </div>
        )}

        <div className="flex gap-1 border-b border-[#E8E2D9]">
          {[['orgs','Organizations'],['leads','Leads']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} data-testid={`pa-tab-${k}`}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg ${tab === k ? 'bg-[#D96C5B] text-white' : 'bg-[#F9F6F0] text-[#6A625E]'}`}>{l}</button>
          ))}
        </div>

        {tab === 'orgs' && (
          <div className="space-y-2" data-testid="pa-orgs-list">
            {orgs.length === 0 && <Empty label="No organizations yet" />}
            {orgs.map(o => (
              <div key={o.id} className="bg-white border border-[#E8E2D9] rounded-xl p-4 flex items-center justify-between hover:border-[#D96C5B]">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-[#2A2624]">{o.name}</p>
                    <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded ${o.subscription_status === 'trial' ? 'bg-[#E8B25C]/15 text-[#B8841F]' : o.subscription_status === 'active' ? 'bg-[#7D9D85]/15 text-[#4A6C52]' : 'bg-[#D96C5B]/15 text-[#A3402E]'}`}>{o.subscription_status}</span>
                  </div>
                  <p className="text-xs text-[#6A625E]">{o.contact_email} · {o.user_count} users · Modules: {Object.entries(o.modules || {}).filter(([k,v]) => v).map(([k]) => k).join(', ') || 'None'}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setEditOrg({ ...o })} data-testid={`pa-edit-${o.id}`}>Manage</Button>
              </div>
            ))}
          </div>
        )}

        {tab === 'leads' && (
          <div className="space-y-2" data-testid="pa-leads-list">
            {leads.length === 0 && <Empty label="No leads yet" />}
            {leads.map(l => (
              <div key={l.id} className="bg-white border border-[#E8E2D9] rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-[#2A2624]">{l.name} · {l.company || '—'}</p>
                  <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded ${l.status === 'new' ? 'bg-[#D96C5B]/15 text-[#A3402E]' : 'bg-[#A28B7A]/15 text-[#A28B7A]'}`}>{l.status}</span>
                </div>
                <p className="text-xs text-[#6A625E]">{l.email} · {l.phone || 'no phone'} · {new Date(l.created_at).toLocaleString()}</p>
                <p className="text-sm text-[#2A2624] mt-2 whitespace-pre-wrap">{l.message}</p>
              </div>
            ))}
          </div>
        )}
      </main>

      <Dialog open={!!editOrg} onOpenChange={() => setEditOrg(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Manage — {editOrg?.name}</DialogTitle></DialogHeader>
          {editOrg && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold uppercase mb-2">Modules</p>
                <div className="space-y-2">
                  {MODULE_KEYS.map(m => (
                    <label key={m.key} className="flex items-center justify-between p-2 bg-[#F9F6F0] rounded-lg" data-testid={`pa-module-toggle-${m.key}`}>
                      <span className="text-sm">{m.label}</span>
                      <Switch checked={!!editOrg.modules?.[m.key]} onCheckedChange={(v) => setEditOrg({...editOrg, modules: {...(editOrg.modules || {}), [m.key]: v}})} />
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold uppercase mb-2">Subscription</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Status</Label>
                    <select value={editOrg.subscription_status || 'trial'} onChange={e => setEditOrg({...editOrg, subscription_status: e.target.value})} className="h-9 w-full rounded-md border border-[#E8E2D9] bg-white px-3 text-sm" data-testid="pa-status-select">
                      <option value="trial">Trial</option><option value="active">Active</option><option value="expired">Expired</option><option value="canceled">Canceled</option>
                    </select></div>
                  <div><Label className="text-xs">Plan</Label>
                    <select value={editOrg.plan || 'trial'} onChange={e => setEditOrg({...editOrg, plan: e.target.value})} className="h-9 w-full rounded-md border border-[#E8E2D9] bg-white px-3 text-sm">
                      <option value="trial">Trial</option><option value="starter">Starter</option><option value="compliance">Compliance</option><option value="complete">Complete</option><option value="custom">Custom</option>
                    </select></div>
                  <div><Label className="text-xs">Trial ends at</Label>
                    <Input type="date" value={(editOrg.trial_ends_at || '').slice(0, 10)} onChange={e => setEditOrg({...editOrg, trial_ends_at: e.target.value})} /></div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrg(null)}>Cancel</Button>
            <Button onClick={saveOrg} className="bg-[#D96C5B] hover:bg-[#C25949]" data-testid="pa-save-org">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return <div className="bg-white border border-[#E8E2D9] rounded-xl p-4 flex items-center justify-between">
    <div><p className="text-xs text-[#A28B7A]">{label}</p><p className="text-2xl font-bold text-[#2A2624]">{value}</p></div>
    <div className="w-10 h-10 rounded-lg bg-[#F9F6F0] flex items-center justify-center">{icon}</div>
  </div>;
}

function Empty({ label }) {
  return <div className="text-center py-12 text-sm text-[#A28B7A] bg-[#F9F6F0] rounded-xl">{label}</div>;
}
