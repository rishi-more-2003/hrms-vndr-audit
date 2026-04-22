import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { vendorAuditAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import {
  Upload, FileText, CheckCircle, Warning, PencilSimple, Download, ArrowLeft, Play,
  PaperPlaneTilt, CheckSquare, XCircle, Table, Buildings, ShieldCheck, Info,
} from '@phosphor-icons/react';

const DOC_TYPES = [
  { key: 'pf_ecr', label: 'PF ECR' },
  { key: 'pf_challan', label: 'PF Challan' },
  { key: 'pf_paid_challan', label: 'PF Paid Challan' },
  { key: 'esic_contribution_history', label: 'ESIC Contribution History' },
  { key: 'esic_paid_challan', label: 'ESIC Paid Challan' },
  { key: 'pt_paid_challan', label: 'PT Paid Challan' },
  { key: 'pt_return', label: 'PT Return' },
];

const SEV_STYLES = {
  critical: 'bg-[#C65549] text-white',
  high: 'bg-[#D96C5B] text-white',
  medium: 'bg-[#E8B25C] text-[#5A3F10]',
  low: 'bg-[#A28B7A]/25 text-[#6A5847]',
  info: 'bg-[#5A7BA8]/20 text-[#3D5A85]',
};

export default function AuditRunPage({ isContractor = false }) {
  const { id } = useParams();
  const nav = useNavigate();
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('upload');
  const [editDoc, setEditDoc] = useState(null);
  const [adminNote, setAdminNote] = useState({ open: false, mode: null, text: '' });

  useEffect(() => { if (id) refresh(); }, [id]);
  async function refresh() {
    setLoading(true);
    try {
      const r = await vendorAuditAPI.getAudit(id);
      setAudit(r.data);
    } catch (e) { toast.error('Failed to load audit'); }
    setLoading(false);
  }

  async function onExcel(e) {
    const f = e.target.files[0]; if (!f) return;
    setBusy(true);
    try {
      const r = await vendorAuditAPI.uploadExcel(id, f);
      toast.success(`Parsed ${r.data.rows_parsed} employee rows`);
      (r.data.warnings || []).forEach(w => toast.info(w));
      refresh();
    } catch (err) { toast.error(err.response?.data?.detail || 'Excel upload failed'); }
    setBusy(false); e.target.value = '';
  }

  async function onPdf(docType, e) {
    const f = e.target.files[0]; if (!f) return;
    setBusy(true);
    try {
      await vendorAuditAPI.uploadPdf(id, docType, f);
      toast.success(`${DOC_TYPES.find(d => d.key === docType).label} uploaded & parsed`);
      refresh();
    } catch (err) { toast.error(err.response?.data?.detail || 'PDF upload failed'); }
    setBusy(false); e.target.value = '';
  }

  async function runAudit() {
    setBusy(true);
    try {
      await vendorAuditAPI.runAudit(id);
      toast.success('Audit completed');
      setTab('findings');
      refresh();
    } catch (err) { toast.error(err.response?.data?.detail || 'Audit run failed'); }
    setBusy(false);
  }
  async function submitForReview() {
    setBusy(true);
    try { await vendorAuditAPI.submitAudit(id); toast.success('Submitted to principal employer'); refresh(); }
    catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    setBusy(false);
  }
  async function approveReject(action) {
    setBusy(true);
    try {
      if (action === 'approve') await vendorAuditAPI.approveAudit(id, adminNote.text);
      else await vendorAuditAPI.rejectAudit(id, adminNote.text);
      toast.success(action === 'approve' ? 'Approved' : 'Rejected');
      setAdminNote({ open: false, mode: null, text: '' }); refresh();
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed'); }
    setBusy(false);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-[#6A625E]">Loading audit...</p></div>;
  if (!audit) return <div className="text-center py-12"><p className="text-[#D96C5B]">Audit not found</p></div>;

  const locked = ['submitted','approved','rejected'].includes(audit.status);
  const result = audit.audit_result;
  const docs = audit.documents || {};
  const parsed = audit.parsed_documents || {};
  const pdfsUploaded = DOC_TYPES.filter(d => docs[d.key]).length;

  const backHref = isContractor ? '/contractor/dashboard' : '/vendor-audit';

  return (
    <div className="space-y-6" data-testid="audit-run-page">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button size="sm" variant="outline" onClick={() => nav(backHref)} data-testid="back-btn"><ArrowLeft size={16} /></Button>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-[#2A2624] truncate" style={{ fontFamily: 'Outfit' }}>{audit.contractor_name} · {audit.wage_month}</h1>
            <p className="text-xs text-[#6A625E]">{audit.state} · Started {new Date(audit.created_at).toLocaleDateString()}</p>
          </div>
        </div>
        <span className={`text-[10px] uppercase font-bold px-3 py-1.5 rounded ${locked ? 'bg-[#7D9D85]/15 text-[#4A6C52]' : 'bg-[#E8B25C]/15 text-[#B8841F]'}`}>{audit.status}</span>
      </div>

      {/* Progress bar */}
      <div className="bg-white border border-[#E8E2D9] rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold uppercase text-[#2A2624]">Audit Progress</p>
          <p className="text-xs text-[#6A625E]">{audit.rows?.length || 0} employees · {pdfsUploaded}/{DOC_TYPES.length} PDFs · {result ? 'Audited' : 'Pending'}</p>
        </div>
        <div className="flex gap-1">
          <StepBadge done={(audit.rows || []).length > 0} label="1. Payroll Excel" />
          <StepBadge done={pdfsUploaded > 0} warn={pdfsUploaded > 0 && pdfsUploaded < DOC_TYPES.length} label={`2. Statutory PDFs (${pdfsUploaded}/${DOC_TYPES.length})`} />
          <StepBadge done={!!result} label="3. Run Audit" />
          <StepBadge done={['submitted','approved','rejected'].includes(audit.status)} label="4. Submit" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#E8E2D9]">
        {[['upload','Upload'],['review','Review Extracted'],['findings','Findings'],['registers','Registers']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`tab-${k}`}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg ${tab === k ? 'bg-[#D96C5B] text-white' : 'bg-[#F9F6F0] text-[#6A625E]'}`}>{label}</button>
        ))}
      </div>

      {/* UPLOAD */}
      {tab === 'upload' && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white border-2 border-dashed border-[#E8E2D9] rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2"><Table size={18} className="text-[#D96C5B]" /><p className="font-semibold text-[#2A2624]">Payroll Excel (single file)</p></div>
            {audit.rows?.length > 0 ? (
              <div className="bg-[#7D9D85]/10 rounded-lg p-3 text-sm">
                <div className="flex items-center gap-2 text-[#4A6C52]"><CheckCircle size={16} /> {audit.rows.length} employees parsed</div>
                <p className="text-xs text-[#6A625E] mt-1">File: {audit.excel_file_name}</p>
              </div>
            ) : <p className="text-xs text-[#A28B7A]">Upload the filled vendor data collection sheet for this wage month.</p>}
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline"><a href={vendorAuditAPI.templateUrl() + '?t=' + (localStorage.getItem('token') || '')}
                onClick={async (e) => {
                  e.preventDefault();
                  const r = await fetch(vendorAuditAPI.templateUrl(), { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
                  const blob = await r.blob();
                  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'vendor_data_collection_template.xlsx'; a.click();
                }} data-testid="download-template-btn"><Download size={14} className="mr-1" /> Template</a></Button>
              <label className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer ${locked ? 'bg-[#A28B7A]/30 text-[#6A625E]' : 'bg-[#D96C5B] text-white hover:bg-[#C25949]'}`} data-testid="upload-excel-btn">
                <Upload size={14} /> {audit.rows?.length > 0 ? 'Re-upload' : 'Upload Excel'}
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onExcel} disabled={locked || busy} />
              </label>
            </div>
          </div>

          <div className="bg-white border border-[#E8E2D9] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3"><FileText size={18} className="text-[#D96C5B]" /><p className="font-semibold text-[#2A2624]">Statutory PDFs</p></div>
            <p className="text-xs text-[#A28B7A] mb-3">Upload original PDFs downloaded from govt portals. Scanned/printed PDFs are rejected.</p>
            <div className="space-y-2">
              {DOC_TYPES.map(d => {
                const uploaded = !!docs[d.key];
                return (
                  <div key={d.key} className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-[#F9F6F0]">
                    <div className="flex items-center gap-2 min-w-0">
                      {uploaded ? <CheckCircle size={16} className="text-[#4A6C52] flex-shrink-0" /> : <div className="w-4 h-4 rounded-full border-2 border-[#E8E2D9] flex-shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#2A2624]">{d.label}</p>
                        {uploaded && <p className="text-[10px] text-[#A28B7A] truncate">{docs[d.key].file_name}</p>}
                      </div>
                    </div>
                    <label className={`text-xs cursor-pointer px-3 py-1 rounded-md ${locked ? 'bg-[#A28B7A]/20 text-[#6A625E]' : uploaded ? 'text-[#D96C5B] hover:bg-[#D96C5B]/10' : 'bg-[#D96C5B] text-white hover:bg-[#C25949]'}`} data-testid={`upload-${d.key}-btn`}>
                      <Upload size={12} className="inline mr-1" />{uploaded ? 'Replace' : 'Upload'}
                      <input type="file" accept=".pdf" className="hidden" onChange={(e) => onPdf(d.key, e)} disabled={locked || busy} />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* REVIEW */}
      {tab === 'review' && (
        <div className="space-y-3">
          <div className="bg-[#E8B25C]/10 rounded-lg p-3 flex items-start gap-2">
            <Info size={14} className="text-[#E8B25C] mt-0.5" />
            <p className="text-xs text-[#6A625E]">Auto-extracted values are shown below. Click any value to correct it if the parser mis-read the PDF. Your corrections will be used for audit checks.</p>
          </div>
          {DOC_TYPES.map(d => {
            const p = parsed[d.key];
            if (!p) return null;
            return (
              <div key={d.key} className="bg-white border border-[#E8E2D9] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-[#2A2624]">{d.label}</p>
                  <Button size="sm" variant="outline" onClick={() => setEditDoc({ docType: d.key, summary: p.summary || {} })} disabled={locked}><PencilSimple size={14} className="mr-1" /> Correct</Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  {Object.entries(p.summary || {}).map(([k, v]) => (
                    <div key={k}><p className="text-[#A28B7A] uppercase text-[9px]">{k.replace(/_/g, ' ')}</p><p className="text-[#2A2624] font-medium truncate">{String(v ?? '—') || '—'}</p></div>
                  ))}
                </div>
                {p.employees?.length > 0 && <p className="text-[10px] text-[#4A6C52] mt-2">· {p.employees.length} employee rows extracted</p>}
              </div>
            );
          })}
          {Object.keys(parsed).length === 0 && <EmptyState label="Upload statutory PDFs first on the Upload tab" />}
        </div>
      )}

      {/* FINDINGS */}
      {tab === 'findings' && (
        <div className="space-y-4">
          {!result ? (
            <div className="bg-white border border-[#E8E2D9] rounded-xl p-6 text-center space-y-3">
              <ShieldCheck size={36} className="text-[#D96C5B] mx-auto" />
              <p className="text-sm text-[#6A625E]">Run the automated audit to cross-verify the Excel against the PDFs at employee-level.</p>
              <Button onClick={runAudit} disabled={busy || !(audit.rows?.length > 0)} className="bg-[#D96C5B] hover:bg-[#C25949]" data-testid="run-audit-btn"><Play size={16} className="mr-1" /> Run Audit</Button>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Summary label="Employees" value={result.totals.employees_audited} />
                <Summary label="With Findings" value={result.totals.employees_with_findings} />
                <Summary label="Critical" value={result.totals.by_severity.critical || 0} color="#C65549" />
                <Summary label="High" value={result.totals.by_severity.high || 0} color="#D96C5B" />
                <Summary label="Total" value={result.totals.total_findings} color="#2A2624" />
              </div>

              {(result.summary_findings || []).length > 0 && (
                <div className="bg-white border border-[#E8E2D9] rounded-xl p-4">
                  <p className="text-xs font-bold uppercase text-[#2A2624] mb-2">Cross-Document & Summary Findings</p>
                  <div className="space-y-2">
                    {result.summary_findings.map((f, i) => <FindingCard key={i} f={f} />)}
                  </div>
                </div>
              )}

              <div className="bg-white border border-[#E8E2D9] rounded-xl p-4">
                <p className="text-xs font-bold uppercase text-[#2A2624] mb-2">Employee-Level Findings</p>
                <div className="space-y-2">
                  {(result.per_employee || []).filter(e => e.finding_count > 0).map((emp, i) => (
                    <details key={i} className="border border-[#E8E2D9] rounded-lg overflow-hidden">
                      <summary className="cursor-pointer px-3 py-2 bg-[#F9F6F0] hover:bg-[#E8E2D9]/40 flex items-center justify-between">
                        <span className="text-sm font-medium text-[#2A2624]">{emp.employee_code} · {emp.name}</span>
                        <span className="text-xs text-[#D96C5B] font-bold">{emp.finding_count} issues</span>
                      </summary>
                      <div className="p-3 space-y-2">{emp.findings.map((f, j) => <FindingCard key={j} f={f} />)}</div>
                    </details>
                  ))}
                  {result.per_employee.every(e => e.finding_count === 0) && (
                    <div className="text-center py-6 text-sm text-[#4A6C52] bg-[#7D9D85]/10 rounded-lg">All employees passed the audit. No findings at employee-level.</div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                {!locked && isContractor && (
                  <Button onClick={submitForReview} disabled={busy} className="bg-[#7D9D85] hover:bg-[#6A8872]" data-testid="submit-audit-btn"><PaperPlaneTilt size={14} className="mr-1" /> Submit to Principal Employer</Button>
                )}
                {audit.status === 'submitted' && !isContractor && (
                  <>
                    <Button variant="outline" onClick={() => setAdminNote({ open: true, mode: 'reject', text: '' })} className="text-[#D96C5B] border-[#D96C5B]" data-testid="reject-audit-btn"><XCircle size={14} className="mr-1" /> Reject</Button>
                    <Button onClick={() => setAdminNote({ open: true, mode: 'approve', text: '' })} className="bg-[#7D9D85] hover:bg-[#6A8872]" data-testid="approve-audit-btn"><CheckSquare size={14} className="mr-1" /> Approve</Button>
                  </>
                )}
              </div>
              {audit.status === 'rejected' && audit.rejection_reason && (
                <div className="bg-[#D96C5B]/10 rounded-lg p-3"><p className="text-xs text-[#A3402E] font-semibold">Rejection Reason</p><p className="text-sm text-[#2A2624]">{audit.rejection_reason}</p></div>
              )}
              {audit.status === 'approved' && audit.admin_remarks && (
                <div className="bg-[#7D9D85]/10 rounded-lg p-3"><p className="text-xs text-[#4A6C52] font-semibold">Admin Remarks</p><p className="text-sm text-[#2A2624]">{audit.admin_remarks}</p></div>
              )}
            </>
          )}
        </div>
      )}

      {/* REGISTERS */}
      {tab === 'registers' && (
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { kind: 'pf', label: 'PF Register', desc: 'Per-employee PF base, EPS, EDLI, admin & contributions' },
            { kind: 'esic', label: 'ESIC Register', desc: 'Per-employee ESIC base, days, employee & employer contributions' },
            { kind: 'pt', label: 'PT Register (Maharashtra)', desc: 'Per-employee PT slab per state rules' },
          ].map(r => (
            <div key={r.kind} className="bg-white border border-[#E8E2D9] rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2"><FileText size={18} className="text-[#D96C5B]" /><p className="font-semibold text-[#2A2624]">{r.label}</p></div>
              <p className="text-xs text-[#6A625E]">{r.desc}</p>
              <Button onClick={async () => {
                const resp = await fetch(vendorAuditAPI.registerUrl(id, r.kind), { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
                if (!resp.ok) { toast.error('Failed to generate'); return; }
                const blob = await resp.blob();
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${r.label.replace(/\s+/g, '_')}_${audit.wage_month}.xlsx`; a.click();
              }} disabled={!(audit.rows?.length > 0)} size="sm" variant="outline" data-testid={`register-${r.kind}-btn`}><Download size={14} className="mr-1" /> Download</Button>
            </div>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editDoc} onOpenChange={() => setEditDoc(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Correct extracted values</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {editDoc && Object.entries(editDoc.summary).map(([k, v]) => (
              <div key={k} className="space-y-1"><Label className="text-[11px] text-[#6A625E] uppercase">{k.replace(/_/g, ' ')}</Label>
                <Input value={v ?? ''} onChange={e => setEditDoc({ ...editDoc, summary: { ...editDoc.summary, [k]: e.target.value }})} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDoc(null)}>Cancel</Button>
            <Button onClick={async () => {
              try {
                for (const [k, v] of Object.entries(editDoc.summary)) {
                  await vendorAuditAPI.manualOverride(id, editDoc.docType, `summary.${k}`, v);
                }
                toast.success('Saved'); setEditDoc(null); refresh();
              } catch (e) { toast.error('Save failed'); }
            }} className="bg-[#D96C5B] hover:bg-[#C25949]">Save Corrections</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin approve/reject dialog */}
      <Dialog open={adminNote.open} onOpenChange={(o) => setAdminNote({ ...adminNote, open: o })}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{adminNote.mode === 'approve' ? 'Approve' : 'Reject'} Audit</DialogTitle></DialogHeader>
          <Textarea placeholder={adminNote.mode === 'approve' ? 'Optional remarks' : 'Please provide a reason'} value={adminNote.text} onChange={e => setAdminNote({ ...adminNote, text: e.target.value })} rows={4} data-testid="admin-note-input" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdminNote({ open: false, mode: null, text: '' })}>Cancel</Button>
            <Button onClick={() => approveReject(adminNote.mode)} className={adminNote.mode === 'approve' ? 'bg-[#7D9D85] hover:bg-[#6A8872]' : 'bg-[#D96C5B] hover:bg-[#C25949]'} data-testid="admin-note-confirm">
              {adminNote.mode === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StepBadge({ done, warn, label }) {
  const cls = done ? 'bg-[#7D9D85] text-white' : warn ? 'bg-[#E8B25C] text-[#5A3F10]' : 'bg-[#E8E2D9] text-[#6A625E]';
  return <div className={`flex-1 text-[11px] font-medium px-3 py-2 rounded-md text-center ${cls}`}>{label}</div>;
}

function Summary({ label, value, color }) {
  return <div className="bg-white border border-[#E8E2D9] rounded-xl p-3 text-center">
    <p className="text-[10px] text-[#A28B7A] uppercase">{label}</p>
    <p className="text-2xl font-bold" style={{ color: color || '#2A2624' }}>{value}</p>
  </div>;
}

function FindingCard({ f }) {
  return (
    <div className="border-l-4 border-[#D96C5B] bg-[#F9F6F0] rounded-r-lg p-3">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${SEV_STYLES[f.severity] || SEV_STYLES.info}`}>{f.severity}</span>
          <span className="text-[10px] text-[#A28B7A] font-mono">{f.rule_code}</span>
          <span className="text-[10px] text-[#6A625E]">{f.law}</span>
        </div>
      </div>
      <p className="text-sm font-semibold text-[#2A2624]">{f.title}</p>
      <p className="text-xs text-[#6A625E] mt-1">{f.detail}</p>
      {(f.expected !== null || f.actual !== null) && (
        <div className="flex gap-4 mt-1 text-[11px]">
          {f.expected !== null && f.expected !== undefined && <span><span className="text-[#4A6C52]">Expected:</span> <span className="font-mono">{String(f.expected)}</span></span>}
          {f.actual !== null && f.actual !== undefined && <span><span className="text-[#D96C5B]">Found:</span> <span className="font-mono">{String(f.actual)}</span></span>}
          {f.field && <span className="text-[#A28B7A]">({f.field})</span>}
        </div>
      )}
    </div>
  );
}

function EmptyState({ label }) {
  return <div className="text-center py-12 text-sm text-[#A28B7A] bg-[#F9F6F0] rounded-xl">{label}</div>;
}
