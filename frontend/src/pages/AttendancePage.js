import React, { useEffect, useState } from 'react';
import { attendanceAPI, employeeAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { ClockCounterClockwise, CalendarCheck, Plus, Check, X as XIcon, Table, CalendarBlank, Warning } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

var METHOD_LABELS = {
  self_clockin: 'Self Clock-in', admin_entry: 'Admin Entry',
  employee_month_end: 'Emp Month-End', manager_month_end: 'Mgr Month-End',
  manual_time_select: 'Manual Time', biometric_fingerprint: 'Biometric FP',
  biometric_face: 'Biometric Face', geo_tagged: 'Geo-tagged', card_tap: 'Card Tap'
};

function StatusBadge({ status }) {
  var colors = { active: 'badge-success', pending_approval: 'badge-warning', approved: 'badge-success', rejected: 'badge-danger', pending: 'badge-warning' };
  return <span className={'badge ' + (colors[status] || 'badge-info')}>{(status || 'active').replace(/_/g, ' ')}</span>;
}

export default function AttendancePage() {
  var auth = useAuth();
  var isAdmin = auth.isAdmin;
  var [attendance, setAttendance] = useState([]);
  var [employees, setEmployees] = useState([]);
  var [missedPunches, setMissedPunches] = useState([]);
  var [loading, setLoading] = useState(true);
  var [todayAtt, setTodayAtt] = useState(null);
  var [viewTab, setViewTab] = useState('realtime');
  var [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  var [manualDialog, setManualDialog] = useState(false);
  var [missedDialog, setMissedDialog] = useState(false);
  var [bulkDialog, setBulkDialog] = useState(false);
  var [adminDialog, setAdminDialog] = useState(false);
  var [manualForm, setManualForm] = useState({ date: '', clock_in: '', clock_out: '', reason: '' });
  var [missedForm, setMissedForm] = useState({ date: '', punch_type: 'clock_out', punch_time: '', reason: '' });
  var [adminForm, setAdminForm] = useState({ employee_id: '', date: '', clock_in: '', clock_out: '', reason: '' });
  var [bulkEntries, setBulkEntries] = useState([]);

  useEffect(function() { fetchData(); }, [selectedMonth]);

  async function fetchData() {
    try {
      var res = await attendanceAPI.getAll(null, selectedMonth);
      setAttendance(res.data || []);
      var today = new Date().toISOString().split('T')[0];
      setTodayAtt((res.data || []).find(function(a) { return a.date === today && a.is_active; }) || null);
      if (isAdmin) {
        var empRes = await employeeAPI.getAll();
        setEmployees(empRes.data);
      }
      var mpRes = await attendanceAPI.getMissedPunches();
      setMissedPunches(mpRes.data || []);
    } catch (e) { setAttendance([]); }
    setLoading(false);
  }

  async function handleClockIn() {
    try { await attendanceAPI.clockIn('self_clockin'); toast.success('Clocked in'); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  }
  async function handleClockOut() {
    try { var r = await attendanceAPI.clockOut('self_clockin'); toast.success('Clocked out. Hours: ' + r.data.total_hours); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  }
  async function handleManualEntry(e) {
    e.preventDefault();
    try { await attendanceAPI.manualEntry(manualForm); toast.success('Manual entry submitted'); setManualDialog(false); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  }
  async function handleMissedPunch(e) {
    e.preventDefault();
    try { await attendanceAPI.missedPunch(missedForm); toast.success('Missed punch request submitted'); setMissedDialog(false); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  }
  async function handleAdminEntry(e) {
    e.preventDefault();
    try { await attendanceAPI.adminEntry(adminForm); toast.success('Entry added'); setAdminDialog(false); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  }
  async function handleBulkSubmit() {
    try { await attendanceAPI.bulkEntry({ entries: bulkEntries, entry_by: isAdmin ? 'manager' : 'employee', needs_approval: !isAdmin }); toast.success('Bulk entries submitted'); setBulkDialog(false); fetchData(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  }
  async function approveMissed(id) { try { await attendanceAPI.approveMissedPunch(id); toast.success('Approved'); fetchData(); } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); } }
  async function rejectMissed(id) { try { await attendanceAPI.rejectMissedPunch(id); toast.success('Rejected'); fetchData(); } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); } }
  async function approveEntry(id) { try { await attendanceAPI.approveEntry(id); toast.success('Approved'); fetchData(); } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); } }
  async function rejectEntry(id) { try { await attendanceAPI.rejectEntry(id); toast.success('Rejected'); fetchData(); } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); } }

  function generateBulkDays() {
    var year = parseInt(selectedMonth.split('-')[0]);
    var month = parseInt(selectedMonth.split('-')[1]);
    var daysInMonth = new Date(year, month, 0).getDate();
    var entries = [];
    for (var d = 1; d <= daysInMonth; d++) {
      var dateStr = selectedMonth + '-' + String(d).padStart(2, '0');
      var existing = attendance.find(function(a) { return a.date === dateStr; });
      entries.push({ date: dateStr, clock_in: existing?.clock_in || '', clock_out: existing?.clock_out || '', notes: '' });
    }
    setBulkEntries(entries);
  }

  // Calendar view data
  var calDays = [];
  if (selectedMonth) {
    var year = parseInt(selectedMonth.split('-')[0]);
    var month = parseInt(selectedMonth.split('-')[1]);
    var daysInMonth = new Date(year, month, 0).getDate();
    var firstDayOfWeek = new Date(year, month - 1, 1).getDay();
    for (var pad = 0; pad < firstDayOfWeek; pad++) calDays.push(null);
    for (var d = 1; d <= daysInMonth; d++) {
      var dateStr = selectedMonth + '-' + String(d).padStart(2, '0');
      var att = attendance.find(function(a) { return a.date === dateStr; });
      calDays.push({ day: d, date: dateStr, att: att });
    }
  }

  var pendingEntries = attendance.filter(function(a) { return a.approval_status === 'pending'; });
  var pendingMissed = missedPunches.filter(function(m) { return m.status === 'pending'; });

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>;

  return (
    <div className="space-y-6" data-testid="attendance-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Attendance</h1>
          <p className="text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>Track, manage and review attendance</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isAdmin && (
            <>
              <Dialog open={manualDialog} onOpenChange={setManualDialog}>
                <DialogTrigger asChild><Button size="sm" variant="outline" className="rounded-xl" data-testid="manual-entry-btn"><Plus size={16} className="mr-1" /> Manual Entry</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Manual Time Entry</DialogTitle></DialogHeader>
                  <form onSubmit={handleManualEntry} className="space-y-4">
                    <div><Label>Date</Label><Input type="date" value={manualForm.date} onChange={function(e) { setManualForm({...manualForm, date: e.target.value}); }} required /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><Label>Clock In</Label><Input type="datetime-local" value={manualForm.clock_in} onChange={function(e) { setManualForm({...manualForm, clock_in: e.target.value}); }} required /></div>
                      <div><Label>Clock Out</Label><Input type="datetime-local" value={manualForm.clock_out} onChange={function(e) { setManualForm({...manualForm, clock_out: e.target.value}); }} /></div>
                    </div>
                    <div><Label>Reason</Label><Textarea value={manualForm.reason} onChange={function(e) { setManualForm({...manualForm, reason: e.target.value}); }} placeholder="Reason for manual entry" /></div>
                    <WarningBox text="This entry will require manager approval." />
                    <Button type="submit" className="w-full bg-[#D96C5B] hover:bg-[#C25949]">Submit</Button>
                  </form>
                </DialogContent>
              </Dialog>
              <Dialog open={missedDialog} onOpenChange={setMissedDialog}>
                <DialogTrigger asChild><Button size="sm" variant="outline" className="rounded-xl" data-testid="missed-punch-btn"><Warning size={16} className="mr-1" /> Missed Punch</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Missed Punch Request</DialogTitle></DialogHeader>
                  <form onSubmit={handleMissedPunch} className="space-y-4">
                    <div><Label>Date</Label><Input type="date" value={missedForm.date} onChange={function(e) { setMissedForm({...missedForm, date: e.target.value}); }} required /></div>
                    <div><Label>Punch Type</Label><Select value={missedForm.punch_type} onValueChange={function(v) { setMissedForm({...missedForm, punch_type: v}); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="clock_in">Clock In</SelectItem><SelectItem value="clock_out">Clock Out</SelectItem></SelectContent></Select></div>
                    <div><Label>Correct Time</Label><Input type="datetime-local" value={missedForm.punch_time} onChange={function(e) { setMissedForm({...missedForm, punch_time: e.target.value}); }} required /></div>
                    <div><Label>Reason</Label><Textarea value={missedForm.reason} onChange={function(e) { setMissedForm({...missedForm, reason: e.target.value}); }} required /></div>
                    <Button type="submit" className="w-full bg-[#D96C5B] hover:bg-[#C25949]">Submit Request</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          )}
          {isAdmin && (
            <Dialog open={adminDialog} onOpenChange={setAdminDialog}>
              <DialogTrigger asChild><Button size="sm" variant="outline" className="rounded-xl" data-testid="admin-entry-btn"><Plus size={16} className="mr-1" /> Admin Entry</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Admin Attendance Entry</DialogTitle></DialogHeader>
                <form onSubmit={handleAdminEntry} className="space-y-4">
                  <div><Label>Employee</Label><Select value={adminForm.employee_id} onValueChange={function(v) { setAdminForm({...adminForm, employee_id: v}); }}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent>{employees.map(function(e) { return <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>; })}</SelectContent></Select></div>
                  <div><Label>Date</Label><Input type="date" value={adminForm.date} onChange={function(e) { setAdminForm({...adminForm, date: e.target.value}); }} required /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Clock In</Label><Input type="datetime-local" value={adminForm.clock_in} onChange={function(e) { setAdminForm({...adminForm, clock_in: e.target.value}); }} required /></div>
                    <div><Label>Clock Out</Label><Input type="datetime-local" value={adminForm.clock_out} onChange={function(e) { setAdminForm({...adminForm, clock_out: e.target.value}); }} /></div>
                  </div>
                  <Button type="submit" className="w-full bg-[#D96C5B] hover:bg-[#C25949]">Add Entry</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
          <Dialog open={bulkDialog} onOpenChange={function(v) { if (v) generateBulkDays(); setBulkDialog(v); }}>
            <DialogTrigger asChild><Button size="sm" variant="outline" className="rounded-xl" data-testid="bulk-entry-btn"><Table size={16} className="mr-1" /> Month-End Entry</Button></DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden">
              <DialogHeader><DialogTitle>Month-End Bulk Entry ({selectedMonth})</DialogTitle></DialogHeader>
              <div className="max-h-[60vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-[#F9F6F0] sticky top-0"><tr><th className="px-3 py-2 text-left text-xs">Date</th><th className="px-3 py-2 text-left text-xs">Clock In</th><th className="px-3 py-2 text-left text-xs">Clock Out</th></tr></thead>
                  <tbody>{bulkEntries.map(function(entry, i) {
                    return (<tr key={i} className="border-b border-[#E8E2D9]">
                      <td className="px-3 py-1.5 text-xs font-medium">{entry.date}</td>
                      <td className="px-3 py-1"><Input type="datetime-local" value={entry.clock_in} onChange={function(e) { var ne = [...bulkEntries]; ne[i] = {...ne[i], clock_in: e.target.value}; setBulkEntries(ne); }} className="h-8 text-xs" /></td>
                      <td className="px-3 py-1"><Input type="datetime-local" value={entry.clock_out} onChange={function(e) { var ne = [...bulkEntries]; ne[i] = {...ne[i], clock_out: e.target.value}; setBulkEntries(ne); }} className="h-8 text-xs" /></td>
                    </tr>);
                  })}</tbody>
                </table>
              </div>
              <Button onClick={handleBulkSubmit} className="w-full bg-[#D96C5B] hover:bg-[#C25949] mt-2">Submit All Entries</Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Real-time Clock */}
      {!isAdmin && (
        <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-[#2A2624] mb-1" style={{ fontFamily: 'Outfit' }}>Today's Attendance</h3>
              <p className="text-sm text-[#6A625E]">
                {todayAtt ? (<>{todayAtt.clock_in && ('In: ' + new Date(todayAtt.clock_in).toLocaleTimeString())}{todayAtt.clock_out && (' | Out: ' + new Date(todayAtt.clock_out).toLocaleTimeString())}{todayAtt.total_hours != null && (' | ' + todayAtt.total_hours + ' hrs')}<span className="ml-2 text-xs text-[#A28B7A]">via {METHOD_LABELS[todayAtt.collection_method] || todayAtt.collection_method}</span></>) : "Not clocked in yet"}
              </p>
            </div>
            <div className="flex space-x-3">
              <Button onClick={handleClockIn} disabled={!!todayAtt} data-testid="clock-in-button" className="bg-[#7D9D85] hover:bg-[#6A8A72] text-white rounded-xl"><ClockCounterClockwise size={18} className="mr-2" /> Clock In</Button>
              <Button onClick={handleClockOut} disabled={!todayAtt || !!todayAtt?.clock_out} data-testid="clock-out-button" className="bg-[#D96C5B] hover:bg-[#C25949] text-white rounded-xl"><ClockCounterClockwise size={18} className="mr-2" /> Clock Out</Button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Approvals (Admin/Manager) */}
      {(isAdmin || pendingEntries.length > 0 || pendingMissed.length > 0) && (pendingEntries.length > 0 || pendingMissed.length > 0) && (
        <div className="bg-[#E8B25C]/10 border border-[#E8B25C]/30 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-[#2A2624] mb-4">Pending Approvals</h3>
          {pendingEntries.map(function(e) { return (
            <div key={e.id} className="flex items-center justify-between py-2 border-b border-[#E8E2D9]">
              <div><p className="text-sm text-[#2A2624]">{e.date} | {e.clock_in ? new Date(e.clock_in).toLocaleTimeString() : '-'} - {e.clock_out ? new Date(e.clock_out).toLocaleTimeString() : '-'}</p><p className="text-xs text-[#6A625E]">Method: {METHOD_LABELS[e.collection_method] || e.collection_method}</p></div>
              <div className="flex space-x-2"><button onClick={function() { approveEntry(e.id); }} className="p-2 hover:bg-[#7D9D85]/10 rounded-lg"><Check size={16} className="text-[#7D9D85]" /></button><button onClick={function() { rejectEntry(e.id); }} className="p-2 hover:bg-[#C65549]/10 rounded-lg"><XIcon size={16} className="text-[#C65549]" /></button></div>
            </div>
          ); })}
          {pendingMissed.map(function(m) { return (
            <div key={m.id} className="flex items-center justify-between py-2 border-b border-[#E8E2D9]">
              <div><p className="text-sm text-[#2A2624]">Missed {m.punch_type} for {m.date}</p><p className="text-xs text-[#6A625E]">Time: {m.punch_time} | Reason: {m.reason}</p></div>
              <div className="flex space-x-2"><button onClick={function() { approveMissed(m.id); }} className="p-2 hover:bg-[#7D9D85]/10 rounded-lg"><Check size={16} className="text-[#7D9D85]" /></button><button onClick={function() { rejectMissed(m.id); }} className="p-2 hover:bg-[#C65549]/10 rounded-lg"><XIcon size={16} className="text-[#C65549]" /></button></div>
            </div>
          ); })}
        </div>
      )}

      {/* Month Selector */}
      <div className="flex items-center space-x-4">
        <Input type="month" value={selectedMonth} onChange={function(e) { setSelectedMonth(e.target.value); }} className="w-48" data-testid="month-selector" />
        <Tabs value={viewTab} onValueChange={setViewTab}>
          <TabsList className="bg-white border border-[#E8E2D9] rounded-xl p-1">
            <TabsTrigger value="table" data-testid="view-table" className="rounded-lg text-xs data-[state=active]:bg-[#D96C5B] data-[state=active]:text-white"><Table size={14} className="mr-1" /> Table</TabsTrigger>
            <TabsTrigger value="calendar" data-testid="view-calendar" className="rounded-lg text-xs data-[state=active]:bg-[#D96C5B] data-[state=active]:text-white"><CalendarBlank size={14} className="mr-1" /> Calendar</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Table View */}
      {viewTab === 'table' && (
        <div className="bg-white border border-[#E8E2D9] rounded-2xl shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="attendance-table">
              <thead className="bg-[#F9F6F0] border-b border-[#E8E2D9]"><tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-[#2A2624] uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-[#2A2624] uppercase">Clock In</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-[#2A2624] uppercase">Clock Out</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-[#2A2624] uppercase">Hours</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-[#2A2624] uppercase">Method</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-[#2A2624] uppercase">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-[#E8E2D9]">
                {attendance.length === 0 ? (
                  <tr><td colSpan="6" className="px-4 py-12 text-center text-[#6A625E]">No attendance records for this month</td></tr>
                ) : attendance.map(function(att) { return (
                  <tr key={att.id} className="hover:bg-[#FDFBF9]">
                    <td className="px-4 py-3 text-sm font-medium text-[#2A2624]">{att.date}</td>
                    <td className="px-4 py-3 text-sm text-[#6A625E]">{att.clock_in ? new Date(att.clock_in).toLocaleTimeString() : '-'}</td>
                    <td className="px-4 py-3 text-sm text-[#6A625E]">{att.clock_out ? new Date(att.clock_out).toLocaleTimeString() : '-'}</td>
                    <td className="px-4 py-3 text-sm text-[#6A625E]">{att.total_hours != null ? att.total_hours + 'h' : '-'}</td>
                    <td className="px-4 py-3"><span className="badge badge-info text-xs">{METHOD_LABELS[att.collection_method] || att.collection_method || '-'}</span></td>
                    <td className="px-4 py-3"><StatusBadge status={att.approval_status || att.entry_status || 'active'} /></td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Calendar View */}
      {viewTab === 'calendar' && (
        <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(function(d) { return <div key={d} className="text-center text-xs font-bold text-[#2A2624] py-2">{d}</div>; })}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calDays.map(function(item, i) {
              if (!item) return <div key={'pad-' + i} className="aspect-square" />;
              var a = item.att;
              var bgColor = !a ? 'bg-white' : a.approval_status === 'pending' ? 'bg-[#E8B25C]/10' : a.status === 'present' ? 'bg-[#7D9D85]/10' : 'bg-[#C65549]/10';
              return (
                <div key={item.date} className={'aspect-square border border-[#E8E2D9] rounded-lg p-1 text-center ' + bgColor + ' hover:border-[#D96C5B] transition-colors'} data-testid={'cal-day-' + item.day}>
                  <p className="text-xs font-semibold text-[#2A2624]">{item.day}</p>
                  {a && (<>
                    <p className="text-[10px] text-[#7D9D85] leading-tight">{a.clock_in ? new Date(a.clock_in).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : ''}</p>
                    <p className="text-[10px] text-[#D96C5B] leading-tight">{a.clock_out ? new Date(a.clock_out).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : ''}</p>
                    {a.total_hours != null && <p className="text-[10px] text-[#6A625E]">{a.total_hours}h</p>}
                  </>)}
                </div>
              );
            })}
          </div>
          <div className="flex items-center space-x-4 mt-4 text-xs">
            <div className="flex items-center space-x-1"><div className="w-3 h-3 rounded bg-[#7D9D85]/30" /><span className="text-[#6A625E]">Present</span></div>
            <div className="flex items-center space-x-1"><div className="w-3 h-3 rounded bg-[#E8B25C]/30" /><span className="text-[#6A625E]">Pending</span></div>
            <div className="flex items-center space-x-1"><div className="w-3 h-3 rounded bg-white border border-[#E8E2D9]" /><span className="text-[#6A625E]">No Record</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

function WarningBox({text}){return(<div className="bg-[#E8B25C]/10 border border-[#E8B25C]/30 rounded-lg p-3 flex items-start space-x-2"><Warning size={16} className="text-[#E8B25C] flex-shrink-0 mt-0.5"/><p className="text-xs text-[#6A625E]">{text}</p></div>);}
