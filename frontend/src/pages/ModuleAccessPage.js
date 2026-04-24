import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Users, Plus, X, Shield } from '@phosphor-icons/react';

const MODULE_LABELS = {
  hrms: 'HRMS',
  vendor_audit: 'Vendor Audit',
  register_maker: 'Register Maker',
  internal_audit: 'Internal Audit',
  consultancy: 'Consultancy',
};

export default function ModuleAccessPage() {
  const [users, setUsers] = useState([]);
  const [catalogue, setCatalogue] = useState({ module_roles: {}, modules: [] });
  const [loading, setLoading] = useState(true);
  const [grantFor, setGrantFor] = useState(null);
  const [grantMod, setGrantMod] = useState('');
  const [grantRole, setGrantRole] = useState('');
  const API = process.env.REACT_APP_BACKEND_URL + '/api';

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    setLoading(true);
    try {
      const [u, c] = await Promise.all([
        axios.get(`${API}/module-roles/org-users`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        axios.get(`${API}/module-roles/meta/roles`),
      ]);
      setUsers(u.data || []); setCatalogue(c.data);
    } catch (e) { toast.error('Failed to load'); }
    setLoading(false);
  }

  async function grant() {
    if (!grantFor || !grantMod || !grantRole) { toast.error('Pick module and role'); return; }
    try {
      await axios.put(`${API}/module-roles/users/${grantFor.id}/grant`, { module: grantMod, role: grantRole },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      toast.success('Access granted'); setGrantFor(null); setGrantMod(''); setGrantRole(''); refresh();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  }

  async function revoke(userId, module) {
    if (!window.confirm(`Revoke ${MODULE_LABELS[module]} access?`)) return;
    try {
      await axios.delete(`${API}/module-roles/users/${userId}/revoke/${module}`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      toast.success('Revoked'); refresh();
    } catch (e) { toast.error('Failed'); }
  }

  const availableRoles = grantMod ? (catalogue.module_roles[grantMod] || []) : [];

  return (
    <div className="space-y-4" data-testid="module-access-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Module Access</h1>
          <p className="text-sm text-[#6A625E]">Grant your team members access to specific Saffron modules beyond their primary role.</p>
        </div>
      </div>

      {loading ? <p className="text-sm text-[#6A625E]">Loading...</p> : (
        <div className="space-y-2">
          {users.length === 0 && <div className="text-center py-12 bg-[#F9F6F0] rounded-xl text-sm text-[#A28B7A]">No users in your organization yet</div>}
          {users.map(u => {
            const mr = u.module_roles || {};
            return (
              <div key={u.id} className="bg-white border border-[#E8E2D9] rounded-xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[#D96C5B]/10 flex items-center justify-center"><Users size={16} className="text-[#D96C5B]" /></div>
                    <div className="min-w-0">
                      <p className="font-semibold text-[#2A2624] truncate">{u.full_name || u.email}</p>
                      <p className="text-xs text-[#6A625E] truncate">{u.email} · primary: <span className="uppercase font-medium">{u.role || '—'}</span></p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setGrantFor(u)} data-testid={`grant-access-${u.id}`}><Plus size={12} className="mr-1" /> Grant module</Button>
                </div>
                {Object.keys(mr).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 pl-12">
                    {Object.entries(mr).map(([mod, role]) => (
                      <span key={mod} className="inline-flex items-center gap-1 bg-[#F9F6F0] text-[#2A2624] text-xs px-2 py-1 rounded-md" data-testid={`access-chip-${u.id}-${mod}`}>
                        <Shield size={10} className="text-[#7D9D85]" />
                        <span className="font-medium">{MODULE_LABELS[mod] || mod}</span>
                        <span className="text-[#A28B7A]">· {role}</span>
                        <button onClick={() => revoke(u.id, mod)} className="ml-1 text-[#D96C5B] hover:bg-[#D96C5B]/10 rounded px-0.5"><X size={10} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!grantFor} onOpenChange={() => setGrantFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Grant module access — {grantFor?.full_name || grantFor?.email}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Module</Label>
              <Select value={grantMod} onValueChange={(v) => { setGrantMod(v); setGrantRole(''); }}>
                <SelectTrigger className="h-9" data-testid="grant-module-select"><SelectValue placeholder="Select a module" /></SelectTrigger>
                <SelectContent>{(catalogue.modules || []).map(m => <SelectItem key={m} value={m}>{MODULE_LABELS[m] || m}</SelectItem>)}</SelectContent>
              </Select></div>
            <div><Label className="text-xs">Role in that module</Label>
              <Select value={grantRole} onValueChange={setGrantRole} disabled={!grantMod}>
                <SelectTrigger className="h-9" data-testid="grant-role-select"><SelectValue placeholder="Select a role" /></SelectTrigger>
                <SelectContent>{availableRoles.map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
              </Select></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantFor(null)}>Cancel</Button>
            <Button onClick={grant} disabled={!grantMod || !grantRole} className="bg-[#D96C5B] hover:bg-[#C25949]" data-testid="grant-submit">Grant Access</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
