import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { vendorAuditAPI } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { useAuth } from '../contexts/AuthContext';
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
  const { impersonationMode } = useAuth();
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

  async function onAIDocument(file, claimedDocType) {
    setBusy(true);
    try {
      const r = await vendorAuditAPI.uploadDocumentAI(id, file, claimedDocType);
      const v = r.data.validation || {};
      if (v.status === 'mismatch') toast.warning(`Validation: ${v.message}`);
      else if (v.status === 'unknown') toast.info('Document not recognized as statutory format — AI extracted what it could');
      else toast.success(`Extracted from ${r.data.file_name}${r.data.from_cache ? ' (cached)' : ` · ₹${(r.data.cost_inr || 0).toFixed(2)}`}`);
      refresh();
    } catch (err) { toast.error(err.response?.data?.detail || 'AI extraction failed'); }
    setBusy(false);
  }
  async function onDeleteAIDoc(docId) {
    if (!window.confirm('Remove this document from the audit?')) return;
    try {
      await vendorAuditAPI.deleteAIDocument(id, docId);
      toast.success('Removed'); refresh();
    } catch (err) { toast.error('Failed'); }
  }
  async function runAuditAI() {
    setBusy(true);
    try {
      await vendorAuditAPI.runAuditAI(id);
      toast.success('AI audit completed');
      setTab('findings');
      refresh();
    } catch (err) { toast.error(err.response?.data?.detail || 'AI audit failed'); }
    setBusy(false);
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

  const locked = ['submitted','approved','rejected'].includes(audit.status) || impersonationMode === 'preview';
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
          <p className="text-xs text-[#6A625E]">
            {(audit.ai_documents ? Object.keys(audit.ai_documents).length : 0)} smart docs ·
            {' '}{audit.rows?.length || 0} employees · {result ? 'Audited' : 'Pending'}
          </p>
        </div>
        <div className="flex gap-1">
          <StepBadge done={(audit.ai_documents && Object.keys(audit.ai_documents).length > 0) || (audit.rows || []).length > 0} label="1. Upload Documents" />
          <StepBadge done={!!result} label="2. Run AI Audit" />
          <StepBadge done={['submitted','approved','rejected'].includes(audit.status)} label="3. Submit" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#E8E2D9]">
        {[['upload','Upload'],['review','Review Extracted'],['findings','Findings'],['registers','Registers']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`tab-${k}`}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg ${tab === k ? 'bg-[#D96C5B] text-white' : 'bg-[#F9F6F0] text-[#6A625E]'}`}>{label}</button>
        ))}
      </div>

      {/* UPLOAD — AI Smart Upload (any documents, AI extracts) */}
      {tab === 'upload' && (
        <SmartUploadPanel
          audit={audit}
          locked={locked}
          busy={busy}
          onUpload={onAIDocument}
          onDelete={onDeleteAIDoc}
          onRunAudit={runAuditAI}
          onLegacyExcel={onExcel}
          onLegacyPdf={onPdf}
        />
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
              <p className="text-sm text-[#6A625E]">Run the audit to cross-verify uploaded documents at employee-level.</p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <Button onClick={runAuditAI}
                  disabled={busy || !(audit.ai_documents && Object.keys(audit.ai_documents).length > 0)}
                  className="bg-[#D96C5B] hover:bg-[#C25949]" data-testid="run-ai-audit-btn">
                  <Play size={16} className="mr-1" /> Run AI Audit
                </Button>
                <Button onClick={runAudit} variant="outline"
                  disabled={busy || !(audit.rows?.length > 0)} data-testid="run-audit-btn">
                  Legacy (Excel-based)
                </Button>
              </div>
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


const VAL_STYLES = {
  valid:    { color: '#7D9D85', label: 'Valid', icon: CheckCircle },
  mismatch: { color: '#D96C5B', label: 'Mismatch', icon: Warning },
  unknown:  { color: '#A28B7A', label: 'Unknown', icon: Info },
  invalid:  { color: '#C65549', label: 'Invalid', icon: XCircle },
};

function SmartUploadPanel({ audit, locked, busy, onUpload, onDelete, onRunAudit, onLegacyExcel, onLegacyPdf }) {
  const [claimed, setClaimed] = React.useState('');
  const [showLegacy, setShowLegacy] = React.useState(false);
  const aiDocs = audit.ai_documents ? Object.values(audit.ai_documents) : [];
  const sortedDocs = aiDocs.slice().sort((a, b) => (b.uploaded_at || '').localeCompare(a.uploaded_at || ''));

  function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    files.forEach(f => onUpload(f, claimed || undefined));
    e.target.value = '';
  }

  return (
    <div className="space-y-4" data-testid="smart-upload-panel">
      {/* Hero */}
      <div className="bg-gradient-to-br from-[#E8B25C] to-[#D96C5B] text-white rounded-2xl p-6">
        <p className="text-[10px] uppercase tracking-widest font-semibold opacity-90">AI Smart Upload</p>
        <h2 className="text-2xl font-semibold mt-1" style={{ fontFamily: 'Outfit' }}>Just upload your documents.</h2>
        <p className="text-white/90 mt-1 text-sm max-w-2xl">Drop PF challans, ESIC contributions, payroll Excels, wage registers — anything. Saffron's AI reads them, classifies them, extracts every field, and runs the full audit.</p>
        <p className="text-[11px] text-white/70 mt-2">Supports .pdf, .xlsx, .docx · 25 MB max per file · Same file uploaded twice = ₹0 (cached extraction)</p>
      </div>

      {/* Drop zone */}
      <div className="bg-white border-2 border-dashed border-[#E8E2D9] rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Label className="text-xs whitespace-nowrap">Document type (optional hint):</Label>
            <select
              value={claimed} onChange={e => setClaimed(e.target.value)}
              className="text-xs px-2 py-1.5 border border-[#E8E2D9] rounded bg-white"
              data-testid="ai-claimed-doc-type"
            >
              <option value="">Auto-detect</option>
              {DOC_TYPES.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </div>
          <label
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition ${locked || busy ? 'bg-[#A28B7A]/30 text-[#6A625E]' : 'bg-[#D96C5B] text-white hover:bg-[#C25949]'}`}
            data-testid="ai-upload-btn"
          >
            <Upload size={14} /> {busy ? 'Extracting…' : 'Upload document(s)'}
            <input type="file" multiple accept=".pdf,.xlsx,.xls,.docx" className="hidden" onChange={handleFiles} disabled={locked || busy} />
          </label>
        </div>

        {sortedDocs.length === 0 ? (
          <p className="text-xs text-[#A28B7A] py-4 text-center">No documents uploaded yet — drop your first one above.</p>
        ) : (
          <div className="space-y-1.5">
            {sortedDocs.map(d => {
              const meta = VAL_STYLES[d.validation?.status] || VAL_STYLES.unknown;
              const StatusIcon = meta.icon;
              const detected = d.detected_doc_type || d.extracted?.doc_type_detected;
              const detectedLabel = DOC_TYPES.find(t => t.key === detected)?.label || detected || 'unknown';
              const empCount = (d.extracted?.employees || []).length;
              return (
                <div key={d.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-[#F9F6F0] border border-[#E8E2D9]" data-testid={`ai-doc-${d.id}`}>
                  <FileText size={14} className="text-[#A28B7A] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#2A2624] truncate">{d.file_name}</p>
                    <p className="text-[10px] text-[#A28B7A] truncate">
                      {(d.file_size / 1024).toFixed(0)} KB · detected: <b>{detectedLabel}</b>
                      {empCount > 0 && ` · ${empCount} employees`}
                      {d.from_cache ? ' · cached (₹0)' : d.cost_inr > 0 ? ` · ₹${d.cost_inr.toFixed(2)}` : ''}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-1 rounded" style={{ backgroundColor: `${meta.color}20`, color: meta.color }}>
                    <StatusIcon size={10} weight="fill" /> {meta.label}
                  </span>
                  <button onClick={() => onDelete(d.id)} disabled={locked} className="text-[#A28B7A] hover:text-[#D96C5B] p-1 disabled:opacity-40" data-testid={`ai-doc-del-${d.id}`}>
                    <XCircle size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Validation warnings */}
        {sortedDocs.some(d => d.validation?.status === 'mismatch') && (
          <div className="bg-[#D96C5B]/10 border border-[#D96C5B]/30 rounded-lg p-2 text-xs text-[#A0532E]">
            <Warning size={12} className="inline mr-1" />
            Some documents look like a different statutory format than what was claimed. Click a row's status badge for details, or just leave the type as Auto-detect.
          </div>
        )}
      </div>

      {/* Run Audit CTA */}
      {sortedDocs.length > 0 && (
        <div className="bg-white border border-[#E8E2D9] rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#2A2624]">Ready when you are.</p>
            <p className="text-[11px] text-[#A28B7A]">{sortedDocs.length} document(s) uploaded · {sortedDocs.reduce((a, d) => a + (d.extracted?.employees?.length || 0), 0)} employee rows extracted across files</p>
          </div>
          <Button onClick={onRunAudit} disabled={locked || busy} className="bg-[#D96C5B] hover:bg-[#C25949]" data-testid="run-ai-audit-cta">
            <Play size={14} className="mr-1" /> Run AI Audit
          </Button>
        </div>
      )}

      {/* Legacy fallback (collapsible) */}
      <div className="bg-[#F9F6F0]/50 rounded-xl p-3">
        <button
          onClick={() => setShowLegacy(s => !s)}
          className="w-full flex items-center justify-between text-xs text-[#6A625E] hover:text-[#2A2624]"
          data-testid="toggle-legacy-upload"
        >
          <span>Prefer the old fixed-template + slot-based upload? {showLegacy ? '▼' : '▶'}</span>
          <span className="text-[10px] text-[#A28B7A]">Optional</span>
        </button>
        {showLegacy && (
          <div className="grid md:grid-cols-2 gap-3 mt-3">
            <div className="bg-white border border-[#E8E2D9] rounded-lg p-3 text-xs">
              <p className="font-semibold mb-2">Filled vendor data Excel</p>
              <label className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md cursor-pointer ${locked ? 'bg-[#A28B7A]/30' : 'bg-[#D96C5B] text-white'}`} data-testid="upload-excel-btn">
                <Upload size={12} /> Upload Excel
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={onLegacyExcel} disabled={locked || busy} />
              </label>
            </div>
            <div className="bg-white border border-[#E8E2D9] rounded-lg p-3 text-xs space-y-1">
              <p className="font-semibold mb-1">Per-statutory PDF slots</p>
              {DOC_TYPES.map(d => (
                <label key={d.key} className="text-[10px] cursor-pointer text-[#D96C5B] hover:underline block" data-testid={`upload-${d.key}-btn`}>
                  + {d.label}
                  <input type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files[0]; if (f) onLegacyPdf(d.key, { target: { files: [f], value: '' } }); }} disabled={locked || busy} />
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

