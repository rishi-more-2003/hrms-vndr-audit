import React, { useEffect, useState } from 'react';
import { reimbursementAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Receipt, Plus, Check, X as XIcon, CurrencyDollar } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const ReimbursementsPage = () => {
  const { isAdmin } = useAuth();
  const [reimbursements, setReimbursements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    category: 'travel',
    amount: '',
    description: '',
    receipt_url: ''
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const res = await reimbursementAPI.getAll();
      setReimbursements(res.data);
    } catch { setReimbursements([]); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await reimbursementAPI.create({
        ...formData,
        amount: parseFloat(formData.amount),
        receipt_url: formData.receipt_url || null
      });
      toast.success('Reimbursement submitted');
      setIsDialogOpen(false);
      fetchData();
      setFormData({ category: 'travel', amount: '', description: '', receipt_url: '' });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit');
    }
  };

  const handleApprove = async (id) => {
    try { await reimbursementAPI.approve(id); toast.success('Approved'); fetchData(); }
    catch (error) { toast.error(error.response?.data?.detail || 'Failed'); }
  };
  const handleReject = async (id) => {
    try { await reimbursementAPI.reject(id); toast.success('Rejected'); fetchData(); }
    catch (error) { toast.error(error.response?.data?.detail || 'Failed'); }
  };
  const handleDisburse = async (id) => {
    try { await reimbursementAPI.disburse(id); toast.success('Disbursed'); fetchData(); }
    catch (error) { toast.error(error.response?.data?.detail || 'Failed'); }
  };

  const statusColor = (s) => s === 'approved' ? 'badge-success' : s === 'rejected' ? 'badge-danger' : s === 'disbursed' ? 'badge-info' : 'badge-warning';
  const categoryLabel = (c) => ({ travel: 'Travel', food: 'Food', medical: 'Medical', equipment: 'Equipment', other: 'Other' }[c] || c);

  const totalPending = reimbursements.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0);
  const totalApproved = reimbursements.filter(r => r.status === 'approved' || r.status === 'disbursed').reduce((s, r) => s + r.amount, 0);

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>;

  return (
    <div className="space-y-6" data-testid="reimbursements-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Reimbursements</h1>
          <p className="text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>Submit and track expense claims</p>
        </div>
        {!isAdmin && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="submit-reimbursement-button" className="bg-[#D96C5B] hover:bg-[#C25949] text-white rounded-xl">
                <Plus size={20} className="mr-2" /> Submit Claim
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Submit Reimbursement</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Category</Label>
                  <Select value={formData.category} onValueChange={(v) => setFormData({...formData, category: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="travel">Travel</SelectItem>
                      <SelectItem value="food">Food</SelectItem>
                      <SelectItem value="medical">Medical</SelectItem>
                      <SelectItem value="equipment">Equipment</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Amount (INR)</Label>
                  <Input type="number" value={formData.amount} onChange={(e) => setFormData({...formData, amount: e.target.value})} placeholder="0.00" required min="1" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} placeholder="Describe the expense" required />
                </div>
                <Button type="submit" className="w-full bg-[#D96C5B] hover:bg-[#C25949]">Submit Claim</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
          <p className="text-sm text-[#6A625E] mb-1">Pending</p>
          <p className="text-3xl font-semibold text-[#E8B25C]">&#8377;{totalPending.toLocaleString()}</p>
        </div>
        <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
          <p className="text-sm text-[#6A625E] mb-1">Approved / Disbursed</p>
          <p className="text-3xl font-semibold text-[#7D9D85]">&#8377;{totalApproved.toLocaleString()}</p>
        </div>
        <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
          <p className="text-sm text-[#6A625E] mb-1">Total Claims</p>
          <p className="text-3xl font-semibold text-[#2A2624]">{reimbursements.length}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E8E2D9] rounded-2xl shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
        {reimbursements.length === 0 ? (
          <div className="p-12 text-center">
            <Receipt size={64} className="mx-auto mb-4 text-[#A28B7A] opacity-50" />
            <h3 className="text-xl font-semibold text-[#2A2624] mb-2">No Reimbursements</h3>
            <p className="text-[#6A625E]">Submit your first expense claim</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="reimbursements-table">
              <thead className="bg-[#F9F6F0] border-b border-[#E8E2D9]">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Category</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Amount</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Description</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Date</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E2D9]">
                {reimbursements.slice().reverse().map((r) => (
                  <tr key={r.id} className="hover:bg-[#FDFBF9] transition-colors">
                    <td className="px-6 py-4">
                      <span className="badge badge-info">{categoryLabel(r.category)}</span>
                    </td>
                    <td className="px-6 py-4 text-[#2A2624] font-semibold">&#8377;{r.amount.toLocaleString()}</td>
                    <td className="px-6 py-4 text-[#6A625E] max-w-xs truncate">{r.description}</td>
                    <td className="px-6 py-4">
                      <span className={`badge ${statusColor(r.status)}`}>{r.status}</span>
                    </td>
                    <td className="px-6 py-4 text-[#6A625E] text-sm">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4">
                      <div className="flex space-x-2">
                        {r.status === 'pending' && (isAdmin || true) && (
                          <>
                            <button onClick={() => handleApprove(r.id)} data-testid={`approve-reimb-${r.id}`} className="p-2 hover:bg-[#7D9D85]/10 rounded-lg transition-colors">
                              <Check size={18} className="text-[#7D9D85]" />
                            </button>
                            <button onClick={() => handleReject(r.id)} data-testid={`reject-reimb-${r.id}`} className="p-2 hover:bg-[#C65549]/10 rounded-lg transition-colors">
                              <XIcon size={18} className="text-[#C65549]" />
                            </button>
                          </>
                        )}
                        {r.status === 'approved' && isAdmin && (
                          <button onClick={() => handleDisburse(r.id)} data-testid={`disburse-reimb-${r.id}`} className="p-2 hover:bg-[#D96C5B]/10 rounded-lg transition-colors text-[#D96C5B]">
                            <CurrencyDollar size={18} />
                          </button>
                        )}
                      </div>
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

export default ReimbursementsPage;
