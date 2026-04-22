import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { vendorAuditAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Buildings, Plus, Key, Trash, PencilSimple, ShieldCheck, FileText, ClockClockwise, CheckCircle, XCircle } from '@phosphor-icons/react';

const STATUS_STYLES = {
  draft: 'bg-[#A28B7A]/15 text-[#A28B7A]',
  uploaded: 'bg-[#E8B25C]/15 text-[#B8841F]',
  audited: 'bg-[#7D9D85]/15 text-[#4A6C52]',
  submitted: 'bg-[#5A7BA8]/15 text-[#3D5A85]',
  approved: 'bg-[#7D9D85]/25 text-[#2F5236]',
  rejected: 'bg-[#D96C5B]/15 text-[#A3402E]',
};

export default function VendorAuditPage() {
  const nav = useNavigate();
  const [tab, setTab] = useState('audits');
  const [contractors, setContractors] = useState([]);
  const [audits, setAudits] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const [cDialog, setCDialog] = useState(false);
  const [cEdit, setCEdit] = useState(null);
  const [cForm, setCForm] = useState({ state: 'MAHARASHTRA' });

  const [startDialog, setStartDialog] = useState(false);
  const [startCtr, setStartCtr] = useState('');
  const [startMonth, setStartMonth] = useState('');

  const [credDialog, setCredDialog] = useState(null); // {email, temp_password}

  useEffect(() => { fetchAll(); }, []);
  async function fetchAll() {
    setLoading(true);
    try {
      const [c, a, s] = await Promise.all([
        vendorAuditAPI.listContractors(),
        vendorAuditAPI.listAudits(),
        vendorAuditAPI.dashboardStats(),
      ]);
      setContractors(c.data || []);
      setAudits(a.data || []);
      setStats(s.data);
    } catch (e) { toast.error('Failed to load'); }
    setLoading(false);
  }

  function openNewContractor() { setCEdit(null); setCForm({ state: 'MAHARASHTRA' }); setCDialog(true); }
  function openEditContractor(c) { setCEdit(c.id); setCForm({ ...c }); setCDialog(true); }

  async function saveContractor() {
    if (!cForm.name || !cForm.contact_email) { toast.error('Name and Contact Email are required'); return; }
    try {
      if (cEdit) {
        await vendorAuditAPI.updateContractor(cEdit, cForm);
        toast.success('Contractor updated');
        setCDialog(false); fetchAll();
      } else {
        const r = await vendorAuditAPI.createContractor(cForm);
        setCDialog(false);
        setCredDialog({ email: cForm.contact_email, temp_password: r.data.temp_password });
        fetchAll();
      }
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
  }

  async function resetPw(c) {
    if (!window.confirm(`Reset password for ${c.contact_email}?`)) return;
    try {
      const r = await vendorAuditAPI.resetContractorPassword(c.id);
      setCredDialog({ email: c.contact_email, temp_password: r.data.temp_password });
    } catch (e) { toast.error('Failed'); }
  }

  async function delContractor(c) {
    if (!window.confirm(`Delete ${c.name}? The contractor user account will also be removed.`)) return;
    try { await vendorAuditAPI.deleteContractor(c.id); toast.success('Deleted'); fetchAll(); }
    catch (e) { toast.error('Failed'); }
  }

  async function startAudit() {
    if (!startCtr || !startMonth) { toast.error('Select contractor and wage month'); return; }
    try {
      const r = await vendorAuditAPI.startAudit({ wage_month: startMonth, state: 'MAHARASHTRA' }, startCtr);
      setStartDialog(false);
      nav(`/vendor-audit/audits/${r.data.id}`);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-[#6A625E]">Loading...</p></div>;

  return (
    <div className="space-y-6" data-testid="vendor-audit-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Vendor Audit</h1>
          <p className="text-sm text-[#6A625E]">Automated statutory compliance audits for contractors deployed at your premises</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={openNewContractor} variant="outline" data-testid="new-contractor-btn" className="border-[#2A2624] text-[#2A2624]"><Plus size={16} className="mr-1"/> Add Contractor</Button>
          <Button onClick={() => setStartDialog(true)} data-testid="new-audit-btn" className="bg-[#D96C5B] hover:bg-[#C25949]"><ShieldCheck size={16} className="mr-1"/> Start Audit</Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Contractors" value={stats.contractors_count} icon={<Buildings size={20} className="text-[#D96C5B]" />} />
          <StatCard label="Total Audits" value={stats.total_audits} icon={<FileText size={20} className="text-[#7D9D85]" />} />
          <StatCard label="In Progress" value={(stats.by_status?.draft || 0) + (stats.by_status?.uploaded || 0)} icon={<ClockClockwise size={20} className="text-[#E8B25C]" />} />
          <StatCard label="Approved" value={stats.by_status?.approved || 0} icon={<CheckCircle size={20} className="text-[#4A6C52]" />} />
        </div>
      )}

      <div className="flex gap-1 border-b border-[#E8E2D9]">
        {[['audits','Audits'],['contractors','Contractors']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`tab-${k}`}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg ${tab === k ? 'bg-[#D96C5B] text-white' : 'bg-[#F9F6F0] text-[#6A625E]'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'contractors' && (
        <div className="space-y-2" data-testid="contractors-list">
          {contractors.length === 0 && <EmptyState label="No contractors yet — add your first one above" />}
          {contractors.map(c => (
            <div key={c.id} className="flex items-center justify-between bg-white border border-[#E8E2D9] rounded-xl p-4 hover:border-[#D96C5B] transition">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-[#D96C5B]/10 flex items-center justify-center"><Buildings size={18} className="text-[#D96C5B]" /></div>
                <div className="min-w-0">
                  <p className="font-semibold text-[#2A2624] truncate">{c.name}</p>
                  <p className="text-xs text-[#6A625E] truncate">{c.contact_email} · {c.state} · {c.establishment_code || '—'}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEditContractor(c)} title="Edit"><PencilSimple size={16} /></Button>
                <Button size="sm" variant="ghost" onClick={() => resetPw(c)} title="Reset password"><Key size={16} /></Button>
                <Button size="sm" variant="ghost" onClick={() => delContractor(c)} className="text-[#D96C5B]" title="Delete"><Trash size={16} /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'audits' && (
        <div className="space-y-2" data-testid="audits-list">
          {audits.length === 0 && <EmptyState label="No audits yet — start your first audit above" />}
          {audits.map(a => (
            <button key={a.id} onClick={() => nav(`/vendor-audit/audits/${a.id}`)}
              className="w-full flex items-center justify-between bg-white border border-[#E8E2D9] rounded-xl p-4 hover:border-[#D96C5B] transition text-left">
              <div className="min-w-0">
                <p className="font-semibold text-[#2A2624] truncate">{a.contractor_name} · {a.wage_month}</p>
                <p className="text-xs text-[#6A625E]">Created {new Date(a.created_at).toLocaleDateString()} · Rows: {a.excel_row_count || 0}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${STATUS_STYLES[a.status] || 'bg-[#A28B7A]/15 text-[#A28B7A]'}`}>{a.status}</span>
                {a.audit_result?.totals?.total_findings > 0 && (
                  <span className="text-xs text-[#D96C5B] font-medium">{a.audit_result.totals.total_findings} findings</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Contractor dialog */}
      <Dialog open={cDialog} onOpenChange={setCDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-[#E8E2D9]">
            <DialogTitle>{cEdit ? 'Edit' : 'Add'} Contractor</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 grid grid-cols-2 gap-3">
            <FormField label="Name *"><Input value={cForm.name || ''} onChange={e => setCForm({...cForm, name: e.target.value})} data-testid="c-name" /></FormField>
            <FormField label="Legal Name"><Input value={cForm.legal_name || ''} onChange={e => setCForm({...cForm, legal_name: e.target.value})} /></FormField>
            <FormField label="Contact Person"><Input value={cForm.contact_person || ''} onChange={e => setCForm({...cForm, contact_person: e.target.value})} /></FormField>
            <FormField label="Contact Email *"><Input type="email" value={cForm.contact_email || ''} onChange={e => setCForm({...cForm, contact_email: e.target.value})} data-testid="c-email" disabled={!!cEdit} /></FormField>
            <FormField label="Contact Phone"><Input value={cForm.contact_phone || ''} onChange={e => setCForm({...cForm, contact_phone: e.target.value})} /></FormField>
            <FormField label="State">
              <Select value={cForm.state || 'MAHARASHTRA'} onValueChange={v => setCForm({...cForm, state: v})}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['MAHARASHTRA','KARNATAKA','TAMIL NADU','DELHI','HARYANA','GUJARAT','UTTAR PRADESH','WEST BENGAL','TELANGANA'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Establishment Code"><Input value={cForm.establishment_code || ''} onChange={e => setCForm({...cForm, establishment_code: e.target.value})} /></FormField>
            <FormField label="LIN"><Input value={cForm.lin || ''} onChange={e => setCForm({...cForm, lin: e.target.value})} /></FormField>
            <FormField label="PF Code"><Input value={cForm.pf_code || ''} onChange={e => setCForm({...cForm, pf_code: e.target.value})} /></FormField>
            <FormField label="ESIC Code"><Input value={cForm.esic_code || ''} onChange={e => setCForm({...cForm, esic_code: e.target.value})} /></FormField>
            <FormField label="PT Registration No."><Input value={cForm.pt_registration_no || ''} onChange={e => setCForm({...cForm, pt_registration_no: e.target.value})} /></FormField>
            <FormField label="MLWF LIN"><Input value={cForm.mlwf_lin || ''} onChange={e => setCForm({...cForm, mlwf_lin: e.target.value})} /></FormField>
            <FormField label="GST No."><Input value={cForm.gst_no || ''} onChange={e => setCForm({...cForm, gst_no: e.target.value})} /></FormField>
            <FormField label="PAN"><Input value={cForm.pan || ''} onChange={e => setCForm({...cForm, pan: e.target.value.toUpperCase()})} /></FormField>
            <FormField label="Contribution Rate (%)"><Input type="number" step="0.01" value={cForm.contribution_rate_pct || ''} onChange={e => setCForm({...cForm, contribution_rate_pct: parseFloat(e.target.value) || 0})} /></FormField>
            <FormField label="Exemption Status"><Input value={cForm.exemption_status || ''} onChange={e => setCForm({...cForm, exemption_status: e.target.value})} /></FormField>
            <div className="col-span-2"><FormField label="Address"><Input value={cForm.address || ''} onChange={e => setCForm({...cForm, address: e.target.value})} /></FormField></div>
            <div className="col-span-2"><FormField label="Scope of Work"><Input value={cForm.scope_of_work || ''} onChange={e => setCForm({...cForm, scope_of_work: e.target.value})} placeholder="Housekeeping, Security, Canteen..." /></FormField></div>
          </div>
          <DialogFooter className="px-6 pb-6">
            <Button variant="outline" onClick={() => setCDialog(false)}>Cancel</Button>
            <Button onClick={saveContractor} className="bg-[#D96C5B] hover:bg-[#C25949]" data-testid="save-contractor-btn">{cEdit ? 'Update' : 'Create'} Contractor</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Start audit dialog */}
      <Dialog open={startDialog} onOpenChange={setStartDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Start New Audit</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <FormField label="Contractor">
              <Select value={startCtr} onValueChange={setStartCtr}>
                <SelectTrigger className="h-9" data-testid="audit-contractor-select"><SelectValue placeholder="Select contractor" /></SelectTrigger>
                <SelectContent>{contractors.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label="Wage Month">
              <Input placeholder="e.g., JAN-2026" value={startMonth} onChange={e => setStartMonth(e.target.value.toUpperCase())} data-testid="audit-month-input" />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartDialog(false)}>Cancel</Button>
            <Button onClick={startAudit} className="bg-[#D96C5B] hover:bg-[#C25949]" data-testid="start-audit-btn">Start Audit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials display */}
      <Dialog open={!!credDialog} onOpenChange={() => setCredDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Contractor Credentials</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-[#A28B7A]">Share these credentials with the contractor. They must change the password on first login.</p>
            <div className="bg-[#F9F6F0] rounded-lg p-3 space-y-1 font-mono text-sm">
              <div><span className="text-[#A28B7A]">Portal URL:</span> <span className="text-[#2A2624]">{window.location.origin}/contractor/login</span></div>
              <div><span className="text-[#A28B7A]">Email:</span> <span className="text-[#2A2624]">{credDialog?.email}</span></div>
              <div><span className="text-[#A28B7A]">Password:</span> <span className="text-[#D96C5B] font-bold">{credDialog?.temp_password}</span></div>
            </div>
            <Button onClick={() => { navigator.clipboard.writeText(`Portal: ${window.location.origin}/contractor/login\nEmail: ${credDialog.email}\nPassword: ${credDialog.temp_password}`); toast.success('Copied'); }} variant="outline" className="w-full">Copy to clipboard</Button>
          </div>
          <DialogFooter><Button onClick={() => setCredDialog(null)}>Done</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <div className="bg-white border border-[#E8E2D9] rounded-xl p-4 flex items-center justify-between">
      <div><p className="text-xs text-[#A28B7A]">{label}</p><p className="text-2xl font-bold text-[#2A2624]">{value}</p></div>
      <div className="w-10 h-10 rounded-lg bg-[#F9F6F0] flex items-center justify-center">{icon}</div>
    </div>
  );
}

function FormField({ label, children }) {
  return <div className="space-y-1"><Label className="text-[11px] text-[#6A625E]">{label}</Label>{children}</div>;
}

function EmptyState({ label }) {
  return <div className="text-center py-12 text-sm text-[#A28B7A] bg-[#F9F6F0] rounded-xl">{label}</div>;
}
