import React, { useEffect, useState } from 'react';
import { leaveAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { CalendarX, Plus, Check, X as XIcon } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';

const LeavePage = () => {
  const { isAdmin } = useAuth();
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    leave_type: 'casual', start_date: '', end_date: '', reason: '', total_days: 1
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const res = await leaveAPI.getAll();
      setLeaves(res.data);
    } catch { setLeaves([]); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await leaveAPI.apply(formData);
      toast.success('Leave application submitted');
      setIsDialogOpen(false);
      fetchData();
      setFormData({ leave_type: 'casual', start_date: '', end_date: '', reason: '', total_days: 1 });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to apply leave');
    }
  };

  const handleApprove = async (id) => {
    try { await leaveAPI.approve(id); toast.success('Leave approved'); fetchData(); }
    catch (error) { toast.error(error.response?.data?.detail || 'Not authorized'); }
  };
  const handleReject = async (id) => {
    try { await leaveAPI.reject(id); toast.success('Leave rejected'); fetchData(); }
    catch (error) { toast.error(error.response?.data?.detail || 'Not authorized'); }
  };

  useEffect(() => {
    if (formData.start_date && formData.end_date) {
      const start = new Date(formData.start_date);
      const end = new Date(formData.end_date);
      const days = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);
      setFormData(prev => ({...prev, total_days: days}));
    }
  }, [formData.start_date, formData.end_date]);

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>;

  const pendingCount = leaves.filter(l => l.status === 'pending').length;
  const approvedCount = leaves.filter(l => l.status === 'approved').length;

  return (
    <div className="space-y-6" data-testid="leave-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Leave Management</h1>
          <p className="text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>
            {isAdmin ? 'Review and manage all leave requests' : 'Apply and track your leaves'}
          </p>
        </div>
        {!isAdmin && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="apply-leave-button" className="bg-[#D96C5B] hover:bg-[#C25949] text-white rounded-xl">
                <Plus size={20} className="mr-2" /> Apply Leave
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Apply for Leave</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Leave Type</Label>
                  <Select value={formData.leave_type} onValueChange={(v) => setFormData({...formData, leave_type: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="casual">Casual Leave</SelectItem>
                      <SelectItem value="sick">Sick Leave</SelectItem>
                      <SelectItem value="earned">Earned Leave</SelectItem>
                      <SelectItem value="maternity">Maternity Leave</SelectItem>
                      <SelectItem value="paternity">Paternity Leave</SelectItem>
                      <SelectItem value="unpaid">Unpaid Leave</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Start Date</Label><Input type="date" value={formData.start_date} onChange={(e) => setFormData({...formData, start_date: e.target.value})} required /></div>
                  <div><Label>End Date</Label><Input type="date" value={formData.end_date} onChange={(e) => setFormData({...formData, end_date: e.target.value})} required /></div>
                </div>
                <p className="text-sm text-[#6A625E]">Total Days: <strong>{formData.total_days}</strong></p>
                <div>
                  <Label>Reason</Label>
                  <Textarea value={formData.reason} onChange={(e) => setFormData({...formData, reason: e.target.value})} required />
                </div>
                <Button type="submit" className="w-full bg-[#D96C5B] hover:bg-[#C25949]">Submit</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
          <p className="text-sm text-[#6A625E] mb-1">Pending</p>
          <p className="text-3xl font-semibold text-[#E8B25C]">{pendingCount}</p>
        </div>
        <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
          <p className="text-sm text-[#6A625E] mb-1">Approved</p>
          <p className="text-3xl font-semibold text-[#7D9D85]">{approvedCount}</p>
        </div>
        <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
          <p className="text-sm text-[#6A625E] mb-1">Total Requests</p>
          <p className="text-3xl font-semibold text-[#2A2624]">{leaves.length}</p>
        </div>
      </div>

      {/* Leave Table */}
      <div className="bg-white border border-[#E8E2D9] rounded-2xl shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
        <div className="p-6 border-b border-[#E8E2D9]">
          <h3 className="text-xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Leave Requests</h3>
        </div>
        {leaves.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarX size={64} className="mx-auto mb-4 text-[#A28B7A] opacity-50" />
            <h3 className="text-xl font-semibold text-[#2A2624] mb-2">No Leave Requests</h3>
            <p className="text-[#6A625E]">{isAdmin ? 'No pending requests' : 'Apply for leave to see requests here'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="leave-table">
              <thead className="bg-[#F9F6F0] border-b border-[#E8E2D9]">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Type</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Start</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">End</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Days</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Reason</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E2D9]">
                {leaves.slice().reverse().map((leave) => (
                  <tr key={leave.id} className="hover:bg-[#FDFBF9] transition-colors">
                    <td className="px-6 py-4"><span className="badge badge-info capitalize">{leave.leave_type}</span></td>
                    <td className="px-6 py-4 text-[#6A625E] text-sm">{leave.start_date}</td>
                    <td className="px-6 py-4 text-[#6A625E] text-sm">{leave.end_date}</td>
                    <td className="px-6 py-4 text-[#6A625E] text-sm">{leave.total_days}</td>
                    <td className="px-6 py-4 text-[#6A625E] text-sm max-w-xs truncate">{leave.reason}</td>
                    <td className="px-6 py-4">
                      <span className={`badge ${leave.status === 'approved' ? 'badge-success' : leave.status === 'rejected' ? 'badge-danger' : 'badge-warning'}`}>
                        {leave.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {leave.status === 'pending' && (isAdmin || true) && (
                        <div className="flex space-x-2">
                          <button onClick={() => handleApprove(leave.id)} data-testid={`approve-leave-${leave.id}`} className="p-2 hover:bg-[#7D9D85]/10 rounded-lg"><Check size={18} className="text-[#7D9D85]" /></button>
                          <button onClick={() => handleReject(leave.id)} data-testid={`reject-leave-${leave.id}`} className="p-2 hover:bg-[#C65549]/10 rounded-lg"><XIcon size={18} className="text-[#C65549]" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeavePage;
