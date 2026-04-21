import React, { useEffect, useState } from 'react';
import { salaryComponentAPI, salaryTemplateAPI, salaryAssignmentAPI, salaryComputeAPI, complianceTemplateAPI, employeeAPI, locationAPI, departmentAPI } from '../services/api';
import { CurrencyDollar, Plus, Trash, PencilSimple, Users, ArrowRight, Check, Info } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';

var COMP_TYPES = [
  { key: 'earning', label: 'Earnings', color: '#7D9D85' },
  { key: 'deduction', label: 'Deductions', color: '#D96C5B' },
  { key: 'provision', label: 'Provisions', color: '#E8B25C' },
];
var CLASSIFICATIONS = ['inclusion_wages', 'exclusion', 'others'];
var CLASS_LABELS = { inclusion_wages: 'Inclusion/Wages', exclusion: 'Exclusion', others: 'Others' };
var CALC_TYPES_EARNING = ['fixed_amount', 'percentage_of_basic', 'percentage_of_gross', 'percentage_of_ctc', 'percentage_of_inclusion', 'percentage_of_exclusion', 'percentage_of_group', 'percentage_of_club'];
var CALC_TYPES_DED_PROV = ['fixed_amount', 'percentage_of_basic', 'percentage_of_gross', 'percentage_of_ctc', 'percentage_of_inclusion', 'percentage_of_exclusion', 'percentage_of_group', 'percentage_of_club'];
var CALC_LABELS = {
  fixed_amount: 'Fixed Amount', percentage_of_basic: '% of Basic', percentage_of_gross: '% of Gross',
  percentage_of_ctc: '% of CTC', percentage_of_inclusion: '% of Inclusion', percentage_of_exclusion: '% of Exclusion',
  percentage_of_group: '% of Group', percentage_of_club: '% of Clubbed Components',
};
var APPLICABILITY_BASES = [
  { key: 'gross', label: 'Gross' },
  { key: 'inclusion', label: 'Inclusion Wages' },
  { key: 'exclusion', label: 'Exclusion Wages' },
  { key: 'basic', label: 'Basic' },
  { key: 'ctc', label: 'CTC' },
  { key: 'group', label: 'Component Group' },
  { key: 'club', label: 'Clubbed Components' },
];
var OPERATORS = [
  { key: 'less_than', label: '<' },
  { key: 'less_than_equal', label: '≤' },
  { key: 'greater_than', label: '>' },
  { key: 'greater_than_equal', label: '≥' },
  { key: 'between', label: 'Between' },
];
var fmt = function(n) { return '\u20B9' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); };

export default function SalaryStructurePage() {
  var [tab, setTab] = useState('components');
  var [components, setComponents] = useState([]);
  var [templates, setTemplates] = useState([]);
  var [employees, setEmployees] = useState([]);
  var [locations, setLocations] = useState([]);
  var [departments, setDepartments] = useState([]);
  var [complianceTpls, setComplianceTpls] = useState({ pf: [], esic: [], pt: [], lwf: [], tds: [] });
  var [policyTpls, setPolicyTpls] = useState({ leave: [], attendance: [], overtime: [], reimbursement: [], bonus: [], gratuity: [] });
  var [loading, setLoading] = useState(true);
  // Component form
  var [compDialog, setCompDialog] = useState(false);
  var [compForm, setCompForm] = useState({});
  var [editCompId, setEditCompId] = useState(null);
  // Template form
  var [tmplDialog, setTmplDialog] = useState(false);
  var [tmplForm, setTmplForm] = useState({ template_name: '', components: [], ctc_mode: false, ctc_annual: 0, pay_type: 'monthly' });
  var [editTmplId, setEditTmplId] = useState(null);
  var [computeResult, setComputeResult] = useState(null);
  // Assign
  var [assignDialog, setAssignDialog] = useState(false);
  var [assignForm, setAssignForm] = useState({ assign_by: 'department', target_id: '', salary_template_id: '' });

  useEffect(function() { fetchAll(); }, []);

  async function fetchAll() {
    try {
      var r = await Promise.all([salaryComponentAPI.getAll(), salaryTemplateAPI.getAll(), employeeAPI.getAll(), locationAPI.getAll(), departmentAPI.getAll()]);
      setComponents(r[0].data || []);
      setTemplates(r[1].data || []);
      setEmployees(r[2].data || []);
      setLocations(r[3].data || []);
      setDepartments(r[4].data || []);
      // Fetch statutory templates (for optional auto-calc linking)
      var st = await Promise.all(['pf','esic','pt','lwf','tds'].map(function(t) { return complianceTemplateAPI.getAll(t).catch(function() { return { data: [] }; }); }));
      setComplianceTpls({ pf: st[0].data || [], esic: st[1].data || [], pt: st[2].data || [], lwf: st[3].data || [], tds: st[4].data || [] });
      // Fetch policy templates (for policy↔salary linking)
      var pt = await Promise.all(['leave','attendance','overtime','reimbursement','bonus','gratuity'].map(function(t) {
        return import('../services/api').then(function(m) { return m.policyTemplateAPI.getAll(t).catch(function() { return { data: [] }; }); });
      }));
      setPolicyTpls({ leave: pt[0].data || [], attendance: pt[1].data || [], overtime: pt[2].data || [], reimbursement: pt[3].data || [], bonus: pt[4].data || [], gratuity: pt[5].data || [] });
    } catch (e) { /* ok */ }
    setLoading(false);
  }

  async function seedDefaults() {
    if (!window.confirm('Install 22 default components (Basic/HRA/DA/Conv, OT 1.5x/2x/3x group, Bonus group, PF/ESIC/PT-MH/PT-TN slabs, LWF, TDS, Loan/Advance EMI, Gratuity provision)? Existing components with matching codes will be skipped.')) return;
    try {
      var r = await salaryComponentAPI.seedDefaults(false);
      toast.success('Seeded: ' + (r.data.created || []).length + ' new, ' + (r.data.skipped_already_exists || []).length + ' skipped');
      var r2 = await salaryComponentAPI.getAll();
      setComponents(r2.data || []);
    } catch (e) { toast.error(e.response?.data?.detail || 'Seed failed'); }
  }

  // ─── Components ───
  function openNewComp(type) {
    setCompForm({
      name: '', code: '', component_type: type, category: 'standard',
      group: '', auto_pair_key: '',
      calc_type: 'fixed_amount', default_value: 0, default_percentage: 0,
      calc_source_group: '', calc_sources: [],
      calc_basis_mode: 'earned', applicability_basis_mode: 'rate',
      is_fixed: true, is_variable: false, allow_direct_entry: false,
      attendance_dependent: true,
      attracts_pf: false, attracts_esic: false, attracts_pt: false,
      attracts_lwf: false, attracts_ot: false, attracts_tds: false, attracts_bonus: false,
      classification: 'inclusion_wages',
      applicability: { enabled: false, basis: 'gross', basis_mode: 'rate', operator: 'less_than_equal', value_min: 0, value_max: 0, sources: [] },
      has_slabs: false, slabs: [], slab_salary_basis: 'gross',
      ot_config: type === 'earning' ? { enabled: false, rate_type: 'fixed', fixed_rate: 0, factor: 'one_half', calc_basis: 'actual_days', hours_per_day: 8 } : undefined,
    });
    setEditCompId(null); setCompDialog(true);
  }
  function openEditComp(c) { setCompForm({...c}); setEditCompId(c.id); setCompDialog(true); }
  async function saveComp(e) {
    e.preventDefault();
    try {
      if (editCompId) { await salaryComponentAPI.update(editCompId, compForm); toast.success('Updated'); }
      else { var res = await salaryComponentAPI.create(compForm); if (res.data.auto_created_provisions) toast.success('Created + auto-paired: ' + res.data.auto_created_provisions.join(', ')); else toast.success('Created'); }
      setCompDialog(false); var r = await salaryComponentAPI.getAll(); setComponents(r.data || []);
    } catch (e) { toast.error('Failed'); }
  }
  async function deleteComp(id) { try { await salaryComponentAPI.delete(id); toast.success('Deleted'); setComponents(components.filter(function(c) { return c.id !== id; })); } catch (e) { toast.error('Failed'); } }

  // ─── Templates ───
  function openNewTmpl() {
    var defaultComps = components.map(function(c) { return {
      component_id: c.id, code: c.code, name: c.name, component_type: c.component_type,
      enabled: !!c.auto_pair_key,
      group: c.group || '',
      calc_type: c.calc_type || 'fixed_amount',
      amount: c.default_value || 0, percentage: c.default_percentage || 0,
      calc_source_group: c.calc_source_group, calc_sources: c.calc_sources || [],
      calc_basis_mode: c.calc_basis_mode || 'earned',
      applicability_basis_mode: c.applicability_basis_mode || 'rate',
      is_fixed: c.is_fixed !== false, is_variable: c.is_variable || false,
      allow_direct_entry: c.allow_direct_entry || false,
      attendance_dependent: c.attendance_dependent !== false,
      attracts_pf: c.attracts_pf || false, attracts_esic: c.attracts_esic || false,
      attracts_pt: c.attracts_pt || false, attracts_lwf: c.attracts_lwf || false,
      attracts_ot: c.attracts_ot || false, attracts_tds: c.attracts_tds || false,
      attracts_bonus: c.attracts_bonus || false,
      classification: c.classification || 'inclusion_wages',
      applicability: c.applicability,
      has_slabs: c.has_slabs || false, slabs: c.slabs || [], slab_salary_basis: c.slab_salary_basis,
      auto_pair_key: c.auto_pair_key,
      ot_config: c.ot_config,
    }; });
    setTmplForm({ template_name: '', components: defaultComps, ctc_mode: false, ctc_annual: 0, pay_type: 'monthly', pf_template_id: '', esic_template_id: '', pt_template_id: '', lwf_template_id: '', tds_template_id: '' });
    setEditTmplId(null); setComputeResult(null); setTmplDialog(true);
  }
  function openEditTmpl(t) { setTmplForm({...t}); setEditTmplId(t.id); setComputeResult(null); setTmplDialog(true); }
  function toggleTmplComp(idx) { var c = [...tmplForm.components]; c[idx] = {...c[idx], enabled: !c[idx].enabled}; setTmplForm({...tmplForm, components: c}); }
  function setTmplCompField(idx, key, val) { var c = [...tmplForm.components]; c[idx] = {...c[idx], [key]: val}; setTmplForm({...tmplForm, components: c}); }
  async function computeSalary() {
    var active = (tmplForm.components || []).filter(function(c) { return c.enabled; });
    try {
      var r = await salaryComputeAPI.compute({
        components: active,
        pay_type: tmplForm.pay_type,
        ctc_annual: tmplForm.ctc_annual || 0,
        use_statutory_auto: tmplForm.use_statutory_auto !== false,
        pf_template_id: tmplForm.pf_template_id || null,
        esic_template_id: tmplForm.esic_template_id || null,
        pt_template_id: tmplForm.pt_template_id || null,
        lwf_template_id: tmplForm.lwf_template_id || null,
        tds_template_id: tmplForm.tds_template_id || null,
      });
      setComputeResult(r.data);
    } catch (e) { toast.error('Compute failed'); }
  }
  async function saveTmpl(e) {
    e.preventDefault();
    try {
      if (editTmplId) { await salaryTemplateAPI.update(editTmplId, tmplForm); toast.success('Updated'); }
      else { await salaryTemplateAPI.create(tmplForm); toast.success('Created'); }
      setTmplDialog(false); var r = await salaryTemplateAPI.getAll(); setTemplates(r.data || []);
    } catch (e) { toast.error('Failed'); }
  }
  async function deleteTmpl(id) { try { await salaryTemplateAPI.delete(id); toast.success('Deleted'); setTemplates(templates.filter(function(t) { return t.id !== id; })); } catch (e) { toast.error('Failed'); } }

  // ─── Assign ───
  async function handleBulkAssign() {
    try { await salaryAssignmentAPI.bulkAssign(assignForm); toast.success('Assigned'); setAssignDialog(false); } catch (e) { toast.error('Failed'); }
  }

  var earningComps = components.filter(function(c) { return c.component_type === 'earning'; });
  var deductionComps = components.filter(function(c) { return c.component_type === 'deduction'; });
  var provisionComps = components.filter(function(c) { return c.component_type === 'provision'; });

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>;

  return (
    <div className="space-y-6" data-testid="salary-structure-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Salary Structure</h1><p className="text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>Components, templates & assignments</p></div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-xl" onClick={seedDefaults} data-testid="seed-defaults-btn"><Plus size={18} className="mr-2" /> Seed Defaults</Button>
          <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
          <DialogTrigger asChild><Button variant="outline" className="rounded-xl" data-testid="salary-bulk-assign"><Users size={18} className="mr-2" /> Bulk Assign</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>Bulk Assign Salary Template</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Assign By</Label><Select value={assignForm.assign_by} onValueChange={function(v) { setAssignForm({...assignForm, assign_by: v}); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="location">Location</SelectItem><SelectItem value="department">Department</SelectItem></SelectContent></Select></div>
              {assignForm.assign_by === 'location' && <div><Label>Location</Label><Select value={assignForm.target_id} onValueChange={function(v) { setAssignForm({...assignForm, target_id: v}); }}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{locations.map(function(l) { return <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>; })}</SelectContent></Select></div>}
              {assignForm.assign_by === 'department' && <div><Label>Department</Label><Select value={assignForm.target_id} onValueChange={function(v) { setAssignForm({...assignForm, target_id: v}); }}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{departments.map(function(d) { return <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>; })}</SelectContent></Select></div>}
              <div><Label>Salary Template</Label><Select value={assignForm.salary_template_id} onValueChange={function(v) { setAssignForm({...assignForm, salary_template_id: v}); }}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{templates.map(function(t) { return <SelectItem key={t.id} value={t.id}>{t.template_name}</SelectItem>; })}</SelectContent></Select></div>
              <Button onClick={handleBulkAssign} className="w-full bg-[#D96C5B] hover:bg-[#C25949]">Assign</Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white border border-[#E8E2D9] rounded-xl p-1">
          <TabsTrigger value="components" data-testid="salary-tab-components" className="rounded-lg text-sm data-[state=active]:bg-[#D96C5B] data-[state=active]:text-white">Components</TabsTrigger>
          <TabsTrigger value="templates" data-testid="salary-tab-templates" className="rounded-lg text-sm data-[state=active]:bg-[#D96C5B] data-[state=active]:text-white">Templates</TabsTrigger>
        </TabsList>

        {/* ─── COMPONENTS TAB ─── */}
        <TabsContent value="components" className="mt-6 space-y-6">
          {COMP_TYPES.map(function(ct) {
            var list = ct.key === 'earning' ? earningComps : ct.key === 'deduction' ? deductionComps : provisionComps;
            return (
              <div key={ct.key} className="bg-white border border-[#E8E2D9] rounded-2xl shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
                <div className="flex items-center justify-between p-4 border-b border-[#E8E2D9]">
                  <h3 className="text-lg font-semibold" style={{ color: ct.color, fontFamily: 'Outfit' }}>{ct.label} ({list.length})</h3>
                  <Button size="sm" onClick={function() { openNewComp(ct.key); }} className="bg-[#D96C5B] hover:bg-[#C25949] rounded-xl" data-testid={'add-' + ct.key + '-comp'}><Plus size={14} className="mr-1" /> Add</Button>
                </div>
                {list.length === 0 ? <p className="p-6 text-sm text-[#6A625E]">No {ct.label.toLowerCase()} components</p> : (
                  <div className="divide-y divide-[#E8E2D9]">
                    {list.map(function(c) { return (
                      <div key={c.id} className="flex items-center justify-between px-4 py-3 hover:bg-[#FDFBF9]">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2"><p className="font-medium text-[#2A2624] text-sm">{c.name}</p><span className="text-xs text-[#A28B7A]">({c.code})</span>{c.group && <span className="text-[9px] px-1.5 py-0.5 bg-[#7D9D85]/10 text-[#7D9D85] rounded font-semibold uppercase tracking-wide">{c.group}</span>}{c.auto_pair_key && <span className="badge badge-info text-xs">Auto-Paired: {c.auto_pair_key.toUpperCase()}</span>}{c.is_variable && <span className="badge badge-warning text-xs">Variable</span>}{c.has_slabs && <span className="text-[9px] px-1.5 py-0.5 bg-[#E8B25C]/10 text-[#E8B25C] rounded font-semibold">SLABS</span>}{c.applicability && c.applicability.enabled && <span className="text-[9px] px-1.5 py-0.5 bg-[#A28B7A]/10 text-[#A28B7A] rounded">APPLICABILITY</span>}</div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {c.attracts_pf && <span className="text-[9px] px-1.5 py-0.5 bg-[#7D9D85]/10 text-[#7D9D85] rounded">PF</span>}
                            {c.attracts_esic && <span className="text-[9px] px-1.5 py-0.5 bg-[#D96C5B]/10 text-[#D96C5B] rounded">ESIC</span>}
                            {c.attracts_pt && <span className="text-[9px] px-1.5 py-0.5 bg-[#E8B25C]/10 text-[#E8B25C] rounded">PT</span>}
                            {c.attracts_lwf && <span className="text-[9px] px-1.5 py-0.5 bg-[#4A5D4E]/10 text-[#4A5D4E] rounded">LWF</span>}
                            {c.attracts_ot && <span className="text-[9px] px-1.5 py-0.5 bg-[#A28B7A]/10 text-[#A28B7A] rounded">OT</span>}
                            {c.attracts_bonus && <span className="text-[9px] px-1.5 py-0.5 bg-[#D96C5B]/10 text-[#D96C5B] rounded">BONUS</span>}
                            {c.attracts_tds && <span className="text-[9px] px-1.5 py-0.5 bg-[#A28B7A]/10 text-[#A28B7A] rounded">TDS</span>}
                            <span className="text-[9px] px-1.5 py-0.5 bg-[#2A2624]/5 text-[#6A625E] rounded">{CLASS_LABELS[c.classification] || c.classification}</span>
                          </div>
                        </div>
                        <div className="flex space-x-1"><button onClick={function() { openEditComp(c); }} className="p-1.5 hover:bg-[#D96C5B]/10 rounded-lg"><PencilSimple size={14} className="text-[#D96C5B]" /></button><button onClick={function() { deleteComp(c.id); }} className="p-1.5 hover:bg-[#C65549]/10 rounded-lg"><Trash size={14} className="text-[#C65549]" /></button></div>
                      </div>
                    ); })}
                  </div>
                )}
              </div>
            );
          })}
        </TabsContent>

        {/* ─── TEMPLATES TAB ─── */}
        <TabsContent value="templates" className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[#2A2624]">Salary Templates</h3>
            <Button onClick={openNewTmpl} className="bg-[#D96C5B] hover:bg-[#C25949] rounded-xl" data-testid="create-salary-template"><Plus size={18} className="mr-2" /> Create Template</Button>
          </div>
          {templates.length === 0 ? (
            <div className="bg-white border border-[#E8E2D9] rounded-2xl p-12 text-center"><CurrencyDollar size={64} className="mx-auto mb-4 text-[#A28B7A] opacity-50" /><h3 className="text-xl font-semibold text-[#2A2624] mb-2">No Templates</h3><p className="text-[#6A625E]">Create salary components first, then build templates</p></div>
          ) : (
            <div className="space-y-3">{templates.map(function(t) {
              var ec = (t.components || []).filter(function(c) { return c.enabled && c.component_type === 'earning'; });
              var dc = (t.components || []).filter(function(c) { return c.enabled && c.component_type === 'deduction'; });
              var totalE = ec.reduce(function(s, c) { return s + (c.amount || 0); }, 0);
              var totalD = dc.reduce(function(s, c) { return s + (c.amount || 0); }, 0);
              return (
                <div key={t.id} className="bg-white border border-[#E8E2D9] rounded-xl p-4 hover:border-[#D96C5B] transition-colors">
                  <div className="flex items-center justify-between"><div className="flex-1"><h4 className="font-semibold text-[#2A2624]">{t.template_name}</h4><p className="text-xs text-[#6A625E] mt-1">Earnings: {ec.length} components ({fmt(totalE)}) | Deductions: {dc.length} ({fmt(totalD)}) | Net: {fmt(totalE - totalD)}</p></div>
                    <div className="flex space-x-2"><button onClick={function() { openEditTmpl(t); }} className="p-2 hover:bg-[#D96C5B]/10 rounded-lg"><PencilSimple size={16} className="text-[#D96C5B]" /></button><button onClick={function() { deleteTmpl(t.id); }} className="p-2 hover:bg-[#C65549]/10 rounded-lg"><Trash size={16} className="text-[#C65549]" /></button></div></div>
                </div>
              );
            })}</div>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── COMPONENT DIALOG ─── */}
      <Dialog open={compDialog} onOpenChange={setCompDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editCompId ? 'Edit' : 'Create'} {compForm.component_type ? compForm.component_type[0].toUpperCase() + compForm.component_type.slice(1) : ''} Component</DialogTitle></DialogHeader>
          <form onSubmit={saveComp} className="space-y-3">
            {/* Name / Code / Group */}
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">Name *</Label><Input value={compForm.name || ''} onChange={function(e) { setCompForm({...compForm, name: e.target.value}); }} required data-testid="comp-name" /></div>
              <div><Label className="text-xs">Code *</Label><Input value={compForm.code || ''} onChange={function(e) { setCompForm({...compForm, code: e.target.value.toUpperCase()}); }} required placeholder="BASIC, HRA_MH" data-testid="comp-code" /></div>
              <div><Label className="text-xs">Group</Label><Input value={compForm.group || ''} onChange={function(e) { setCompForm({...compForm, group: e.target.value}); }} placeholder="e.g. Conveyance, Overtime" data-testid="comp-group" /><p className="text-[10px] text-[#A28B7A] mt-0.5">Groups multiple variants (e.g. 2 PTs for different states)</p></div>
            </div>

            {/* Calc type */}
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">Calc Type</Label>
                <Select value={compForm.calc_type || 'fixed_amount'} onValueChange={function(v) { setCompForm({...compForm, calc_type: v}); }}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{(compForm.component_type === 'earning' ? CALC_TYPES_EARNING : CALC_TYPES_DED_PROV).map(function(ct) { return <SelectItem key={ct} value={ct}>{CALC_LABELS[ct]}</SelectItem>; })}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Classification</Label>
                <Select value={compForm.classification || 'inclusion_wages'} onValueChange={function(v) { setCompForm({...compForm, classification: v}); }}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{CLASSIFICATIONS.map(function(cl) { return <SelectItem key={cl} value={cl}>{CLASS_LABELS[cl]}</SelectItem>; })}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Calc Basis (Rate/Earned)</Label>
                <Select value={compForm.calc_basis_mode || 'earned'} onValueChange={function(v) { setCompForm({...compForm, calc_basis_mode: v}); }}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="earned">Earned Salary</SelectItem><SelectItem value="rate">Rate Salary (full-month)</SelectItem></SelectContent>
                </Select>
              </div>
            </div>

            {/* If calc_type is percentage_of_group → show group source */}
            {compForm.calc_type === 'percentage_of_group' && (
              <div><Label className="text-xs">Source Group Name</Label><Input value={compForm.calc_source_group || ''} onChange={function(e) { setCompForm({...compForm, calc_source_group: e.target.value, calc_type: 'percentage_of_group:' + e.target.value }); }} placeholder="e.g. Conveyance" /></div>
            )}
            {compForm.calc_type === 'percentage_of_club' && (
              <div><Label className="text-xs">Clubbed Component Codes (comma-separated)</Label><Input value={(compForm.calc_sources || []).join(',')} onChange={function(e) { setCompForm({...compForm, calc_sources: e.target.value.split(',').map(function(s) { return s.trim().toUpperCase(); }).filter(Boolean) }); }} placeholder="BASIC,HRA,DA" /></div>
            )}

            {/* Amounts */}
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Default Amount (INR)</Label><Input type="number" value={compForm.default_value || ''} onChange={function(e) { setCompForm({...compForm, default_value: parseFloat(e.target.value) || 0}); }} className="h-9" /></div>
              <div><Label className="text-xs">Default Percentage (%)</Label><Input type="number" value={compForm.default_percentage || ''} onChange={function(e) { setCompForm({...compForm, default_percentage: parseFloat(e.target.value) || 0}); }} className="h-9" /></div>
            </div>

            {/* Deduction auto-pair */}
            {compForm.component_type === 'deduction' && (
              <div><Label className="text-xs">Auto-Pair Key (statutory partner provision)</Label>
                <Select value={compForm.auto_pair_key || ''} onValueChange={function(v) { setCompForm({...compForm, auto_pair_key: v === 'none' ? '' : v}); }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="pf">PF (auto-creates Employer+Admin+EDLI)</SelectItem>
                    <SelectItem value="esic">ESIC (auto-creates Employer)</SelectItem>
                    <SelectItem value="lwf">LWF (auto-creates Employer)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Applicability filter (all types) */}
            <div className="border border-[#E8E2D9] rounded-xl p-3 bg-[#F9F6F0]">
              <div className="flex items-center justify-between"><p className="text-xs font-bold text-[#2A2624] uppercase">Applicability</p><Switch checked={!!(compForm.applicability && compForm.applicability.enabled)} onCheckedChange={function(v) { setCompForm({...compForm, applicability: {...(compForm.applicability||{}), enabled: v}}); }} data-testid="applicability-toggle" /></div>
              {compForm.applicability && compForm.applicability.enabled && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                  <div><Label className="text-[10px]">Basis</Label>
                    <Select value={compForm.applicability.basis || 'gross'} onValueChange={function(v) { setCompForm({...compForm, applicability: {...compForm.applicability, basis: v}}); }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{APPLICABILITY_BASES.map(function(b) { return <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>; })}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-[10px]">Rate / Earned</Label>
                    <Select value={compForm.applicability.basis_mode || 'rate'} onValueChange={function(v) { setCompForm({...compForm, applicability: {...compForm.applicability, basis_mode: v}}); }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="rate">Rate Salary</SelectItem><SelectItem value="earned">Earned Salary</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-[10px]">Operator</Label>
                    <Select value={compForm.applicability.operator || 'less_than_equal'} onValueChange={function(v) { setCompForm({...compForm, applicability: {...compForm.applicability, operator: v}}); }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{OPERATORS.map(function(o) { return <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>; })}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-[10px]">Value (INR)</Label><Input type="number" value={compForm.applicability.value_min || ''} onChange={function(e) { setCompForm({...compForm, applicability: {...compForm.applicability, value_min: parseFloat(e.target.value) || 0}}); }} className="h-8 text-xs" /></div>
                  {compForm.applicability.operator === 'between' && <div className="col-span-2"><Label className="text-[10px]">Max Value</Label><Input type="number" value={compForm.applicability.value_max || ''} onChange={function(e) { setCompForm({...compForm, applicability: {...compForm.applicability, value_max: parseFloat(e.target.value) || 0}}); }} className="h-8 text-xs" /></div>}
                  {compForm.applicability.basis === 'group' && <div className="col-span-2"><Label className="text-[10px]">Group Name</Label><Input value={compForm.applicability.group_name || ''} onChange={function(e) { setCompForm({...compForm, applicability: {...compForm.applicability, basis: 'group:' + e.target.value, group_name: e.target.value}}); }} className="h-8 text-xs" /></div>}
                </div>
              )}
              <p className="text-[10px] text-[#A28B7A] mt-2">Example: ESIC applies only if Rate Gross ≤ ₹21,000</p>
            </div>

            {/* Slabs for deduction/provision */}
            {compForm.component_type !== 'earning' && (
              <div className="border border-[#E8E2D9] rounded-xl p-3">
                <div className="flex items-center justify-between"><p className="text-xs font-bold text-[#2A2624] uppercase">Slab-based?</p><Switch checked={!!compForm.has_slabs} onCheckedChange={function(v) { setCompForm({...compForm, has_slabs: v, slabs: v && !(compForm.slabs||[]).length ? [{gender:'any', min_age:null, max_age:null, employee_category:'any', salary_from:0, salary_to:null, fixed_amount:0, rate_pct:null, rate_on:'gross'}] : compForm.slabs}); }} data-testid="slabs-toggle" /></div>
                {compForm.has_slabs && (
                  <div className="mt-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-[10px]">Slab Salary Basis</Label>
                        <Select value={compForm.slab_salary_basis || 'gross'} onValueChange={function(v) { setCompForm({...compForm, slab_salary_basis: v}); }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{APPLICABILITY_BASES.map(function(b) { return <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>; })}</SelectContent>
                        </Select>
                      </div>
                    </div>
                    {(compForm.slabs || []).map(function(s, i) { return (
                      <div key={i} className="grid grid-cols-2 md:grid-cols-8 gap-1 items-end bg-[#FDFBF9] p-2 rounded-lg">
                        <div><Label className="text-[9px]">Gender</Label>
                          <Select value={s.gender || 'any'} onValueChange={function(v) { var sl=[...compForm.slabs]; sl[i]={...sl[i],gender:v}; setCompForm({...compForm, slabs: sl}); }}>
                            <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="any">Any</SelectItem><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
                          </Select>
                        </div>
                        <div><Label className="text-[9px]">Min Age</Label><Input type="number" value={s.min_age || ''} onChange={function(e) { var sl=[...compForm.slabs]; sl[i]={...sl[i],min_age:e.target.value?parseInt(e.target.value):null}; setCompForm({...compForm,slabs:sl}); }} className="h-7 text-[10px]" /></div>
                        <div><Label className="text-[9px]">Max Age</Label><Input type="number" value={s.max_age || ''} onChange={function(e) { var sl=[...compForm.slabs]; sl[i]={...sl[i],max_age:e.target.value?parseInt(e.target.value):null}; setCompForm({...compForm,slabs:sl}); }} className="h-7 text-[10px]" /></div>
                        <div><Label className="text-[9px]">Category</Label><Input value={s.employee_category || 'any'} onChange={function(e) { var sl=[...compForm.slabs]; sl[i]={...sl[i],employee_category:e.target.value}; setCompForm({...compForm,slabs:sl}); }} className="h-7 text-[10px]" placeholder="any" /></div>
                        <div><Label className="text-[9px]">Salary From</Label><Input type="number" value={s.salary_from || ''} onChange={function(e) { var sl=[...compForm.slabs]; sl[i]={...sl[i],salary_from:parseFloat(e.target.value)||0}; setCompForm({...compForm,slabs:sl}); }} className="h-7 text-[10px]" /></div>
                        <div><Label className="text-[9px]">Salary To</Label><Input type="number" value={s.salary_to || ''} onChange={function(e) { var sl=[...compForm.slabs]; sl[i]={...sl[i],salary_to:e.target.value?parseFloat(e.target.value):null}; setCompForm({...compForm,slabs:sl}); }} className="h-7 text-[10px]" placeholder="∞" /></div>
                        <div><Label className="text-[9px]">Fixed ₹</Label><Input type="number" value={s.fixed_amount || ''} onChange={function(e) { var sl=[...compForm.slabs]; sl[i]={...sl[i],fixed_amount:parseFloat(e.target.value)||0,rate_pct:null}; setCompForm({...compForm,slabs:sl}); }} className="h-7 text-[10px]" /></div>
                        <div className="flex gap-1 items-end"><div className="flex-1"><Label className="text-[9px]">Or %</Label><Input type="number" value={s.rate_pct || ''} onChange={function(e) { var sl=[...compForm.slabs]; sl[i]={...sl[i],rate_pct:e.target.value?parseFloat(e.target.value):null,fixed_amount:null}; setCompForm({...compForm,slabs:sl}); }} className="h-7 text-[10px]" /></div><button type="button" onClick={function() { var sl=compForm.slabs.filter(function(_,idx){return idx!==i;}); setCompForm({...compForm,slabs:sl}); }} className="p-1 text-[#C65549]"><Trash size={12} /></button></div>
                      </div>
                    ); })}
                    <Button type="button" size="sm" variant="outline" onClick={function() { setCompForm({...compForm, slabs: [...(compForm.slabs||[]), {gender:'any', min_age:null, max_age:null, employee_category:'any', salary_from:0, salary_to:null, fixed_amount:0, rate_pct:null}]}); }}><Plus size={12} className="mr-1" /> Add Slab</Button>
                  </div>
                )}
              </div>
            )}

            {/* Attendance dependency + Fixed/Variable */}
            <div className="border border-[#E8E2D9] rounded-xl p-3">
              <p className="text-xs font-bold text-[#2A2624] mb-2 uppercase">Behavior</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center justify-between py-1"><Label className="text-xs">Attendance-Dependent (pro-rated)</Label><Switch checked={compForm.attendance_dependent !== false} onCheckedChange={function(v) { setCompForm({...compForm, attendance_dependent: v}); }} /></div>
                <div className="flex items-center justify-between py-1"><Label className="text-xs">Fixed Component</Label><Switch checked={compForm.is_fixed !== false} onCheckedChange={function(v) { setCompForm({...compForm, is_fixed: v}); }} /></div>
                <div className="flex items-center justify-between py-1"><Label className="text-xs">Variable (monthly)</Label><Switch checked={compForm.is_variable || false} onCheckedChange={function(v) { setCompForm({...compForm, is_variable: v}); }} /></div>
                <div className="flex items-center justify-between py-1"><Label className="text-xs">Allow Direct Entry</Label><Switch checked={compForm.allow_direct_entry || false} onCheckedChange={function(v) { setCompForm({...compForm, allow_direct_entry: v}); }} /></div>
              </div>
            </div>

            {/* Attracts (only for Earnings) */}
            {compForm.component_type === 'earning' && (
              <div className="border border-[#E8E2D9] rounded-xl p-3">
                <p className="text-xs font-bold text-[#2A2624] mb-2 uppercase">Attracts (Statutory Applicability)</p>
                <div className="grid grid-cols-4 gap-2">
                  {[['pf','PF'],['esic','ESIC'],['pt','PT'],['lwf','LWF'],['ot','OT'],['tds','TDS'],['bonus','Bonus']].map(function(pair) { var k = pair[0], l = pair[1]; var field = 'attracts_' + k; return (
                    <div key={k} className="flex items-center justify-between py-1"><Label className="text-xs">{l}</Label><Switch checked={compForm[field] || false} onCheckedChange={function(v) { setCompForm({...compForm, [field]: v}); }} /></div>
                  ); })}
                </div>
              </div>
            )}

            {/* Overtime config (only for earning components in Overtime group) */}
            {compForm.component_type === 'earning' && (compForm.group || '').toLowerCase() === 'overtime' && (
              <div className="border border-[#7D9D85]/40 rounded-xl p-3 bg-[#7D9D85]/5">
                <p className="text-xs font-bold text-[#7D9D85] mb-2 uppercase">Overtime Configuration</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-[10px]">Rate Type</Label>
                    <Select value={(compForm.ot_config||{}).rate_type || 'fixed'} onValueChange={function(v) { setCompForm({...compForm, ot_config: {...(compForm.ot_config||{}), rate_type: v}}); }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="fixed">Fixed per hour</SelectItem><SelectItem value="calculative">Calculative (factor)</SelectItem></SelectContent>
                    </Select>
                  </div>
                  {(compForm.ot_config||{}).rate_type === 'fixed' ? (
                    <div><Label className="text-[10px]">Fixed ₹/hour</Label><Input type="number" value={(compForm.ot_config||{}).fixed_rate || ''} onChange={function(e) { setCompForm({...compForm, ot_config: {...(compForm.ot_config||{}), fixed_rate: parseFloat(e.target.value)||0}}); }} className="h-8 text-xs" /></div>
                  ) : (
                    <>
                      <div><Label className="text-[10px]">Factor</Label>
                        <Select value={(compForm.ot_config||{}).factor || 'one_half'} onValueChange={function(v) { setCompForm({...compForm, ot_config: {...(compForm.ot_config||{}), factor: v}}); }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="single">1x</SelectItem><SelectItem value="one_half">1.5x</SelectItem><SelectItem value="double">2x</SelectItem><SelectItem value="triple">3x</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div><Label className="text-[10px]">Day Basis</Label>
                        <Select value={(compForm.ot_config||{}).calc_basis || 'actual_days'} onValueChange={function(v) { setCompForm({...compForm, ot_config: {...(compForm.ot_config||{}), calc_basis: v}}); }}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="actual_days">Actual days in month</SelectItem><SelectItem value="fixed_30">Fixed 30</SelectItem><SelectItem value="fixed_26">Fixed 26</SelectItem></SelectContent>
                        </Select>
                      </div>
                      <div><Label className="text-[10px]">Hrs/day</Label><Input type="number" value={(compForm.ot_config||{}).hours_per_day || 8} onChange={function(e) { setCompForm({...compForm, ot_config: {...(compForm.ot_config||{}), hours_per_day: parseFloat(e.target.value)||8}}); }} className="h-8 text-xs" /></div>
                    </>
                  )}
                </div>
                <p className="text-[10px] text-[#A28B7A] mt-2">OT config now lives on each OT component — you can create multiple OT variants under the "Overtime" group with different factors.</p>
              </div>
            )}

            <Button type="submit" className="w-full bg-[#D96C5B] hover:bg-[#C25949]" data-testid="save-component">{editCompId ? 'Update' : 'Create'} Component</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── TEMPLATE DIALOG ─── */}
      <Dialog open={tmplDialog} onOpenChange={setTmplDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader><DialogTitle>{editTmplId ? 'Edit' : 'Create'} Salary Template</DialogTitle></DialogHeader>
          <form onSubmit={saveTmpl}>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div><Label className="text-xs">Template Name *</Label><Input value={tmplForm.template_name || ''} onChange={function(e) { setTmplForm({...tmplForm, template_name: e.target.value}); }} required /></div>
              <div><Label className="text-xs">Pay Type</Label><Select value={tmplForm.pay_type || 'monthly'} onValueChange={function(v) { setTmplForm({...tmplForm, pay_type: v}); }}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="daily">Daily Wage</SelectItem></SelectContent></Select></div>
              <div className="flex items-end"><Button type="button" onClick={computeSalary} variant="outline" className="w-full h-9 text-xs" data-testid="compute-salary-btn"><CurrencyDollar size={14} className="mr-1" /> Compute</Button></div>
            </div>

            {/* Statutory linking — for accurate PF/ESIC/PT/LWF/TDS calc */}
            <div className="border border-[#E8E2D9] rounded-xl p-3 mb-3 bg-[#F9F6F0]">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-[#2A2624] uppercase">Statutory Auto-Calculation</p>
                <div className="flex items-center gap-2"><Label className="text-xs">Auto compute PF/ESIC/PT/TDS</Label><Switch checked={tmplForm.use_statutory_auto !== false} onCheckedChange={function(v) { setTmplForm({...tmplForm, use_statutory_auto: v}); }} data-testid="use-statutory-auto" /></div>
              </div>
              {tmplForm.use_statutory_auto !== false && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {[
                    { key: 'pf_template_id', type: 'pf', label: 'PF' },
                    { key: 'esic_template_id', type: 'esic', label: 'ESIC' },
                    { key: 'pt_template_id', type: 'pt', label: 'PT' },
                    { key: 'lwf_template_id', type: 'lwf', label: 'LWF' },
                    { key: 'tds_template_id', type: 'tds', label: 'TDS' },
                  ].map(function(s) { var list = complianceTpls[s.type] || []; return (
                    <div key={s.key}>
                      <Label className="text-[10px]">{s.label} Template</Label>
                      <Select value={tmplForm[s.key] || ''} onValueChange={function(v) { setTmplForm({...tmplForm, [s.key]: v === 'default' ? '' : v}); }}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Use default" /></SelectTrigger>
                        <SelectContent><SelectItem value="default">Use default rules</SelectItem>{list.map(function(t) { return <SelectItem key={t.id} value={t.id}>{t.name || t.template_name || 'Unnamed'}</SelectItem>; })}</SelectContent>
                      </Select>
                    </div>
                  ); })}
                </div>
              )}
              <p className="text-[10px] text-[#A28B7A] mt-2">When on: PF caps at ₹15,000 basic, ESIC applies only if gross ≤ ₹21,000, PT uses state slabs, TDS uses New Regime 2024-25. Link compliance templates to use employee-specific slabs.</p>
            </div>

            {/* Policy Links — connect this salary template to leave/attendance/overtime/bonus/gratuity/reimbursement policies */}
            <div className="border border-[#E8E2D9] rounded-xl p-3 mb-3 bg-[#7D9D85]/5">
              <p className="text-xs font-bold text-[#7D9D85] uppercase mb-2">Policy Links</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {[
                  { key: 'leave_policy_id', type: 'leave', label: 'Leave Policy' },
                  { key: 'attendance_policy_id', type: 'attendance', label: 'Attendance Policy' },
                  { key: 'overtime_policy_id', type: 'overtime', label: 'Overtime Policy' },
                  { key: 'reimbursement_policy_id', type: 'reimbursement', label: 'Reimbursement Policy' },
                  { key: 'bonus_policy_id', type: 'bonus', label: 'Bonus Policy' },
                  { key: 'gratuity_policy_id', type: 'gratuity', label: 'Gratuity Policy' },
                ].map(function(p) { var list = policyTpls[p.type] || []; return (
                  <div key={p.key}>
                    <Label className="text-[10px]">{p.label}</Label>
                    <Select value={tmplForm[p.key] || ''} onValueChange={function(v) { setTmplForm({...tmplForm, [p.key]: v === 'none' ? '' : v}); }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Not linked" /></SelectTrigger>
                      <SelectContent><SelectItem value="none">Not linked</SelectItem>{list.map(function(t) { return <SelectItem key={t.id} value={t.id}>{t.template_name || t.name || 'Unnamed'}</SelectItem>; })}</SelectContent>
                    </Select>
                  </div>
                ); })}
              </div>
              <p className="text-[10px] text-[#A28B7A] mt-2">Linked policies drive attendance-based pro-rating (rate_days/earned_days), OT factors, Bonus eligibility and Gratuity rules when Payroll Run executes.</p>
            </div>

            {/* Component list */}
            <div className="max-h-[45vh] overflow-y-auto border border-[#E8E2D9] rounded-xl">
              {COMP_TYPES.map(function(ct) {
                var list = (tmplForm.components || []).filter(function(c) { return c.component_type === ct.key; });
                if (list.length === 0) return null;
                return (
                  <div key={ct.key}>
                    <div className="sticky top-0 bg-[#F9F6F0] px-4 py-2 border-b border-[#E8E2D9]"><p className="text-xs font-bold uppercase" style={{ color: ct.color }}>{ct.label}</p></div>
                    {list.map(function(c) {
                      var idx = tmplForm.components.indexOf(c);
                      return (
                        <div key={c.component_id} className={'flex items-center gap-2 px-4 py-2 border-b border-[#E8E2D9]/50 ' + (c.enabled ? '' : 'opacity-40')}>
                          <Switch checked={c.enabled} onCheckedChange={function() { toggleTmplComp(idx); }} />
                          <div className="w-28 truncate"><p className="text-xs font-medium">{c.name}</p><p className="text-[9px] text-[#A28B7A]">{c.code}</p></div>
                          <Select value={c.calc_type || 'fixed_amount'} onValueChange={function(v) { setTmplCompField(idx, 'calc_type', v); }} disabled={!c.enabled}>
                            <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{(c.component_type === 'earning' ? CALC_TYPES_EARNING : CALC_TYPES_DED_PROV).map(function(ct2) { return <SelectItem key={ct2} value={ct2} className="text-xs">{CALC_LABELS[ct2]}</SelectItem>; })}</SelectContent>
                          </Select>
                          {c.calc_type === 'fixed_amount' ? (
                            <Input type="number" value={c.amount || ''} onChange={function(e) { setTmplCompField(idx, 'amount', parseFloat(e.target.value) || 0); }} className="h-7 w-24 text-xs" placeholder="Amount" disabled={!c.enabled} />
                          ) : (
                            <Input type="number" value={c.percentage || ''} onChange={function(e) { setTmplCompField(idx, 'percentage', parseFloat(e.target.value) || 0); }} className="h-7 w-20 text-xs" placeholder="%" disabled={!c.enabled} />
                          )}
                          <Select value={c.classification || 'inclusion_wages'} onValueChange={function(v) { setTmplCompField(idx, 'classification', v); }} disabled={!c.enabled}>
                            <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{CLASSIFICATIONS.map(function(cl) { return <SelectItem key={cl} value={cl} className="text-xs">{CLASS_LABELS[cl]}</SelectItem>; })}</SelectContent>
                          </Select>
                          {c.is_variable && <span className="text-[8px] px-1 py-0.5 bg-[#E8B25C]/20 text-[#E8B25C] rounded">VAR</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Compute Result */}
            {computeResult && (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-[#7D9D85]/10 rounded-xl p-3 text-center"><p className="text-xs text-[#6A625E]">Gross</p><p className="text-lg font-bold text-[#7D9D85]">{fmt(computeResult.gross_monthly)}</p><p className="text-[10px] text-[#A28B7A]">Annual: {fmt(computeResult.gross_annual)}</p></div>
                  <div className="bg-[#D96C5B]/10 rounded-xl p-3 text-center"><p className="text-xs text-[#6A625E]">Deductions</p><p className="text-lg font-bold text-[#D96C5B]">{fmt(computeResult.total_deductions_monthly)}</p><p className="text-[10px] text-[#A28B7A]">Annual: {fmt(computeResult.total_deductions_annual)}</p></div>
                  <div className="bg-[#2A2624]/5 rounded-xl p-3 text-center"><p className="text-xs text-[#6A625E]">Net / Take-Home</p><p className="text-lg font-bold text-[#2A2624]">{fmt(computeResult.net_monthly)}</p><p className="text-[10px] text-[#A28B7A]">Annual: {fmt(computeResult.net_annual)}</p></div>
                  <div className="bg-[#E8B25C]/10 rounded-xl p-3 text-center"><p className="text-xs text-[#6A625E]">CTC</p><p className="text-lg font-bold text-[#E8B25C]">{fmt(computeResult.ctc_monthly)}</p><p className="text-[10px] text-[#A28B7A]">Annual: {fmt(computeResult.ctc_annual)}</p></div>
                  {computeResult.gross_daily && <div className="bg-[#4A5D4E]/10 rounded-xl p-3 text-center col-span-2"><p className="text-xs text-[#6A625E]">Daily Wage</p><p className="text-lg font-bold text-[#4A5D4E]">Gross: {fmt(computeResult.gross_daily)} | Net: {fmt(computeResult.net_daily)}</p></div>}
                </div>

                {/* Per-component breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-white border border-[#E8E2D9] rounded-xl p-3">
                    <p className="text-xs font-bold text-[#7D9D85] uppercase mb-2">Earnings Breakdown</p>
                    {(computeResult.earnings || []).map(function(e, i) { return (
                      <div key={i} className="flex justify-between text-xs py-1 border-b border-[#E8E2D9]/50 last:border-0">
                        <span className="text-[#6A625E] truncate mr-2" title={e.name}>{e.name}{e.calc_type !== 'fixed_amount' && e.percentage ? ' (' + e.percentage + '%)' : ''}</span>
                        <span className="font-medium text-[#2A2624]">{fmt(e.amount)}</span>
                      </div>
                    ); })}
                  </div>
                  <div className="bg-white border border-[#E8E2D9] rounded-xl p-3">
                    <p className="text-xs font-bold text-[#D96C5B] uppercase mb-2">Deductions Breakdown</p>
                    {(computeResult.deductions || []).map(function(d, i) { return (
                      <div key={i} className="flex justify-between text-xs py-1 border-b border-[#E8E2D9]/50 last:border-0">
                        <span className="text-[#6A625E] truncate mr-2" title={d.name}>{d.name}{d.is_statutory_computed && <span className="ml-1 text-[9px] text-[#7D9D85]">(auto)</span>}</span>
                        <span className="font-medium text-[#2A2624]">{fmt(d.amount)}</span>
                      </div>
                    ); })}
                  </div>
                  <div className="bg-white border border-[#E8E2D9] rounded-xl p-3">
                    <p className="text-xs font-bold text-[#E8B25C] uppercase mb-2">Provisions Breakdown</p>
                    {(computeResult.provisions || []).map(function(p, i) { return (
                      <div key={i} className="flex justify-between text-xs py-1 border-b border-[#E8E2D9]/50 last:border-0">
                        <span className="text-[#6A625E] truncate mr-2" title={p.name}>{p.name}{p.is_statutory_computed && <span className="ml-1 text-[9px] text-[#7D9D85]">(auto)</span>}</span>
                        <span className="font-medium text-[#2A2624]">{fmt(p.amount)}</span>
                      </div>
                    ); })}
                  </div>
                </div>

                {/* Statutory summary */}
                {computeResult.statutory && (
                  <div className="bg-[#F9F6F0] border border-[#E8E2D9] rounded-xl p-3">
                    <p className="text-xs font-bold text-[#2A2624] uppercase mb-2">Statutory Summary (per Indian Labour Law)</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      {computeResult.statutory.pf && <div><p className="text-[#A28B7A]">PF Wages</p><p className="font-semibold">{fmt(computeResult.statutory.pf.base_used)} <span className="text-[9px] text-[#A28B7A]">(cap ₹15,000)</span></p><p className="text-[10px] text-[#D96C5B]">Emp: {fmt(computeResult.statutory.pf.employee)} | Er: {fmt(computeResult.statutory.pf.employer)}</p></div>}
                      {computeResult.statutory.esic && <div><p className="text-[#A28B7A]">ESIC</p><p className="font-semibold">{computeResult.statutory.esic.applicable ? 'Applicable' : 'N/A (>₹21K)'}</p>{computeResult.statutory.esic.applicable && <p className="text-[10px] text-[#D96C5B]">Emp: {fmt(computeResult.statutory.esic.employee)} | Er: {fmt(computeResult.statutory.esic.employer)}</p>}</div>}
                      {computeResult.statutory.pt && <div><p className="text-[#A28B7A]">Professional Tax</p><p className="font-semibold">{fmt(computeResult.statutory.pt.amount)}</p><p className="text-[10px] text-[#A28B7A]">monthly slab</p></div>}
                      {computeResult.statutory.tds && <div><p className="text-[#A28B7A]">TDS (Monthly)</p><p className="font-semibold">{fmt(computeResult.statutory.tds.monthly_tds)}</p><p className="text-[10px] text-[#A28B7A]">On ₹{Number(computeResult.statutory.tds.annual_taxable).toLocaleString('en-IN')} annual</p></div>}
                    </div>
                  </div>
                )}
              </div>
            )}

            <Button type="submit" className="w-full bg-[#D96C5B] hover:bg-[#C25949] mt-4">{editTmplId ? 'Update' : 'Create'} Template</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
