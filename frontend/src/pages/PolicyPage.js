import React, { useEffect, useState } from 'react';
import { policyTemplateAPI, policyAssignmentAPI, employeeAPI, locationAPI, departmentAPI, shiftAPI } from '../services/api';
import { Scroll, Plus, Trash, PencilSimple, Users, Warning } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';

var POLICY_TYPES = [
  { key: 'leave', label: 'Leave' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'overtime', label: 'Overtime' },
  { key: 'reimbursement', label: 'Reimburse' },
  { key: 'bonus', label: 'Bonus' },
  { key: 'gratuity', label: 'Gratuity' },
  { key: 'incentive', label: 'Incentive' },
  { key: 'advance', label: 'Advance' },
  { key: 'loan', label: 'Loan' },
];

var FREQ_OPTIONS = ['per_day','per_week','per_month','per_quarter','per_half_year','per_year'];
var FREQ_LABELS = {per_day:'Per Day',per_week:'Per Week',per_month:'Per Month',per_quarter:'Per Quarter',per_half_year:'Per Half Year',per_year:'Per Year'};
var DAYS_OF_WEEK = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function FreqSelect({value,onChange,label}){return(<div><Label className="text-xs">{label}</Label><Select value={value||'per_year'} onValueChange={onChange}><SelectTrigger className="h-9"><SelectValue/></SelectTrigger><SelectContent>{FREQ_OPTIONS.map(function(o){return <SelectItem key={o} value={o}>{FREQ_LABELS[o]}</SelectItem>;})}</SelectContent></Select></div>);}
function NumInput({value,onChange,label,min,placeholder}){return(<div><Label className="text-xs">{label}</Label><Input type="number" value={value??''} onChange={function(e){onChange(parseFloat(e.target.value)||0);}} min={min||0} className="h-9" placeholder={placeholder}/></div>);}
function SwitchField({value,onChange,label}){return(<div className="flex items-center justify-between py-1.5"><Label className="text-xs">{label}</Label><Switch checked={!!value} onCheckedChange={onChange}/></div>);}
function TextInput({value,onChange,label,placeholder}){return(<div><Label className="text-xs">{label}</Label><Input value={value||''} onChange={function(e){onChange(e.target.value);}} className="h-9" placeholder={placeholder}/></div>);}
function Section({title,children,color}){return(<div className="border border-[#E8E2D9] rounded-xl p-4 mt-3"><p className="text-xs font-bold uppercase tracking-[0.15em] mb-3" style={{color:color||'#D96C5B'}}>{title}</p>{children}</div>);}
function WarningBox({text}){return(<div className="bg-[#E8B25C]/10 border border-[#E8B25C]/30 rounded-lg p-3 flex items-start space-x-2 mt-2"><Warning size={16} className="text-[#E8B25C] flex-shrink-0 mt-0.5"/><p className="text-xs text-[#6A625E]">{text}</p></div>);}

// ═══════════ LEAVE POLICY ═══════════
function LeavePolicyForm({data,onChange}){
  var d=data;function set(k,v){onChange({...d,[k]:v});}
  function setLeave(t,k,v){var l={...(d.leaves||{})};l[t]={...(l[t]||{}),[k]:v};onChange({...d,leaves:l});}
  function gl(t,k,def){return(d.leaves&&d.leaves[t]&&d.leaves[t][k])??def;}
  function addHoliday(){set('holidays',[...(d.holidays||[]),{date:'',name:'',type:'national'}]);}
  function updateHoliday(i,k,v){var h=[...(d.holidays||[])];h[i]={...h[i],[k]:v};set('holidays',h);}
  function removeHoliday(i){set('holidays',(d.holidays||[]).filter(function(_,idx){return idx!==i;}));}
  var leaveTypes=[{key:'casual',label:'Casual Leave',color:'#D96C5B'},{key:'sick',label:'Sick Leave',color:'#E8B25C'},{key:'earned',label:'Earned Leave',color:'#7D9D85'},{key:'maternity',label:'Maternity Leave',color:'#A28B7A'},{key:'paternity',label:'Paternity Leave',color:'#4A5D4E'},{key:'wfh',label:'Work From Home',color:'#D96C5B'}];
  return(
    <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-2">
      <div><Label className="text-sm">Template Name *</Label><Input value={d.template_name||''} onChange={function(e){set('template_name',e.target.value);}} required/></div>
      {leaveTypes.map(function(lt){return(
        <Section key={lt.key} title={lt.label} color={lt.color}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <NumInput value={gl(lt.key,'allowed',0)} onChange={function(v){setLeave(lt.key,'allowed',v);}} label="Total Allowed"/>
            <FreqSelect value={gl(lt.key,'frequency','per_year')} onChange={function(v){setLeave(lt.key,'frequency',v);}} label="Frequency"/>
            <NumInput value={gl(lt.key,'application_window_days',0)} onChange={function(v){setLeave(lt.key,'application_window_days',v);}} label="Application Window (days)"/>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <SwitchField value={gl(lt.key,'carry_forward',false)} onChange={function(v){setLeave(lt.key,'carry_forward',v);}} label="Carry Forward"/>
            {gl(lt.key,'carry_forward')&&<NumInput value={gl(lt.key,'max_carry',0)} onChange={function(v){setLeave(lt.key,'max_carry',v);}} label="Max Carry"/>}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-1">
            <SwitchField value={gl(lt.key,'encashment',false)} onChange={function(v){setLeave(lt.key,'encashment',v);}} label="Encashment"/>
            <SwitchField value={gl(lt.key,'clubbing_allowed',true)} onChange={function(v){setLeave(lt.key,'clubbing_allowed',v);}} label="Clubbing Allowed"/>
          </div>
          {lt.key==='earned'&&(<div className="grid grid-cols-2 gap-3 mt-2 pt-2 border-t border-[#E8E2D9]"><FreqSelect value={gl('earned','credit_cycle','per_month')} onChange={function(v){setLeave('earned','credit_cycle',v);}} label="Credit Cycle"/><NumInput value={gl('earned','paid_days_per_credit',20)} onChange={function(v){setLeave('earned','paid_days_per_credit',v);}} label="Paid Days per 1 EL Credit"/></div>)}
          {lt.key==='sick'&&(<div className="mt-2 pt-2 border-t border-[#E8E2D9] space-y-2"><NumInput value={gl('sick','reporting_window_hours',2)} onChange={function(v){setLeave('sick','reporting_window_hours',v);}} label="Reporting Window (hrs)"/><div className="grid grid-cols-2 gap-3"><NumInput value={gl('sick','medical_docs_threshold',3)} onChange={function(v){setLeave('sick','medical_docs_threshold',v);}} label="Medical Docs After (days)"/><FreqSelect value={gl('sick','medical_docs_frequency','per_year')} onChange={function(v){setLeave('sick','medical_docs_frequency',v);}} label="Threshold Freq"/></div><div><Label className="text-xs">Approval Mode</Label><Select value={gl('sick','approval_mode','auto_if_balance')} onValueChange={function(v){setLeave('sick','approval_mode',v);}}><SelectTrigger className="h-9"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="auto_if_balance">Auto-approve if balance</SelectItem><SelectItem value="manager_approval">Manager approval always</SelectItem></SelectContent></Select></div></div>)}
          {(lt.key==='maternity'||lt.key==='paternity')&&(<div className="mt-2 pt-2 border-t border-[#E8E2D9] space-y-2"><NumInput value={gl(lt.key,'eligibility_min_days',80)} onChange={function(v){setLeave(lt.key,'eligibility_min_days',v);}} label="Eligibility Min Days"/><SwitchField value={gl(lt.key,'documents_required',true)} onChange={function(v){setLeave(lt.key,'documents_required',v);}} label="Documents Required"/></div>)}
          {lt.key==='wfh'&&(<div className="mt-2 pt-2 border-t border-[#E8E2D9] space-y-2"><SwitchField value={gl('wfh','enabled',false)} onChange={function(v){setLeave('wfh','enabled',v);}} label="WFH Allowed"/>{gl('wfh','enabled')&&(<div><Label className="text-xs">Pay Type</Label><Select value={gl('wfh','pay_type','full')} onValueChange={function(v){setLeave('wfh','pay_type',v);}}><SelectTrigger className="h-9"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="full">Full Pay</SelectItem><SelectItem value="partial">Partial Pay</SelectItem></SelectContent></Select>{gl('wfh','pay_type')==='partial'&&<NumInput value={gl('wfh','pay_percentage',100)} onChange={function(v){setLeave('wfh','pay_percentage',v);}} label="Pay %"/>}</div>)}</div>)}
        </Section>
      );})}
      <Section title="General Rules" color="#2A2624">
        <SwitchField value={d.sandwich_rule||false} onChange={function(v){set('sandwich_rule',v);}} label="Sandwich Rule"/>
        <SwitchField value={d.negative_balance_allowed||false} onChange={function(v){set('negative_balance_allowed',v);}} label="Allow Negative Balance"/>
        {d.negative_balance_allowed&&<NumInput value={d.max_negative||0} onChange={function(v){set('max_negative',v);}} label="Max Negative"/>}
      </Section>
      <Section title="Holiday Calendar" color="#7D9D85">
        <div className="flex items-center justify-between mb-3"><p className="text-xs text-[#6A625E]">National, state, festival holidays</p><Button size="sm" variant="outline" onClick={addHoliday}><Plus size={14} className="mr-1"/> Add</Button></div>
        {(d.holidays||[]).map(function(h,i){return(<div key={i} className="grid grid-cols-4 gap-2 mb-2 items-end"><div><Label className="text-xs">Date</Label><Input type="date" value={h.date||''} onChange={function(e){updateHoliday(i,'date',e.target.value);}} className="h-9"/></div><div><Label className="text-xs">Name</Label><Input value={h.name||''} onChange={function(e){updateHoliday(i,'name',e.target.value);}} className="h-9"/></div><div><Label className="text-xs">Type</Label><Select value={h.type||'national'} onValueChange={function(v){updateHoliday(i,'type',v);}}><SelectTrigger className="h-9"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="national">National</SelectItem><SelectItem value="state">State</SelectItem><SelectItem value="festival">Festival</SelectItem><SelectItem value="company">Company</SelectItem></SelectContent></Select></div><button onClick={function(){removeHoliday(i);}} className="p-2 text-[#C65549]"><Trash size={14}/></button></div>);})}
      </Section>
    </div>
  );
}

// ═══════════ ATTENDANCE POLICY (ENHANCED) ═══════════
function AttendancePolicyForm({data,onChange,shifts}){
  var d=data;function set(k,v){onChange({...d,[k]:v});}
  function toggleWeekOff(day){var days=[...(d.week_off_days||[])];var idx=days.indexOf(day);if(idx>=0)days.splice(idx,1);else days.push(day);set('week_off_days',days);}
  function addShiftRule(){set('shift_rules',[...(d.shift_rules||[]),{shift_id:'',grace_period_minutes:15,half_day_after_hours:4,min_hours_full_day:8,auto_absent_if_no_clockin_by:'11:00',quarter_day_after_hours:6}]);}
  function updateShiftRule(i,k,v){var r=[...(d.shift_rules||[])];r[i]={...r[i],[k]:v};set('shift_rules',r);}
  function removeShiftRule(i){set('shift_rules',(d.shift_rules||[]).filter(function(_,idx){return idx!==i;}));}
  var isFixed=d.month_day_calc&&d.month_day_calc!=='actual';

  return(
    <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-2">
      <div><Label className="text-sm">Template Name *</Label><Input value={d.template_name||''} onChange={function(e){set('template_name',e.target.value);}} required/></div>

      <Section title="Pay Basis & Day Calculation" color="#D96C5B">
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Pay Basis</Label><Select value={d.pay_basis||'monthly'} onValueChange={function(v){set('pay_basis',v);}}><SelectTrigger className="h-9"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="daily">Daily</SelectItem><SelectItem value="monthly">Monthly</SelectItem></SelectContent></Select></div>
          <div><Label className="text-xs">Month Day Calculation</Label><Select value={d.month_day_calc||'actual'} onValueChange={function(v){set('month_day_calc',v);}}><SelectTrigger className="h-9"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="actual">Actual Days</SelectItem><SelectItem value="fixed_30">Fixed 30</SelectItem><SelectItem value="fixed_26">Fixed 26</SelectItem><SelectItem value="custom">Custom</SelectItem></SelectContent></Select></div>
        </div>
        {d.month_day_calc==='custom'&&<NumInput value={d.custom_days||30} onChange={function(v){set('custom_days',v);}} label="Custom Days"/>}
        {isFixed&&(
          <>
            <WarningBox text={"Fixed days selected: Months with more/fewer actual days (e.g. Jan=31, Feb=28) will create discrepancies in the muster roll. Choose how to handle excess/deficit days below."}/>
            <div className="mt-2"><Label className="text-xs">Fixed Day Discrepancy Handling</Label>
              <Select value={d.fixed_day_handling||'ignore_excess'} onValueChange={function(v){set('fixed_day_handling',v);}}>
                <SelectTrigger className="h-9"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ignore_excess">Ignore excess days (e.g. 31st not counted for 30-day policy)</SelectItem>
                  <SelectItem value="prorate_salary">Pro-rate salary for actual days worked</SelectItem>
                  <SelectItem value="cap_at_fixed">Cap attendance at fixed days, extra days as overtime</SelectItem>
                  <SelectItem value="use_actual_for_muster">Use actual days for muster, fixed for salary calc only</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-[#A28B7A] mt-1">This determines how attendance register handles months with different day counts</p>
            </div>
          </>
        )}
      </Section>

      <Section title="Salary Cycle" color="#7D9D85">
        <div className="grid grid-cols-2 gap-3">
          <NumInput value={d.salary_cycle_start||1} onChange={function(v){set('salary_cycle_start',v);}} label="Cycle Start Day" min={1}/>
          <NumInput value={d.salary_cycle_end||31} onChange={function(v){set('salary_cycle_end',v);}} label="Cycle End Day" min={1}/>
        </div>
        <p className="text-xs text-[#A28B7A] mt-1">E.g. Start=10, End=9 means 10th to 9th of next month</p>
      </Section>

      <Section title="Week Offs" color="#E8B25C">
        <div className="grid grid-cols-2 gap-3 mb-3"><NumInput value={d.week_offs_per_week||1} onChange={function(v){set('week_offs_per_week',v);}} label="Week Offs per Week"/><SwitchField value={d.week_offs_paid!==false} onChange={function(v){set('week_offs_paid',v);}} label="Week Offs Paid"/></div>
        <Label className="text-xs mb-2 block">Week Off Days</Label>
        <div className="flex flex-wrap gap-2">{DAYS_OF_WEEK.map(function(day){var sel=(d.week_off_days||[]).indexOf(day)>=0;return(<button key={day} type="button" onClick={function(){toggleWeekOff(day);}} className={'px-3 py-1.5 rounded-lg text-xs font-medium transition-all '+(sel?'bg-[#D96C5B] text-white':'bg-white border border-[#E8E2D9] text-[#6A625E] hover:border-[#D96C5B]')}>{day.substring(0,3)}</button>);})}</div>
      </Section>

      <Section title="Duty Hours & Late/Early Rules" color="#D96C5B">
        <NumInput value={d.duty_hours||8} onChange={function(v){set('duty_hours',v);}} label="Required Duty Hours per Day"/>
        <p className="text-xs text-[#A28B7A] mt-1">Employee must complete these hours. Leaving early = same consequences as late arrival.</p>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <SwitchField value={d.late_comer_rule||false} onChange={function(v){set('late_comer_rule',v);}} label="Late Comer Penalty"/>
          <SwitchField value={d.early_departure_penalty||false} onChange={function(v){set('early_departure_penalty',v);}} label="Early Departure Penalty"/>
        </div>
        {(d.late_comer_rule||d.early_departure_penalty)&&(
          <div className="mt-2 space-y-2">
            <div><Label className="text-xs">Penalty Type</Label>
              <Select value={d.lateearly_penalty_type||'warning'} onValueChange={function(v){set('lateearly_penalty_type',v);}}>
                <SelectTrigger className="h-9"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="warning">Warning Only (no salary cut)</SelectItem>
                  <SelectItem value="half_day_cut">Half Day Salary Cut</SelectItem>
                  <SelectItem value="quarter_day_cut">Quarter Day Salary Cut</SelectItem>
                  <SelectItem value="proportional">Proportional Deduction (per minute)</SelectItem>
                  <SelectItem value="accumulated">Accumulated Late Marks to Half Day</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {d.lateearly_penalty_type==='accumulated'&&(
              <div className="grid grid-cols-2 gap-3">
                <NumInput value={d.late_marks_for_half_day||3} onChange={function(v){set('late_marks_for_half_day',v);}} label="Late Marks = 1 Half Day"/>
                <FreqSelect value={d.late_mark_reset_freq||'per_month'} onChange={function(v){set('late_mark_reset_freq',v);}} label="Reset Frequency"/>
              </div>
            )}
            <NumInput value={d.grace_buffer_minutes||0} onChange={function(v){set('grace_buffer_minutes',v);}} label="Grace Buffer Before Penalty (minutes)"/>
          </div>
        )}
      </Section>

      <Section title="Double Login & Auto Logout" color="#A28B7A">
        <SwitchField value={d.double_login_allowed||false} onChange={function(v){set('double_login_allowed',v);}} label="Allow Double Login/Logout (Mistaken Re-login)"/>
        {!d.double_login_allowed&&<p className="text-xs text-[#A28B7A] mt-1">If disabled, mistaken logout then re-login requires manager/team lead approval per hierarchy.</p>}
        {d.double_login_allowed&&<p className="text-xs text-[#7D9D85] mt-1">Multiple login/logout pairs allowed freely without approval.</p>}
        <SwitchField value={d.require_approval_for_relogin||true} onChange={function(v){set('require_approval_for_relogin',v);}} label="Require Manager Approval for Re-login After Mistaken Logout"/>

        <div className="mt-3 pt-3 border-t border-[#E8E2D9]">
          <SwitchField value={d.auto_logout_enabled||false} onChange={function(v){set('auto_logout_enabled',v);}} label="Auto Logout If Not Logged Out In Time"/>
          {d.auto_logout_enabled&&(
            <div className="space-y-2 mt-2">
              <NumInput value={d.auto_logout_buffer_minutes||30} onChange={function(v){set('auto_logout_buffer_minutes',v);}} label="Buffer Time After Shift End (minutes)"/>
              <SwitchField value={d.auto_logout_alert_manager||true} onChange={function(v){set('auto_logout_alert_manager',v);}} label="Send Alert to Manager/Team Lead on Auto Logout"/>
              <SwitchField value={d.auto_logout_alert_employee||true} onChange={function(v){set('auto_logout_alert_employee',v);}} label="Send Alert to Employee on Auto Logout"/>
            </div>
          )}
        </div>
      </Section>

      <Section title="Shift-Specific Rules" color="#4A5D4E">
        <div className="flex items-center justify-between mb-3"><p className="text-xs text-[#6A625E]">Per-shift grace period, half/quarter day, min hours</p><Button size="sm" variant="outline" onClick={addShiftRule}><Plus size={14} className="mr-1"/> Add</Button></div>
        {(d.shift_rules||[]).map(function(rule,i){return(
          <div key={i} className="border border-[#E8E2D9] rounded-lg p-3 mb-2">
            <div className="flex items-center justify-between mb-2"><div className="flex-1 mr-2"><Label className="text-xs">Shift</Label><Select value={rule.shift_id||''} onValueChange={function(v){updateShiftRule(i,'shift_id',v);}}><SelectTrigger className="h-9"><SelectValue placeholder="Select shift"/></SelectTrigger><SelectContent>{shifts.map(function(s){return <SelectItem key={s.id} value={s.id}>{s.name} ({s.start_time}-{s.end_time})</SelectItem>;})}</SelectContent></Select></div><button onClick={function(){removeShiftRule(i);}} className="p-1 text-[#C65549]"><Trash size={14}/></button></div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <NumInput value={rule.grace_period_minutes} onChange={function(v){updateShiftRule(i,'grace_period_minutes',v);}} label="Grace (min)"/>
              <NumInput value={rule.half_day_after_hours} onChange={function(v){updateShiftRule(i,'half_day_after_hours',v);}} label="Half Day After (hrs)"/>
              <NumInput value={rule.quarter_day_after_hours||6} onChange={function(v){updateShiftRule(i,'quarter_day_after_hours',v);}} label="Quarter Day After (hrs)"/>
              <NumInput value={rule.min_hours_full_day} onChange={function(v){updateShiftRule(i,'min_hours_full_day',v);}} label="Min Hrs Full Day"/>
              <div><Label className="text-xs">Auto Absent By</Label><Input type="time" value={rule.auto_absent_if_no_clockin_by||'11:00'} onChange={function(e){updateShiftRule(i,'auto_absent_if_no_clockin_by',e.target.value);}} className="h-9"/></div>
            </div>
          </div>
        );})}
      </Section>

      <Section title="Comp-Off & Biometric" color="#7D9D85">
        <SwitchField value={d.compoff_for_holiday_work||false} onChange={function(v){set('compoff_for_holiday_work',v);}} label="Comp-off for Holiday/Week-off Work"/>
        {d.compoff_for_holiday_work&&<NumInput value={d.compoff_validity_days||30} onChange={function(v){set('compoff_validity_days',v);}} label="Comp-off Validity (days)"/>}
        <SwitchField value={d.biometric_mandatory||false} onChange={function(v){set('biometric_mandatory',v);}} label="Biometric/Device Clock-in Mandatory"/>
      </Section>
    </div>
  );
}

// ═══════════ OVERTIME POLICY ═══════════
function OvertimePolicyForm({data,onChange}){
  var d=data;function set(k,v){onChange({...d,[k]:v});}
  return(
    <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-2">
      <div><Label className="text-sm">Template Name *</Label><Input value={d.template_name||''} onChange={function(e){set('template_name',e.target.value);}} required/></div>
      <Section title="Overtime Configuration" color="#D96C5B">
        <SwitchField value={d.overtime_allowed||false} onChange={function(v){set('overtime_allowed',v);}} label="Overtime Allowed"/>
        {d.overtime_allowed&&(<div className="space-y-3 mt-2">
          <div><Label className="text-xs">OT Rate Type</Label><Select value={d.ot_rate_type||'fixed'} onValueChange={function(v){set('ot_rate_type',v);}}><SelectTrigger className="h-9"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="fixed">Fixed Rate Per Hour</SelectItem><SelectItem value="calculative">Calculative (Factor-based)</SelectItem></SelectContent></Select></div>
          {d.ot_rate_type==='fixed'&&<NumInput value={d.ot_fixed_rate||0} onChange={function(v){set('ot_fixed_rate',v);}} label="Fixed Rate Per OT Hour (INR)"/>}
          {d.ot_rate_type==='calculative'&&(
            <div className="space-y-2">
              <div><Label className="text-xs">OT Factor</Label><Select value={d.ot_factor||'single'} onValueChange={function(v){set('ot_factor',v);}}><SelectTrigger className="h-9"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="single">Single Rate (1x)</SelectItem><SelectItem value="one_half">1.5x Rate</SelectItem><SelectItem value="double">Double Rate (2x)</SelectItem><SelectItem value="triple">Triple Rate (3x)</SelectItem><SelectItem value="custom">Custom Factor</SelectItem></SelectContent></Select></div>
              {d.ot_factor==='custom'&&<NumInput value={d.ot_custom_factor||1} onChange={function(v){set('ot_custom_factor',v);}} label="Custom Factor (e.g. 1.5, 2.5)"/>}
              <div><Label className="text-xs">Per-Hour Calculation Basis</Label><Select value={d.ot_calc_basis||'actual_days'} onValueChange={function(v){set('ot_calc_basis',v);}}><SelectTrigger className="h-9"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="actual_days">Actual Days in Month (Jan=31, Feb=28...)</SelectItem><SelectItem value="fixed_30">Fixed 30 Days</SelectItem><SelectItem value="fixed_26">Fixed 26 Days</SelectItem></SelectContent></Select><p className="text-xs text-[#A28B7A] mt-1">Salary/Days/Hours = Per hour rate. This changes monthly if actual days selected.</p></div>
              <NumInput value={d.ot_hours_per_day||8} onChange={function(v){set('ot_hours_per_day',v);}} label="Working Hours per Day (for rate calc)"/>
            </div>
          )}
        </div>)}
      </Section>
      {d.overtime_allowed&&(
        <>
          <Section title="OT Caps & Limits" color="#E8B25C">
            <div className="grid grid-cols-2 gap-3">
              <NumInput value={d.ot_cap_per_day||0} onChange={function(v){set('ot_cap_per_day',v);}} label="Max OT Hours Per Day (0=unlimited)"/>
              <NumInput value={d.ot_cap_per_week||0} onChange={function(v){set('ot_cap_per_week',v);}} label="Max OT Hours Per Week"/>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <NumInput value={d.ot_cap_per_month||0} onChange={function(v){set('ot_cap_per_month',v);}} label="Max OT Hours Per Month"/>
              <NumInput value={d.ot_cap_per_quarter||0} onChange={function(v){set('ot_cap_per_quarter',v);}} label="Max OT Hours Per Quarter"/>
            </div>
          </Section>
          <Section title="OT Approvals & Alerts" color="#7D9D85">
            <SwitchField value={d.ot_requires_approval||true} onChange={function(v){set('ot_requires_approval',v);}} label="OT Payment Requires Manager Approval"/>
            <SwitchField value={d.ot_pre_approval_required||false} onChange={function(v){set('ot_pre_approval_required',v);}} label="Pre-approval Required Before Working OT"/>
            <SwitchField value={d.ot_limit_alert||true} onChange={function(v){set('ot_limit_alert',v);}} label="Alert Manager When OT Limit Crossed"/>
            <SwitchField value={d.ot_holiday_different_rate||false} onChange={function(v){set('ot_holiday_different_rate',v);}} label="Different OT Rate for Holidays/Week-offs"/>
            {d.ot_holiday_different_rate&&<div><Label className="text-xs">Holiday OT Factor</Label><Select value={d.ot_holiday_factor||'double'} onValueChange={function(v){set('ot_holiday_factor',v);}}><SelectTrigger className="h-9"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="single">1x</SelectItem><SelectItem value="one_half">1.5x</SelectItem><SelectItem value="double">2x</SelectItem><SelectItem value="triple">3x</SelectItem></SelectContent></Select></div>}
          </Section>
        </>
      )}
    </div>
  );
}

// ═══════════ REIMBURSEMENT POLICY ═══════════
function ReimbursementPolicyForm({data,onChange}){
  var d=data;function set(k,v){onChange({...d,[k]:v});}
  return(
    <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-2">
      <div><Label className="text-sm">Template Name *</Label><Input value={d.template_name||''} onChange={function(e){set('template_name',e.target.value);}} required/></div>
      <Section title="Claim Rules" color="#D96C5B">
        <SwitchField value={d.claims_allowed!==false} onChange={function(v){set('claims_allowed',v);}} label="Allow Employees to Raise Claims"/>
        {d.claims_allowed!==false&&(<div className="space-y-2 mt-2">
          <div className="grid grid-cols-2 gap-3"><NumInput value={d.max_claim_amount||0} onChange={function(v){set('max_claim_amount',v);}} label="Max Claim Amount (INR, 0=unlimited)"/><NumInput value={d.min_claim_amount||0} onChange={function(v){set('min_claim_amount',v);}} label="Min Claim Amount (INR)"/></div>
          <FreqSelect value={d.claim_frequency||'per_month'} onChange={function(v){set('claim_frequency',v);}} label="Claim Frequency Limit"/>
          <NumInput value={d.max_claims_per_frequency||0} onChange={function(v){set('max_claims_per_frequency',v);}} label="Max Claims per Frequency (0=unlimited)"/>
          <SwitchField value={d.documents_mandatory||true} onChange={function(v){set('documents_mandatory',v);}} label="Bill/Supporting Documents Mandatory"/>
        </div>)}
      </Section>
      {d.claims_allowed!==false&&(
        <Section title="Approval Rules" color="#7D9D85">
          <div><Label className="text-xs">Approval Mode</Label><Select value={d.approval_mode||'manager'} onValueChange={function(v){set('approval_mode',v);}}><SelectTrigger className="h-9"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="direct">Direct Approval (Auto)</SelectItem><SelectItem value="manager">Manager/Team Lead Verification</SelectItem><SelectItem value="hybrid">Hybrid (Auto below threshold, Manager above)</SelectItem></SelectContent></Select></div>
          {d.approval_mode==='direct'&&<NumInput value={d.direct_max_amount||5000} onChange={function(v){set('direct_max_amount',v);}} label="Max Amount for Direct Approval (INR)"/>}
          {d.approval_mode==='hybrid'&&(<div className="space-y-2 mt-2">
            <NumInput value={d.auto_approve_threshold||5000} onChange={function(v){set('auto_approve_threshold',v);}} label="Auto-Approve Up To (INR)"/>
            <FreqSelect value={d.auto_approve_frequency||'per_month'} onChange={function(v){set('auto_approve_frequency',v);}} label="Auto-Approve Frequency Limit"/>
            <NumInput value={d.auto_approve_max_per_freq||0} onChange={function(v){set('auto_approve_max_per_freq',v);}} label="Max Auto-Approvals per Frequency"/>
          </div>)}
          <SwitchField value={d.multi_level_approval||false} onChange={function(v){set('multi_level_approval',v);}} label="Multi-level Approval (follows hierarchy chain)"/>
        </Section>
      )}
    </div>
  );
}

// ═══════════ GENERIC POLICY (Bonus/Gratuity/Incentive/Advance/Loan) ═══════════
function GenericPolicyForm({data,onChange,type}){
  var d=data;function set(k,v){onChange({...d,[k]:v});}
  var configs={
    bonus:{title:'Bonus Policy',fields:[
      {type:'switch',key:'bonus_applicable',label:'Bonus Applicable'},
      {type:'select',key:'bonus_type',label:'Bonus Type',options:['statutory','performance','festival','annual','custom']},
      {type:'num',key:'bonus_percentage',label:'Bonus % of Basic/Gross'},
      {type:'select',key:'bonus_basis',label:'Calculation Basis',options:['basic_salary','gross_salary','ctc']},
      {type:'num',key:'min_days_eligibility',label:'Min Days Worked for Eligibility'},
      {type:'select',key:'payment_frequency',label:'Payment Frequency',freq:true},
      {type:'num',key:'statutory_min',label:'Statutory Minimum (INR)',default:8400},
      {type:'num',key:'statutory_max',label:'Statutory Maximum (INR)',default:21000},
      {type:'switch',key:'prorata_for_new_joiners',label:'Pro-rata for New Joiners'},
    ]},
    gratuity:{title:'Gratuity Policy',fields:[
      {type:'switch',key:'gratuity_applicable',label:'Gratuity Applicable'},
      {type:'num',key:'min_years_service',label:'Min Years of Service',default:5},
      {type:'num',key:'gratuity_factor',label:'Gratuity Factor (days per year)',default:15},
      {type:'select',key:'salary_basis',label:'Salary Basis',options:['basic_salary','basic_plus_da']},
      {type:'num',key:'max_gratuity_amount',label:'Max Gratuity Amount (INR)',default:2000000},
      {type:'switch',key:'auto_calculate_on_exit',label:'Auto-calculate on Employee Exit'},
      {type:'switch',key:'include_notice_period',label:'Include Notice Period in Service'},
    ]},
    incentive:{title:'Incentive / Commission Policy',fields:[
      {type:'switch',key:'incentive_applicable',label:'Incentive/Commission Applicable'},
      {type:'select',key:'incentive_type',label:'Type',options:['fixed','percentage','slab_based','target_based']},
      {type:'num',key:'fixed_amount',label:'Fixed Amount (INR)'},
      {type:'num',key:'percentage_rate',label:'Percentage Rate (%)'},
      {type:'select',key:'percentage_basis',label:'% of',options:['revenue','profit','sales','collections']},
      {type:'select',key:'payment_freq',label:'Payment Frequency',freq:true},
      {type:'switch',key:'requires_approval',label:'Requires Manager Approval'},
      {type:'num',key:'min_target_achievement',label:'Min Target Achievement (%)'},
      {type:'switch',key:'prorata_allowed',label:'Pro-rata for Partial Achievement'},
    ]},
    advance:{title:'Salary Advance Policy',fields:[
      {type:'switch',key:'advance_allowed',label:'Salary Advance Allowed'},
      {type:'num',key:'max_advance_percentage',label:'Max Advance (% of Monthly Salary)'},
      {type:'num',key:'max_advance_amount',label:'Max Advance Amount (INR)'},
      {type:'select',key:'advance_frequency',label:'Advance Frequency',freq:true},
      {type:'num',key:'max_repayment_months',label:'Max Repayment Months'},
      {type:'switch',key:'interest_applicable',label:'Interest Applicable'},
      {type:'num',key:'interest_rate',label:'Interest Rate (% p.a.)'},
      {type:'switch',key:'requires_approval',label:'Requires Approval'},
      {type:'num',key:'min_service_months',label:'Min Service Months for Eligibility'},
    ]},
    loan:{title:'Employee Loan Policy',fields:[
      {type:'switch',key:'loan_allowed',label:'Employee Loan Allowed'},
      {type:'num',key:'max_loan_amount',label:'Max Loan Amount (INR)'},
      {type:'num',key:'max_loan_multiple',label:'Max Loan (x Monthly Salary)'},
      {type:'num',key:'max_repayment_months',label:'Max Repayment Months'},
      {type:'switch',key:'interest_applicable',label:'Interest Applicable'},
      {type:'num',key:'interest_rate',label:'Interest Rate (% p.a.)'},
      {type:'select',key:'interest_type',label:'Interest Type',options:['simple','reducing_balance']},
      {type:'select',key:'deduction_method',label:'EMI Deduction',options:['auto_from_salary','manual_payment']},
      {type:'switch',key:'requires_approval',label:'Requires Admin Approval'},
      {type:'num',key:'min_service_months',label:'Min Service Months'},
      {type:'switch',key:'multiple_loans_allowed',label:'Multiple Active Loans Allowed'},
      {type:'num',key:'max_emi_percentage',label:'Max EMI as % of Salary'},
    ]},
  };
  var cfg=configs[type]||{title:'Policy',fields:[]};
  return(
    <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-2">
      <div><Label className="text-sm">Template Name *</Label><Input value={d.template_name||''} onChange={function(e){set('template_name',e.target.value);}} required/></div>
      <Section title={cfg.title} color="#D96C5B">
        {cfg.fields.map(function(f){
          if(f.type==='switch') return <SwitchField key={f.key} value={d[f.key]??false} onChange={function(v){set(f.key,v);}} label={f.label}/>;
          if(f.type==='num') return <NumInput key={f.key} value={d[f.key]??(f.default||0)} onChange={function(v){set(f.key,v);}} label={f.label}/>;
          if(f.type==='select'&&f.freq) return <FreqSelect key={f.key} value={d[f.key]||'per_year'} onChange={function(v){set(f.key,v);}} label={f.label}/>;
          if(f.type==='select') return(<div key={f.key}><Label className="text-xs">{f.label}</Label><Select value={d[f.key]||''} onValueChange={function(v){set(f.key,v);}}><SelectTrigger className="h-9"><SelectValue placeholder="Select"/></SelectTrigger><SelectContent>{(f.options||[]).map(function(o){return <SelectItem key={o} value={o}>{o.replace(/_/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();})}</SelectItem>;})}</SelectContent></Select></div>);
          return null;
        })}
      </Section>
    </div>
  );
}

// ═══════════ MAIN PAGE ═══════════
export default function PolicyPage(){
  var [activeTab,setActiveTab]=useState('leave');
  var [templates,setTemplates]=useState({});
  var [formData,setFormData]=useState({});
  var [createDialog,setCreateDialog]=useState(false);
  var [assignDialog,setAssignDialog]=useState(false);
  var [editingId,setEditingId]=useState(null);
  var [employees,setEmployees]=useState([]);
  var [locations,setLocations]=useState([]);
  var [departments,setDepartments]=useState([]);
  var [shifts,setShifts]=useState([]);
  var [assignForm,setAssignForm]=useState({assign_by:'location',target_id:'',templates:{}});
  var [loading,setLoading]=useState(true);

  useEffect(function(){fetchAll();},[]);
  useEffect(function(){fetchTemplates(activeTab);},[activeTab]);

  async function fetchAll(){
    try{
      var r=await Promise.all([employeeAPI.getAll(),locationAPI.getAll(),departmentAPI.getAll(),shiftAPI.getAll()]);
      setEmployees(r[0].data);setLocations(r[1].data);setDepartments(r[2].data);setShifts(r[3].data||[]);
      var types=POLICY_TYPES.map(function(t){return t.key;});
      var tr=await Promise.all(types.map(function(t){return policyTemplateAPI.getAll(t).catch(function(){return{data:[]};});}));
      var nt={};types.forEach(function(t,i){nt[t]=tr[i].data||[];});setTemplates(nt);
    }catch(e){}setLoading(false);
  }
  async function fetchTemplates(t){try{var r=await policyTemplateAPI.getAll(t);setTemplates(function(p){return{...p,[t]:r.data};});}catch(e){}}
  function openCreate(){setFormData({});setEditingId(null);setCreateDialog(true);}
  function openEdit(t){setFormData({...t});setEditingId(t.id);setCreateDialog(true);}
  async function saveTemplate(e){e.preventDefault();try{if(editingId){await policyTemplateAPI.update(activeTab,editingId,formData);toast.success('Updated');}else{await policyTemplateAPI.create(activeTab,formData);toast.success('Created');}setCreateDialog(false);fetchTemplates(activeTab);}catch(e){toast.error('Failed');}}
  async function deleteTemplate(id){try{await policyTemplateAPI.delete(activeTab,id);toast.success('Deleted');fetchTemplates(activeTab);}catch(e){toast.error('Failed');}}
  async function handleBulkAssign(){try{await policyAssignmentAPI.bulkAssign(assignForm);toast.success('Assigned');setAssignDialog(false);}catch(e){toast.error('Failed');}}

  var cur=templates[activeTab]||[];

  function renderForm(){
    if(activeTab==='leave') return <LeavePolicyForm data={formData} onChange={setFormData}/>;
    if(activeTab==='attendance') return <AttendancePolicyForm data={formData} onChange={setFormData} shifts={shifts}/>;
    if(activeTab==='overtime') return <OvertimePolicyForm data={formData} onChange={setFormData}/>;
    if(activeTab==='reimbursement') return <ReimbursementPolicyForm data={formData} onChange={setFormData}/>;
    return <GenericPolicyForm data={formData} onChange={setFormData} type={activeTab}/>;
  }

  function summary(t){
    if(activeTab==='leave'){var l=t.leaves||{};return['CL:'+(l.casual?.allowed||0),'SL:'+(l.sick?.allowed||0),'EL:'+(l.earned?.allowed||0),l.wfh?.enabled?'WFH':'','Hol:'+(t.holidays||[]).length].filter(Boolean).join(' | ');}
    if(activeTab==='attendance') return['Pay:'+(t.pay_basis||'monthly'),'Days:'+(t.month_day_calc||'actual'),'Cycle:'+(t.salary_cycle_start||1)+'-'+(t.salary_cycle_end||31),'WO:'+(t.week_off_days||[]).map(function(d){return d.substring(0,3);}).join(',')].join(' | ');
    if(activeTab==='overtime') return(t.overtime_allowed?'OT: '+(t.ot_rate_type||'fixed')+' | Factor:'+(t.ot_factor||'single')+' | Cap:'+(t.ot_cap_per_month||'none')+'/mo':'OT: Not Allowed');
    if(activeTab==='reimbursement') return(t.claims_allowed!==false?'Claims: '+(t.approval_mode||'manager')+' | Max:'+(t.max_claim_amount||'unlimited')+' | Docs:'+(t.documents_mandatory?'Yes':'No'):'Claims Not Allowed');
    return t.template_name||'';
  }

  return(
    <div className="space-y-6" data-testid="policy-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div><h1 className="text-3xl font-semibold text-[#2A2624]" style={{fontFamily:'Outfit'}}>Policy Management</h1><p className="text-[#6A625E]" style={{fontFamily:'Manrope'}}>Configure all HR policies</p></div>
        <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
          <DialogTrigger asChild><Button variant="outline" className="rounded-xl" data-testid="policy-bulk-assign"><Users size={18} className="mr-2"/> Bulk Assign</Button></DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Bulk Assign Policies</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Assign By</Label><Select value={assignForm.assign_by} onValueChange={function(v){setAssignForm({...assignForm,assign_by:v});}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="location">Location</SelectItem><SelectItem value="department">Department</SelectItem></SelectContent></Select></div>
              {assignForm.assign_by==='location'&&<div><Label>Location</Label><Select value={assignForm.target_id} onValueChange={function(v){setAssignForm({...assignForm,target_id:v});}}><SelectTrigger><SelectValue placeholder="Select"/></SelectTrigger><SelectContent>{locations.map(function(l){return <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>;})}</SelectContent></Select></div>}
              {assignForm.assign_by==='department'&&<div><Label>Department</Label><Select value={assignForm.target_id} onValueChange={function(v){setAssignForm({...assignForm,target_id:v});}}><SelectTrigger><SelectValue placeholder="Select"/></SelectTrigger><SelectContent>{departments.map(function(d){return <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>;})}</SelectContent></Select></div>}
              {POLICY_TYPES.map(function(pt){var tl=templates[pt.key]||[];return(<div key={pt.key}><Label>{pt.label}</Label><Select value={assignForm.templates[pt.key+'_template_id']||''} onValueChange={function(v){setAssignForm({...assignForm,templates:{...assignForm.templates,[pt.key+'_template_id']:v}});}}><SelectTrigger><SelectValue placeholder={'Select '+pt.label}/></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{tl.map(function(t){return <SelectItem key={t.id} value={t.id}>{t.template_name}</SelectItem>;})}</SelectContent></Select></div>);})}
              <Button onClick={handleBulkAssign} className="w-full bg-[#D96C5B] hover:bg-[#C25949]">Assign Policies</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-white border border-[#E8E2D9] rounded-xl p-1 w-full grid" style={{gridTemplateColumns:'repeat('+POLICY_TYPES.length+',1fr)'}}>
          {POLICY_TYPES.map(function(pt){return <TabsTrigger key={pt.key} value={pt.key} data-testid={'policy-tab-'+pt.key} className="rounded-lg text-xs data-[state=active]:bg-[#D96C5B] data-[state=active]:text-white">{pt.label}</TabsTrigger>;})}
        </TabsList>
        {POLICY_TYPES.map(function(pt){return(
          <TabsContent key={pt.key} value={pt.key} className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[#2A2624]">{pt.label} Templates</h3>
              <Button onClick={openCreate} className="bg-[#D96C5B] hover:bg-[#C25949] rounded-xl" data-testid={'create-'+pt.key+'-policy'}><Plus size={18} className="mr-2"/> Create</Button>
            </div>
            {cur.length===0?(<div className="bg-white border border-[#E8E2D9] rounded-2xl p-12 text-center"><Scroll size={64} className="mx-auto mb-4 text-[#A28B7A] opacity-50"/><h3 className="text-xl font-semibold text-[#2A2624] mb-2">No Templates</h3><p className="text-[#6A625E]">Create a template to get started</p></div>):(
              <div className="space-y-3">{cur.map(function(t){return(<div key={t.id} className="bg-white border border-[#E8E2D9] rounded-xl p-4 hover:border-[#D96C5B] transition-colors"><div className="flex items-center justify-between"><div className="flex-1"><h4 className="font-semibold text-[#2A2624]">{t.template_name}</h4><p className="text-xs text-[#6A625E] mt-1">{summary(t)}</p></div><div className="flex space-x-2 flex-shrink-0"><button onClick={function(){openEdit(t);}} className="p-2 hover:bg-[#D96C5B]/10 rounded-lg"><PencilSimple size={16} className="text-[#D96C5B]"/></button><button onClick={function(){deleteTemplate(t.id);}} className="p-2 hover:bg-[#C65549]/10 rounded-lg"><Trash size={16} className="text-[#C65549]"/></button></div></div></div>);})}</div>
            )}
          </TabsContent>
        );})}
      </Tabs>

      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden">
          <DialogHeader><DialogTitle>{editingId?'Edit':'Create'} {POLICY_TYPES.find(function(t){return t.key===activeTab;})?.label} Policy</DialogTitle></DialogHeader>
          <form onSubmit={saveTemplate}>{renderForm()}<Button type="submit" className="w-full bg-[#D96C5B] hover:bg-[#C25949] mt-4">{editingId?'Update':'Create'}</Button></form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
