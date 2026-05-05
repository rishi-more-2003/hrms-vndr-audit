/**
 * Fine-tuning Studio — platform-admin only.
 *
 * 3 tabs:
 *   • Datasets — create dataset, upload PDF/Excel, edit JSON ground truth, approve, mark holdout
 *   • Jobs — start fine-tuning runs, watch status, see fine-tuned model id
 *   • Eval — run base vs fine-tuned model on the holdout set; auto-metrics + side-by-side voting
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  ArrowLeft, Sparkle, ShieldCheck, Database, Cube, ChartBar, UploadSimple, Trash, CheckCircle,
  XCircle, ArrowsClockwise, Eye, FloppyDisk, Flask, Robot, Lightning, Warning,
  Check, X, Equals,
} from '@phosphor-icons/react';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

// ── auth: platform admin token lives in localStorage as 'token' (set by AuthContext)
function authHeaders() {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const STATUS_COLORS = {
  pending: 'bg-[#E8B25C]/15 text-[#B8841F]',
  approved: 'bg-[#7D9D85]/15 text-[#4A6C52]',
  rejected: 'bg-[#D96C5B]/15 text-[#A3402E]',
  validating_files: 'bg-[#A28B7A]/15 text-[#6A625E]',
  queued: 'bg-[#A28B7A]/15 text-[#6A625E]',
  running: 'bg-[#5A7BA8]/15 text-[#5A7BA8]',
  succeeded: 'bg-[#7D9D85]/15 text-[#4A6C52]',
  failed: 'bg-[#D96C5B]/15 text-[#A3402E]',
  cancelled: 'bg-[#D9CFC4]/30 text-[#6A625E]',
};

export default function FineTuneDashboard() {
  const nav = useNavigate();
  const [tab, setTab] = useState('datasets');
  const [config, setConfig] = useState(null);

  useEffect(() => {
    axios.get(`${API}/finetune/config`, { headers: authHeaders() })
      .then(r => setConfig(r.data))
      .catch(e => {
        if (e.response?.status === 401 || e.response?.status === 403) nav('/platform-admin/login');
        else toast.error('Could not load fine-tune config');
      });
  }, [nav]);

  if (!config) {
    return <div className="min-h-screen bg-[#FDFBF9] flex items-center justify-center text-[#6A625E]">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-[#FDFBF9]" data-testid="ft-dashboard">
      <header className="bg-[#1A1715] text-white px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#D96C5B] to-[#E8B25C] flex items-center justify-center">
              <Robot size={14} weight="fill" color="white" />
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-[0.2em] text-[#E8B25C] font-bold">Fine-tuning Studio</p>
              <p className="text-sm font-semibold" style={{ fontFamily: 'Outfit' }}>Train your own AI</p>
            </div>
          </div>
          <Button size="sm" variant="ghost" className="text-white/70 hover:bg-white/10"
            onClick={() => nav('/platform-admin')} data-testid="ft-back-btn">
            <ArrowLeft size={14} className="mr-1" /> Back to admin
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <ProvidersBanner config={config} />

        <div className="flex gap-1 border-b border-[#E8E2D9]">
          {[
            ['datasets', 'Datasets', Database],
            ['jobs', 'Jobs', Lightning],
            ['eval', 'Evaluate', ChartBar],
          ].map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)} data-testid={`ft-tab-${k}`}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg flex items-center gap-1.5 ${
                tab === k ? 'bg-[#D96C5B] text-white' : 'bg-[#F9F6F0] text-[#6A625E] hover:bg-[#F1ECE3]'}`}>
              <Icon size={14} weight={tab === k ? 'fill' : 'regular'} /> {label}
            </button>
          ))}
        </div>

        {tab === 'datasets' && <DatasetsTab config={config} />}
        {tab === 'jobs' && <JobsTab config={config} />}
        {tab === 'eval' && <EvalTab />}
      </main>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Providers banner (shows which keys are configured)
// ────────────────────────────────────────────────────────────────────────────
function ProvidersBanner({ config }) {
  const oai = config.providers.openai;
  const gem = config.providers.gemini;
  return (
    <div className="grid md:grid-cols-2 gap-3" data-testid="ft-providers">
      <ProviderCard name="OpenAI" configured={oai.configured} envKey={oai.env_key}
        instructions={oai.instructions} icon={Sparkle} testId="ft-provider-openai" />
      <ProviderCard name="Google Gemini" configured={gem.configured} envKey={gem.env_key}
        instructions={gem.instructions} icon={ShieldCheck} testId="ft-provider-gemini" disabled />
    </div>
  );
}

function ProviderCard({ name, configured, envKey, instructions, icon: Icon, testId, disabled }) {
  return (
    <div className={`bg-white border rounded-xl p-4 flex items-start gap-3 ${
      configured ? 'border-[#7D9D85]' : 'border-[#E8E2D9]'}`} data-testid={testId}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
        configured ? 'bg-[#7D9D85]/15' : 'bg-[#A28B7A]/10'}`}>
        <Icon size={18} className={configured ? 'text-[#4A6C52]' : 'text-[#A28B7A]'} weight="fill" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-[#2A2624]">{name}</p>
          {configured ? (
            <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-[#7D9D85]/15 text-[#4A6C52]">Connected</span>
          ) : disabled ? (
            <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-[#D9CFC4]/30 text-[#6A625E]">Coming soon</span>
          ) : (
            <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-[#E8B25C]/15 text-[#B8841F]">Not configured</span>
          )}
        </div>
        <p className="text-xs text-[#6A625E] mt-0.5">
          {configured
            ? <>Key found in <code className="text-[10px] bg-[#F9F6F0] px-1 rounded">{envKey}</code> · ready to train.</>
            : instructions}
        </p>
        {!configured && !disabled && (
          <p className="text-[10px] text-[#A28B7A] mt-1">
            File: <code className="bg-[#F9F6F0] px-1 rounded">/app/backend/.env</code> — add the line
            <code className="bg-[#F9F6F0] px-1 rounded ml-1">{envKey}=sk-…</code>
            and run <code className="bg-[#F9F6F0] px-1 rounded">sudo supervisorctl restart backend</code>.
          </p>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Datasets tab
// ════════════════════════════════════════════════════════════════════════════
function DatasetsTab({ config }) {
  const [datasets, setDatasets] = useState([]);
  const [open, setOpen] = useState(null); // dataset object currently expanded
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', task_type: '', description: '' });

  async function refresh() {
    const r = await axios.get(`${API}/finetune/datasets`, { headers: authHeaders() });
    setDatasets(r.data);
  }
  useEffect(() => { refresh(); }, []);

  async function create() {
    if (!draft.name || !draft.task_type) { toast.error('Name + task are required'); return; }
    try {
      const r = await axios.post(`${API}/finetune/datasets`, draft, { headers: authHeaders() });
      setCreating(false); setDraft({ name: '', task_type: '', description: '' });
      toast.success('Dataset created'); await refresh(); setOpen(r.data);
    } catch (e) { toast.error(e.response?.data?.detail || 'Could not create'); }
  }

  async function remove(id) {
    if (!window.confirm('Delete this dataset and all its examples?')) return;
    await axios.delete(`${API}/finetune/datasets/${id}`, { headers: authHeaders() });
    if (open?.id === id) setOpen(null);
    await refresh();
  }

  if (open) return <DatasetDetail dataset={open} onClose={() => { setOpen(null); refresh(); }} />;

  return (
    <div className="space-y-4" data-testid="ft-datasets-tab">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Datasets</h2>
          <p className="text-sm text-[#6A625E]">Each dataset is a collection of training examples for one AI task.</p>
        </div>
        <Button onClick={() => setCreating(true)} className="bg-[#D96C5B] hover:bg-[#C25949]" data-testid="ft-new-dataset-btn">
          + New dataset
        </Button>
      </div>

      {creating && (
        <div className="bg-white border-2 border-[#D96C5B] rounded-xl p-5 space-y-3" data-testid="ft-new-dataset-form">
          <p className="text-sm font-semibold text-[#2A2624]">Create dataset</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. PF ECR Q1 2026" data-testid="ft-ds-name" />
            </div>
            <div>
              <Label className="text-xs">Task type</Label>
              <Select value={draft.task_type} onValueChange={v => setDraft({ ...draft, task_type: v })}>
                <SelectTrigger data-testid="ft-ds-task"><SelectValue placeholder="Pick a task" /></SelectTrigger>
                <SelectContent>
                  {config.tasks.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Description (optional)</Label>
            <Input value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })}
              placeholder="What's special about this dataset?" data-testid="ft-ds-desc" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={create} className="bg-[#D96C5B] hover:bg-[#C25949]" data-testid="ft-ds-create-btn">Create</Button>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {datasets.length === 0 && !creating && (
        <div className="bg-white border border-dashed border-[#E8E2D9] rounded-xl p-12 text-center text-[#A28B7A]" data-testid="ft-ds-empty">
          <Database size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No datasets yet — click "+ New dataset" to start.</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3" data-testid="ft-datasets-list">
        {datasets.map(d => (
          <div key={d.id} className="bg-white border border-[#E8E2D9] rounded-xl p-4 hover:border-[#D96C5B] cursor-pointer"
            onClick={() => setOpen(d)} data-testid={`ft-ds-${d.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[#2A2624]">{d.name}</p>
                <p className="text-[10px] uppercase tracking-wider text-[#A28B7A] mt-0.5">{d.task_label}</p>
                {d.description && <p className="text-xs text-[#6A625E] mt-1">{d.description}</p>}
              </div>
              <button onClick={e => { e.stopPropagation(); remove(d.id); }}
                className="text-[#A28B7A] hover:text-[#D96C5B] flex-shrink-0" data-testid={`ft-ds-del-${d.id}`}>
                <Trash size={14} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3 text-[10px]">
              <Pill label={`${d.counts.total} total`} />
              <Pill label={`${d.counts.pending} pending`} tone="amber" />
              <Pill label={`${d.counts.approved} approved`} tone="green" />
              <Pill label={`${d.counts.holdout} holdout`} tone="blue" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Pill({ label, tone }) {
  const colours = {
    amber: 'bg-[#E8B25C]/15 text-[#B8841F]',
    green: 'bg-[#7D9D85]/15 text-[#4A6C52]',
    red: 'bg-[#D96C5B]/15 text-[#A3402E]',
    blue: 'bg-[#5A7BA8]/15 text-[#5A7BA8]',
  }[tone] || 'bg-[#A28B7A]/10 text-[#6A625E]';
  return <span className={`px-1.5 py-0.5 rounded font-medium ${colours}`}>{label}</span>;
}

// ────────────────────────────────────────────────────────────────────────────
// Dataset detail (examples list + editor)
// ────────────────────────────────────────────────────────────────────────────
function DatasetDetail({ dataset, onClose }) {
  const [examples, setExamples] = useState([]);
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState(null); // currently-edited example
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  async function refresh() {
    const r = await axios.get(`${API}/finetune/datasets/${dataset.id}/examples`,
      { headers: authHeaders(), params: filter ? { status: filter } : {} });
    setExamples(r.data);
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [filter]);

  async function uploadFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('file', f);
    try {
      const r = await axios.post(`${API}/finetune/datasets/${dataset.id}/upload`, fd,
        { headers: { ...authHeaders(), 'Content-Type': 'multipart/form-data' }, timeout: 120000 });
      toast.success('Bootstrapped — review + approve below');
      await refresh();
      setActive(r.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed');
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="space-y-4" data-testid="ft-ds-detail">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose} data-testid="ft-ds-back">
          <ArrowLeft size={14} className="mr-1" /> All datasets
        </Button>
        <div>
          <p className="text-xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>{dataset.name}</p>
          <p className="text-xs text-[#A28B7A]">{dataset.task_label}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* LEFT — examples list */}
        <div className="lg:col-span-2 space-y-3">
          <div className="bg-white border border-[#E8E2D9] rounded-xl p-4">
            <Label className="text-xs">Upload PDF / Excel / Word</Label>
            <p className="text-[11px] text-[#A28B7A] mb-2">We'll run the current AI on it and pre-fill a candidate JSON for you to review.</p>
            <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.docx" onChange={uploadFile}
              className="hidden" data-testid="ft-ex-upload-input" />
            <Button onClick={() => fileRef.current?.click()} disabled={busy}
              className="w-full bg-[#D96C5B] hover:bg-[#C25949]" data-testid="ft-ex-upload-btn">
              <UploadSimple size={14} className="mr-1.5" />
              {busy ? 'Extracting (10–60s)…' : 'Upload + bootstrap'}
            </Button>
          </div>

          <div className="bg-white border border-[#E8E2D9] rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-[#2A2624]">Examples ({examples.length})</p>
              <Select value={filter || 'all'} onValueChange={v => setFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 max-h-[60vh] overflow-y-auto" data-testid="ft-ex-list">
              {examples.length === 0 && <p className="text-xs text-[#A28B7A] text-center py-4">No examples yet.</p>}
              {examples.map(ex => (
                <button key={ex.id} onClick={() => setActive(ex)}
                  data-testid={`ft-ex-${ex.id}`}
                  className={`w-full text-left p-2 rounded border transition ${
                    active?.id === ex.id ? 'border-[#D96C5B] bg-[#D96C5B]/5'
                      : 'border-[#E8E2D9] hover:bg-[#F9F6F0]'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-[#2A2624] truncate flex-1">{ex.source_filename}</p>
                    <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${STATUS_COLORS[ex.status]}`}>{ex.status}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[#A28B7A]">
                    <span>{Math.round(ex.source_size / 1024)} KB</span>
                    {ex.holdout && <span className="text-[#5A7BA8] font-medium">· holdout</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT — example editor */}
        <div className="lg:col-span-3">
          {active ? <ExampleEditor exampleId={active.id} onChange={refresh} /> :
            <div className="bg-white border border-dashed border-[#E8E2D9] rounded-xl p-12 text-center text-[#A28B7A]">
              <Eye size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Click an example on the left to review + edit its ground-truth JSON.</p>
            </div>}
        </div>
      </div>
    </div>
  );
}

function ExampleEditor({ exampleId, onChange }) {
  const [ex, setEx] = useState(null);
  const [text, setText] = useState('');
  const [parseErr, setParseErr] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await axios.get(`${API}/finetune/examples/${exampleId}`, { headers: authHeaders() });
    setEx(r.data);
    setText(JSON.stringify(r.data.ground_truth_output ?? {}, null, 2));
    setParseErr(null);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [exampleId]);

  function onTextChange(v) {
    setText(v);
    try { JSON.parse(v); setParseErr(null); }
    catch (e) { setParseErr(e.message); }
  }

  async function save() {
    if (parseErr) { toast.error(`Invalid JSON: ${parseErr}`); return; }
    setBusy(true);
    try {
      const parsed = JSON.parse(text);
      await axios.put(`${API}/finetune/examples/${exampleId}`,
        { ground_truth_output: parsed }, { headers: authHeaders() });
      toast.success('Saved');
      await load(); onChange?.();
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
    setBusy(false);
  }

  async function approve() {
    if (parseErr) { toast.error('Fix JSON first'); return; }
    if (text !== JSON.stringify(ex.ground_truth_output ?? {}, null, 2)) await save();
    await axios.post(`${API}/finetune/examples/${exampleId}/approve`, {}, { headers: authHeaders() });
    toast.success('Approved'); await load(); onChange?.();
  }
  async function reject() {
    await axios.post(`${API}/finetune/examples/${exampleId}/reject`, {}, { headers: authHeaders() });
    toast.success('Rejected'); await load(); onChange?.();
  }
  async function toggleHoldout() {
    await axios.post(`${API}/finetune/examples/${exampleId}/holdout`, {}, { headers: authHeaders() });
    await load(); onChange?.();
  }
  async function resetToCandidate() {
    if (!ex?.candidate_output) return;
    setText(JSON.stringify(ex.candidate_output, null, 2));
    setParseErr(null);
  }

  if (!ex) return <div className="text-sm text-[#A28B7A]">Loading…</div>;

  return (
    <div className="bg-white border border-[#E8E2D9] rounded-xl p-4 space-y-3" data-testid="ft-ex-editor">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#2A2624] truncate">{ex.source_filename}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${STATUS_COLORS[ex.status]}`}>{ex.status}</span>
            {ex.holdout && <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-[#5A7BA8]/15 text-[#5A7BA8]">holdout</span>}
          </div>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={resetToCandidate} title="Restore AI candidate" data-testid="ft-ex-reset">
            <ArrowsClockwise size={14} />
          </Button>
        </div>
      </div>

      <div>
        <Label className="text-xs">Input prompt that the model will see</Label>
        <Textarea value={ex.input_text} readOnly rows={6}
          className="text-[11px] font-mono bg-[#F9F6F0]" data-testid="ft-ex-input" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs">Ground-truth JSON output (the answer we want the model to learn)</Label>
          {parseErr ? <span className="text-[10px] text-[#D96C5B] flex items-center gap-1"><Warning size={11} /> {parseErr}</span>
            : <span className="text-[10px] text-[#7D9D85] flex items-center gap-1"><Check size={11} /> Valid JSON</span>}
        </div>
        <Textarea value={text} onChange={e => onTextChange(e.target.value)} rows={16}
          className={`text-[11px] font-mono ${parseErr ? 'border-[#D96C5B]' : ''}`} data-testid="ft-ex-gt" />
      </div>

      <div className="flex flex-wrap gap-2 pt-1 border-t border-[#E8E2D9]">
        <Button onClick={save} disabled={busy || !!parseErr} variant="outline" data-testid="ft-ex-save-btn">
          <FloppyDisk size={14} className="mr-1.5" /> Save edits
        </Button>
        <Button onClick={approve} disabled={busy || !!parseErr} className="bg-[#7D9D85] hover:bg-[#6B8B72]" data-testid="ft-ex-approve-btn">
          <CheckCircle size={14} className="mr-1.5" /> Approve
        </Button>
        <Button onClick={reject} variant="outline" className="text-[#A3402E] border-[#D96C5B]/30" data-testid="ft-ex-reject-btn">
          <XCircle size={14} className="mr-1.5" /> Reject
        </Button>
        <Button onClick={toggleHoldout} variant="outline" className={ex.holdout ? 'border-[#5A7BA8] text-[#5A7BA8]' : ''} data-testid="ft-ex-holdout-btn">
          <Flask size={14} className="mr-1.5" /> {ex.holdout ? 'Remove from holdout' : 'Mark for eval (holdout)'}
        </Button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Jobs tab
// ════════════════════════════════════════════════════════════════════════════
function JobsTab({ config }) {
  const [jobs, setJobs] = useState([]);
  const [datasets, setDatasets] = useState([]);
  const [creating, setCreating] = useState(false);

  async function refresh() {
    const [j, d] = await Promise.all([
      axios.get(`${API}/finetune/jobs`, { headers: authHeaders() }),
      axios.get(`${API}/finetune/datasets`, { headers: authHeaders() }),
    ]);
    setJobs(j.data); setDatasets(d.data);
  }
  useEffect(() => { refresh(); const i = setInterval(refresh, 30000); return () => clearInterval(i); }, []);

  return (
    <div className="space-y-4" data-testid="ft-jobs-tab">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Fine-tuning jobs</h2>
          <p className="text-sm text-[#6A625E]">Each job sends an approved dataset to OpenAI and produces a fine-tuned model.</p>
        </div>
        <Button onClick={() => setCreating(true)} disabled={!config.providers.openai.configured}
          className="bg-[#D96C5B] hover:bg-[#C25949]" data-testid="ft-new-job-btn">
          + New job
        </Button>
      </div>

      {!config.providers.openai.configured && (
        <div className="bg-[#E8B25C]/10 border border-[#E8B25C]/30 rounded-xl p-4 text-sm text-[#6A625E]" data-testid="ft-jobs-no-key">
          <Warning size={16} className="inline mr-1.5 text-[#B8841F]" />
          Add your <code className="bg-white px-1 rounded">OPENAI_API_KEY</code> to <code className="bg-white px-1 rounded">/app/backend/.env</code>, then restart the backend, to enable fine-tuning.
        </div>
      )}

      {creating && (
        <NewJobForm config={config} datasets={datasets} onCancel={() => setCreating(false)}
          onCreated={() => { setCreating(false); refresh(); }} />
      )}

      {jobs.length === 0 ? (
        <div className="bg-white border border-dashed border-[#E8E2D9] rounded-xl p-12 text-center text-[#A28B7A]" data-testid="ft-jobs-empty">
          <Lightning size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No fine-tuning jobs yet.</p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="ft-jobs-list">
          {jobs.map(j => <JobCard key={j.id} job={j} onChange={refresh} />)}
        </div>
      )}
    </div>
  );
}

function NewJobForm({ config, datasets, onCancel, onCreated }) {
  const [body, setBody] = useState({
    dataset_id: '',
    provider: 'openai',
    base_model: config.providers.openai.tunable_models[0]?.id || '',
    n_epochs: 3,
    learning_rate_multiplier: '',
    batch_size: '',
    suffix: '',
  });
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState(null);

  const eligible = useMemo(() => datasets.filter(d => d.counts.approved - d.counts.holdout >= 10), [datasets]);

  async function loadPreview(id) {
    if (!id) return;
    setPreviewing(true);
    try {
      const r = await axios.get(`${API}/finetune/datasets/${id}/jsonl`, { headers: authHeaders() });
      setPreview(r.data);
    } catch (e) { toast.error('Could not preview JSONL'); }
    setPreviewing(false);
  }

  async function submit() {
    if (!body.dataset_id) { toast.error('Pick a dataset'); return; }
    setBusy(true);
    try {
      const payload = {
        ...body,
        learning_rate_multiplier: body.learning_rate_multiplier === '' ? null : Number(body.learning_rate_multiplier),
        batch_size: body.batch_size === '' ? null : Number(body.batch_size),
        suffix: body.suffix || null,
      };
      await axios.post(`${API}/finetune/jobs`, payload, { headers: authHeaders() });
      toast.success('Fine-tuning job submitted to OpenAI');
      onCreated();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to start job');
    }
    setBusy(false);
  }

  return (
    <div className="bg-white border-2 border-[#D96C5B] rounded-xl p-5 space-y-3" data-testid="ft-new-job-form">
      <p className="text-sm font-semibold text-[#2A2624]">New fine-tuning job</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Dataset (must have ≥10 approved non-holdout examples)</Label>
          <Select value={body.dataset_id}
            onValueChange={v => { setBody({ ...body, dataset_id: v }); loadPreview(v); }}>
            <SelectTrigger data-testid="ft-job-dataset"><SelectValue placeholder={eligible.length === 0 ? "No eligible datasets" : "Select"} /></SelectTrigger>
            <SelectContent>
              {datasets.map(d => {
                const ok = d.counts.approved - d.counts.holdout >= 10;
                return <SelectItem key={d.id} value={d.id} disabled={!ok}>{d.name} — {d.counts.approved - d.counts.holdout}/{d.counts.approved} ready{!ok ? ' (need ≥10)' : ''}</SelectItem>;
              })}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Base model</Label>
          <Select value={body.base_model} onValueChange={v => setBody({ ...body, base_model: v })}>
            <SelectTrigger data-testid="ft-job-model"><SelectValue /></SelectTrigger>
            <SelectContent>
              {config.providers.openai.tunable_models.map(m => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Epochs <span className="text-[#A28B7A]">(1–25, default 3)</span></Label>
          <Input type="number" min={1} max={25} value={body.n_epochs}
            onChange={e => setBody({ ...body, n_epochs: Number(e.target.value) })} data-testid="ft-job-epochs" />
        </div>
        <div>
          <Label className="text-xs">Learning-rate multiplier <span className="text-[#A28B7A]">(blank = auto)</span></Label>
          <Input type="number" step={0.1} value={body.learning_rate_multiplier}
            onChange={e => setBody({ ...body, learning_rate_multiplier: e.target.value })} placeholder="auto" data-testid="ft-job-lr" />
        </div>
        <div>
          <Label className="text-xs">Batch size <span className="text-[#A28B7A]">(blank = auto)</span></Label>
          <Input type="number" value={body.batch_size}
            onChange={e => setBody({ ...body, batch_size: e.target.value })} placeholder="auto" data-testid="ft-job-batch" />
        </div>
        <div>
          <Label className="text-xs">Model suffix <span className="text-[#A28B7A]">(max 18 chars, optional)</span></Label>
          <Input maxLength={18} value={body.suffix}
            onChange={e => setBody({ ...body, suffix: e.target.value })} placeholder="vendor-q1" data-testid="ft-job-suffix" />
        </div>
      </div>

      {preview && (
        <div className="bg-[#F9F6F0] border border-[#E8E2D9] rounded-lg p-3 text-[11px] text-[#6A625E]" data-testid="ft-job-preview">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-bold text-[#2A2624]">JSONL preview</span>
            <span>{preview.line_count} training rows · {Math.round(preview.char_count / 1024)} KB</span>
          </div>
          {preview.preview?.[0] && (
            <pre className="font-mono text-[10px] overflow-x-auto bg-white border border-[#E8E2D9] rounded p-2 max-h-32">{preview.preview[0].slice(0, 400)}…</pre>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t border-[#E8E2D9]">
        <Button onClick={submit} disabled={busy || !body.dataset_id} className="bg-[#D96C5B] hover:bg-[#C25949]" data-testid="ft-job-submit">
          {busy ? 'Submitting…' : 'Start fine-tuning'}
        </Button>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        {previewing && <span className="text-xs text-[#A28B7A]">Loading preview…</span>}
      </div>
    </div>
  );
}

function JobCard({ job, onChange }) {
  const [expanded, setExpanded] = useState(false);
  const [events, setEvents] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const isInflight = ['validating_files', 'queued', 'running'].includes(job.openai_status);

  async function refresh() {
    setRefreshing(true);
    try {
      const r = await axios.get(`${API}/finetune/jobs/${job.id}`, { headers: authHeaders() });
      onChange?.(r.data);
    } catch (e) { /* ignore */ }
    setRefreshing(false);
  }
  async function loadEvents() {
    try {
      const r = await axios.get(`${API}/finetune/jobs/${job.id}/events`, { headers: authHeaders() });
      setEvents(r.data.events || []);
    } catch (e) { setEvents([]); }
  }
  async function cancel() {
    if (!window.confirm('Cancel this fine-tuning job?')) return;
    await axios.post(`${API}/finetune/jobs/${job.id}/cancel`, {}, { headers: authHeaders() });
    onChange?.();
  }

  useEffect(() => { if (expanded) loadEvents(); /* eslint-disable-next-line */ }, [expanded]);

  return (
    <div className="bg-white border border-[#E8E2D9] rounded-xl" data-testid={`ft-job-${job.id}`}>
      <div className="p-4 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-[#2A2624]">{job.dataset_name}</p>
            <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${STATUS_COLORS[job.openai_status] || 'bg-[#A28B7A]/10 text-[#6A625E]'}`}>{job.openai_status}</span>
            <span className="text-[10px] text-[#A28B7A] font-mono">{job.openai_job_id}</span>
          </div>
          <p className="text-xs text-[#6A625E] mt-0.5">
            {job.base_model} · {job.training_examples} examples · {job.hyperparameters?.n_epochs} epochs
            · ≈ ${job.cost_estimate?.approx_cost_usd ?? '?'}
          </p>
          {job.fine_tuned_model && (
            <p className="text-[11px] mt-1 text-[#4A6C52] font-mono break-all" data-testid={`ft-job-model-${job.id}`}>
              <CheckCircle size={11} className="inline mr-1" weight="fill" /> {job.fine_tuned_model}
            </p>
          )}
          {job.error_message && (
            <p className="text-[11px] mt-1 text-[#A3402E]"><Warning size={11} className="inline mr-1" /> {job.error_message}</p>
          )}
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing} data-testid={`ft-job-refresh-${job.id}`}>
            <ArrowsClockwise size={12} className={refreshing ? 'animate-spin' : ''} />
          </Button>
          {isInflight && (
            <Button size="sm" variant="outline" className="text-[#A3402E]" onClick={cancel} data-testid={`ft-job-cancel-${job.id}`}>Cancel</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)}>{expanded ? 'Hide' : 'Events'}</Button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-[#E8E2D9] p-3 bg-[#F9F6F0] max-h-64 overflow-y-auto">
          {events.length === 0 ? <p className="text-xs text-[#A28B7A]">No events yet.</p> :
            events.map(ev => (
              <div key={ev.id} className="text-[11px] py-1 border-b border-[#E8E2D9] last:border-0">
                <span className="text-[#A28B7A] font-mono mr-2">{new Date(ev.created_at * 1000).toLocaleTimeString()}</span>
                <span className={ev.level === 'error' ? 'text-[#A3402E]' : 'text-[#6A625E]'}>{ev.message}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Eval tab
// ════════════════════════════════════════════════════════════════════════════
function EvalTab() {
  const [jobs, setJobs] = useState([]);
  const [runs, setRuns] = useState([]);
  const [activeRun, setActiveRun] = useState(null);
  const [pickedJob, setPickedJob] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [j, r] = await Promise.all([
      axios.get(`${API}/finetune/jobs`, { headers: authHeaders() }),
      axios.get(`${API}/finetune/eval-runs`, { headers: authHeaders() }),
    ]);
    setJobs((j.data || []).filter(x => x.fine_tuned_model));
    setRuns(r.data || []);
  }
  useEffect(() => { refresh(); }, []);

  async function runEval() {
    if (!pickedJob) { toast.error('Pick a fine-tuned job'); return; }
    setBusy(true);
    try {
      const r = await axios.post(`${API}/finetune/eval-runs`, { job_id: pickedJob }, { headers: authHeaders(), timeout: 240000 });
      toast.success(`Eval done — ran ${r.data.summary.n_examples} examples`);
      setActiveRun(r.data);
      await refresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'Eval failed'); }
    setBusy(false);
  }

  async function openRun(id) {
    const r = await axios.get(`${API}/finetune/eval-runs/${id}`, { headers: authHeaders() });
    setActiveRun(r.data);
  }

  if (activeRun) return <EvalRunDetail run={activeRun} onClose={() => { setActiveRun(null); refresh(); }} />;

  return (
    <div className="space-y-4" data-testid="ft-eval-tab">
      <div>
        <h2 className="text-2xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Evaluate</h2>
        <p className="text-sm text-[#6A625E]">Run base model vs fine-tuned model on your holdout examples → see auto-metrics + side-by-side preview.</p>
      </div>

      <div className="bg-white border border-[#E8E2D9] rounded-xl p-4">
        <Label className="text-xs">Pick a completed fine-tuning job</Label>
        <div className="flex gap-2 mt-1.5">
          <Select value={pickedJob} onValueChange={setPickedJob}>
            <SelectTrigger className="flex-1" data-testid="ft-eval-job-select"><SelectValue placeholder={jobs.length === 0 ? "No completed jobs yet" : "Select"} /></SelectTrigger>
            <SelectContent>
              {jobs.map(j => <SelectItem key={j.id} value={j.id}>{j.dataset_name} — {j.fine_tuned_model?.slice(-12)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={runEval} disabled={busy || !pickedJob} className="bg-[#D96C5B] hover:bg-[#C25949]" data-testid="ft-eval-run-btn">
            {busy ? 'Running (1–3 min)…' : 'Run eval'}
          </Button>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="bg-white border border-dashed border-[#E8E2D9] rounded-xl p-12 text-center text-[#A28B7A]" data-testid="ft-eval-empty">
          <ChartBar size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No eval runs yet.</p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="ft-eval-runs-list">
          {runs.map(r => (
            <button key={r.id} onClick={() => openRun(r.id)}
              className="w-full bg-white border border-[#E8E2D9] rounded-xl p-4 text-left hover:border-[#D96C5B]"
              data-testid={`ft-eval-run-${r.id}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-[#2A2624]">{r.task_type} · {new Date(r.created_at).toLocaleString()}</p>
                <span className="text-xs text-[#A28B7A]">{r.summary?.n_examples} examples</span>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-2 text-xs">
                <Metric label="Base F1" value={r.summary?.base_avg_f1} />
                <Metric label="Fine-tuned F1" value={r.summary?.ft_avg_f1} highlight />
                <Metric label="Lift"
                  value={r.summary?.ft_lift_f1}
                  prefix={r.summary?.ft_lift_f1 >= 0 ? '+' : ''}
                  tone={r.summary?.ft_lift_f1 >= 0 ? 'green' : 'red'} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, highlight, prefix = '', tone }) {
  const colour = tone === 'green' ? 'text-[#4A6C52]' : tone === 'red' ? 'text-[#A3402E]' :
    highlight ? 'text-[#D96C5B]' : 'text-[#2A2624]';
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[#A28B7A]">{label}</p>
      <p className={`text-base font-bold ${colour}`}>{prefix}{(value ?? 0).toFixed(3)}</p>
    </div>
  );
}

function EvalRunDetail({ run, onClose }) {
  const [judgments, setJudgments] = useState(run.judgments || []);
  const [activeIdx, setActiveIdx] = useState(0);

  async function vote(choice) {
    const ex = run.pairs[activeIdx];
    try {
      const r = await axios.post(`${API}/finetune/eval-runs/${run.id}/judgments`,
        { example_id: ex.example_id, choice }, { headers: authHeaders() });
      setJudgments(r.data.judgments || []);
      toast.success('Vote recorded');
      // auto-advance
      if (activeIdx < run.pairs.length - 1) setActiveIdx(activeIdx + 1);
    } catch (e) { toast.error('Vote failed'); }
  }

  const counts = useMemo(() => {
    const c = { base: 0, ft: 0, tie: 0 };
    for (const j of judgments) c[j.choice] = (c[j.choice] || 0) + 1;
    return c;
  }, [judgments]);

  const ex = run.pairs[activeIdx];
  const myVote = judgments.find(j => j.example_id === ex.example_id)?.choice;

  return (
    <div className="space-y-4" data-testid="ft-eval-detail">
      <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft size={14} className="mr-1" /> All eval runs</Button>

      <div className="bg-white border border-[#E8E2D9] rounded-xl p-5">
        <h2 className="text-xl font-semibold text-[#2A2624] mb-3" style={{ fontFamily: 'Outfit' }}>Eval results</h2>
        <div className="grid sm:grid-cols-5 gap-4">
          <Metric label="Base F1" value={run.summary.base_avg_f1} />
          <Metric label="Fine-tuned F1" value={run.summary.ft_avg_f1} highlight />
          <Metric label="Lift" value={run.summary.ft_lift_f1}
            prefix={run.summary.ft_lift_f1 >= 0 ? '+' : ''}
            tone={run.summary.ft_lift_f1 >= 0 ? 'green' : 'red'} />
          <Metric label="Base exact-match" value={run.summary.base_exact_match_rate} />
          <Metric label="FT exact-match" value={run.summary.ft_exact_match_rate} highlight />
        </div>
        <p className="text-[11px] text-[#A28B7A] mt-3">
          Auto-metrics compute leaf-field F1: every key in the JSON tree is compared independently. Higher is better.
          {run.summary.ft_lift_f1 < 0.02 && run.summary.ft_lift_f1 > -0.02 && ' · Lift is small — try more examples or more epochs.'}
        </p>
      </div>

      {/* Side-by-side */}
      <div className="bg-white border border-[#E8E2D9] rounded-xl p-5" data-testid="ft-eval-sbs">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-bold text-[#2A2624]">Side-by-side · example {activeIdx + 1} of {run.pairs.length}</p>
            <p className="text-xs text-[#A28B7A]">{ex.source_filename}</p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span><b className="text-[#2A2624]">{counts.base}</b> base</span>
            <span><b className="text-[#D96C5B]">{counts.ft}</b> fine-tuned</span>
            <span><b className="text-[#A28B7A]">{counts.tie}</b> tie</span>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-3 mb-3">
          <SbsCard title="Base model" subtitle={run.base_model}
            output={ex.base_output} metrics={ex.base_metrics} testid="ft-sbs-base" />
          <SbsCard title="Fine-tuned model" subtitle={run.ft_model}
            output={ex.ft_output} metrics={ex.ft_metrics} testid="ft-sbs-ft" highlight />
        </div>

        <details className="mb-3">
          <summary className="text-xs text-[#A28B7A] cursor-pointer">Show ground truth</summary>
          <pre className="text-[10px] font-mono bg-[#F9F6F0] border border-[#E8E2D9] rounded p-2 max-h-48 overflow-auto mt-1">{JSON.stringify(ex.ground_truth, null, 2)}</pre>
        </details>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E8E2D9]">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={activeIdx === 0} onClick={() => setActiveIdx(activeIdx - 1)} data-testid="ft-sbs-prev">‹ Prev</Button>
            <Button size="sm" variant="outline" disabled={activeIdx === run.pairs.length - 1} onClick={() => setActiveIdx(activeIdx + 1)} data-testid="ft-sbs-next">Next ›</Button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => vote('base')} className={`${myVote === 'base' ? 'bg-[#2A2624] text-white' : 'bg-[#F9F6F0] text-[#2A2624] hover:bg-[#E8E2D9]'}`} data-testid="ft-vote-base">
              <X size={12} className="mr-1" /> Base wins
            </Button>
            <Button size="sm" onClick={() => vote('tie')} className={`${myVote === 'tie' ? 'bg-[#A28B7A] text-white' : 'bg-[#F9F6F0] text-[#6A625E] hover:bg-[#E8E2D9]'}`} data-testid="ft-vote-tie">
              <Equals size={12} className="mr-1" /> Tie
            </Button>
            <Button size="sm" onClick={() => vote('ft')} className={`${myVote === 'ft' ? 'bg-[#D96C5B] text-white' : 'bg-[#F9F6F0] text-[#A0532E] hover:bg-[#E8E2D9]'}`} data-testid="ft-vote-ft">
              <Check size={12} className="mr-1" /> Fine-tuned wins
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SbsCard({ title, subtitle, output, metrics, testid, highlight }) {
  return (
    <div className={`border rounded-lg p-3 ${highlight ? 'border-[#D96C5B] bg-[#D96C5B]/5' : 'border-[#E8E2D9] bg-[#F9F6F0]'}`} data-testid={testid}>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-bold text-[#2A2624]">{title}</p>
        <span className="text-[9px] text-[#A28B7A] font-mono truncate ml-2">{subtitle?.slice(-20)}</span>
      </div>
      <div className="flex gap-3 text-[10px] text-[#6A625E] mb-2">
        <span>F1 <b className="text-[#2A2624]">{(metrics?.f1 ?? 0).toFixed(3)}</b></span>
        <span>EM <b className="text-[#2A2624]">{(metrics?.exact_match ?? 0).toFixed(0)}</b></span>
        <span>{metrics?.leaves_correct ?? 0}/{metrics?.leaves_truth ?? 0} fields</span>
      </div>
      <pre className="text-[10px] font-mono bg-white border border-[#E8E2D9] rounded p-2 max-h-64 overflow-auto">{JSON.stringify(output, null, 2)}</pre>
    </div>
  );
}
