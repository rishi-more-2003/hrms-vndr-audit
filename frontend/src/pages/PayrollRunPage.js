import React, { useEffect, useState } from 'react';
import { payrollRunAPI, payslipAPI, employeeAPI } from '../services/api';
import { CurrencyDollar, Plus, Trash, PencilSimple, Download, Lock, CheckCircle, CaretRight, CaretDown } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var YEARS = [2024, 2025, 2026, 2027];
var fmt = function(n) { return '\u20B9' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); };

export default function PayrollRunPage() {
  var [runs, setRuns] = useState([]);
  var [selected, setSelected] = useState(null);
  var [expanded, setExpanded] = useState({});
  var [loading, setLoading] = useState(true);
  var [createDialog, setCreateDialog] = useState(false);
  var now = new Date();
  var [form, setForm] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });

  useEffect(function() { fetchRuns(); }, []);
  async function fetchRuns() {
    try { var r = await payrollRunAPI.getAll(); setRuns(r.data || []); } catch (e) { /* ok */ }
    setLoading(false);
  }

  async function createRun() {
    try {
      await payrollRunAPI.create({ month: form.month, year: form.year });
      toast.success('Payroll run created');
      setCreateDialog(false);
      fetchRuns();
    } catch (e) { toast.error('Failed to create run'); }
  }

  async function openRun(runId) {
    try { var r = await payrollRunAPI.getById(runId); setSelected(r.data); } catch (e) { toast.error('Failed'); }
  }

  async function freeze(runId) {
    try { await payrollRunAPI.freeze(runId); toast.success('Frozen'); fetchRuns(); if (selected && selected.id === runId) openRun(runId); } catch (e) { toast.error('Failed'); }
  }
  async function markPaid(runId) {
    try { await payrollRunAPI.markPaid(runId); toast.success('Marked paid'); fetchRuns(); if (selected && selected.id === runId) openRun(runId); } catch (e) { toast.error('Failed'); }
  }
  async function deleteRun(runId) {
    if (!window.confirm('Delete this draft payroll run?')) return;
    try { await payrollRunAPI.delete(runId); toast.success('Deleted'); setSelected(null); fetchRuns(); } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  }

  async function downloadPayslip(empId, month, year, empName) {
    try {
      var r = await payslipAPI.generate({ employee_id: empId, month: month, year: year });
      var blob = new Blob([r.data], { type: 'application/pdf' });
      var url = window.URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'payslip_' + (empName || empId) + '_' + year + '_' + String(month).padStart(2, '0') + '.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) { toast.error('Payslip generation failed'); }
  }

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>;

  var statusColor = { draft: '#E8B25C', frozen: '#7D9D85', paid: '#4A5D4E' };

  return (
    <div className="space-y-6" data-testid="payroll-run-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Payroll Runs</h1>
          <p className="text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>Monthly salary processing, payslips & compliance</p>
        </div>
        <Dialog open={createDialog} onOpenChange={setCreateDialog}>
          <DialogTrigger asChild><Button className="bg-[#D96C5B] hover:bg-[#C25949] rounded-xl" data-testid="create-payroll-run"><Plus size={18} className="mr-2" /> New Run</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Create Monthly Payroll Run</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Month</Label><Select value={String(form.month)} onValueChange={function(v) { setForm({...form, month: parseInt(v)}); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MONTHS.map(function(m, i) { return <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>; })}</SelectContent></Select></div>
                <div><Label className="text-xs">Year</Label><Select value={String(form.year)} onValueChange={function(v) { setForm({...form, year: parseInt(v)}); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{YEARS.map(function(y) { return <SelectItem key={y} value={String(y)}>{y}</SelectItem>; })}</SelectContent></Select></div>
              </div>
              <p className="text-xs text-[#A28B7A]">This will process all active employees with an assigned salary template. Employees without a template will be listed as skipped.</p>
              <Button onClick={createRun} className="w-full bg-[#D96C5B] hover:bg-[#C25949]" data-testid="confirm-create-run">Create Run</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {runs.length === 0 ? (
        <div className="bg-white border border-[#E8E2D9] rounded-2xl p-12 text-center"><CurrencyDollar size={64} className="mx-auto mb-4 text-[#A28B7A] opacity-50" /><h3 className="text-xl font-semibold text-[#2A2624] mb-2">No Payroll Runs</h3><p className="text-[#6A625E]">Create your first monthly run to process salaries</p></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 space-y-2">
            {runs.map(function(r) { return (
              <div key={r.id} onClick={function() { openRun(r.id); }} className={'bg-white border rounded-xl p-3 cursor-pointer transition-all ' + (selected && selected.id === r.id ? 'border-[#D96C5B] shadow-md' : 'border-[#E8E2D9] hover:border-[#D96C5B]/50')} data-testid={'run-' + r.id}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[#2A2624]">{MONTHS[r.month - 1]} {r.year}</p>
                    <p className="text-[10px] text-[#A28B7A]">{r.employee_count} employees • {fmt(r.totals?.net)} net</p>
                  </div>
                  <span className="text-[10px] uppercase font-bold px-2 py-1 rounded" style={{ backgroundColor: statusColor[r.status] + '20', color: statusColor[r.status] }}>{r.status}</span>
                </div>
              </div>
            ); })}
          </div>

          <div className="lg:col-span-2">
            {!selected ? (
              <div className="bg-white border border-[#E8E2D9] rounded-2xl p-12 text-center text-[#A28B7A]">Select a run to view details</div>
            ) : (
              <div className="bg-white border border-[#E8E2D9] rounded-2xl">
                <div className="p-4 border-b border-[#E8E2D9] flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-[#2A2624]">{MONTHS[selected.month - 1]} {selected.year}</h3>
                    <p className="text-xs text-[#6A625E]">Created {new Date(selected.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-2">
                    {selected.status === 'draft' && <Button size="sm" variant="outline" onClick={function() { freeze(selected.id); }} data-testid="freeze-run"><Lock size={14} className="mr-1" /> Freeze</Button>}
                    {selected.status === 'frozen' && <Button size="sm" variant="outline" onClick={function() { markPaid(selected.id); }} data-testid="mark-paid-run"><CheckCircle size={14} className="mr-1" /> Mark Paid</Button>}
                    {selected.status === 'draft' && <Button size="sm" variant="outline" onClick={function() { deleteRun(selected.id); }}><Trash size={14} className="mr-1 text-[#C65549]" /></Button>}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 p-4 border-b border-[#E8E2D9]">
                  <div className="bg-[#7D9D85]/10 rounded-xl p-3 text-center"><p className="text-[10px] text-[#6A625E] uppercase">Total Gross</p><p className="text-sm font-bold text-[#7D9D85]">{fmt(selected.totals?.gross)}</p></div>
                  <div className="bg-[#D96C5B]/10 rounded-xl p-3 text-center"><p className="text-[10px] text-[#6A625E] uppercase">Deductions</p><p className="text-sm font-bold text-[#D96C5B]">{fmt(selected.totals?.deductions)}</p></div>
                  <div className="bg-[#2A2624]/5 rounded-xl p-3 text-center"><p className="text-[10px] text-[#6A625E] uppercase">Net Payable</p><p className="text-sm font-bold text-[#2A2624]">{fmt(selected.totals?.net)}</p></div>
                  <div className="bg-[#E8B25C]/10 rounded-xl p-3 text-center"><p className="text-[10px] text-[#6A625E] uppercase">Total CTC</p><p className="text-sm font-bold text-[#E8B25C]">{fmt(selected.totals?.ctc)}</p></div>
                </div>

                <div className="max-h-[50vh] overflow-y-auto">
                  {(selected.line_items || []).map(function(li) {
                    var isOpen = !!expanded[li.employee_id];
                    return (
                      <div key={li.employee_id} className="border-b border-[#E8E2D9]/60">
                        <div className="flex items-center justify-between px-4 py-3 hover:bg-[#FDFBF9]">
                          <div className="flex items-center gap-2 flex-1 cursor-pointer" onClick={function() { setExpanded({...expanded, [li.employee_id]: !isOpen}); }}>
                            {isOpen ? <CaretDown size={14} /> : <CaretRight size={14} />}
                            <div>
                              <p className="text-sm font-medium text-[#2A2624]">{li.full_name || li.employee_code}</p>
                              <p className="text-[10px] text-[#A28B7A]">{li.template_name}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-xs text-[#6A625E]">Net</p>
                              <p className="text-sm font-bold text-[#2A2624]">{fmt(li.net_monthly)}</p>
                            </div>
                            <Button size="sm" variant="outline" className="text-xs" onClick={function() { downloadPayslip(li.employee_id, selected.month, selected.year, li.full_name); }} data-testid={'payslip-' + li.employee_id}><Download size={12} className="mr-1" /> Payslip</Button>
                          </div>
                        </div>
                        {isOpen && (
                          <div className="grid grid-cols-3 gap-3 p-4 bg-[#F9F6F0]/60">
                            <div><p className="text-[10px] font-bold text-[#7D9D85] uppercase mb-1">Earnings</p>{(li.earnings || []).map(function(e, i) { return <div key={i} className="flex justify-between text-[11px] py-0.5"><span className="text-[#6A625E]">{e.name}</span><span>{fmt(e.amount)}</span></div>; })}</div>
                            <div><p className="text-[10px] font-bold text-[#D96C5B] uppercase mb-1">Deductions</p>{(li.deductions || []).map(function(d, i) { return <div key={i} className="flex justify-between text-[11px] py-0.5"><span className="text-[#6A625E]">{d.name}</span><span>{fmt(d.amount)}</span></div>; })}</div>
                            <div><p className="text-[10px] font-bold text-[#E8B25C] uppercase mb-1">Provisions</p>{(li.provisions || []).map(function(p, i) { return <div key={i} className="flex justify-between text-[11px] py-0.5"><span className="text-[#6A625E]">{p.name}</span><span>{fmt(p.amount)}</span></div>; })}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {(selected.skipped || []).length > 0 && (
                  <div className="p-4 border-t border-[#E8E2D9] bg-[#E8B25C]/5">
                    <p className="text-xs font-bold text-[#E8B25C] uppercase mb-1">Skipped ({selected.skipped.length})</p>
                    {selected.skipped.map(function(s, i) { return <p key={i} className="text-[10px] text-[#6A625E]">{s.employee_id.substring(0, 8)}… — {s.reason}</p>; })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
