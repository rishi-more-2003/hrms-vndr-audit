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
var CALC_TYPES = ['fixed_amount', 'percentage_of_basic', 'percentage_of_gross', 'percentage_of_ctc'];
var CALC_LABELS = { fixed_amount: 'Fixed Amount', percentage_of_basic: '% of Basic', percentage_of_gross: '% of Gross', percentage_of_ctc: '% of CTC' };
var fmt = function(n) { return '\u20B9' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); };

export default function SalaryStructurePage() {
  var [tab, setTab] = useState('components');
  var [components, setComponents] = useState([]);
  var [templates, setTemplates] = useState([]);
  var [employees, setEmployees] = useState([]);
  var [locations, setLocations] = useState([]);
  var [departments, setDepartments] = useState([]);
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
    } catch (e) { /* ok */ }
    setLoading(false);
  }

  // ─── Components ───
  function openNewComp(type) {
    setCompForm({
      name: '', code: '', component_type: type, category: 'standard',
      is_statutory: false, auto_pair_key: '', calc_type: 'fixed_amount',
      default_value: 0, default_percentage: 0,
      is_fixed: true, is_variable: false, allow_direct_entry: false,
      attracts_pf: false, attracts_esic: false, attracts_pt: false,
      attracts_lwf: false, attracts_ot: false, attracts_tds: false,
      classification: 'inclusion_wages'
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
    var defaultComps = components.map(function(c) { return { component_id: c.id, code: c.code, name: c.name, component_type: c.component_type, enabled: c.is_statutory || false, calc_type: c.calc_type || 'fixed_amount', amount: c.default_value || 0, percentage: c.default_percentage || 0, is_fixed: c.is_fixed !== false, is_variable: c.is_variable || false, allow_direct_entry: c.allow_direct_entry || false, attracts_pf: c.attracts_pf || false, attracts_esic: c.attracts_esic || false, attracts_pt: c.attracts_pt || false, attracts_lwf: c.attracts_lwf || false, attracts_ot: c.attracts_ot || false, attracts_tds: c.attracts_tds || false, classification: c.classification || 'inclusion_wages' }; });
    setTmplForm({ template_name: '', components: defaultComps, ctc_mode: false, ctc_annual: 0, pay_type: 'monthly', pf_template_id: '', esic_template_id: '', pt_template_id: '', lwf_template_id: '', tds_template_id: '' });
    setEditTmplId(null); setComputeResult(null); setTmplDialog(true);
  }
  function openEditTmpl(t) { setTmplForm({...t}); setEditTmplId(t.id); setComputeResult(null); setTmplDialog(true); }
  function toggleTmplComp(idx) { var c = [...tmplForm.components]; c[idx] = {...c[idx], enabled: !c[idx].enabled}; setTmplForm({...tmplForm, components: c}); }
  function setTmplCompField(idx, key, val) { var c = [...tmplForm.components]; c[idx] = {...c[idx], [key]: val}; setTmplForm({...tmplForm, components: c}); }
  async function computeSalary() {
    var active = tmplForm.components.filter(function(c) { return c.enabled; }).map(function(c) { return {...c, amount: c.calc_type === 'fixed_amount' ? (c.amount || 0) : 0 }; });
    try { var r = await salaryComputeAPI.compute({ components: active, pay_type: tmplForm.pay_type }); setComputeResult(r.data); } catch (e) { toast.error('Compute failed'); }
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
                          <div className="flex items-center space-x-2"><p className="font-medium text-[#2A2624] text-sm">{c.name}</p><span className="text-xs text-[#A28B7A]">({c.code})</span>{c.is_statutory && <span className="badge badge-info text-xs">Statutory</span>}{c.is_variable && <span className="badge badge-warning text-xs">Variable</span>}</div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {c.attracts_pf && <span className="text-[9px] px-1.5 py-0.5 bg-[#7D9D85]/10 text-[#7D9D85] rounded">PF</span>}
                            {c.attracts_esic && <span className="text-[9px] px-1.5 py-0.5 bg-[#D96C5B]/10 text-[#D96C5B] rounded">ESIC</span>}
                            {c.attracts_pt && <span className="text-[9px] px-1.5 py-0.5 bg-[#E8B25C]/10 text-[#E8B25C] rounded">PT</span>}
                            {c.attracts_tds && <span className="text-[9px] px-1.5 py-0.5 bg-[#A28B7A]/10 text-[#A28B7A] rounded">TDS</span>}
                            <span className="text-[9px] px-1.5 py-0.5 bg-[#2A2624]/5 text-[#6A625E] rounded">{CLASS_LABELS[c.classification] || c.classification}</span>
                          </div>
                        </div>
                        <div className="flex space-x-1"><button onClick={function() { openEditComp(c); }} className="p-1.5 hover:bg-[#D96C5B]/10 rounded-lg"><PencilSimple size={14} className="text-[#D96C5B]" /></button>{!c.is_statutory && <button onClick={function() { deleteComp(c.id); }} className="p-1.5 hover:bg-[#C65549]/10 rounded-lg"><Trash size={14} className="text-[#C65549]" /></button>}</div>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editCompId ? 'Edit' : 'Create'} Component</DialogTitle></DialogHeader>
          <form onSubmit={saveComp} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Name *</Label><Input value={compForm.name || ''} onChange={function(e) { setCompForm({...compForm, name: e.target.value}); }} required /></div>
              <div><Label className="text-xs">Code *</Label><Input value={compForm.code || ''} onChange={function(e) { setCompForm({...compForm, code: e.target.value}); }} required placeholder="e.g. BASIC, HRA" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">Type</Label><Select value={compForm.component_type || 'earning'} onValueChange={function(v) { setCompForm({...compForm, component_type: v}); }}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="earning">Earning</SelectItem><SelectItem value="deduction">Deduction</SelectItem><SelectItem value="provision">Provision</SelectItem></SelectContent></Select></div>
              <div><Label className="text-xs">Calc Type</Label><Select value={compForm.calc_type || 'fixed_amount'} onValueChange={function(v) { setCompForm({...compForm, calc_type: v}); }}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{CALC_TYPES.map(function(ct) { return <SelectItem key={ct} value={ct}>{CALC_LABELS[ct]}</SelectItem>; })}</SelectContent></Select></div>
              <div><Label className="text-xs">Classification</Label><Select value={compForm.classification || 'inclusion_wages'} onValueChange={function(v) { setCompForm({...compForm, classification: v}); }}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{CLASSIFICATIONS.map(function(cl) { return <SelectItem key={cl} value={cl}>{CLASS_LABELS[cl]}</SelectItem>; })}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Default Amount (INR)</Label><Input type="number" value={compForm.default_value || ''} onChange={function(e) { setCompForm({...compForm, default_value: parseFloat(e.target.value) || 0}); }} className="h-9" /></div>
              <div><Label className="text-xs">Default Percentage (%)</Label><Input type="number" value={compForm.default_percentage || ''} onChange={function(e) { setCompForm({...compForm, default_percentage: parseFloat(e.target.value) || 0}); }} className="h-9" /></div>
            </div>
            {compForm.component_type === 'deduction' && (
              <div><Label className="text-xs">Auto-Pair Key (for auto-creating provisions)</Label><Select value={compForm.auto_pair_key || ''} onValueChange={function(v) { setCompForm({...compForm, auto_pair_key: v}); }}><SelectTrigger className="h-9"><SelectValue placeholder="None" /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="pf">PF (creates Employer, Admin, EDLI provisions)</SelectItem><SelectItem value="esic">ESIC (creates Employer provision)</SelectItem><SelectItem value="lwf">LWF (creates Employer provision)</SelectItem></SelectContent></Select></div>
            )}
            <div className="border border-[#E8E2D9] rounded-xl p-3">
              <p className="text-xs font-bold text-[#2A2624] mb-2 uppercase">Fixed / Variable</p>
              <div className="space-y-1">
                <div className="flex items-center justify-between py-1"><Label className="text-xs">Fixed Component</Label><Switch checked={compForm.is_fixed !== false} onCheckedChange={function(v) { setCompForm({...compForm, is_fixed: v}); }} /></div>
                <div className="flex items-center justify-between py-1"><Label className="text-xs">Variable (amount may change monthly)</Label><Switch checked={compForm.is_variable || false} onCheckedChange={function(v) { setCompForm({...compForm, is_variable: v}); }} /></div>
                <div className="flex items-center justify-between py-1"><Label className="text-xs">Allow Direct Entry (override fixed amount)</Label><Switch checked={compForm.allow_direct_entry || false} onCheckedChange={function(v) { setCompForm({...compForm, allow_direct_entry: v}); }} /></div>
              </div>
              {compForm.allow_direct_entry && <p className="text-xs text-[#A28B7A] mt-1">Admin can enter a different amount for this component when processing payroll (e.g. extra conveyance)</p>}
            </div>
            <div className="border border-[#E8E2D9] rounded-xl p-3">
              <p className="text-xs font-bold text-[#2A2624] mb-2 uppercase">Attracts (Statutory Applicability)</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex items-center justify-between py-1"><Label className="text-xs">PF</Label><Switch checked={compForm.attracts_pf || false} onCheckedChange={function(v) { setCompForm({...compForm, attracts_pf: v}); }} /></div>
                <div className="flex items-center justify-between py-1"><Label className="text-xs">ESIC</Label><Switch checked={compForm.attracts_esic || false} onCheckedChange={function(v) { setCompForm({...compForm, attracts_esic: v}); }} /></div>
                <div className="flex items-center justify-between py-1"><Label className="text-xs">PT</Label><Switch checked={compForm.attracts_pt || false} onCheckedChange={function(v) { setCompForm({...compForm, attracts_pt: v}); }} /></div>
                <div className="flex items-center justify-between py-1"><Label className="text-xs">LWF</Label><Switch checked={compForm.attracts_lwf || false} onCheckedChange={function(v) { setCompForm({...compForm, attracts_lwf: v}); }} /></div>
                <div className="flex items-center justify-between py-1"><Label className="text-xs">OT</Label><Switch checked={compForm.attracts_ot || false} onCheckedChange={function(v) { setCompForm({...compForm, attracts_ot: v}); }} /></div>
                <div className="flex items-center justify-between py-1"><Label className="text-xs">TDS</Label><Switch checked={compForm.attracts_tds || false} onCheckedChange={function(v) { setCompForm({...compForm, attracts_tds: v}); }} /></div>
              </div>
            </div>
            <div className="flex items-center justify-between py-1"><Label className="text-xs">Statutory Component</Label><Switch checked={compForm.is_statutory || false} onCheckedChange={function(v) { setCompForm({...compForm, is_statutory: v}); }} /></div>
            <Button type="submit" className="w-full bg-[#D96C5B] hover:bg-[#C25949]">{editCompId ? 'Update' : 'Create'} Component</Button>
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
              <div className="flex items-end"><Button type="button" onClick={computeSalary} variant="outline" className="w-full h-9 text-xs"><CurrencyDollar size={14} className="mr-1" /> Compute</Button></div>
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
                            <SelectContent>{CALC_TYPES.map(function(ct2) { return <SelectItem key={ct2} value={ct2} className="text-xs">{CALC_LABELS[ct2]}</SelectItem>; })}</SelectContent>
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
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-[#7D9D85]/10 rounded-xl p-3 text-center"><p className="text-xs text-[#6A625E]">Gross</p><p className="text-lg font-bold text-[#7D9D85]">{fmt(computeResult.gross_monthly)}</p><p className="text-[10px] text-[#A28B7A]">Annual: {fmt(computeResult.gross_annual)}</p></div>
                <div className="bg-[#D96C5B]/10 rounded-xl p-3 text-center"><p className="text-xs text-[#6A625E]">Deductions</p><p className="text-lg font-bold text-[#D96C5B]">{fmt(computeResult.total_deductions_monthly)}</p><p className="text-[10px] text-[#A28B7A]">Annual: {fmt(computeResult.total_deductions_annual)}</p></div>
                <div className="bg-[#2A2624]/5 rounded-xl p-3 text-center"><p className="text-xs text-[#6A625E]">Net / Take-Home</p><p className="text-lg font-bold text-[#2A2624]">{fmt(computeResult.net_monthly)}</p><p className="text-[10px] text-[#A28B7A]">Annual: {fmt(computeResult.net_annual)}</p></div>
                <div className="bg-[#E8B25C]/10 rounded-xl p-3 text-center"><p className="text-xs text-[#6A625E]">CTC</p><p className="text-lg font-bold text-[#E8B25C]">{fmt(computeResult.ctc_monthly)}</p><p className="text-[10px] text-[#A28B7A]">Annual: {fmt(computeResult.ctc_annual)}</p></div>
                {computeResult.gross_daily && <div className="bg-[#4A5D4E]/10 rounded-xl p-3 text-center col-span-2"><p className="text-xs text-[#6A625E]">Daily Wage</p><p className="text-lg font-bold text-[#4A5D4E]">Gross: {fmt(computeResult.gross_daily)} | Net: {fmt(computeResult.net_daily)}</p></div>}
              </div>
            )}

            <Button type="submit" className="w-full bg-[#D96C5B] hover:bg-[#C25949] mt-4">{editTmplId ? 'Update' : 'Create'} Template</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
