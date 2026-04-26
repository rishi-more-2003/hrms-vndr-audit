import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import ModuleShell from '../components/ModuleShell';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Plus, FolderSimple, FileText, Upload, Trash, ArrowsClockwise,
  CheckCircle, Warning, Sparkle, X, CurrencyInr, Stack,
} from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

const STATUS_META = {
  pending:  { label: 'Pending',   color: '#A28B7A', icon: ArrowsClockwise },
  studying: { label: 'AI studying…', color: '#E8B25C', icon: Sparkle },
  ready:    { label: 'Ready',     color: '#7D9D85', icon: CheckCircle },
  failed:   { label: 'Failed',    color: '#D96C5B', icon: Warning },
};

export default function RegisterMakerDashboard() {
  const [tab, setTab] = useState('overview'); // overview | categories | templates
  const [stats, setStats] = useState(null);
  const [cats, setCats] = useState([]);
  const [tpls, setTpls] = useState([]);
  const [ref, setRef] = useState({ states: [], laws: [] });
  const [openTpl, setOpenTpl] = useState(null); // template detail modal

  const refresh = useCallback(async () => {
    try {
      const [s, c, t, r] = await Promise.all([
        axios.get(`${API}/register-maker/stats`, auth()),
        axios.get(`${API}/register-maker/categories`, auth()),
        axios.get(`${API}/register-maker/templates`, auth()),
        axios.get(`${API}/register-maker/meta/reference`, auth()),
      ]);
      setStats(s.data); setCats(c.data); setTpls(t.data); setRef(r.data);
    } catch (e) {
      toast.error('Failed to load Register Maker data');
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Poll while any template is studying
  useEffect(() => {
    const studying = tpls.some(t => t.ai_status === 'studying' || t.ai_status === 'pending');
    if (!studying) return;
    const id = setInterval(() => refresh(), 5000);
    return () => clearInterval(id);
  }, [tpls, refresh]);

  return (
    <ModuleShell
      moduleKey="register_maker"
      title="Register Maker"
      subtitle="Teach Saffron any statutory register — once. We'll generate it for life."
      dataTestId="register-maker-dashboard"
    >
      <div className="space-y-6">
        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-[#E8E2D9]">
          {[
            { k: 'overview',   label: 'Overview' },
            { k: 'categories', label: `Categories${cats.length ? ` · ${cats.length}` : ''}` },
            { k: 'templates',  label: `Templates${tpls.length ? ` · ${tpls.length}` : ''}` },
          ].map(t => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              data-testid={`rm-tab-${t.k}`}
              className={`px-4 py-2.5 text-sm font-medium transition border-b-2 ${
                tab === t.k ? 'border-[#D96C5B] text-[#2A2624]' : 'border-transparent text-[#6A625E] hover:text-[#2A2624]'
              }`}
            >{t.label}</button>
          ))}
        </div>

        {tab === 'overview' && <OverviewTab stats={stats} cats={cats} tpls={tpls} onTpl={setOpenTpl} setTab={setTab} />}
        {tab === 'categories' && <CategoriesTab cats={cats} ref={ref} refresh={refresh} setTab={setTab} />}
        {tab === 'templates' && <TemplatesTab tpls={tpls} cats={cats} refresh={refresh} onTpl={setOpenTpl} />}

        <TemplateDetailDialog tpl={openTpl} cats={cats} onClose={() => setOpenTpl(null)} refresh={refresh} />
      </div>
    </ModuleShell>
  );
}

// ─────────── Overview ───────────
function OverviewTab({ stats, cats, tpls, onTpl, setTab }) {
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-[#E8B25C] to-[#D96C5B] text-white rounded-2xl p-8">
        <p className="text-xs uppercase tracking-widest font-semibold opacity-90">AI-learned · zero hard-coding</p>
        <h2 className="text-2xl md:text-3xl font-semibold mt-1" style={{ fontFamily: 'Outfit' }}>Upload any register, we'll learn its format.</h2>
        <p className="text-white/90 mt-2 max-w-2xl">Drop a blank Excel/PDF/Word template, tag it under a category. Our AI extracts the schema once. After that, generation is free and instant — no AI calls per register.</p>
        <div className="flex gap-2 mt-5">
          <Button onClick={() => setTab('templates')} className="bg-white text-[#2A2624] hover:bg-white/90" data-testid="rm-overview-upload">
            <Upload size={14} className="mr-1" /> Upload a template
          </Button>
          <Button onClick={() => setTab('categories')} variant="outline" className="border-white/30 text-white hover:bg-white/10" data-testid="rm-overview-categories">
            <FolderSimple size={14} className="mr-1" /> Manage categories
          </Button>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid md:grid-cols-4 gap-3">
        <StatTile icon={FolderSimple} label="Categories" value={stats?.categories ?? 0} />
        <StatTile icon={Stack} label="Templates" value={stats?.templates ?? 0} />
        <StatTile icon={CheckCircle} label="AI-studied" value={stats?.templates_ready ?? 0} accent="#7D9D85" />
        <StatTile icon={CurrencyInr} label="AI usage so far" value={`₹${(stats?.ai_usage?.total_cost_inr ?? 0).toFixed(2)}`} accent="#E8B25C" />
      </div>

      {/* Recent templates */}
      <div>
        <p className="text-xs font-bold uppercase text-[#2A2624] mb-2">Recent templates</p>
        {tpls.length === 0 ? (
          <div className="bg-[#F9F6F0] rounded-xl p-8 text-center text-sm text-[#A28B7A]">
            No templates yet. <button onClick={() => setTab('templates')} className="text-[#D96C5B] font-semibold underline">Upload your first one</button> — takes 30 seconds.
          </div>
        ) : (
          <div className="space-y-2">
            {tpls.slice(0, 5).map(t => (
              <TemplateRow key={t.id} t={t} cats={cats} onClick={() => onTpl(t)} />
            ))}
          </div>
        )}
      </div>

      {/* Cost transparency */}
      <div className="bg-[#FBE8D9]/50 border border-[#E8B25C]/30 rounded-xl p-4 text-xs text-[#6A625E]">
        <p className="font-bold text-[#2A2624] mb-1 text-sm flex items-center gap-1.5"><Sparkle size={14} className="text-[#E8B25C]" weight="fill" /> How AI cost works</p>
        <ul className="space-y-1 list-disc pl-4">
          <li>One-time learning per template: <b>~₹0.20 – ₹2.00</b> (Gemini 3 Flash → Claude Sonnet 4.5 fallback for complex cases)</li>
          <li>Generating registers from learned templates: <b>₹0</b> — pure data filling, no AI</li>
          <li>As more tenants upload similar templates, the platform builds a shared library — your second tenant pays ₹0 for the same form</li>
        </ul>
      </div>
    </div>
  );
}

function StatTile({ icon: Icon, label, value, accent = '#D96C5B' }) {
  return (
    <div className="bg-white border border-[#E8E2D9] rounded-xl p-4 flex items-center gap-3" data-testid={`rm-stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${accent}20` }}>
        <Icon size={18} style={{ color: accent }} weight="fill" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase text-[#A28B7A] font-bold tracking-wider">{label}</p>
        <p className="text-2xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>{value}</p>
      </div>
    </div>
  );
}

// ─────────── Categories ───────────
function CategoriesTab({ cats, ref, refresh, setTab }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', state: '', law: '', tags: '', description: '' });
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setBusy(true);
    try {
      const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean);
      await axios.post(`${API}/register-maker/categories`, {
        name: form.name.trim(),
        state: form.state || null,
        law: form.law || null,
        tags,
        description: form.description || null,
      }, auth());
      toast.success('Category created');
      setOpen(false); setForm({ name: '', state: '', law: '', tags: '', description: '' });
      refresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
    setBusy(false);
  }

  async function del(c) {
    if (!window.confirm(`Delete "${c.name}"?`)) return;
    try {
      await axios.delete(`${API}/register-maker/categories/${c.id}`, auth());
      toast.success('Deleted'); refresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#6A625E]">Group your registers by state, governing law, and freeform tags. Templates live inside categories.</p>
        <Button onClick={() => setOpen(true)} className="bg-[#D96C5B] hover:bg-[#C25949]" data-testid="rm-cat-new">
          <Plus size={14} className="mr-1" /> New category
        </Button>
      </div>

      {cats.length === 0 ? (
        <div className="bg-[#F9F6F0] rounded-xl p-12 text-center">
          <FolderSimple size={32} className="text-[#A28B7A] mx-auto mb-2" />
          <p className="text-sm text-[#6A625E] mb-3">No categories yet. Create one to start uploading register templates.</p>
          <Button onClick={() => setOpen(true)} variant="outline" data-testid="rm-cat-empty-cta"><Plus size={14} className="mr-1" /> First category</Button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {cats.map(c => (
            <div key={c.id} className="bg-white border border-[#E8E2D9] rounded-xl p-4" data-testid={`rm-cat-${c.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-[#2A2624] truncate">{c.name}</p>
                  <p className="text-[11px] text-[#A28B7A]">{[c.state, c.law].filter(Boolean).join(' · ') || '—'}</p>
                </div>
                <button onClick={() => del(c)} data-testid={`rm-cat-del-${c.id}`} className="text-[#A28B7A] hover:text-[#D96C5B] p-1"><Trash size={14} /></button>
              </div>
              {c.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {c.tags.map(t => <span key={t} className="text-[10px] bg-[#FBE8D9] text-[#A0532E] px-2 py-0.5 rounded">{t}</span>)}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between text-xs text-[#6A625E]">
                <span>{c.template_count || 0} template{c.template_count === 1 ? '' : 's'}</span>
                <button onClick={() => setTab('templates')} className="text-[#D96C5B] hover:underline" data-testid={`rm-cat-view-${c.id}`}>View →</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New category</DialogTitle>
            <DialogDescription>Categorize templates by state, law, and freeform tags.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. MH Wage Registers" data-testid="rm-cat-form-name" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">State</Label>
                <Select value={form.state} onValueChange={v => setForm({ ...form, state: v })}>
                  <SelectTrigger className="h-9" data-testid="rm-cat-form-state"><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>{ref.states.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Governing Law</Label>
                <Select value={form.law} onValueChange={v => setForm({ ...form, law: v })}>
                  <SelectTrigger className="h-9" data-testid="rm-cat-form-law"><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>{ref.laws.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Tags (comma-separated)</Label>
              <Input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder="monthly, wage, mandatory" data-testid="rm-cat-form-tags" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} data-testid="rm-cat-form-desc" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy} className="bg-[#D96C5B] hover:bg-[#C25949]" data-testid="rm-cat-form-submit">
              {busy ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────── Templates ───────────
function TemplatesTab({ tpls, cats, refresh, onTpl }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', category_id: '', register_form_code: '', notes: '', file: null });
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!form.name.trim() || !form.category_id || !form.file) {
      toast.error('Name, category and file are required'); return;
    }
    const allowed = ['.xlsx', '.pdf', '.docx'];
    const ok = allowed.some(ext => form.file.name.toLowerCase().endsWith(ext));
    if (!ok) { toast.error('Only .xlsx, .pdf, .docx supported'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', form.file);
      fd.append('name', form.name.trim());
      fd.append('category_id', form.category_id);
      if (form.register_form_code) fd.append('register_form_code', form.register_form_code);
      if (form.notes) fd.append('notes', form.notes);
      await axios.post(`${API}/register-maker/templates`, fd, {
        headers: { ...auth().headers, 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Template uploaded · AI study running…');
      setOpen(false);
      setForm({ name: '', category_id: '', register_form_code: '', notes: '', file: null });
      refresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'Upload failed'); }
    setBusy(false);
  }

  async function restudy(t) {
    try {
      await axios.post(`${API}/register-maker/templates/${t.id}/restudy`, {}, auth());
      toast.success('Re-study queued'); refresh();
    } catch (e) { toast.error('Failed'); }
  }

  async function del(t) {
    if (!window.confirm(`Delete "${t.name}"?`)) return;
    try {
      await axios.delete(`${API}/register-maker/templates/${t.id}`, auth());
      toast.success('Deleted'); refresh();
    } catch (e) { toast.error('Failed'); }
  }

  const noCats = cats.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#6A625E]">Upload blank Excel / PDF / Word register templates. Our AI studies the format and extracts the data schema.</p>
        <Button
          onClick={() => setOpen(true)}
          disabled={noCats}
          className="bg-[#D96C5B] hover:bg-[#C25949] disabled:opacity-50"
          data-testid="rm-tpl-new"
        >
          <Upload size={14} className="mr-1" /> Upload template
        </Button>
      </div>

      {noCats && (
        <div className="bg-[#FBE8D9]/50 border border-[#E8B25C]/30 rounded-xl p-3 text-xs text-[#6A625E] flex items-center gap-2">
          <Warning size={14} className="text-[#E8B25C]" /> Create at least one category first before uploading templates.
        </div>
      )}

      {tpls.length === 0 ? (
        <div className="bg-[#F9F6F0] rounded-xl p-12 text-center">
          <FileText size={32} className="text-[#A28B7A] mx-auto mb-2" />
          <p className="text-sm text-[#6A625E]">No templates uploaded yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tpls.map(t => (
            <TemplateRow key={t.id} t={t} cats={cats} onClick={() => onTpl(t)} onRestudy={restudy} onDelete={del} />
          ))}
        </div>
      )}

      {/* Upload dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload register template</DialogTitle>
            <DialogDescription>Excel, PDF or Word. Blank templates work best (sample data is OK too).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Register name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Form A — Wage Register" data-testid="rm-tpl-form-name" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Category *</Label>
                <Select value={form.category_id} onValueChange={v => setForm({ ...form, category_id: v })}>
                  <SelectTrigger className="h-9" data-testid="rm-tpl-form-category"><SelectValue placeholder="Pick one" /></SelectTrigger>
                  <SelectContent>{cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Form code</Label>
                <Input value={form.register_form_code} onChange={e => setForm({ ...form, register_form_code: e.target.value })} placeholder="Form A" data-testid="rm-tpl-form-code" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes / hint to AI</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="e.g. Maharashtra monthly wage register under Min Wages Act" data-testid="rm-tpl-form-notes" />
            </div>
            <div>
              <Label className="text-xs">Template file *</Label>
              <Input
                type="file"
                accept=".xlsx,.pdf,.docx"
                onChange={e => setForm({ ...form, file: e.target.files?.[0] || null })}
                data-testid="rm-tpl-form-file"
              />
              {form.file && <p className="text-[11px] text-[#6A625E] mt-1">{form.file.name} · {(form.file.size / 1024).toFixed(1)} KB</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={upload} disabled={busy} className="bg-[#D96C5B] hover:bg-[#C25949]" data-testid="rm-tpl-form-submit">
              {busy ? 'Uploading…' : 'Upload & study'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateRow({ t, cats, onClick, onRestudy, onDelete }) {
  const cat = cats.find(c => c.id === t.category_id);
  const meta = STATUS_META[t.ai_status] || STATUS_META.pending;
  const StatusIcon = meta.icon;
  return (
    <div className="bg-white border border-[#E8E2D9] rounded-xl p-3 flex items-center gap-3" data-testid={`rm-tpl-${t.id}`}>
      <div className="w-9 h-9 rounded-lg bg-[#F9F6F0] flex items-center justify-center flex-shrink-0">
        <FileText size={16} className="text-[#A28B7A]" />
      </div>
      <button onClick={onClick} className="flex-1 min-w-0 text-left" data-testid={`rm-tpl-open-${t.id}`}>
        <p className="font-semibold text-[#2A2624] truncate">{t.name}</p>
        <p className="text-[11px] text-[#A28B7A] truncate">
          {cat?.name || '—'} · {t.file_kind?.toUpperCase()} · {(t.file_size / 1024).toFixed(0)} KB
          {t.register_form_code ? ` · ${t.register_form_code}` : ''}
        </p>
      </button>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] uppercase font-bold" style={{ backgroundColor: `${meta.color}20`, color: meta.color }}>
          <StatusIcon size={10} weight="fill" /> {meta.label}
        </span>
        {t.ai_cost_inr > 0 && (
          <span className="text-[10px] text-[#6A625E]">₹{t.ai_cost_inr.toFixed(2)}</span>
        )}
        {onRestudy && (
          <button onClick={() => onRestudy(t)} className="text-[#A28B7A] hover:text-[#D96C5B] p-1" title="Re-study with AI" data-testid={`rm-tpl-restudy-${t.id}`}>
            <ArrowsClockwise size={14} />
          </button>
        )}
        {onDelete && (
          <button onClick={() => onDelete(t)} className="text-[#A28B7A] hover:text-[#D96C5B] p-1" data-testid={`rm-tpl-del-${t.id}`}>
            <Trash size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────── Template detail (AI schema preview) ───────────
function TemplateDetailDialog({ tpl, cats, onClose, refresh }) {
  if (!tpl) return null;
  const cat = cats.find(c => c.id === tpl.category_id);
  const schema = tpl.ai_schema;
  return (
    <Dialog open={!!tpl} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText size={18} /> {tpl.name}
            <button onClick={onClose} className="ml-auto text-[#A28B7A] hover:text-[#2A2624]"><X size={16} /></button>
          </DialogTitle>
          <DialogDescription>{cat?.name || 'Uncategorized'} · {tpl.file_kind?.toUpperCase()} · uploaded {new Date(tpl.created_at).toLocaleString()}</DialogDescription>
        </DialogHeader>

        {/* AI status banner */}
        {tpl.ai_status !== 'ready' && (
          <div className="rounded-lg p-3 text-sm flex items-center gap-2"
               style={{
                 backgroundColor: tpl.ai_status === 'failed' ? '#D96C5B15' : '#E8B25C15',
                 color: tpl.ai_status === 'failed' ? '#A0532E' : '#A0532E',
               }}>
            {tpl.ai_status === 'studying' && <Sparkle size={14} weight="fill" />} 
            {tpl.ai_status === 'failed' && <Warning size={14} weight="fill" />}
            {tpl.ai_status === 'pending' && <ArrowsClockwise size={14} />} 
            <span>
              {tpl.ai_status === 'studying' && 'AI is studying this template — usually takes 5-15 seconds.'}
              {tpl.ai_status === 'pending' && 'Queued for AI study…'}
              {tpl.ai_status === 'failed' && (tpl.ai_error || 'AI extraction failed.')}
            </span>
          </div>
        )}

        {schema && (
          <div className="space-y-4 mt-2">
            {/* Top metadata */}
            <div className="bg-[#F9F6F0] rounded-xl p-4 space-y-2 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                {schema.register_form_code && <span className="text-[10px] bg-[#D96C5B] text-white px-2 py-0.5 rounded uppercase font-bold">{schema.register_form_code}</span>}
                {schema.row_type && <span className="text-[10px] bg-[#7D9D85]/20 text-[#4A6C52] px-2 py-0.5 rounded uppercase font-bold">{schema.row_type.replace(/_/g, ' ')}</span>}
                {schema.period_basis && <span className="text-[10px] bg-[#E8B25C]/20 text-[#A0532E] px-2 py-0.5 rounded uppercase font-bold">{schema.period_basis}</span>}
                <span className="text-[10px] text-[#6A625E] ml-auto">
                  Confidence: <b style={{ color: (schema.confidence || 0) >= 0.7 ? '#4A6C52' : '#A0532E' }}>{Math.round((schema.confidence || 0) * 100)}%</b>
                </span>
              </div>
              {schema.register_name && <p className="font-semibold text-[#2A2624]">{schema.register_name}</p>}
              {schema.description && <p className="text-xs text-[#6A625E]">{schema.description}</p>}
              {schema.notes && <p className="text-xs text-[#6A625E] bg-white rounded p-2">📝 {schema.notes}</p>}
            </div>

            {/* AI cost panel */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-white border border-[#E8E2D9] rounded-lg p-3">
                <p className="text-[10px] uppercase text-[#A28B7A]">AI Model</p>
                <p className="font-semibold text-[#2A2624] truncate" title={schema.model_used}>{tpl.ai_escalated ? 'Sonnet 4.5 (escalated)' : 'Gemini 3 Flash'}</p>
              </div>
              <div className="bg-white border border-[#E8E2D9] rounded-lg p-3">
                <p className="text-[10px] uppercase text-[#A28B7A]">Tokens</p>
                <p className="font-semibold text-[#2A2624]">{(tpl.ai_tokens_in + tpl.ai_tokens_out).toLocaleString()}</p>
              </div>
              <div className="bg-white border border-[#E8E2D9] rounded-lg p-3">
                <p className="text-[10px] uppercase text-[#A28B7A]">Cost (one-time)</p>
                <p className="font-semibold text-[#2A2624]">₹{(tpl.ai_cost_inr || 0).toFixed(2)}</p>
              </div>
            </div>

            {/* Static fields */}
            {schema.static_fields?.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase text-[#2A2624] mb-2">Header / Static fields ({schema.static_fields.length})</p>
                <div className="space-y-1">
                  {schema.static_fields.map((f, i) => (
                    <div key={i} className="bg-white border border-[#E8E2D9] rounded-lg p-2 flex items-center gap-2 text-xs">
                      <span className="font-mono text-[10px] text-[#A28B7A] w-12">{f.value_cell || '—'}</span>
                      <span className="font-semibold text-[#2A2624] flex-1">{f.name}</span>
                      <span className="text-[#6A625E]">→ {f.source_hint || 'manual'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Columns */}
            {schema.columns?.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase text-[#2A2624] mb-2">Data columns ({schema.columns.length})</p>
                <div className="overflow-x-auto bg-white border border-[#E8E2D9] rounded-lg">
                  <table className="w-full text-xs">
                    <thead className="bg-[#F9F6F0]">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">Header</th>
                        <th className="px-3 py-2 text-left">Type</th>
                        <th className="px-3 py-2 text-left">Source hint</th>
                        <th className="px-3 py-2 text-left">Required</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schema.columns.map((c, i) => (
                        <tr key={i} className="border-t border-[#E8E2D9]" data-testid={`rm-col-${c.key}`}>
                          <td className="px-3 py-2 text-[#A28B7A] font-mono">{i + 1}</td>
                          <td className="px-3 py-2 font-semibold text-[#2A2624]">{c.name}</td>
                          <td className="px-3 py-2"><span className="text-[10px] bg-[#F9F6F0] px-1.5 py-0.5 rounded uppercase">{c.dtype}</span></td>
                          <td className="px-3 py-2 text-[#6A625E]">{c.source_hint || '—'}</td>
                          <td className="px-3 py-2">{c.required ? <CheckCircle size={12} className="text-[#7D9D85]" weight="fill" /> : <span className="text-[#A28B7A]">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {schema.extraction_warnings?.length > 0 && (
              <div className="bg-[#E8B25C]/10 border border-[#E8B25C]/30 rounded-lg p-3 text-xs space-y-1">
                <p className="font-bold text-[#A0532E] mb-1">AI flagged these caveats</p>
                {schema.extraction_warnings.map((w, i) => <p key={i} className="text-[#6A625E]">• {w}</p>)}
              </div>
            )}

            <div className="bg-[#F9F6F0] rounded-lg p-3 text-xs text-[#6A625E]">
              <b className="text-[#2A2624]">Phase B preview:</b> once Compatibility Check + Generation are live, this template will compare its required fields against your master data sheet, then produce filled registers in seconds — without further AI cost.
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
