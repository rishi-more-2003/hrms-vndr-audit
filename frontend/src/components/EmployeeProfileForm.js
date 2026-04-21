import React, { useEffect, useState } from 'react';
import { employeeAPI, departmentAPI, designationAPI, locationAPI, salaryTemplateAPI, salaryAssignmentAPI, policyTemplateAPI, meAPI } from '../services/api';
import { User, FloppyDisk, X, Upload, Trash, Warning, Info, Lock } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';

var TABS = [
  { key: 'personal', label: 'Personal' },
  { key: 'contact', label: 'Contact' },
  { key: 'address', label: 'Address' },
  { key: 'employment', label: 'Employment' },
  { key: 'salary_bank', label: 'Salary & Bank' },
  { key: 'statutory', label: 'Statutory' },
  { key: 'kyc', label: 'KYC / Identity' },
  { key: 'voluntary', label: 'Voluntary' },
  { key: 'previous', label: 'Previous Emp' },
  { key: 'policies', label: 'Policies' },
  { key: 'hierarchy', label: 'Approval Hierarchy' },
  { key: 'assignments', label: 'Salary Template' },
  { key: 'documents', label: 'Documents' },
];

// Fields an employee can self-edit
var EMP_EDITABLE = new Set([
  'middle_name', 'marital_status', 'phone', 'telephone',
  'corr_address_line1', 'corr_address_line2', 'corr_address_line3',
  'corr_address_city', 'corr_address_pincode',
  'perm_address_line1', 'perm_address_line2', 'perm_address_line3',
  'perm_address_city', 'perm_address_pincode', 'perm_same_as_corr',
  'blood_group', 'height_weight', 'identification_mark', 'qualification',
  'birth_place', 'emergency_contact_name', 'emergency_contact_phone',
  'emergency_contact_relation',
]);

// Protected fields grouped by tab — used by "Request Change" dialog to show a field picker.
var PROTECTED_FIELDS_BY_TAB = {
  employment: [
    ['date_of_joining', 'Date of Joining'],
    ['location_id', 'Location'],
    ['department_id', 'Department'],
    ['designation_id', 'Designation'],
    ['grade_id', 'Grade'],
    ['role', 'Role'],
    ['employment_type', 'Employment Type'],
    ['status', 'Employee Status'],
  ],
  salary_bank: [
    ['salary_payment_mode', 'Salary Payment Mode'],
    ['salary_ac_bank', 'Salary Bank'],
    ['salary_ac_branch', 'Bank Branch'],
    ['salary_ac_no', 'Salary A/C No.'],
    ['salary_ac_ifsc', 'IFSC Code'],
  ],
  statutory: [
    ['uan_no', 'UAN No.'],
    ['pf_account_no', 'PF A/C No.'],
    ['pension_account_no', 'Pension A/C No.'],
    ['esic_account_no', 'ESIC A/C No.'],
    ['pf_member', 'PF Member'],
    ['esic_member', 'ESIC Member'],
    ['pt_applicable', 'Professional Tax Applicable'],
    ['lwf_applicable', 'LWF Applicable'],
  ],
  kyc: [
    ['pan', 'PAN'],
    ['aadhaar', 'Aadhaar'],
    ['passport_no', 'Passport No.'],
    ['passport_doe', 'Passport Expiry'],
    ['driving_license_no', 'Driving License No.'],
    ['name_as_per_aadhaar', 'Name as per Aadhaar'],
    ['name_as_per_pan', 'Name as per PAN'],
  ],
  voluntary: [
    ['voluntary_pf', 'Voluntary PF'],
    ['voluntary_pf_rate', 'Voluntary PF Rate'],
    ['voluntary_pension', 'Voluntary Pension'],
    ['voluntary_pension_rate', 'Voluntary Pension Rate'],
  ],
  previous: [
    ['prev_employer_name', 'Previous Employer Name'],
    ['prev_employer_esic_code', 'Prev. Employer ESIC Code'],
    ['prev_pf_ac_no', 'Prev. PF A/C No.'],
    ['prev_uan_no', 'Prev. UAN No.'],
    ['prev_esic_ac_no', 'Prev. ESIC A/C No.'],
  ],
  hierarchy: [
    ['leave_approver_id', 'Leave Approver'],
    ['attendance_approver_id', 'Attendance Approver'],
    ['overtime_approver_id', 'Overtime Approver'],
    ['reimbursement_approver_id', 'Reimbursement Approver'],
    ['payroll_approver_id', 'Payroll Approver'],
    ['general_manager_id', 'General Manager'],
  ],
};

// Helper renderer — consistent compact field
function Field({ label, required, children, hint }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-[#6A625E]">{label}{required && <span className="text-[#D96C5B]"> *</span>}</Label>
      {children}
      {hint && <p className="text-[10px] text-[#A28B7A]">{hint}</p>}
    </div>
  );
}

function Txt(props) { return <Input {...props} className={"h-9 text-sm " + (props.className || '')} />; }

function LockBadge() {
  return <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 bg-[#A28B7A]/10 text-[#A28B7A] rounded font-semibold" title="Admin-only field"><Lock size={10} /> LOCKED</span>;
}

export default function EmployeeProfileForm({ employeeId, onClose, onSaved, allEmployees, departments, designations, locations, grades, salaryTemplates, selfMode }) {
  var [tab, setTab] = useState('personal');
  var [form, setForm] = useState({});
  var [lastCode, setLastCode] = useState(null);
  var [docs, setDocs] = useState([]);
  var [salaryAssignment, setSalaryAssignment] = useState(null);
  var [effectivePolicies, setEffectivePolicies] = useState(null);
  var [policyTpls, setPolicyTpls] = useState({});
  var [loading, setLoading] = useState(false);
  var [changeReqOpen, setChangeReqOpen] = useState(false);
  var [crField, setCrField] = useState('');
  var [crValue, setCrValue] = useState('');
  var [crReason, setCrReason] = useState('');
  var [crSubmitting, setCrSubmitting] = useState(false);
  var isEdit = !!employeeId || selfMode;
  var readOnlyAll = !!selfMode;  // in selfMode, most fields are read-only
  // Helper: can this field be edited right now?
  var canEdit = function(fieldName) {
    if (!selfMode) return true;  // admin can edit all
    return EMP_EDITABLE.has(fieldName);
  };

  useEffect(function() {
    fetchBase();
    if (selfMode) fetchMine();
    else if (employeeId) fetchExisting();
  }, [employeeId, selfMode]);

  async function fetchBase() {
    try { var r = await employeeAPI.lastCode(); setLastCode(r.data.last_code); } catch (e) {}
    // Policy templates for the Policies tab
    try {
      var types = ['leave','attendance','overtime','reimbursement','bonus','gratuity','advance','loan'];
      var results = await Promise.all(types.map(function(t) { return policyTemplateAPI.getAll(t).catch(function() { return { data: [] }; }); }));
      var map = {};
      types.forEach(function(t, i) { map[t] = results[i].data || []; });
      setPolicyTpls(map);
    } catch (e) {}
  }
  async function fetchExisting() {
    try {
      var r = await employeeAPI.getProfile(employeeId); setForm(r.data || {});
      var d = await employeeAPI.listDocuments(employeeId); setDocs(d.data || []);
      try { var s = await salaryAssignmentAPI.get(employeeId); setSalaryAssignment(s.data || null); } catch (e) {}
      try { var e2 = await employeeAPI.effectivePolicies(employeeId); setEffectivePolicies(e2.data || null); } catch (e) {}
    } catch (e) { toast.error('Failed to load employee'); }
  }
  async function fetchMine() {
    try {
      var r = await meAPI.profile(); setForm(r.data || {});
      try { var e2 = await meAPI.effectivePolicies(); setEffectivePolicies(e2.data || null); } catch (e) {}
      try { var d = await employeeAPI.listDocuments(r.data.id); setDocs(d.data || []); } catch (e) {}
    } catch (e) { toast.error('Failed to load profile'); }
  }

  function f(k, v) { setForm(function(prev) { return {...prev, [k]: v}; }); }

  async function save() {
    setLoading(true);
    try {
      if (selfMode) {
        // Only send editable fields
        var payload = {};
        Object.keys(form).forEach(function(k) { if (EMP_EDITABLE.has(k)) payload[k] = form[k]; });
        await meAPI.updateProfile(payload);
        toast.success('Profile updated');
      } else if (isEdit) {
        await employeeAPI.updateProfile(employeeId, form);
        toast.success('Profile updated');
      } else {
        var res = await employeeAPI.createProfile(form);
        toast.success('Employee created: ' + res.data.employee_code);
      }
      onSaved && onSaved();
    } catch (e) {
      var d = e.response?.data?.detail;
      if (typeof d === 'object' && d.fields) toast.error('Missing: ' + d.fields.slice(0,4).join(', ') + (d.fields.length>4 ? '…' : ''));
      else if (typeof d === 'object' && d.violations) toast.error(d.violations.map(function(v) { return v.field + ' "' + v.value + '" conflicts with ' + v.conflicts_with_employee_code; }).join(' | '));
      else toast.error(typeof d === 'string' ? d : 'Failed to save');
    }
    setLoading(false);
  }

  async function saveHierarchy() {
    setLoading(true);
    try {
      await employeeAPI.updateApprovalHierarchy(employeeId, {
        leave_approver_id: form.leave_approver_id,
        reimbursement_approver_id: form.reimbursement_approver_id,
        overtime_approver_id: form.overtime_approver_id,
        attendance_approver_id: form.attendance_approver_id,
        payroll_approver_id: form.payroll_approver_id,
        general_manager_id: form.general_manager_id,
      });
      toast.success('Hierarchy updated');
    } catch (e) { toast.error('Failed'); }
    setLoading(false);
  }

  async function savePolicies() {
    setLoading(true);
    try {
      var payload = {};
      ['leave_policy_id','attendance_policy_id','overtime_policy_id','reimbursement_policy_id','bonus_policy_id','gratuity_policy_id','advance_policy_id','loan_policy_id'].forEach(function(k) { payload[k] = form[k] || ''; });
      await employeeAPI.updatePolicies(employeeId, payload);
      var e2 = await employeeAPI.effectivePolicies(employeeId); setEffectivePolicies(e2.data);
      toast.success('Policies assigned');
    } catch (e) { toast.error('Failed'); }
    setLoading(false);
  }

  async function saveSalaryAssignment() {
    try {
      await salaryAssignmentAPI.update(employeeId, { salary_template_id: form.salary_template_id });
      toast.success('Salary template assigned');
    } catch (e) { toast.error('Failed'); }
  }

  async function addDoc() {
    var url = window.prompt('File URL (paste from uploaded link)');
    if (!url) return;
    var name = window.prompt('File name', url.split('/').pop());
    var cat = window.prompt('Category (general/recruitment/payslip/kyc/statutory/other)', 'general') || 'general';
    try {
      await employeeAPI.addDocument(employeeId, { file_url: url, file_name: name, category: cat });
      var d = await employeeAPI.listDocuments(employeeId); setDocs(d.data || []);
      toast.success('Added');
    } catch (e) { toast.error('Failed'); }
  }
  async function deleteDoc(id) {
    if (!window.confirm('Delete document?')) return;
    try { await employeeAPI.deleteDocument(employeeId, id); setDocs(docs.filter(function(d) { return d.id !== id; })); } catch (e) { toast.error('Failed'); }
  }

  function openChangeRequest() {
    var fields = PROTECTED_FIELDS_BY_TAB[tab] || [];
    setCrField(fields.length ? fields[0][0] : '');
    setCrValue('');
    setCrReason('');
    setChangeReqOpen(true);
  }
  async function submitChangeRequest() {
    if (!crField) { toast.error('Please select a field'); return; }
    if (crValue === '' || crValue === null || crValue === undefined) { toast.error('Please enter a new value'); return; }
    setCrSubmitting(true);
    try {
      var payload = { changes: {}, reason: crReason || '' };
      payload.changes[crField] = crValue;
      await meAPI.createChangeRequest(payload);
      toast.success('Change request submitted for admin approval');
      setChangeReqOpen(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to submit');
    }
    setCrSubmitting(false);
  }

  var emps = allEmployees || [];

  return (
    <div className="space-y-4" data-testid="employee-profile-form">
      {/* Header with last code hint */}
      <div className="flex items-center justify-between bg-[#F9F6F0] rounded-xl p-3">
        <div>
          <p className="text-xs text-[#A28B7A]">{isEdit ? 'Editing' : 'New Employee'}</p>
          <p className="text-lg font-semibold text-[#2A2624]">{form.first_name || ''} {form.last_name || ''} {form.employee_code ? '(' + form.employee_code + ')' : ''}</p>
        </div>
        {!isEdit && lastCode && (
          <div className="text-right">
            <p className="text-[10px] text-[#A28B7A]">Last Employee ID</p>
            <p className="text-sm font-mono text-[#7D9D85]">{lastCode}</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-[#E8E2D9]">
        {TABS.map(function(t) { return (
          <button key={t.key} onClick={function() { setTab(t.key); }} data-testid={'tab-' + t.key}
                  className={'px-3 py-2 text-xs font-medium rounded-t-lg ' + (tab === t.key ? 'bg-[#D96C5B] text-white' : 'bg-[#F9F6F0] text-[#6A625E] hover:bg-[#E8E2D9]')}>
            {t.label}
          </button>
        ); })}
      </div>

      {selfMode && ['employment','salary_bank','statutory','kyc','voluntary','previous','hierarchy','assignments'].indexOf(tab) >= 0 && (
        <div className="bg-[#A28B7A]/10 border border-[#A28B7A]/20 rounded-lg p-3 flex items-start gap-2">
          <Lock size={14} className="text-[#A28B7A] mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-[#2A2624]">This section is view-only</p>
            <p className="text-[11px] text-[#A28B7A]">These details are managed by HR/Admin. To request a correction, use the "Request Change" button in the footer.</p>
          </div>
        </div>
      )}

      <div className="max-h-[60vh] overflow-y-auto pr-2">
        {/* PERSONAL */}
        {tab === 'personal' && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="Employee ID" required><Txt value={form.employee_code || ''} onChange={function(e) { f('employee_code', e.target.value); }} data-testid="emp-code" disabled={!canEdit('employee_code')} /></Field>
            <Field label="First Name" required><Txt value={form.first_name || ''} onChange={function(e) { f('first_name', e.target.value); }} data-testid="emp-first-name" disabled={!canEdit('first_name')} /></Field>
            <Field label="Middle Name"><Txt value={form.middle_name || ''} onChange={function(e) { f('middle_name', e.target.value); }} /></Field>
            <Field label="Last Name" required><Txt value={form.last_name || ''} onChange={function(e) { f('last_name', e.target.value); }} data-testid="emp-last-name" disabled={!canEdit('last_name')} /></Field>
            <Field label="Gender" required>
              <Select value={form.gender || ''} onValueChange={function(v) { f('gender', v); }} disabled={!canEdit('gender')}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Date of Birth" required><Txt type="date" value={form.date_of_birth || ''} onChange={function(e) { f('date_of_birth', e.target.value); }} disabled={!canEdit('date_of_birth')} /></Field>
            <Field label="Marital Status">
              <Select value={form.marital_status || ''} onValueChange={function(v) { f('marital_status', v); }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent><SelectItem value="single">Single</SelectItem><SelectItem value="married">Married</SelectItem><SelectItem value="divorced">Divorced</SelectItem><SelectItem value="widowed">Widowed</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Nationality" required><Txt value={form.nationality || 'Indian'} onChange={function(e) { f('nationality', e.target.value); }} /></Field>
            <Field label="Working Nation"><Txt value={form.working_nation || 'India'} onChange={function(e) { f('working_nation', e.target.value); }} /></Field>
            <Field label="Birth Place"><Txt value={form.birth_place || ''} onChange={function(e) { f('birth_place', e.target.value); }} /></Field>
            <Field label="Blood Group">
              <Select value={form.blood_group || ''} onValueChange={function(v) { f('blood_group', v); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{['A+','A-','B+','B-','O+','O-','AB+','AB-'].map(function(g) { return <SelectItem key={g} value={g}>{g}</SelectItem>; })}</SelectContent>
              </Select>
            </Field>
            <Field label="Height / Weight"><Txt value={form.height_weight || ''} onChange={function(e) { f('height_weight', e.target.value); }} placeholder="5'9&quot; / 70kg" /></Field>
            <Field label="Identification Mark"><Txt value={form.identification_mark || ''} onChange={function(e) { f('identification_mark', e.target.value); }} /></Field>
            <Field label="Qualification"><Txt value={form.qualification || ''} onChange={function(e) { f('qualification', e.target.value); }} /></Field>
            <Field label="Physical Status">
              <Select value={form.physical_status || 'normal'} onValueChange={function(v) { f('physical_status', v); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="normal">Normal</SelectItem><SelectItem value="disabled">Disabled</SelectItem></SelectContent>
              </Select>
            </Field>
            {form.physical_status === 'disabled' && <Field label="Disabled Percentage"><Txt type="number" value={form.disabled_percentage || ''} onChange={function(e) { f('disabled_percentage', parseFloat(e.target.value) || 0); }} /></Field>}
          </div>
        )}

        {/* CONTACT */}
        {tab === 'contact' && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="Mobile No." required><Txt value={form.phone || ''} onChange={function(e) { f('phone', e.target.value); }} data-testid="emp-phone" /></Field>
            <Field label="Email ID" required><Txt type="email" value={form.email || ''} onChange={function(e) { f('email', e.target.value); }} data-testid="emp-email" /></Field>
            <Field label="Telephone No."><Txt value={form.telephone || ''} onChange={function(e) { f('telephone', e.target.value); }} /></Field>
          </div>
        )}

        {/* ADDRESS */}
        {tab === 'address' && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase text-[#7D9D85] mb-2">Correspondence Address</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Field label="Line 1" required><Txt value={form.corr_address_line1 || ''} onChange={function(e) { f('corr_address_line1', e.target.value); }} /></Field>
                <Field label="Line 2"><Txt value={form.corr_address_line2 || ''} onChange={function(e) { f('corr_address_line2', e.target.value); }} /></Field>
                <Field label="Line 3"><Txt value={form.corr_address_line3 || ''} onChange={function(e) { f('corr_address_line3', e.target.value); }} /></Field>
                <Field label="City" required><Txt value={form.corr_address_city || ''} onChange={function(e) { f('corr_address_city', e.target.value); }} /></Field>
                <Field label="Pincode" required><Txt value={form.corr_address_pincode || ''} onChange={function(e) { f('corr_address_pincode', e.target.value); }} /></Field>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold uppercase text-[#7D9D85]">Permanent Address</p>
                <div className="flex items-center gap-2"><Label className="text-xs">Same as correspondence</Label>
                  <Switch checked={!!form.perm_same_as_corr} onCheckedChange={function(v) {
                    f('perm_same_as_corr', v);
                    if (v) {
                      ['line1','line2','line3','city','pincode'].forEach(function(k) { f('perm_address_' + k, form['corr_address_' + k] || ''); });
                    }
                  }} /></div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Field label="Line 1"><Txt value={form.perm_address_line1 || ''} onChange={function(e) { f('perm_address_line1', e.target.value); }} disabled={form.perm_same_as_corr} /></Field>
                <Field label="Line 2"><Txt value={form.perm_address_line2 || ''} onChange={function(e) { f('perm_address_line2', e.target.value); }} disabled={form.perm_same_as_corr} /></Field>
                <Field label="Line 3"><Txt value={form.perm_address_line3 || ''} onChange={function(e) { f('perm_address_line3', e.target.value); }} disabled={form.perm_same_as_corr} /></Field>
                <Field label="City"><Txt value={form.perm_address_city || ''} onChange={function(e) { f('perm_address_city', e.target.value); }} disabled={form.perm_same_as_corr} /></Field>
                <Field label="Pincode"><Txt value={form.perm_address_pincode || ''} onChange={function(e) { f('perm_address_pincode', e.target.value); }} disabled={form.perm_same_as_corr} /></Field>
              </div>
            </div>
          </div>
        )}

        {/* EMPLOYMENT */}
        {tab === 'employment' && (
          <fieldset disabled={selfMode} className="border-0 p-0 m-0 disabled:opacity-90">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="Date of Joining" required><Txt type="date" value={form.date_of_joining || ''} onChange={function(e) { f('date_of_joining', e.target.value); }} /></Field>
            <Field label="Location" required>
              <Select value={form.location_id || ''} onValueChange={function(v) { f('location_id', v); }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{(locations || []).map(function(l) { return <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>; })}</SelectContent>
              </Select>
            </Field>
            <Field label="Department" required>
              <Select value={form.department_id || ''} onValueChange={function(v) { f('department_id', v); }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{(departments || []).map(function(d) { return <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>; })}</SelectContent>
              </Select>
            </Field>
            <Field label="Designation" required>
              <Select value={form.designation_id || ''} onValueChange={function(v) { f('designation_id', v); }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{(designations || []).map(function(d) { return <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>; })}</SelectContent>
              </Select>
            </Field>
            <Field label="Grade">
              <Select value={form.grade_id || ''} onValueChange={function(v) { f('grade_id', v); }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>{(grades || []).map(function(g) { return <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>; })}</SelectContent>
              </Select>
            </Field>
            <Field label="Role"><Txt value={form.role || ''} onChange={function(e) { f('role', e.target.value); }} placeholder="Software Engineer" /></Field>
            <Field label="Employment Type" required>
              <Select value={form.employment_type || ''} onValueChange={function(v) { f('employment_type', v); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="permanent">Permanent</SelectItem><SelectItem value="contract">Contract</SelectItem><SelectItem value="probation">Probation</SelectItem><SelectItem value="intern">Intern</SelectItem><SelectItem value="consultant">Consultant</SelectItem><SelectItem value="full-time">Full-Time</SelectItem><SelectItem value="part-time">Part-Time</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Employee Status">
              <Select value={form.status || 'active'} onValueChange={function(v) { f('status', v); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="on_probation">On Probation</SelectItem><SelectItem value="on_notice">On Notice</SelectItem><SelectItem value="terminated">Terminated</SelectItem><SelectItem value="resigned">Resigned</SelectItem><SelectItem value="separated">Separated</SelectItem></SelectContent>
              </Select>
            </Field>
          </div>
          </fieldset>
        )}

        {/* SALARY & BANK */}
        {tab === 'salary_bank' && (
          <fieldset disabled={selfMode} className="border-0 p-0 m-0 disabled:opacity-90">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="Salary Payment Mode" required>
              <Select value={form.salary_payment_mode || 'bank'} onValueChange={function(v) { f('salary_payment_mode', v); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="bank">Bank Transfer</SelectItem><SelectItem value="cheque">Cheque</SelectItem><SelectItem value="cash">Cash</SelectItem></SelectContent>
              </Select>
            </Field>
            <Field label="Salary Bank"><Txt value={form.salary_ac_bank || ''} onChange={function(e) { f('salary_ac_bank', e.target.value); }} /></Field>
            <Field label="Bank Branch"><Txt value={form.salary_ac_branch || ''} onChange={function(e) { f('salary_ac_branch', e.target.value); }} /></Field>
            <Field label="Salary A/C No."><Txt value={form.salary_ac_no || ''} onChange={function(e) { f('salary_ac_no', e.target.value); }} /></Field>
            <Field label="IFSC Code"><Txt value={form.salary_ac_ifsc || ''} onChange={function(e) { f('salary_ac_ifsc', e.target.value.toUpperCase()); }} /></Field>
          </div>
          </fieldset>
        )}

        {/* STATUTORY */}
        {tab === 'statutory' && (
          <fieldset disabled={selfMode} className="border-0 p-0 m-0 disabled:opacity-90">
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="flex items-center justify-between p-2 bg-[#F9F6F0] rounded-lg"><Label className="text-xs">PF Member</Label><Switch checked={!!form.pf_member} onCheckedChange={function(v) { f('pf_member', v); }} /></div>
              <div className="flex items-center justify-between p-2 bg-[#F9F6F0] rounded-lg"><Label className="text-xs">Pension Member</Label><Switch checked={!!form.pension_member} onCheckedChange={function(v) { f('pension_member', v); }} /></div>
              <div className="flex items-center justify-between p-2 bg-[#F9F6F0] rounded-lg"><Label className="text-xs">Deferred Pension</Label><Switch checked={!!form.deferred_pension} onCheckedChange={function(v) { f('deferred_pension', v); }} /></div>
              <div className="flex items-center justify-between p-2 bg-[#F9F6F0] rounded-lg"><Label className="text-xs">ESIC Member</Label><Switch checked={!!form.esic_member} onCheckedChange={function(v) { f('esic_member', v); }} /></div>
              <div className="flex items-center justify-between p-2 bg-[#F9F6F0] rounded-lg"><Label className="text-xs">Prof. Tax Applicable</Label><Switch checked={!!form.pt_applicable} onCheckedChange={function(v) { f('pt_applicable', v); }} /></div>
              <div className="flex items-center justify-between p-2 bg-[#F9F6F0] rounded-lg"><Label className="text-xs">LWF Applicable</Label><Switch checked={!!form.lwf_applicable} onCheckedChange={function(v) { f('lwf_applicable', v); }} /></div>
              <div className="flex items-center justify-between p-2 bg-[#F9F6F0] rounded-lg"><Label className="text-xs">Mandatory ESIC</Label><Switch checked={!!form.mandatory_esic} onCheckedChange={function(v) { f('mandatory_esic', v); }} /></div>
            </div>

            {form.pf_member && (
              <div>
                <p className="text-xs font-bold uppercase text-[#7D9D85] mb-2">PF Details</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Field label="UAN No." hint="Unique across active employees"><Txt value={form.uan_no || ''} onChange={function(e) { f('uan_no', e.target.value); }} /></Field>
                  <Field label="PF A/C No." hint="Unique"><Txt value={form.pf_account_no || ''} onChange={function(e) { f('pf_account_no', e.target.value); }} /></Field>
                  <Field label="Pension A/C No."><Txt value={form.pension_account_no || ''} onChange={function(e) { f('pension_account_no', e.target.value); }} /></Field>
                  <Field label="EDLI A/C No."><Txt value={form.edli_account_no || ''} onChange={function(e) { f('edli_account_no', e.target.value); }} /></Field>
                  <Field label="LIN No."><Txt value={form.lin_no || ''} onChange={function(e) { f('lin_no', e.target.value); }} /></Field>
                  <Field label="DOJ PF"><Txt type="date" value={form.doj_pf || ''} onChange={function(e) { f('doj_pf', e.target.value); }} /></Field>
                  <Field label="DOJ Pension"><Txt type="date" value={form.doj_pension || ''} onChange={function(e) { f('doj_pension', e.target.value); }} /></Field>
                  <Field label="DOJ EDLI"><Txt type="date" value={form.doj_edli || ''} onChange={function(e) { f('doj_edli', e.target.value); }} /></Field>
                  <Field label="DOL PF"><Txt type="date" value={form.dol_pf || ''} onChange={function(e) { f('dol_pf', e.target.value); }} /></Field>
                  <Field label="Reason of Leaving PF"><Txt value={form.reason_leaving_pf || ''} onChange={function(e) { f('reason_leaving_pf', e.target.value); }} /></Field>
                  <Field label="DOL Pension"><Txt type="date" value={form.dol_pension || ''} onChange={function(e) { f('dol_pension', e.target.value); }} /></Field>
                  <Field label="Reason of Leaving Pension"><Txt value={form.reason_leaving_pension || ''} onChange={function(e) { f('reason_leaving_pension', e.target.value); }} /></Field>
                  <Field label="Scheme Certificate No."><Txt value={form.scheme_cert_no || ''} onChange={function(e) { f('scheme_cert_no', e.target.value); }} /></Field>
                  <Field label="Pension Payment Order"><Txt value={form.pension_payment_order || ''} onChange={function(e) { f('pension_payment_order', e.target.value); }} /></Field>
                </div>
                <p className="text-xs font-bold uppercase text-[#7D9D85] mt-4 mb-2">PF Wages & Limits</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="flex items-center justify-between p-2 bg-[#F9F6F0] rounded-lg"><Label className="text-xs">Restrict PF Wages</Label><Switch checked={!!form.restrict_pf_wages} onCheckedChange={function(v) { f('restrict_pf_wages', v); }} /></div>
                  <Field label="Employee PF Wages Limit"><Txt type="number" value={form.emp_pf_wages_limit || ''} onChange={function(e) { f('emp_pf_wages_limit', parseFloat(e.target.value) || 0); }} /></Field>
                  <Field label="Employer PF Wages Limit"><Txt type="number" value={form.emplr_pf_wages_limit || ''} onChange={function(e) { f('emplr_pf_wages_limit', parseFloat(e.target.value) || 0); }} /></Field>
                  <Field label="Wages Limit at Appointment"><Txt type="number" value={form.wages_limit_at_appointment || ''} onChange={function(e) { f('wages_limit_at_appointment', parseFloat(e.target.value) || 0); }} /></Field>
                </div>
                <p className="text-xs font-bold uppercase text-[#7D9D85] mt-4 mb-2">Pension Bank</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Field label="Bank Name"><Txt value={form.pension_bank_name || ''} onChange={function(e) { f('pension_bank_name', e.target.value); }} /></Field>
                  <Field label="Branch"><Txt value={form.pension_bank_branch || ''} onChange={function(e) { f('pension_bank_branch', e.target.value); }} /></Field>
                  <Field label="IFSC"><Txt value={form.pension_bank_ifsc || ''} onChange={function(e) { f('pension_bank_ifsc', e.target.value.toUpperCase()); }} /></Field>
                  <Field label="A/C No."><Txt value={form.pension_bank_ac_no || ''} onChange={function(e) { f('pension_bank_ac_no', e.target.value); }} /></Field>
                </div>
              </div>
            )}

            {form.esic_member && (
              <div>
                <p className="text-xs font-bold uppercase text-[#7D9D85] mb-2">ESIC Details</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Field label="ESIC A/C No." hint="Unique"><Txt value={form.esic_account_no || ''} onChange={function(e) { f('esic_account_no', e.target.value); }} /></Field>
                  <Field label="DOJ ESIC"><Txt type="date" value={form.doj_esic || ''} onChange={function(e) { f('doj_esic', e.target.value); }} /></Field>
                  <Field label="ESIC Doctor Name"><Txt value={form.esic_doctor_name || ''} onChange={function(e) { f('esic_doctor_name', e.target.value); }} /></Field>
                </div>
              </div>
            )}
          </div>
          </fieldset>
        )}

        {/* KYC */}
        {tab === 'kyc' && (
          <fieldset disabled={selfMode} className="border-0 p-0 m-0 disabled:opacity-90">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="PAN" required hint="Unique"><Txt value={form.pan || ''} onChange={function(e) { f('pan', e.target.value.toUpperCase()); }} /></Field>
            <Field label="Aadhaar" required hint="Unique"><Txt value={form.aadhaar || ''} onChange={function(e) { f('aadhaar', e.target.value); }} /></Field>
            <Field label="Passport No."><Txt value={form.passport_no || ''} onChange={function(e) { f('passport_no', e.target.value); }} /></Field>
            <Field label="Passport DOE"><Txt type="date" value={form.passport_doe || ''} onChange={function(e) { f('passport_doe', e.target.value); }} /></Field>
            <Field label="Driving License No."><Txt value={form.driving_license_no || ''} onChange={function(e) { f('driving_license_no', e.target.value); }} /></Field>
            <Field label="Name as per Aadhaar"><Txt value={form.name_as_per_aadhaar || ''} onChange={function(e) { f('name_as_per_aadhaar', e.target.value); }} /></Field>
            <div className="flex items-center justify-between p-2 bg-[#F9F6F0] rounded-lg"><Label className="text-xs">Aadhaar KYC Done</Label><Switch checked={!!form.aadhaar_kyc_done} onCheckedChange={function(v) { f('aadhaar_kyc_done', v); }} /></div>
            <Field label="Name as per PAN"><Txt value={form.name_as_per_pan || ''} onChange={function(e) { f('name_as_per_pan', e.target.value); }} /></Field>
            <div className="flex items-center justify-between p-2 bg-[#F9F6F0] rounded-lg"><Label className="text-xs">PAN KYC Done</Label><Switch checked={!!form.pan_kyc_done} onCheckedChange={function(v) { f('pan_kyc_done', v); }} /></div>
            <Field label="KYC Bank A/C"><Txt value={form.kyc_bank_ac_no || ''} onChange={function(e) { f('kyc_bank_ac_no', e.target.value); }} /></Field>
            <Field label="Name as per KYC Bank"><Txt value={form.name_as_per_kyc_bank || ''} onChange={function(e) { f('name_as_per_kyc_bank', e.target.value); }} /></Field>
            <Field label="KYC Bank IFSC"><Txt value={form.kyc_bank_ifsc || ''} onChange={function(e) { f('kyc_bank_ifsc', e.target.value.toUpperCase()); }} /></Field>
            <div className="flex items-center justify-between p-2 bg-[#F9F6F0] rounded-lg"><Label className="text-xs">Bank KYC Done</Label><Switch checked={!!form.bank_kyc_done} onCheckedChange={function(v) { f('bank_kyc_done', v); }} /></div>
          </div>
          </fieldset>
        )}

        {/* VOLUNTARY */}
        {tab === 'voluntary' && (
          <fieldset disabled={selfMode} className="border-0 p-0 m-0 disabled:opacity-90">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="flex items-center justify-between p-2 bg-[#F9F6F0] rounded-lg"><Label className="text-xs">Voluntary PF</Label><Switch checked={!!form.voluntary_pf} onCheckedChange={function(v) { f('voluntary_pf', v); }} /></div>
            {form.voluntary_pf && <>
              <Field label="Voluntary PF Type">
                <Select value={form.voluntary_pf_type || ''} onValueChange={function(v) { f('voluntary_pf_type', v); }}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="percentage">Percentage</SelectItem><SelectItem value="fixed">Fixed Amount</SelectItem></SelectContent>
                </Select>
              </Field>
              <Field label="Voluntary PF Rate"><Txt type="number" value={form.voluntary_pf_rate || ''} onChange={function(e) { f('voluntary_pf_rate', parseFloat(e.target.value) || 0); }} /></Field>
            </>}
            <div className="flex items-center justify-between p-2 bg-[#F9F6F0] rounded-lg"><Label className="text-xs">Voluntary Pension</Label><Switch checked={!!form.voluntary_pension} onCheckedChange={function(v) { f('voluntary_pension', v); }} /></div>
            {form.voluntary_pension && <>
              <Field label="Voluntary Pension Type">
                <Select value={form.voluntary_pension_type || ''} onValueChange={function(v) { f('voluntary_pension_type', v); }}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="percentage">Percentage</SelectItem><SelectItem value="fixed">Fixed Amount</SelectItem></SelectContent>
                </Select>
              </Field>
              <Field label="Voluntary Pension Rate"><Txt type="number" value={form.voluntary_pension_rate || ''} onChange={function(e) { f('voluntary_pension_rate', parseFloat(e.target.value) || 0); }} /></Field>
            </>}
          </div>
          </fieldset>
        )}

        {/* PREVIOUS EMP */}
        {tab === 'previous' && (
          <fieldset disabled={selfMode} className="border-0 p-0 m-0 disabled:opacity-90">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="Previous Employer Name"><Txt value={form.prev_employer_name || ''} onChange={function(e) { f('prev_employer_name', e.target.value); }} /></Field>
            <Field label="Prev. Employer ESIC Code"><Txt value={form.prev_employer_esic_code || ''} onChange={function(e) { f('prev_employer_esic_code', e.target.value); }} /></Field>
            <Field label="Prev. ESIC A/C No."><Txt value={form.prev_esic_ac_no || ''} onChange={function(e) { f('prev_esic_ac_no', e.target.value); }} /></Field>
            <Field label="Prev. PF A/C No."><Txt value={form.prev_pf_ac_no || ''} onChange={function(e) { f('prev_pf_ac_no', e.target.value); }} /></Field>
            <Field label="Prev. DOJ PF"><Txt type="date" value={form.prev_doj_pf || ''} onChange={function(e) { f('prev_doj_pf', e.target.value); }} /></Field>
            <Field label="Prev. DOL PF"><Txt type="date" value={form.prev_dol_pf || ''} onChange={function(e) { f('prev_dol_pf', e.target.value); }} /></Field>
            <Field label="Prev. Pension A/C No."><Txt value={form.prev_pension_ac_no || ''} onChange={function(e) { f('prev_pension_ac_no', e.target.value); }} /></Field>
            <Field label="Prev. DOJ Pension"><Txt type="date" value={form.prev_doj_pension || ''} onChange={function(e) { f('prev_doj_pension', e.target.value); }} /></Field>
            <Field label="Prev. DOL Pension"><Txt type="date" value={form.prev_dol_pension || ''} onChange={function(e) { f('prev_dol_pension', e.target.value); }} /></Field>
            <Field label="Prev. UAN No."><Txt value={form.prev_uan_no || ''} onChange={function(e) { f('prev_uan_no', e.target.value); }} /></Field>
          </div>
          </fieldset>
        )}

        {/* POLICIES */}
        {tab === 'policies' && (
          <div className="space-y-4">
            <p className="text-xs text-[#A28B7A]">Admin assigns up to 8 policies directly to this employee. Direct assignment overrides any policy linked at the salary-template level.</p>

            {selfMode && (
              <div className="p-3 bg-[#7D9D85]/10 rounded-lg flex items-start gap-2">
                <Info size={14} className="text-[#7D9D85] mt-0.5" />
                <p className="text-[11px] text-[#2A2624]">Your assigned policies are shown below in read-only mode. Contact HR for changes.</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                ['leave_policy_id', 'leave', 'Leave Policy'],
                ['attendance_policy_id', 'attendance', 'Attendance Policy'],
                ['overtime_policy_id', 'overtime', 'Overtime Policy'],
                ['reimbursement_policy_id', 'reimbursement', 'Reimbursement Policy'],
                ['bonus_policy_id', 'bonus', 'Bonus Policy'],
                ['gratuity_policy_id', 'gratuity', 'Gratuity Policy'],
                ['advance_policy_id', 'advance', 'Advance Policy'],
                ['loan_policy_id', 'loan', 'Loan Policy'],
              ].map(function(row) {
                var key = row[0], ptype = row[1], label = row[2];
                var list = policyTpls[ptype] || [];
                var source = effectivePolicies && effectivePolicies.sources ? effectivePolicies.sources[ptype] : 'none';
                var resolved = effectivePolicies && effectivePolicies.policies ? effectivePolicies.policies[ptype] : null;
                return (
                  <div key={key} className="border border-[#E8E2D9] rounded-lg p-3 bg-white">
                    <div className="flex items-center justify-between mb-1.5">
                      <Label className="text-xs font-semibold text-[#2A2624]">{label}</Label>
                      <span className={'text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ' + (source === 'direct' ? 'bg-[#7D9D85]/20 text-[#7D9D85]' : source === 'template' ? 'bg-[#E8B25C]/20 text-[#E8B25C]' : 'bg-[#A28B7A]/10 text-[#A28B7A]')}>
                        {source === 'direct' ? '●  DIRECT' : source === 'template' ? '◆  FROM TEMPLATE' : '—  NONE'}
                      </span>
                    </div>
                    {selfMode ? (
                      <p className="text-xs text-[#2A2624] font-medium">{resolved ? (resolved.name || resolved.template_name || resolved.id) : 'Not assigned'}</p>
                    ) : (
                      <Select value={form[key] || ''} onValueChange={function(v) { f(key, v === 'none' ? '' : v); }}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Not assigned" /></SelectTrigger>
                        <SelectContent><SelectItem value="none">Not assigned</SelectItem>{list.map(function(t) { return <SelectItem key={t.id} value={t.id}>{t.name || t.template_name || 'Unnamed'}</SelectItem>; })}</SelectContent>
                      </Select>
                    )}
                    {resolved && source === 'template' && <p className="text-[10px] text-[#A28B7A] mt-1">Inherited via Salary Template. Set directly to override.</p>}
                  </div>
                );
              })}
            </div>

            {!selfMode && isEdit && <Button onClick={savePolicies} disabled={loading} className="bg-[#7D9D85] hover:bg-[#6A8872]" data-testid="save-policies-btn">Save Policy Assignments</Button>}
          </div>
        )}

        {/* HIERARCHY */}
        {tab === 'hierarchy' && isEdit && (
          <div className="space-y-4">
            <p className="text-xs text-[#A28B7A]">Per-flow approvers. Each flow can have a different approver — useful when Leave goes to Manager but Reimbursement goes to Finance.</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['leave_approver_id', 'Leave Approver'],
                ['attendance_approver_id', 'Attendance Approver'],
                ['overtime_approver_id', 'Overtime Approver'],
                ['reimbursement_approver_id', 'Reimbursement Approver'],
                ['payroll_approver_id', 'Payroll Approver'],
                ['general_manager_id', 'General Manager (escalation)'],
              ].map(function(pair) { var key = pair[0], label = pair[1];
                var approverInfo = effectivePolicies && effectivePolicies.approvers ? effectivePolicies.approvers[form[key]] : null;
                return (
                <div key={key} className="border border-[#E8E2D9] rounded-lg p-3">
                  <Label className="text-xs font-semibold text-[#2A2624] mb-1.5 block">{label}</Label>
                  {selfMode ? (
                    <p className="text-sm text-[#2A2624]">{approverInfo ? `${approverInfo.first_name} ${approverInfo.last_name} (${approverInfo.employee_code})` : <span className="text-[#A28B7A] text-xs italic">Not set</span>}</p>
                  ) : (
                    <Select value={form[key] || ''} onValueChange={function(v) { f(key, v === 'none' ? '' : v); }}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Not set" /></SelectTrigger>
                      <SelectContent><SelectItem value="none">Not set</SelectItem>{emps.filter(function(e) { return e.id !== employeeId; }).map(function(e) { return <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_code})</SelectItem>; })}</SelectContent>
                    </Select>
                  )}
                </div>
              ); })}
            </div>
            {!selfMode && <Button onClick={saveHierarchy} disabled={loading} className="bg-[#7D9D85] hover:bg-[#6A8872]">Save Hierarchy</Button>}
          </div>
        )}

        {/* SALARY / POLICY ASSIGNMENT */}
        {tab === 'assignments' && isEdit && (
          <div className="space-y-4">
            <Field label="Salary Template">
              <Select value={form.salary_template_id || ''} onValueChange={function(v) { f('salary_template_id', v === 'none' ? '' : v); }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="None assigned" /></SelectTrigger>
                <SelectContent><SelectItem value="none">None</SelectItem>{(salaryTemplates || []).map(function(t) { return <SelectItem key={t.id} value={t.id}>{t.template_name}</SelectItem>; })}</SelectContent>
              </Select>
            </Field>
            {salaryAssignment && (
              <div className="bg-[#F9F6F0] p-3 rounded-lg text-xs">
                <p className="text-[#A28B7A]">Currently assigned:</p>
                <p className="font-semibold text-[#2A2624]">{(salaryTemplates || []).find(function(t) { return t.id === salaryAssignment.salary_template_id; })?.template_name || salaryAssignment.salary_template_id}</p>
              </div>
            )}
            <Button onClick={saveSalaryAssignment} className="bg-[#D96C5B] hover:bg-[#C25949]">Save Salary Assignment</Button>
            <div className="mt-4 p-3 bg-[#E8B25C]/10 rounded-lg flex items-start gap-2">
              <Info size={14} className="text-[#E8B25C] mt-0.5" />
              <p className="text-[10px] text-[#A28B7A]">Policy linkage is set at the Salary Template level (Salary → Templates → Edit → Policy Links). Employees inherit their linked policies through the assigned template.</p>
            </div>
          </div>
        )}

        {/* DOCUMENTS */}
        {tab === 'documents' && isEdit && (
          <div className="space-y-3">
            <div className="flex justify-between items-center"><p className="text-xs font-bold uppercase text-[#7D9D85]">Documents ({docs.length})</p><Button size="sm" onClick={addDoc} variant="outline"><Upload size={14} className="mr-1" /> Add Document</Button></div>
            {docs.length === 0 ? <p className="text-xs text-[#A28B7A] text-center py-6">No documents yet</p> : (
              <div className="space-y-1">
                {docs.map(function(d) { return (
                  <div key={d.id} className="flex items-center justify-between p-2 bg-[#F9F6F0] rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{d.file_name || d.file_url}</p>
                      <p className="text-[10px] text-[#A28B7A]">{d.category} • {new Date(d.uploaded_at).toLocaleDateString()}</p>
                    </div>
                    <a href={d.file_url} target="_blank" rel="noreferrer" className="text-xs text-[#7D9D85] hover:underline mr-2">View</a>
                    <button onClick={function() { deleteDoc(d.id); }} className="p-1 text-[#C65549]"><Trash size={14} /></button>
                  </div>
                ); })}
              </div>
            )}
            <p className="text-[10px] text-[#A28B7A]">Upload files via the Documents page (or any image uploader) and paste the URL here. Categories: general, recruitment, payslip, kyc, statutory, other.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E8E2D9]">
        <Button variant="outline" onClick={onClose}><X size={14} className="mr-1" /> Cancel</Button>
        {selfMode && ['employment','salary_bank','statutory','kyc','voluntary','previous','hierarchy'].indexOf(tab) >= 0 && (
          <Button variant="outline" onClick={openChangeRequest} className="text-[#A28B7A]" data-testid="request-change-btn"><Lock size={12} className="mr-1" /> Request Change</Button>
        )}
        {['personal','contact','address','policies','documents'].indexOf(tab) === -1 && isEdit && !selfMode && null}
        {((!selfMode && ['personal','contact','address','employment','salary_bank','statutory','kyc','voluntary','previous'].indexOf(tab) >= 0) ||
          (selfMode && ['personal','contact','address'].indexOf(tab) >= 0)) && (
          <Button onClick={save} disabled={loading} className="bg-[#D96C5B] hover:bg-[#C25949]" data-testid="save-profile"><FloppyDisk size={14} className="mr-1" /> {isEdit ? (selfMode ? 'Save My Changes' : 'Update Employee') : 'Create Employee'}</Button>
        )}
      </div>

      {/* Request Change Dialog */}
      <Dialog open={changeReqOpen} onOpenChange={setChangeReqOpen}>
        <DialogContent className="sm:max-w-md" data-testid="request-change-dialog">
          <DialogHeader>
            <DialogTitle>Request a Change</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-[#A28B7A]">Select the field you'd like changed. HR will review and approve/reject your request.</p>
            <Field label="Field">
              <Select value={crField} onValueChange={setCrField}>
                <SelectTrigger className="h-9" data-testid="cr-field-select"><SelectValue placeholder="Select field" /></SelectTrigger>
                <SelectContent>
                  {(PROTECTED_FIELDS_BY_TAB[tab] || []).map(function(pair) {
                    return <SelectItem key={pair[0]} value={pair[0]}>{pair[1]}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </Field>
            <Field label="New Value">
              <Txt value={crValue} onChange={function(e) { setCrValue(e.target.value); }} data-testid="cr-value-input" placeholder="Enter the corrected value" />
            </Field>
            <Field label="Reason (optional)">
              <Textarea value={crReason} onChange={function(e) { setCrReason(e.target.value); }} data-testid="cr-reason-input" placeholder="Why do you need this changed?" className="text-sm min-h-[72px]" />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={function() { setChangeReqOpen(false); }} data-testid="cr-cancel">Cancel</Button>
            <Button onClick={submitChangeRequest} disabled={crSubmitting} className="bg-[#D96C5B] hover:bg-[#C25949]" data-testid="cr-submit">Submit Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
