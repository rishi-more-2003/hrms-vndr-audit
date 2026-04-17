import React, { useEffect, useState } from 'react';
import { policyTemplateAPI, policyAssignmentAPI, employeeAPI, locationAPI, departmentAPI, shiftAPI } from '../services/api';
import { Scroll, Plus, Trash, PencilSimple, Users } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';

var POLICY_TYPES = [
  { key: 'leave', label: 'Leave Policy' },
  { key: 'attendance', label: 'Attendance Policy' },
];

var FREQ_OPTIONS = ['per_week', 'per_month', 'per_quarter', 'per_half_year', 'per_year'];
var FREQ_LABELS = { per_week: 'Per Week', per_month: 'Per Month', per_quarter: 'Per Quarter', per_half_year: 'Per Half Year', per_year: 'Per Year' };
var DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function FreqSelect({ value, onChange, label }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value || 'per_year'} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>{FREQ_OPTIONS.map(function(o) { return <SelectItem key={o} value={o}>{FREQ_LABELS[o]}</SelectItem>; })}</SelectContent>
      </Select>
    </div>
  );
}

function NumInput({ value, onChange, label, min }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={value ?? ''} onChange={function(e) { onChange(parseFloat(e.target.value) || 0); }} min={min || 0} className="h-9" />
    </div>
  );
}

function SwitchField({ value, onChange, label }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <Label className="text-xs">{label}</Label>
      <Switch checked={!!value} onCheckedChange={onChange} />
    </div>
  );
}

function Section({ title, children, color }) {
  var c = color || '#D96C5B';
  return (
    <div className="border border-[#E8E2D9] rounded-xl p-4 mt-3">
      <p className="text-xs font-bold uppercase tracking-[0.15em] mb-3" style={{ color: c }}>{title}</p>
      {children}
    </div>
  );
}

// ══════════════  LEAVE POLICY FORM  ══════════════
function LeavePolicyForm({ data, onChange }) {
  var d = data;
  function set(key, val) { onChange({...d, [key]: val}); }
  function setLeave(type, key, val) {
    var leaves = {...(d.leaves || {})};
    leaves[type] = {...(leaves[type] || {}), [key]: val};
    onChange({...d, leaves: leaves});
  }
  function gl(type, key, def) { return (d.leaves && d.leaves[type] && d.leaves[type][key]) ?? def; }

  // Holiday management
  function addHoliday() {
    var holidays = [...(d.holidays || []), { date: '', name: '', type: 'national' }];
    set('holidays', holidays);
  }
  function updateHoliday(i, key, val) {
    var holidays = [...(d.holidays || [])];
    holidays[i] = {...holidays[i], [key]: val};
    set('holidays', holidays);
  }
  function removeHoliday(i) { set('holidays', (d.holidays || []).filter(function(_, idx) { return idx !== i; })); }

  var leaveTypes = [
    { key: 'casual', label: 'Casual Leave', color: '#D96C5B' },
    { key: 'sick', label: 'Sick Leave', color: '#E8B25C' },
    { key: 'earned', label: 'Earned Leave', color: '#7D9D85' },
    { key: 'maternity', label: 'Maternity Leave', color: '#A28B7A' },
    { key: 'paternity', label: 'Paternity Leave', color: '#4A5D4E' },
    { key: 'wfh', label: 'Work From Home', color: '#D96C5B' },
  ];

  return (
    <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-2">
      <div><Label className="text-sm">Template Name *</Label><Input value={d.template_name || ''} onChange={function(e) { set('template_name', e.target.value); }} required /></div>

      {leaveTypes.map(function(lt) {
        return (
          <Section key={lt.key} title={lt.label} color={lt.color}>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <NumInput value={gl(lt.key, 'allowed', 0)} onChange={function(v) { setLeave(lt.key, 'allowed', v); }} label="Total Allowed" />
              <FreqSelect value={gl(lt.key, 'frequency', 'per_year')} onChange={function(v) { setLeave(lt.key, 'frequency', v); }} label="Frequency" />
              <NumInput value={gl(lt.key, 'application_window_days', 0)} onChange={function(v) { setLeave(lt.key, 'application_window_days', v); }} label="Application Window (days prior)" />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <SwitchField value={gl(lt.key, 'carry_forward', false)} onChange={function(v) { setLeave(lt.key, 'carry_forward', v); }} label="Carry Forward Allowed" />
              {gl(lt.key, 'carry_forward') && <NumInput value={gl(lt.key, 'max_carry', 0)} onChange={function(v) { setLeave(lt.key, 'max_carry', v); }} label="Max Carry Forward" />}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-1">
              <SwitchField value={gl(lt.key, 'encashment', false)} onChange={function(v) { setLeave(lt.key, 'encashment', v); }} label="Encashment Allowed" />
              <SwitchField value={gl(lt.key, 'clubbing_allowed', true)} onChange={function(v) { setLeave(lt.key, 'clubbing_allowed', v); }} label="Can Club with Other Leaves" />
            </div>

            {/* Earned Leave specific */}
            {lt.key === 'earned' && (
              <div className="grid grid-cols-2 gap-3 mt-2 pt-2 border-t border-[#E8E2D9]">
                <FreqSelect value={gl('earned', 'credit_cycle', 'per_month')} onChange={function(v) { setLeave('earned', 'credit_cycle', v); }} label="Credit Cycle" />
                <NumInput value={gl('earned', 'paid_days_per_credit', 20)} onChange={function(v) { setLeave('earned', 'paid_days_per_credit', v); }} label="Paid Days per 1 EL Credit" />
              </div>
            )}

            {/* Sick Leave specific */}
            {lt.key === 'sick' && (
              <div className="mt-2 pt-2 border-t border-[#E8E2D9] space-y-2">
                <NumInput value={gl('sick', 'reporting_window_hours', 2)} onChange={function(v) { setLeave('sick', 'reporting_window_hours', v); }} label="Reporting Window (hours)" />
                <div className="grid grid-cols-2 gap-3">
                  <NumInput value={gl('sick', 'medical_docs_threshold', 3)} onChange={function(v) { setLeave('sick', 'medical_docs_threshold', v); }} label="Medical Docs Required After (days)" />
                  <FreqSelect value={gl('sick', 'medical_docs_frequency', 'per_year')} onChange={function(v) { setLeave('sick', 'medical_docs_frequency', v); }} label="Threshold Frequency" />
                </div>
                <div>
                  <Label className="text-xs">Approval Mode</Label>
                  <Select value={gl('sick', 'approval_mode', 'auto_if_balance')} onValueChange={function(v) { setLeave('sick', 'approval_mode', v); }}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto_if_balance">Auto-approve if balance available</SelectItem>
                      <SelectItem value="manager_approval">Always requires manager approval</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Maternity / Paternity specific */}
            {(lt.key === 'maternity' || lt.key === 'paternity') && (
              <div className="mt-2 pt-2 border-t border-[#E8E2D9] space-y-2">
                <NumInput value={gl(lt.key, 'eligibility_min_days', 80)} onChange={function(v) { setLeave(lt.key, 'eligibility_min_days', v); }} label="Eligibility: Min Working/Paid Days" />
                <SwitchField value={gl(lt.key, 'documents_required', true)} onChange={function(v) { setLeave(lt.key, 'documents_required', v); }} label="Medical Documents Required" />
              </div>
            )}

            {/* WFH specific */}
            {lt.key === 'wfh' && (
              <div className="mt-2 pt-2 border-t border-[#E8E2D9] space-y-2">
                <SwitchField value={gl('wfh', 'enabled', false)} onChange={function(v) { setLeave('wfh', 'enabled', v); }} label="WFH Allowed" />
                {gl('wfh', 'enabled') && (
                  <div className="space-y-2">
                    <div>
                      <Label className="text-xs">Pay Type</Label>
                      <Select value={gl('wfh', 'pay_type', 'full')} onValueChange={function(v) { setLeave('wfh', 'pay_type', v); }}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="full">Full Pay</SelectItem>
                          <SelectItem value="partial">Partial Pay</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {gl('wfh', 'pay_type') === 'partial' && (
                      <NumInput value={gl('wfh', 'pay_percentage', 100)} onChange={function(v) { setLeave('wfh', 'pay_percentage', v); }} label="Pay Percentage (%)" />
                    )}
                  </div>
                )}
              </div>
            )}
          </Section>
        );
      })}

      {/* Sandwich Rule */}
      <Section title="General Rules" color="#2A2624">
        <SwitchField value={d.sandwich_rule || false} onChange={function(v) { set('sandwich_rule', v); }} label="Sandwich Rule (weekends between leaves count as leave)" />
        <SwitchField value={d.negative_balance_allowed || false} onChange={function(v) { set('negative_balance_allowed', v); }} label="Allow Negative Leave Balance" />
        {d.negative_balance_allowed && <NumInput value={d.max_negative || 0} onChange={function(v) { set('max_negative', v); }} label="Max Negative Balance Allowed" />}
      </Section>

      {/* Holiday Calendar */}
      <Section title="Holiday Calendar" color="#7D9D85">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-[#6A625E]">Define national, state, and festival holidays</p>
          <Button size="sm" variant="outline" onClick={addHoliday}><Plus size={14} className="mr-1" /> Add Holiday</Button>
        </div>
        {(d.holidays || []).length === 0 && <p className="text-xs text-[#A28B7A]">No holidays added yet</p>}
        {(d.holidays || []).map(function(h, i) {
          return (
            <div key={i} className="grid grid-cols-4 gap-2 mb-2 items-end">
              <div><Label className="text-xs">Date</Label><Input type="date" value={h.date || ''} onChange={function(e) { updateHoliday(i, 'date', e.target.value); }} className="h-9" /></div>
              <div><Label className="text-xs">Holiday Name</Label><Input value={h.name || ''} onChange={function(e) { updateHoliday(i, 'name', e.target.value); }} className="h-9" /></div>
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={h.type || 'national'} onValueChange={function(v) { updateHoliday(i, 'type', v); }}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="national">National</SelectItem>
                    <SelectItem value="state">State</SelectItem>
                    <SelectItem value="festival">Festival</SelectItem>
                    <SelectItem value="company">Company</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <button onClick={function() { removeHoliday(i); }} className="p-2 text-[#C65549] hover:bg-[#C65549]/10 rounded-lg h-9"><Trash size={14} /></button>
            </div>
          );
        })}
      </Section>
    </div>
  );
}

// ══════════════  ATTENDANCE POLICY FORM  ══════════════
function AttendancePolicyForm({ data, onChange, shifts }) {
  var d = data;
  function set(key, val) { onChange({...d, [key]: val}); }

  function toggleWeekOff(day) {
    var days = [...(d.week_off_days || [])];
    var idx = days.indexOf(day);
    if (idx >= 0) days.splice(idx, 1); else days.push(day);
    set('week_off_days', days);
  }

  // Shift rules
  function addShiftRule() {
    var rules = [...(d.shift_rules || []), { shift_id: '', grace_period_minutes: 15, half_day_after_hours: 4, min_hours_full_day: 8, auto_absent_if_no_clockin_by: '11:00' }];
    set('shift_rules', rules);
  }
  function updateShiftRule(i, key, val) {
    var rules = [...(d.shift_rules || [])];
    rules[i] = {...rules[i], [key]: val};
    set('shift_rules', rules);
  }
  function removeShiftRule(i) { set('shift_rules', (d.shift_rules || []).filter(function(_, idx) { return idx !== i; })); }

  return (
    <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-2">
      <div><Label className="text-sm">Template Name *</Label><Input value={d.template_name || ''} onChange={function(e) { set('template_name', e.target.value); }} required /></div>

      <Section title="Pay Basis" color="#D96C5B">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Pay Basis</Label>
            <Select value={d.pay_basis || 'monthly'} onValueChange={function(v) { set('pay_basis', v); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Month Day Calculation</Label>
            <Select value={d.month_day_calc || 'actual'} onValueChange={function(v) { set('month_day_calc', v); }}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="actual">Actual Days (Jan=31, Feb=28...)</SelectItem>
                <SelectItem value="fixed_30">Fixed 30 Days</SelectItem>
                <SelectItem value="fixed_26">Fixed 26 Days</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {d.month_day_calc === 'custom' && <NumInput value={d.custom_days || 30} onChange={function(v) { set('custom_days', v); }} label="Custom Days per Month" />}
      </Section>

      <Section title="Salary Cycle" color="#7D9D85">
        <div className="grid grid-cols-2 gap-3">
          <NumInput value={d.salary_cycle_start || 1} onChange={function(v) { set('salary_cycle_start', v); }} label="Cycle Start Day (of month)" min={1} />
          <NumInput value={d.salary_cycle_end || 31} onChange={function(v) { set('salary_cycle_end', v); }} label="Cycle End Day (of month)" min={1} />
        </div>
        <p className="text-xs text-[#A28B7A] mt-1">E.g. Start=10, End=9 means payroll from 10th to 9th of next month</p>
      </Section>

      <Section title="Week Offs" color="#E8B25C">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <NumInput value={d.week_offs_per_week || 1} onChange={function(v) { set('week_offs_per_week', v); }} label="Week Offs per Week" />
          <SwitchField value={d.week_offs_paid || true} onChange={function(v) { set('week_offs_paid', v); }} label="Week Offs are Paid" />
        </div>
        <Label className="text-xs mb-2 block">Week Off Days</Label>
        <div className="flex flex-wrap gap-2">
          {DAYS_OF_WEEK.map(function(day) {
            var isSelected = (d.week_off_days || []).indexOf(day) >= 0;
            return (
              <button
                key={day}
                type="button"
                onClick={function() { toggleWeekOff(day); }}
                className={'px-3 py-1.5 rounded-lg text-xs font-medium transition-all ' + (isSelected ? 'bg-[#D96C5B] text-white' : 'bg-white border border-[#E8E2D9] text-[#6A625E] hover:border-[#D96C5B]')}
              >
                {day.substring(0, 3)}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Shift-specific Rules */}
      <Section title="Shift-Specific Rules" color="#A28B7A">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-[#6A625E]">Configure rules per shift (grace period, half-day, minimum hours)</p>
          <Button size="sm" variant="outline" onClick={addShiftRule}><Plus size={14} className="mr-1" /> Add Shift Rule</Button>
        </div>
        {(d.shift_rules || []).length === 0 && <p className="text-xs text-[#A28B7A]">No shift rules. Add rules for each applicable shift.</p>}
        {(d.shift_rules || []).map(function(rule, i) {
          return (
            <div key={i} className="border border-[#E8E2D9] rounded-lg p-3 mb-2">
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1 mr-2">
                  <Label className="text-xs">Shift</Label>
                  <Select value={rule.shift_id || ''} onValueChange={function(v) { updateShiftRule(i, 'shift_id', v); }}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select shift" /></SelectTrigger>
                    <SelectContent>
                      {shifts.map(function(s) { return <SelectItem key={s.id} value={s.id}>{s.name} ({s.start_time}-{s.end_time})</SelectItem>; })}
                    </SelectContent>
                  </Select>
                </div>
                <button onClick={function() { removeShiftRule(i); }} className="p-1 text-[#C65549]"><Trash size={14} /></button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <NumInput value={rule.grace_period_minutes} onChange={function(v) { updateShiftRule(i, 'grace_period_minutes', v); }} label="Grace Period (min)" />
                <NumInput value={rule.half_day_after_hours} onChange={function(v) { updateShiftRule(i, 'half_day_after_hours', v); }} label="Half Day After (hrs)" />
                <NumInput value={rule.min_hours_full_day} onChange={function(v) { updateShiftRule(i, 'min_hours_full_day', v); }} label="Min Hours Full Day" />
                <div>
                  <Label className="text-xs">Auto Absent If No Clock-in By</Label>
                  <Input type="time" value={rule.auto_absent_if_no_clockin_by || '11:00'} onChange={function(e) { updateShiftRule(i, 'auto_absent_if_no_clockin_by', e.target.value); }} className="h-9" />
                </div>
              </div>
            </div>
          );
        })}
      </Section>

      <Section title="Comp-Off & Additional Rules" color="#4A5D4E">
        <SwitchField value={d.compoff_for_holiday_work || false} onChange={function(v) { set('compoff_for_holiday_work', v); }} label="Comp-off for working on holidays/week-offs" />
        {d.compoff_for_holiday_work && (
          <NumInput value={d.compoff_validity_days || 30} onChange={function(v) { set('compoff_validity_days', v); }} label="Comp-off Validity (days)" />
        )}
        <SwitchField value={d.late_mark_tracking || false} onChange={function(v) { set('late_mark_tracking', v); }} label="Track Late Marks" />
        {d.late_mark_tracking && (
          <div className="grid grid-cols-2 gap-3 mt-1">
            <NumInput value={d.late_marks_to_half_day || 3} onChange={function(v) { set('late_marks_to_half_day', v); }} label="Late Marks = 1 Half Day" />
            <FreqSelect value={d.late_mark_frequency || 'per_month'} onChange={function(v) { set('late_mark_frequency', v); }} label="Reset Frequency" />
          </div>
        )}
        <SwitchField value={d.early_departure_tracking || false} onChange={function(v) { set('early_departure_tracking', v); }} label="Track Early Departures" />
        <SwitchField value={d.biometric_mandatory || false} onChange={function(v) { set('biometric_mandatory', v); }} label="Biometric/Device Clock-in Mandatory" />
      </Section>
    </div>
  );
}

// ══════════════  MAIN PAGE  ══════════════
export default function PolicyPage() {
  var [activeTab, setActiveTab] = useState('leave');
  var [templates, setTemplates] = useState({});
  var [formData, setFormData] = useState({});
  var [createDialog, setCreateDialog] = useState(false);
  var [assignDialog, setAssignDialog] = useState(false);
  var [editingId, setEditingId] = useState(null);
  var [employees, setEmployees] = useState([]);
  var [locations, setLocations] = useState([]);
  var [departments, setDepartments] = useState([]);
  var [shifts, setShifts] = useState([]);
  var [assignForm, setAssignForm] = useState({ assign_by: 'location', target_id: '', templates: {} });
  var [loading, setLoading] = useState(true);

  useEffect(function() { fetchAll(); }, []);
  useEffect(function() { fetchTemplates(activeTab); }, [activeTab]);

  async function fetchAll() {
    try {
      var results = await Promise.all([employeeAPI.getAll(), locationAPI.getAll(), departmentAPI.getAll(), shiftAPI.getAll()]);
      setEmployees(results[0].data);
      setLocations(results[1].data);
      setDepartments(results[2].data);
      setShifts(results[3].data || []);
      var types = ['leave', 'attendance'];
      var tResults = await Promise.all(types.map(function(t) { return policyTemplateAPI.getAll(t).catch(function() { return { data: [] }; }); }));
      var nt = {};
      types.forEach(function(t, idx) { nt[t] = tResults[idx].data || []; });
      setTemplates(nt);
    } catch (e) { /* ok */ }
    setLoading(false);
  }

  async function fetchTemplates(type) {
    try { var res = await policyTemplateAPI.getAll(type); setTemplates(function(p) { return {...p, [type]: res.data}; }); } catch (e) { /* ok */ }
  }

  function openCreate() { setFormData({}); setEditingId(null); setCreateDialog(true); }
  function openEdit(tmpl) { setFormData({...tmpl}); setEditingId(tmpl.id); setCreateDialog(true); }

  async function saveTemplate(e) {
    e.preventDefault();
    try {
      if (editingId) { await policyTemplateAPI.update(activeTab, editingId, formData); toast.success('Updated'); }
      else { await policyTemplateAPI.create(activeTab, formData); toast.success('Created'); }
      setCreateDialog(false);
      fetchTemplates(activeTab);
    } catch (e) { toast.error('Failed'); }
  }

  async function deleteTemplate(id) {
    try { await policyTemplateAPI.delete(activeTab, id); toast.success('Deleted'); fetchTemplates(activeTab); } catch (e) { toast.error('Failed'); }
  }

  async function handleBulkAssign() {
    try { await policyAssignmentAPI.bulkAssign(assignForm); toast.success('Policies assigned'); setAssignDialog(false); } catch (e) { toast.error('Failed'); }
  }

  var currentTemplates = templates[activeTab] || [];

  function renderSummary(tmpl) {
    if (activeTab === 'leave') {
      var leaves = tmpl.leaves || {};
      var parts = [];
      if (leaves.casual) parts.push('CL:' + (leaves.casual.allowed || 0));
      if (leaves.sick) parts.push('SL:' + (leaves.sick.allowed || 0));
      if (leaves.earned) parts.push('EL:' + (leaves.earned.allowed || 0));
      if (leaves.wfh && leaves.wfh.enabled) parts.push('WFH:Yes');
      parts.push('Holidays:' + (tmpl.holidays || []).length);
      return parts.join(' | ');
    }
    if (activeTab === 'attendance') {
      var parts2 = [];
      parts2.push('Pay:' + (tmpl.pay_basis || 'monthly'));
      parts2.push('Days:' + (tmpl.month_day_calc || 'actual'));
      parts2.push('Cycle:' + (tmpl.salary_cycle_start || 1) + '-' + (tmpl.salary_cycle_end || 31));
      parts2.push('WeekOffs:' + (tmpl.week_off_days || []).map(function(d) { return d.substring(0,3); }).join(','));
      parts2.push('Shifts:' + (tmpl.shift_rules || []).length);
      return parts2.join(' | ');
    }
    return '';
  }

  return (
    <div className="space-y-6" data-testid="policy-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Policy Management</h1>
          <p className="text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>Configure leave, attendance & other policies</p>
        </div>
        <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
          <DialogTrigger asChild>
            <Button variant="outline" className="rounded-xl" data-testid="policy-bulk-assign"><Users size={18} className="mr-2" /> Bulk Assign</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Bulk Assign Policies</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Assign By</Label>
                <Select value={assignForm.assign_by} onValueChange={function(v) { setAssignForm({...assignForm, assign_by: v}); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="location">Location</SelectItem><SelectItem value="department">Department</SelectItem></SelectContent>
                </Select>
              </div>
              {assignForm.assign_by === 'location' && (
                <div><Label>Location</Label><Select value={assignForm.target_id} onValueChange={function(v) { setAssignForm({...assignForm, target_id: v}); }}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{locations.map(function(l) { return <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>; })}</SelectContent></Select></div>
              )}
              {assignForm.assign_by === 'department' && (
                <div><Label>Department</Label><Select value={assignForm.target_id} onValueChange={function(v) { setAssignForm({...assignForm, target_id: v}); }}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{departments.map(function(d) { return <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>; })}</SelectContent></Select></div>
              )}
              {POLICY_TYPES.map(function(pt) {
                var typeTemplates = templates[pt.key] || [];
                return (
                  <div key={pt.key}><Label>{pt.label} Policy</Label>
                    <Select value={assignForm.templates[pt.key + '_template_id'] || ''} onValueChange={function(v) { setAssignForm({...assignForm, templates: {...assignForm.templates, [pt.key + '_template_id']: v}}); }}>
                      <SelectTrigger><SelectValue placeholder={'Select ' + pt.label} /></SelectTrigger>
                      <SelectContent><SelectItem value="none">None</SelectItem>{typeTemplates.map(function(t) { return <SelectItem key={t.id} value={t.id}>{t.template_name}</SelectItem>; })}</SelectContent>
                    </Select>
                  </div>
                );
              })}
              <Button onClick={handleBulkAssign} className="w-full bg-[#D96C5B] hover:bg-[#C25949]">Assign Policies</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-white border border-[#E8E2D9] rounded-xl p-1 w-full flex">
          {POLICY_TYPES.map(function(pt) {
            return <TabsTrigger key={pt.key} value={pt.key} data-testid={'policy-tab-' + pt.key} className="flex-1 rounded-lg text-sm data-[state=active]:bg-[#D96C5B] data-[state=active]:text-white">{pt.label}</TabsTrigger>;
          })}
        </TabsList>

        {POLICY_TYPES.map(function(pt) {
          return (
            <TabsContent key={pt.key} value={pt.key} className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[#2A2624]">{pt.label} Templates</h3>
                <Button onClick={openCreate} className="bg-[#D96C5B] hover:bg-[#C25949] rounded-xl" data-testid={'create-' + pt.key + '-policy'}>
                  <Plus size={18} className="mr-2" /> Create Template
                </Button>
              </div>
              {currentTemplates.length === 0 ? (
                <div className="bg-white border border-[#E8E2D9] rounded-2xl p-12 text-center">
                  <Scroll size={64} className="mx-auto mb-4 text-[#A28B7A] opacity-50" />
                  <h3 className="text-xl font-semibold text-[#2A2624] mb-2">No Templates</h3>
                  <p className="text-[#6A625E]">Create a {pt.label.toLowerCase()} template to get started</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {currentTemplates.map(function(tmpl) {
                    return (
                      <div key={tmpl.id} className="bg-white border border-[#E8E2D9] rounded-xl p-4 hover:border-[#D96C5B] transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold text-[#2A2624]">{tmpl.template_name}</h4>
                            <p className="text-xs text-[#6A625E] mt-1">{renderSummary(tmpl)}</p>
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden">
          <DialogHeader><DialogTitle>{editingId ? 'Edit' : 'Create'} {POLICY_TYPES.find(function(t) { return t.key === activeTab; })?.label} Policy</DialogTitle></DialogHeader>
          <form onSubmit={saveTemplate}>
            {activeTab === 'leave' && <LeavePolicyForm data={formData} onChange={setFormData} />}
            {activeTab === 'attendance' && <AttendancePolicyForm data={formData} onChange={setFormData} shifts={shifts} />}
            <Button type="submit" className="w-full bg-[#D96C5B] hover:bg-[#C25949] mt-4">{editingId ? 'Update' : 'Create'} Policy</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
