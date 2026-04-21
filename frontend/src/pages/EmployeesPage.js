import React, { useEffect, useState } from 'react';
import { employeeAPI, departmentAPI, designationAPI, locationAPI, organizationAPI, salaryTemplateAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Plus, MagnifyingGlass, PencilSimple, GearSix, UploadSimple, DownloadSimple } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import EmployeeProfileForm from '../components/EmployeeProfileForm';

const PERMISSION_LABELS = {
  dashboard: 'Dashboard', attendance: 'Attendance', leave: 'Leave Management',
  payroll: 'Payroll / Payslips', recruitment: 'Recruitment', performance: 'Performance',
  reimbursements: 'Reimbursements', employee_directory: 'Employee Directory',
  documents: 'Documents', onboarding: 'Onboarding',
};

const EmployeesPage = () => {
  const { isAdmin } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [locations, setLocations] = useState([]);
  const [grades, setGrades] = useState([]);
  const [salaryTemplates, setSalaryTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCSV, setBulkCSV] = useState('');
  const [bulkResult, setBulkResult] = useState(null);
  const [permEmployee, setPermEmployee] = useState(null);
  const [permValues, setPermValues] = useState({});

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [emp, dept, desig, loc, org, stpl] = await Promise.all([
        employeeAPI.getAll(), departmentAPI.getAll(), designationAPI.getAll(),
        locationAPI.getAll(), organizationAPI.get(), salaryTemplateAPI.getAll(),
      ]);
      setEmployees(emp.data); setDepartments(dept.data); setDesignations(desig.data);
      setLocations(loc.data || []); setGrades((org.data && org.data.grades) || []);
      setSalaryTemplates(stpl.data || []);
    } catch { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  };

  const openProfile = (id) => { setEditingId(id); setProfileOpen(true); };
  const closeProfile = () => { setProfileOpen(false); setEditingId(null); };

  const openPermissions = (emp) => { setPermEmployee(emp); setPermValues({ ...emp.permissions }); };
  const savePermissions = async () => {
    try {
      await employeeAPI.updatePermissions(permEmployee.id, permValues);
      toast.success('Permissions updated'); setPermEmployee(null); fetchData();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed'); }
  };

  const deptName = (id) => departments.find(d => d.id === id)?.name || '-';
  const desigName = (id) => designations.find(d => d.id === id)?.title || '-';

  const filtered = employees.filter(e =>
    `${e.first_name} ${e.last_name} ${e.email} ${e.employee_code}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const downloadTemplate = async () => {
    try {
      const r = await employeeAPI.bulkUploadTemplate();
      const header = r.data.header.join(',');
      const blob = new Blob([header + '\n'], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'employees_template.csv';
      a.click(); URL.revokeObjectURL(url);
      toast.success('Template downloaded — mandatory fields: ' + r.data.mandatory.slice(0, 6).join(', ') + '…');
    } catch { toast.error('Failed'); }
  };

  const runBulkUpload = async () => {
    const lines = bulkCSV.trim().split('\n');
    if (lines.length < 2) { toast.error('Need header + at least 1 row'); return; }
    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(ln => {
      const cells = ln.split(',').map(c => c.trim());
      const o = {};
      headers.forEach((h, i) => { if (cells[i] !== undefined && cells[i] !== '') o[h] = cells[i]; });
      return o;
    });
    try {
      const r = await employeeAPI.bulkUpload(rows, true);
      setBulkResult(r.data);
      toast.success(`Uploaded: ${r.data.succeeded}/${r.data.total} (${r.data.failed} failed)`);
      fetchData();
    } catch (e) { toast.error('Upload failed'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>;

  return (
    <div className="space-y-6" data-testid="employees-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Employees</h1>
          <p className="text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>Complete employee profiles, bulk upload & permissions</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadTemplate} className="rounded-xl"><DownloadSimple size={16} className="mr-2" /> CSV Template</Button>
            <Button variant="outline" onClick={() => setBulkOpen(true)} className="rounded-xl" data-testid="bulk-upload-btn"><UploadSimple size={16} className="mr-2" /> Bulk Upload</Button>
            <Button onClick={() => openProfile(null)} className="bg-[#D96C5B] hover:bg-[#C25949] text-white rounded-xl" data-testid="add-employee-button"><Plus size={18} className="mr-2" /> Add Employee</Button>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <MagnifyingGlass size={20} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#A28B7A]" />
        <Input type="text" placeholder="Search employees..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} data-testid="search-employee-input" className="pl-12 bg-white border-[#E8E2D9] rounded-xl" />
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E8E2D9] rounded-2xl shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
        {filtered.length === 0 ? (
          <div className="p-12 text-center"><h3 className="text-xl font-semibold text-[#2A2624] mb-2">No Employees Found</h3><p className="text-[#6A625E]">Add your first employee to get started</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="employees-table">
              <thead className="bg-[#F9F6F0] border-b border-[#E8E2D9]"><tr>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide">Employee</th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide">Code</th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide">Department</th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide">Designation</th>
                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide">Status</th>
                {isAdmin && <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wide">Actions</th>}
              </tr></thead>
              <tbody className="divide-y divide-[#E8E2D9]">
                {filtered.map(emp => (
                  <tr key={emp.id} className="hover:bg-[#FDFBF9]">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-[#D96C5B] flex items-center justify-center text-white font-semibold text-sm">{(emp.first_name||' ').charAt(0)}{(emp.last_name||' ').charAt(0)}</div>
                        <div><p className="font-medium text-[#2A2624] text-sm">{emp.first_name} {emp.last_name}</p><p className="text-xs text-[#6A625E]">{emp.email}</p></div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-[#6A625E] text-sm">{emp.employee_code}</td>
                    <td className="px-6 py-4 text-[#6A625E] text-sm">{deptName(emp.department_id)}</td>
                    <td className="px-6 py-4 text-[#6A625E] text-sm">{desigName(emp.designation_id)}</td>
                    <td className="px-6 py-4"><span className={`badge ${emp.status === 'active' ? 'badge-success' : 'badge-warning'}`}>{emp.status}</span></td>
                    {isAdmin && (
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <button onClick={() => openProfile(emp.id)} className="flex items-center gap-1 text-[#7D9D85] hover:text-[#5F7E68] text-xs font-medium" data-testid={`edit-${emp.employee_code}`}><PencilSimple size={14} /> Profile</button>
                          <button onClick={() => openPermissions(emp)} className="flex items-center gap-1 text-[#D96C5B] hover:text-[#C25949] text-xs font-medium" data-testid={`manage-permissions-${emp.employee_code}`}><GearSix size={14} /> Permissions</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Profile Dialog */}
      <Dialog open={profileOpen} onOpenChange={(o) => !o && closeProfile()}>
        <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Edit Employee Profile' : 'New Employee'}</DialogTitle></DialogHeader>
          {profileOpen && (
            <EmployeeProfileForm
              employeeId={editingId}
              allEmployees={employees}
              departments={departments}
              designations={designations}
              locations={locations}
              grades={grades}
              salaryTemplates={salaryTemplates}
              onClose={closeProfile}
              onSaved={() => { closeProfile(); fetchData(); }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Upload Dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Bulk Upload Employees (CSV)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-[#A28B7A]">1. Download the CSV template → 2. Fill rows → 3. Paste content below → 4. Run upload. The first line must be headers.</p>
            <Button variant="outline" size="sm" onClick={downloadTemplate}><DownloadSimple size={14} className="mr-1" /> Download Template</Button>
            <Label className="text-xs">CSV content</Label>
            <textarea value={bulkCSV} onChange={(e) => setBulkCSV(e.target.value)} rows={12} className="w-full border rounded-lg p-2 text-xs font-mono" placeholder="employee_code,first_name,last_name,email,..." data-testid="bulk-csv-input" />
            <Button onClick={runBulkUpload} className="bg-[#D96C5B] hover:bg-[#C25949] w-full" data-testid="run-bulk-upload"><UploadSimple size={14} className="mr-1" /> Run Upload</Button>
            {bulkResult && (
              <div className="bg-[#F9F6F0] rounded-lg p-3 text-xs">
                <p className="font-semibold mb-1">Total: {bulkResult.total} | Succeeded: <span className="text-[#7D9D85]">{bulkResult.succeeded}</span> | Failed: <span className="text-[#C65549]">{bulkResult.failed}</span></p>
                <div className="max-h-40 overflow-y-auto">
                  {(bulkResult.results || []).map((r, i) => (
                    <div key={i} className={`py-1 ${r.success ? 'text-[#7D9D85]' : 'text-[#C65549]'}`}>Row {r.row + 1}: {r.success ? '✓ ' + r.employee_code : '✗ ' + r.error}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog open={!!permEmployee} onOpenChange={() => setPermEmployee(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Manage Permissions — {permEmployee?.first_name} {permEmployee?.last_name}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between py-1.5 border-b border-[#E8E2D9] last:border-0">
                <span className="text-sm">{label}</span>
                <Switch checked={permValues[key] ?? true} onCheckedChange={(v) => setPermValues({...permValues, [key]: v})} data-testid={`permission-toggle-${key}`} />
              </div>
            ))}
            <Button onClick={savePermissions} className="w-full bg-[#D96C5B] hover:bg-[#C25949] mt-3" data-testid="save-permissions-button">Save Permissions</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmployeesPage;
