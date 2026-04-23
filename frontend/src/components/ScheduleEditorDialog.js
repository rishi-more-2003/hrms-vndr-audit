import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { vendorAuditAPI } from '../services/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Calendar, Plus, Trash, FloppyDisk, Play, Info } from '@phosphor-icons/react';

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const STATUS_COLOR = {
  scheduled: 'bg-[#A28B7A]/15 text-[#A28B7A]',
  open: 'bg-[#E8B25C]/15 text-[#B8841F]',
  closed: 'bg-[#7D9D85]/15 text-[#4A6C52]',
  orphaned: 'bg-[#D96C5B]/15 text-[#A3402E]',
};

/** Year schedule editor + list */
export default function ScheduleEditorDialog({ contractor, open, onClose }) {
  const [schedules, setSchedules] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [edit, setEdit] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open && contractor) { refresh(); setEdit(buildYear(year)); } }, [open, contractor, year]);

  async function refresh() {
    try {
      const r = await vendorAuditAPI.listSchedules(contractor.id);
      setSchedules(r.data || []);
    } catch (e) { toast.error('Failed to load schedules'); }
  }

  function buildYear(y) {
    // Default: wage month = month; open = 5th of next month; close = open + 10 days
    return MONTHS.map((m, i) => {
      const next = new Date(y, i + 1, 5);
      const close = new Date(next); close.setDate(close.getDate() + 10);
      return {
        wage_month: `${m}-${y}`,
        window_open_date: next.toISOString().slice(0, 10),
        window_close_date: close.toISOString().slice(0, 10),
      };
    });
  }

  async function save() {
    setBusy(true);
    try {
      const r = await vendorAuditAPI.upsertSchedules(contractor.id, edit);
      toast.success(`Saved: ${r.data.inserted} new, ${r.data.updated} updated`);
      refresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'Save failed'); }
    setBusy(false);
  }

  async function deleteSchedule(s) {
    if (!window.confirm(`Delete ${s.wage_month} schedule?`)) return;
    try {
      await vendorAuditAPI.deleteSchedule(s.id);
      toast.success('Deleted'); refresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'Cannot delete'); }
  }

  async function runNow() {
    setBusy(true);
    try {
      const r = await vendorAuditAPI.runSchedulerNow();
      toast.success(`Opened: ${r.data.opened} · Reminded: ${r.data.reminded} · Closed: ${r.data.closed}`);
      refresh();
    } catch (e) { toast.error('Failed'); }
    setBusy(false);
  }

  const existingMonths = new Set(schedules.map(s => s.wage_month));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-[#E8E2D9]">
          <DialogTitle>Audit Schedule — {contractor?.name}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <div className="bg-[#E8B25C]/10 rounded-lg p-3 text-xs text-[#6A625E] flex items-start gap-2">
            <Info size={14} className="text-[#E8B25C] mt-0.5" />
            <span>On each window-open date, the system creates a draft audit and emails the contractor. On close date, audits in 'uploaded/audited' state auto-submit; drafts are flagged MISSED. Scheduler runs daily at 06:00 IST.</span>
          </div>

          {/* Existing scheduled windows */}
          {schedules.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2"><p className="text-xs font-bold uppercase text-[#2A2624]">Current schedule</p>
                <Button size="sm" variant="outline" onClick={runNow} disabled={busy} data-testid="run-scheduler-now-btn"><Play size={12} className="mr-1" /> Run scheduler now</Button>
              </div>
              <div className="space-y-1">
                {schedules.map(s => (
                  <div key={s.id} className="flex items-center justify-between bg-white border border-[#E8E2D9] rounded-lg p-2 text-sm">
                    <span className="font-medium text-[#2A2624]">{s.wage_month}</span>
                    <span className="text-xs text-[#6A625E]">Open: {s.window_open_date} · Close: {s.window_close_date}</span>
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${STATUS_COLOR[s.status] || ''}`}>{s.status}</span>
                    <Button size="sm" variant="ghost" onClick={() => deleteSchedule(s)} className="text-[#D96C5B]" disabled={['open','closed'].includes(s.status)}><Trash size={14} /></Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Year bulk editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase text-[#2A2624]">Bulk year setup</p>
              <Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value) || new Date().getFullYear())} className="w-28 h-8 text-sm" data-testid="schedule-year-input" />
            </div>
            <div className="space-y-1">
              {edit.map((row, idx) => {
                const already = existingMonths.has(row.wage_month);
                return (
                  <div key={row.wage_month} className={`grid grid-cols-12 gap-2 items-center p-2 rounded-lg ${already ? 'bg-[#F9F6F0] opacity-60' : 'bg-white border border-[#E8E2D9]'}`}>
                    <Label className="col-span-2 text-sm font-medium">{row.wage_month}</Label>
                    <div className="col-span-4"><Label className="text-[10px] text-[#A28B7A]">Open</Label>
                      <Input type="date" value={row.window_open_date} onChange={e => setEdit(edit.map((r, i) => i === idx ? { ...r, window_open_date: e.target.value } : r))} className="h-8 text-sm" disabled={already} /></div>
                    <div className="col-span-4"><Label className="text-[10px] text-[#A28B7A]">Close</Label>
                      <Input type="date" value={row.window_close_date} onChange={e => setEdit(edit.map((r, i) => i === idx ? { ...r, window_close_date: e.target.value } : r))} className="h-8 text-sm" disabled={already} /></div>
                    <div className="col-span-2 text-right text-[10px] text-[#A28B7A]">{already ? 'exists' : 'new'}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter className="px-6 pb-6 border-t border-[#E8E2D9] pt-4">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={save} disabled={busy} className="bg-[#D96C5B] hover:bg-[#C25949]" data-testid="save-schedule-btn"><FloppyDisk size={14} className="mr-1" /> Save Schedule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
