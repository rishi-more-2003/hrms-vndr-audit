import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { vendorAuditAPI, contractorAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { ShieldCheck, SignOut, Plus, FileText, Key } from '@phosphor-icons/react';

const STATUS_STYLES = {
  draft: 'bg-[#A28B7A]/15 text-[#A28B7A]',
  uploaded: 'bg-[#E8B25C]/15 text-[#B8841F]',
  audited: 'bg-[#7D9D85]/15 text-[#4A6C52]',
  submitted: 'bg-[#5A7BA8]/15 text-[#3D5A85]',
  approved: 'bg-[#7D9D85]/25 text-[#2F5236]',
  rejected: 'bg-[#D96C5B]/15 text-[#A3402E]',
};

export default function ContractorDashboardPage() {
  const { user, contractor, logout } = useAuth();
  const nav = useNavigate();
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startDialog, setStartDialog] = useState(false);
  const [startMonth, setStartMonth] = useState('');
  const [pwdDialog, setPwdDialog] = useState(false);
  const [pwd, setPwd] = useState({ current: '', new1: '', new2: '' });

  useEffect(() => { fetchAudits(); }, []);

  async function fetchAudits() {
    setLoading(true);
    try { const r = await vendorAuditAPI.listAudits(); setAudits(r.data || []); }
    catch (e) { toast.error('Failed to load'); }
    setLoading(false);
  }

  async function startAudit() {
    if (!startMonth) { toast.error('Enter wage month'); return; }
    try {
      const r = await vendorAuditAPI.startAudit({ wage_month: startMonth, state: contractor?.state || 'MAHARASHTRA' });
      setStartDialog(false);
      nav(`/contractor/audits/${r.data.id}`);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  }

  async function changePassword() {
    if (pwd.new1 !== pwd.new2) { toast.error('Passwords do not match'); return; }
    if (pwd.new1.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    try {
      await contractorAPI.changePassword({ current_password: pwd.current, new_password: pwd.new1 });
      toast.success('Password changed');
      setPwdDialog(false); setPwd({ current: '', new1: '', new2: '' });
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  }

  function doLogout() { logout(); nav('/contractor/login'); }

  return (
    <div className="min-h-screen bg-[#FDFBF9]" data-testid="contractor-dashboard">
      {/* Topbar */}
      <header className="bg-[#2A2624] text-white px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#D96C5B] flex items-center justify-center"><ShieldCheck size={20} color="white" /></div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.15em] text-[#D96C5B] font-bold">Contractor Portal</p>
              <p className="text-sm font-semibold" style={{ fontFamily: 'Outfit' }}>{contractor?.name || user?.full_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="text-white/70 hover:bg-white/10" onClick={() => setPwdDialog(true)} data-testid="change-password-btn"><Key size={16} className="mr-1" /> Password</Button>
            <Button size="sm" variant="ghost" className="text-white/70 hover:bg-white/10" onClick={doLogout} data-testid="contractor-logout-btn"><SignOut size={16} className="mr-1" /> Logout</Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Welcome */}
        <div className="bg-gradient-to-r from-[#2A2624] to-[#3B3432] rounded-2xl p-6 text-white">
          <p className="text-xs uppercase tracking-widest text-[#D96C5B] font-bold">Welcome back</p>
          <h1 className="text-3xl font-semibold mt-1" style={{ fontFamily: 'Outfit' }}>{user?.full_name}</h1>
          <p className="text-sm text-white/60 mt-2">Submit your monthly payroll and statutory PDFs to run an automated compliance audit.</p>
          {user?.must_change_password && (
            <div className="mt-4 bg-[#D96C5B]/20 border border-[#D96C5B]/30 rounded-lg p-3 text-sm flex items-center justify-between">
              <span>⚠️ Your account is using a temporary password. Please change it now.</span>
              <Button size="sm" onClick={() => setPwdDialog(true)} className="bg-[#D96C5B] hover:bg-[#C25949]">Change</Button>
            </div>
          )}
        </div>

        {/* Contractor info */}
        {contractor && (
          <div className="bg-white border border-[#E8E2D9] rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <Kv label="Establishment Code" v={contractor.establishment_code} />
            <Kv label="LIN" v={contractor.lin} />
            <Kv label="PF Code" v={contractor.pf_code} />
            <Kv label="ESIC Code" v={contractor.esic_code} />
            <Kv label="State" v={contractor.state} />
            <Kv label="Contact" v={contractor.contact_phone} />
            <Kv label="PT Reg No." v={contractor.pt_registration_no} />
            <Kv label="MLWF LIN" v={contractor.mlwf_lin} />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>My Monthly Audits</h2>
          <Button onClick={() => setStartDialog(true)} className="bg-[#D96C5B] hover:bg-[#C25949]" data-testid="contractor-start-audit-btn"><Plus size={16} className="mr-1" /> Start New Audit</Button>
        </div>

        {loading ? <p className="text-sm text-[#6A625E]">Loading...</p> :
          audits.length === 0 ? (
            <div className="text-center py-12 bg-white border border-[#E8E2D9] rounded-xl">
              <FileText size={36} className="mx-auto text-[#D96C5B] mb-2" />
              <p className="text-sm text-[#6A625E]">No audits yet. Click "Start New Audit" to begin your first monthly submission.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {audits.map(a => (
                <button key={a.id} onClick={() => nav(`/contractor/audits/${a.id}`)}
                  className="w-full flex items-center justify-between bg-white border border-[#E8E2D9] rounded-xl p-4 hover:border-[#D96C5B] transition text-left">
                  <div>
                    <p className="font-semibold text-[#2A2624]">{a.wage_month}</p>
                    <p className="text-xs text-[#6A625E]">Created {new Date(a.created_at).toLocaleDateString()} · {a.excel_row_count || 0} employees</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {a.audit_result?.totals?.total_findings > 0 && <span className="text-xs text-[#D96C5B] font-medium">{a.audit_result.totals.total_findings} findings</span>}
                    <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${STATUS_STYLES[a.status] || 'bg-[#A28B7A]/15 text-[#A28B7A]'}`}>{a.status}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
      </main>

      <Dialog open={startDialog} onOpenChange={setStartDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Start New Monthly Audit</DialogTitle></DialogHeader>
          <div className="space-y-2"><Label className="text-xs">Wage Month (e.g., JAN-2026)</Label>
            <Input value={startMonth} onChange={e => setStartMonth(e.target.value.toUpperCase())} placeholder="JAN-2026" data-testid="c-audit-month-input" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartDialog(false)}>Cancel</Button>
            <Button onClick={startAudit} className="bg-[#D96C5B] hover:bg-[#C25949]" data-testid="c-start-audit-confirm">Start</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pwdDialog} onOpenChange={setPwdDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Change Password</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div><Label className="text-xs">Current password</Label><Input type="password" value={pwd.current} onChange={e => setPwd({...pwd, current: e.target.value})} data-testid="current-pwd-input" /></div>
            <div><Label className="text-xs">New password (min 8 chars)</Label><Input type="password" value={pwd.new1} onChange={e => setPwd({...pwd, new1: e.target.value})} data-testid="new-pwd-input" /></div>
            <div><Label className="text-xs">Confirm new password</Label><Input type="password" value={pwd.new2} onChange={e => setPwd({...pwd, new2: e.target.value})} data-testid="new-pwd2-input" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwdDialog(false)}>Cancel</Button>
            <Button onClick={changePassword} className="bg-[#D96C5B] hover:bg-[#C25949]" data-testid="confirm-pwd-change">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kv({ label, v }) {
  return <div><p className="text-[#A28B7A] uppercase text-[9px]">{label}</p><p className="text-[#2A2624] font-medium">{v || '—'}</p></div>;
}
