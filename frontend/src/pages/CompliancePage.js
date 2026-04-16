import React, { useEffect, useState } from 'react';
import { complianceTemplateAPI, complianceAssignmentAPI, employeeAPI, locationAPI, departmentAPI } from '../services/api';
import { ShieldCheck, Plus, Trash, PencilSimple, Users, Info } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';

var TEMPLATE_TYPES = [
  { key: 'pf', label: 'Provident Fund' },
  { key: 'esic', label: 'ESIC' },
  { key: 'pt', label: 'Profession Tax' },
  { key: 'lwf', label: 'Labour Welfare Fund' },
  { key: 'tds', label: 'Income Tax (TDS)' },
];

// PF Fields with conditional groups
var PF_BASE_FIELDS = [
  { key: 'template_name', label: 'Template Name', type: 'text', required: true },
  { key: 'pf_applicable', label: 'PF Applicable', type: 'switch' },
  { key: 'pf_office', label: 'PF Office', type: 'text' },
  { key: 'pf_code_number', label: 'PF Code Number', type: 'text' },
  { key: 'date_of_coverage_pf', label: 'Date of Coverage (PF)', type: 'date' },
  { key: 'date_of_coverage_pension', label: 'Date of Coverage (Pension)', type: 'date' },
  { key: 'date_of_coverage_edli', label: 'Date of Coverage (EDLI)', type: 'date' },
  { key: 'contribution_rate', label: 'Rate of Contribution (%)', type: 'number', default: 12 },
  { key: 'estb_pf_group_task_no', label: 'Estb PF Group & Task Number', type: 'text' },
  { key: 'registered_address', label: 'Registered Address', type: 'textarea' },
  { key: 'auth_signatory_name', label: 'Authorized Signatory Name', type: 'text' },
  { key: 'auth_signatory_designation', label: 'Authorized Signatory Designation', type: 'text' },
  { key: 'wage_ceiling', label: 'PF Wage Ceiling', type: 'number', default: 15000 },
  { key: 'admin_charges_rate', label: 'Admin Charges Rate (%)', type: 'number', default: 0.5 },
];
var PF_EXEMPTION_FIELDS = [
  { key: 'trust_name', label: 'Trust Name', type: 'text' },
  { key: 'industry_type', label: 'Industry Type', type: 'text' },
  { key: 'exemption_section', label: 'Exemption Section', type: 'text' },
  { key: 'exemption_date', label: 'Exemption Date', type: 'date' },
  { key: 'exemption_authority', label: 'Exemption Authority', type: 'text' },
  { key: 'present_board_date', label: 'Present Board Date', type: 'date' },
  { key: 'board_term', label: 'Board Term', type: 'text' },
];
var EDLI_EXEMPTION_FIELDS = [
  { key: 'edli_master_policy', label: 'EDLI Master Policy No', type: 'text' },
  { key: 'edli_premium', label: 'EDLI Premium', type: 'number' },
  { key: 'edli_payment_date', label: 'Date of Payment', type: 'date' },
  { key: 'edli_policy_period', label: 'Policy Period', type: 'text' },
  { key: 'edli_insurer', label: 'Insurance Company', type: 'text' },
];

var ESIC_FIELDS = [
  { key: 'template_name', label: 'Template Name', type: 'text', required: true },
  { key: 'esic_code_no', label: 'ESIC Code No', type: 'text' },
  { key: 'date_of_commencement', label: 'Date of Commencement', type: 'date' },
  { key: 'esic_local_office', label: 'ESIC Local Office', type: 'text' },
  { key: 'employee_contribution', label: 'Employee Contribution (%)', type: 'number', default: 0.75 },
  { key: 'employer_contribution', label: 'Employer Contribution (%)', type: 'number', default: 3.25 },
  { key: 'wage_ceiling', label: 'Wage Ceiling (Monthly)', type: 'number', default: 21000 },
  { key: 'auth_signatory_name', label: 'Authorized Signatory Name', type: 'text' },
  { key: 'auth_signatory_designation', label: 'Authorized Signatory Designation', type: 'text' },
  { key: 'dispensary_name', label: 'Dispensary Name', type: 'text' },
  { key: 'dispensary_address', label: 'Dispensary Address', type: 'text' },
];

var PT_FIELDS = [
  { key: 'template_name', label: 'Template Name', type: 'text', required: true },
  { key: 'pt_code_no', label: 'PT Code No', type: 'text' },
  { key: 'jurisdiction_state', label: 'Jurisdiction State', type: 'text' },
  { key: 'jurisdiction_city', label: 'Jurisdiction City', type: 'text' },
  { key: 'date_of_commencement', label: 'Date of Commencement', type: 'date' },
  { key: 'pt_office', label: 'PT Office', type: 'text' },
];

var LWF_FIELDS = [
  { key: 'template_name', label: 'Template Name', type: 'text', required: true },
  { key: 'lwf_code_no', label: 'LWF Code No', type: 'text' },
  { key: 'date_of_commencement', label: 'Date of Commencement', type: 'date' },
  { key: 'jurisdiction_state', label: 'Jurisdiction State', type: 'text' },
  { key: 'jurisdiction_city', label: 'Jurisdiction City', type: 'text' },
  { key: 'lwf_office', label: 'LWF Office', type: 'text' },
];

var TDS_FIELDS = [
  { key: 'template_name', label: 'Template Name', type: 'text', required: true },
  { key: 'tax_regime', label: 'Tax Regime', type: 'select', options: ['new_regime', 'old_regime'] },
  { key: 'employer_tan', label: 'Employer TAN', type: 'text' },
  { key: 'employer_pan', label: 'Employer PAN', type: 'text' },
  { key: 'deduction_circle', label: 'Deduction Circle/Ward', type: 'text' },
  { key: 'standard_deduction', label: 'Standard Deduction', type: 'number', default: 75000 },
  { key: 'surcharge_applicable', label: 'Surcharge Applicable', type: 'switch' },
  { key: 'cess_rate', label: 'Health & Education Cess (%)', type: 'number', default: 4 },
  { key: 'section_192', label: 'Section 192 Compliance', type: 'switch' },
];

function renderField(f, data, onChange) {
  if (f.type === 'switch') {
    return (
      <div key={f.key} className="flex items-center justify-between py-2 border-b border-[#E8E2D9]/50">
        <Label className="text-sm">{f.label}</Label>
        <Switch checked={!!data[f.key]} onCheckedChange={function(v) { onChange({...data, [f.key]: v}); }} data-testid={'field-' + f.key} />
      </div>
    );
  }
  if (f.type === 'select') {
    return (
      <div key={f.key}>
        <Label className="text-sm">{f.label}</Label>
        <Select value={data[f.key] || ''} onValueChange={function(v) { onChange({...data, [f.key]: v}); }}>
          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>{(f.options || []).map(function(o) { return <SelectItem key={o} value={o}>{o.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); })}</SelectItem>; })}</SelectContent>
        </Select>
      </div>
    );
  }
  if (f.type === 'textarea') {
    return <div key={f.key}><Label className="text-sm">{f.label}</Label><Textarea value={data[f.key] || ''} onChange={function(e) { onChange({...data, [f.key]: e.target.value}); }} /></div>;
  }
  return (
    <div key={f.key}>
      <Label className="text-sm">{f.label}{f.required ? ' *' : ''}</Label>
      <Input type={f.type} value={data[f.key] ?? (f.default || '')} onChange={function(e) { onChange({...data, [f.key]: f.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value}); }} required={f.required} />
    </div>
  );
}

// PF form with conditional sections
function PFTemplateForm({ data, onChange }) {
  return (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
      {PF_BASE_FIELDS.map(function(f) { return renderField(f, data, onChange); })}

      {/* PF Exempted Section */}
      <div className="flex items-center justify-between py-3 border-t border-[#E8E2D9] mt-4">
        <Label className="font-semibold text-[#2A2624]">PF Exempted?</Label>
        <Switch checked={!!data.pf_exempted} onCheckedChange={function(v) { onChange({...data, pf_exempted: v}); }} data-testid="field-pf_exempted" />
      </div>
      {data.pf_exempted && (
        <div className="ml-4 pl-4 border-l-2 border-[#D96C5B]/30 space-y-3">
          <p className="text-xs text-[#D96C5B] font-medium uppercase tracking-wide">PF Exemption Details</p>
          {PF_EXEMPTION_FIELDS.map(function(f) { return renderField(f, data, onChange); })}
        </div>
      )}

      {/* EDLI Exempted Section */}
      <div className="flex items-center justify-between py-3 border-t border-[#E8E2D9] mt-4">
        <Label className="font-semibold text-[#2A2624]">EDLI Exempted?</Label>
        <Switch checked={!!data.edli_exempted} onCheckedChange={function(v) { onChange({...data, edli_exempted: v}); }} data-testid="field-edli_exempted" />
      </div>
      {data.edli_exempted && (
        <div className="ml-4 pl-4 border-l-2 border-[#7D9D85]/30 space-y-3">
          <p className="text-xs text-[#7D9D85] font-medium uppercase tracking-wide">EDLI Exemption Details</p>
          {EDLI_EXEMPTION_FIELDS.map(function(f) { return renderField(f, data, onChange); })}
        </div>
      )}
    </div>
  );
}

// Generic form for ESIC, TDS
function GenericTemplateForm({ fields, data, onChange }) {
  return (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
      {fields.map(function(f) { return renderField(f, data, onChange); })}
    </div>
  );
}

// Advanced PT/LWF form with frequency config + slabs
function PTLWFTemplateForm({ fields, data, onChange, slabs, onSlabsChange, label }) {
  function addSlab() { onSlabsChange([...slabs, { min_salary: 0, max_salary: 0, male_rate: 0, female_rate: 0 }]); }
  function removeSlab(i) { onSlabsChange(slabs.filter(function(_, idx) { return idx !== i; })); }
  function updateSlab(i, field, val) { var ns = [...slabs]; ns[i] = {...ns[i], [field]: parseFloat(val) || 0}; onSlabsChange(ns); }

  return (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
      {fields.map(function(f) { return renderField(f, data, onChange); })}

      {/* Advanced Frequency & Salary Basis Config */}
      <div className="border border-[#E8E2D9] rounded-xl p-4 mt-4 bg-[#FDFBF9]">
        <div className="flex items-center space-x-2 mb-3">
          <Info size={16} className="text-[#D96C5B]" />
          <p className="text-sm font-semibold text-[#2A2624]">Advanced Configuration</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Deduction Frequency (from Employee)</Label>
            <Select value={data.deduction_frequency || 'monthly'} onValueChange={function(v) { onChange({...data, deduction_frequency: v}); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="half-yearly">Half-Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Payment Frequency (to Government)</Label>
            <Select value={data.payment_frequency || 'monthly'} onValueChange={function(v) { onChange({...data, payment_frequency: v}); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="half-yearly">Half-Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <Label className="text-xs">Slab Salary Basis Period</Label>
            <Select value={data.slab_salary_period || 'same_as_deduction'} onValueChange={function(v) { onChange({...data, slab_salary_period: v}); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="same_as_deduction">Same as Deduction Frequency</SelectItem>
                <SelectItem value="monthly">Monthly Salary</SelectItem>
                <SelectItem value="quarterly">3-Month Cumulative</SelectItem>
                <SelectItem value="half-yearly">6-Month Cumulative</SelectItem>
                <SelectItem value="annual">Annual Salary</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-[#A28B7A] mt-1">E.g. Chennai PT uses 6-month cumulative salary for slab matching</p>
          </div>
          <div>
            <Label className="text-xs">Deduction Method (when deduction differs from payment)</Label>
            <Select value={data.deduction_method || 'spread'} onValueChange={function(v) { onChange({...data, deduction_method: v}); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="spread">Spread (divide across months)</SelectItem>
                <SelectItem value="lump">Lump Sum (deduct at once)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-[#A28B7A] mt-1">Spread: Monthly deduction of total/months. Lump: Full amount in payment month</p>
          </div>
        </div>

        <div className="mt-4">
          <Label className="text-xs">Employee Exit / Separation Handling</Label>
          <Select value={data.exit_handling || 'deduct_from_final'} onValueChange={function(v) { onChange({...data, exit_handling: v}); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="deduct_from_final">Deduct remaining from final salary</SelectItem>
              <SelectItem value="company_bears">Company bears remaining amount</SelectItem>
              <SelectItem value="pro_rata">Pro-rata (only months worked)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-[#A28B7A] mt-1">What happens if employee leaves before payment cycle completes</p>
        </div>
      </div>

      {/* Slabs */}
      <div className="mt-4 border border-[#E8E2D9] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <Label className="font-semibold">{label}</Label>
          <Button size="sm" variant="outline" onClick={addSlab}><Plus size={14} className="mr-1" /> Add Slab</Button>
        </div>
        {slabs.length === 0 && <p className="text-sm text-[#6A625E]">No slabs configured. Add slabs based on earned gross salary.</p>}
        {slabs.map(function(s, i) {
          return (
            <div key={i} className="grid grid-cols-5 gap-2 mb-2 items-end">
              <div><Label className="text-xs">Min Salary</Label><Input type="number" value={s.min_salary} onChange={function(e) { updateSlab(i, 'min_salary', e.target.value); }} /></div>
              <div><Label className="text-xs">Max Salary</Label><Input type="number" value={s.max_salary} onChange={function(e) { updateSlab(i, 'max_salary', e.target.value); }} /></div>
              <div><Label className="text-xs">Male Rate (INR)</Label><Input type="number" value={s.male_rate} onChange={function(e) { updateSlab(i, 'male_rate', e.target.value); }} /></div>
              <div><Label className="text-xs">Female Rate (INR)</Label><Input type="number" value={s.female_rate} onChange={function(e) { updateSlab(i, 'female_rate', e.target.value); }} /></div>
              <button onClick={function() { removeSlab(i); }} className="p-2 text-[#C65549] hover:bg-[#C65549]/10 rounded-lg"><Trash size={16} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CompliancePage() {
  var [activeTab, setActiveTab] = useState('pf');
  var [templates, setTemplates] = useState({});
  var [formData, setFormData] = useState({});
  var [ptSlabs, setPtSlabs] = useState([]);
  var [lwfSlabs, setLwfSlabs] = useState([]);
  var [createDialog, setCreateDialog] = useState(false);
  var [assignDialog, setAssignDialog] = useState(false);
  var [editingId, setEditingId] = useState(null);
  var [employees, setEmployees] = useState([]);
  var [locations, setLocations] = useState([]);
  var [departments, setDepartments] = useState([]);
  var [assignForm, setAssignForm] = useState({ assign_by: 'location', target_id: '', employee_ids: [], templates: {} });
  var [loading, setLoading] = useState(true);

  useEffect(function() { fetchAll(); }, []);
  useEffect(function() { fetchTemplates(activeTab); }, [activeTab]);

  async function fetchAll() {
    try {
      var results = await Promise.all([employeeAPI.getAll(), locationAPI.getAll(), departmentAPI.getAll()]);
      setEmployees(results[0].data);
      setLocations(results[1].data);
      setDepartments(results[2].data);
      // Pre-fetch all template types for bulk assign
      var types = ['pf', 'esic', 'pt', 'lwf', 'tds'];
      var templateResults = await Promise.all(types.map(function(t) {
        return complianceTemplateAPI.getAll(t).catch(function() { return { data: [] }; });
      }));
      var newTemplates = {};
      types.forEach(function(t, idx) { newTemplates[t] = templateResults[idx].data || []; });
      setTemplates(newTemplates);
    } catch (e) { /* ok */ }
    setLoading(false);
  }

  async function fetchTemplates(type) {
    try {
      var res = await complianceTemplateAPI.getAll(type);
      setTemplates(function(prev) { return {...prev, [type]: res.data}; });
    } catch (e) { /* ok */ }
  }

  function openCreate() { setFormData({}); setPtSlabs([]); setLwfSlabs([]); setEditingId(null); setCreateDialog(true); }
  function openEdit(tmpl) { setFormData({...tmpl}); setPtSlabs(tmpl.slabs || []); setLwfSlabs(tmpl.slabs || []); setEditingId(tmpl.id); setCreateDialog(true); }

  async function saveTemplate(e) {
    e.preventDefault();
    var payload = {...formData};
    if (activeTab === 'pt') payload.slabs = ptSlabs;
    if (activeTab === 'lwf') payload.slabs = lwfSlabs;
    try {
      if (editingId) { await complianceTemplateAPI.update(activeTab, editingId, payload); toast.success('Template updated'); }
      else { await complianceTemplateAPI.create(activeTab, payload); toast.success('Template created'); }
      setCreateDialog(false);
      fetchTemplates(activeTab);
    } catch (e) { toast.error('Failed to save'); }
  }

  async function deleteTemplate(id) {
    try { await complianceTemplateAPI.delete(activeTab, id); toast.success('Deleted'); fetchTemplates(activeTab); } catch (e) { toast.error('Failed'); }
  }

  async function handleBulkAssign() {
    try { await complianceAssignmentAPI.bulkAssign(assignForm); toast.success('Templates assigned'); setAssignDialog(false); } catch (e) { toast.error('Failed'); }
  }

  var currentTemplates = templates[activeTab] || [];

  function renderFormByType() {
    if (activeTab === 'pf') return <PFTemplateForm data={formData} onChange={setFormData} />;
    if (activeTab === 'pt') return <PTLWFTemplateForm fields={PT_FIELDS} data={formData} onChange={setFormData} slabs={ptSlabs} onSlabsChange={setPtSlabs} label="PT Deduction Slabs (Gross Salary + Gender)" />;
    if (activeTab === 'lwf') return <PTLWFTemplateForm fields={LWF_FIELDS} data={formData} onChange={setFormData} slabs={lwfSlabs} onSlabsChange={setLwfSlabs} label="LWF Deduction Slabs (Gross Salary)" />;
    if (activeTab === 'esic') return <GenericTemplateForm fields={ESIC_FIELDS} data={formData} onChange={setFormData} />;
    if (activeTab === 'tds') return <GenericTemplateForm fields={TDS_FIELDS} data={formData} onChange={setFormData} />;
    return null;
  }

  return (
    <div className="space-y-6" data-testid="compliance-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Statutory Compliance</h1>
          <p className="text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>Create templates and assign to employees</p>
        </div>
        <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
          <DialogTrigger asChild>
            <Button variant="outline" className="rounded-xl" data-testid="bulk-assign-button"><Users size={18} className="mr-2" /> Bulk Assign</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Bulk Assign Templates</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Assign By</Label>
                <Select value={assignForm.assign_by} onValueChange={function(v) { setAssignForm({...assignForm, assign_by: v}); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="location">Location</SelectItem>
                    <SelectItem value="department">Department</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {assignForm.assign_by === 'location' && (
                <div><Label>Select Location</Label><Select value={assignForm.target_id} onValueChange={function(v) { setAssignForm({...assignForm, target_id: v}); }}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{locations.map(function(l) { return <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>; })}</SelectContent></Select></div>
              )}
              {assignForm.assign_by === 'department' && (
                <div><Label>Select Department</Label><Select value={assignForm.target_id} onValueChange={function(v) { setAssignForm({...assignForm, target_id: v}); }}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{departments.map(function(d) { return <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>; })}</SelectContent></Select></div>
              )}
              {TEMPLATE_TYPES.map(function(tt) {
                var typeTemplates = templates[tt.key] || [];
                return (
                  <div key={tt.key}><Label>{tt.label} Template</Label>
                    <Select value={assignForm.templates[tt.key + '_template_id'] || ''} onValueChange={function(v) { setAssignForm({...assignForm, templates: {...assignForm.templates, [tt.key + '_template_id']: v}}); }}>
                      <SelectTrigger><SelectValue placeholder={'Select ' + tt.label} /></SelectTrigger>
                      <SelectContent><SelectItem value="none">None</SelectItem>{typeTemplates.map(function(t) { return <SelectItem key={t.id} value={t.id}>{t.template_name}</SelectItem>; })}</SelectContent>
                    </Select>
                  </div>
                );
              })}
              <Button onClick={handleBulkAssign} className="w-full bg-[#D96C5B] hover:bg-[#C25949]">Assign to All Employees</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-white border border-[#E8E2D9] rounded-xl p-1 w-full flex">
          {TEMPLATE_TYPES.map(function(tt) {
            return <TabsTrigger key={tt.key} value={tt.key} className="flex-1 rounded-lg text-xs sm:text-sm data-[state=active]:bg-[#D96C5B] data-[state=active]:text-white">{tt.label}</TabsTrigger>;
          })}
        </TabsList>

        {TEMPLATE_TYPES.map(function(tt) {
          return (
            <TabsContent key={tt.key} value={tt.key} className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[#2A2624]">{tt.label} Templates</h3>
                <Button onClick={openCreate} className="bg-[#D96C5B] hover:bg-[#C25949] rounded-xl" data-testid={'create-' + tt.key + '-template'}>
                  <Plus size={18} className="mr-2" /> Create Template
                </Button>
              </div>
              {currentTemplates.length === 0 ? (
                <div className="bg-white border border-[#E8E2D9] rounded-2xl p-12 text-center">
                  <ShieldCheck size={64} className="mx-auto mb-4 text-[#A28B7A] opacity-50" />
                  <h3 className="text-xl font-semibold text-[#2A2624] mb-2">No Templates</h3>
                  <p className="text-[#6A625E]">Create a {tt.label} template to get started</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {currentTemplates.map(function(tmpl) {
                    return (
                      <div key={tmpl.id} className="bg-white border border-[#E8E2D9] rounded-xl p-4 hover:border-[#D96C5B] transition-colors" data-testid={'template-' + tmpl.id}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold text-[#2A2624]">{tmpl.template_name}</h4>
                            <p className="text-xs text-[#6A625E] mt-1">
                              {tt.key === 'pf' && ('Code: ' + (tmpl.pf_code_number || '-') + ' | Rate: ' + (tmpl.contribution_rate || 12) + '%' + (tmpl.pf_exempted ? ' | PF Exempted' : '') + (tmpl.edli_exempted ? ' | EDLI Exempted' : ''))}
                              {tt.key === 'esic' && ('Code: ' + (tmpl.esic_code_no || '-') + ' | Emp: ' + (tmpl.employee_contribution || 0.75) + '% | Emr: ' + (tmpl.employer_contribution || 3.25) + '%')}
                              {tt.key === 'pt' && ('State: ' + (tmpl.jurisdiction_state || '-') + ' | Deduct: ' + (tmpl.deduction_frequency || 'monthly') + ' | Pay: ' + (tmpl.payment_frequency || 'monthly') + ' | Slabs: ' + (tmpl.slabs?.length || 0) + ' | Exit: ' + (tmpl.exit_handling || 'deduct_from_final').replace(/_/g, ' '))}
                              {tt.key === 'lwf' && ('State: ' + (tmpl.jurisdiction_state || '-') + ' | Deduct: ' + (tmpl.deduction_frequency || 'monthly') + ' | Pay: ' + (tmpl.payment_frequency || 'monthly') + ' | Exit: ' + (tmpl.exit_handling || 'deduct_from_final').replace(/_/g, ' '))}
                              {tt.key === 'tds' && ('Regime: ' + (tmpl.tax_regime || 'new_regime').replace(/_/g, ' ') + ' | TAN: ' + (tmpl.employer_tan || '-'))}
                            </p>
                          </div>
                          <div className="flex space-x-2 flex-shrink-0">
                            <button onClick={function() { openEdit(tmpl); }} className="p-2 hover:bg-[#D96C5B]/10 rounded-lg"><PencilSimple size={16} className="text-[#D96C5B]" /></button>
                            <button onClick={function() { deleteTemplate(tmpl.id); }} className="p-2 hover:bg-[#C65549]/10 rounded-lg"><Trash size={16} className="text-[#C65549]" /></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden">
          <DialogHeader><DialogTitle>{editingId ? 'Edit' : 'Create'} {TEMPLATE_TYPES.find(function(t) { return t.key === activeTab; })?.label} Template</DialogTitle></DialogHeader>
          <form onSubmit={saveTemplate}>
            {renderFormByType()}
            <Button type="submit" className="w-full bg-[#D96C5B] hover:bg-[#C25949] mt-4">{editingId ? 'Update' : 'Create'} Template</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
