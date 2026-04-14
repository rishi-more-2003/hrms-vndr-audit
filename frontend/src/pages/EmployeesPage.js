import React, { useEffect, useState } from 'react';
import { employeeAPI, departmentAPI, designationAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Plus, MagnifyingGlass, PencilSimple, Eye, ShieldCheck, GearSix } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';

const PERMISSION_LABELS = {
  dashboard: 'Dashboard',
  attendance: 'Attendance',
  leave: 'Leave Management',
  payroll: 'Payroll / Payslips',
  recruitment: 'Recruitment',
  performance: 'Performance',
  reimbursements: 'Reimbursements',
  employee_directory: 'Employee Directory',
  documents: 'Documents',
  onboarding: 'Onboarding'
};

const EmployeesPage = () => {
  const { isAdmin } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [permEmployee, setPermEmployee] = useState(null);
  const [permValues, setPermValues] = useState({});
  const [formData, setFormData] = useState({
    employee_code: '', first_name: '', last_name: '', email: '',
    phone: '', date_of_birth: '', gender: 'male', address: '',
    department_id: '', designation_id: '', date_of_joining: '',
    reports_to: '', employment_type: 'full-time', password: 'changeme123'
  });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [empRes, deptRes, desigRes] = await Promise.all([
        employeeAPI.getAll(), departmentAPI.getAll(), designationAPI.getAll()
      ]);
      setEmployees(empRes.data);
      setDepartments(deptRes.data);
      setDesignations(desigRes.data);
    } catch { toast.error('Failed to fetch data'); }
    finally { setLoading(false); }
  };

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    try {
      await employeeAPI.create(formData);
      toast.success('Employee added');
      setIsAddOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add');
    }
  };

  const openPermissions = (emp) => {
    setPermEmployee(emp);
    setPermValues({ ...emp.permissions });
  };

  const savePermissions = async () => {
    try {
      await employeeAPI.updatePermissions(permEmployee.id, permValues);
      toast.success('Permissions updated');
      setPermEmployee(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update permissions');
    }
  };

  const deptName = (id) => departments.find(d => d.id === id)?.name || '-';
  const desigName = (id) => designations.find(d => d.id === id)?.title || '-';

  const filtered = employees.filter(emp =>
    `${emp.first_name} ${emp.last_name} ${emp.email} ${emp.employee_code}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>;

  return (
    <div className="space-y-6" data-testid="employees-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Employees</h1>
          <p className="text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>Manage workforce and permissions</p>
        </div>
        {isAdmin && (
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button data-testid="add-employee-button" className="bg-[#D96C5B] hover:bg-[#C25949] text-white rounded-xl">
                <Plus size={20} className="mr-2" /> Add Employee
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Add New Employee</DialogTitle></DialogHeader>
              <form onSubmit={handleAddEmployee} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Employee Code</Label><Input value={formData.employee_code} onChange={(e) => setFormData({...formData, employee_code: e.target.value})} required /></div>
                  <div><Label>Email</Label><Input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} required /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>First Name</Label><Input value={formData.first_name} onChange={(e) => setFormData({...formData, first_name: e.target.value})} required /></div>
                  <div><Label>Last Name</Label><Input value={formData.last_name} onChange={(e) => setFormData({...formData, last_name: e.target.value})} required /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Phone</Label><Input value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} required /></div>
                  <div><Label>Date of Birth</Label><Input type="date" value={formData.date_of_birth} onChange={(e) => setFormData({...formData, date_of_birth: e.target.value})} required /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Gender</Label>
                    <Select value={formData.gender} onValueChange={(v) => setFormData({...formData, gender: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Date of Joining</Label><Input type="date" value={formData.date_of_joining} onChange={(e) => setFormData({...formData, date_of_joining: e.target.value})} required /></div>
                </div>
                <div><Label>Address</Label><Input value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} required /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Department</Label>
                    <Select value={formData.department_id} onValueChange={(v) => setFormData({...formData, department_id: v})}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Designation</Label>
                    <Select value={formData.designation_id} onValueChange={(v) => setFormData({...formData, designation_id: v})}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{designations.map(d => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Reports To</Label>
                    <Select value={formData.reports_to} onValueChange={(v) => setFormData({...formData, reports_to: v})}>
                      <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Manager</SelectItem>
                        {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Employment Type</Label>
                    <Select value={formData.employment_type} onValueChange={(v) => setFormData({...formData, employment_type: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full-time">Full Time</SelectItem>
                        <SelectItem value="part-time">Part Time</SelectItem>
                        <SelectItem value="contract">Contract</SelectItem>
                        <SelectItem value="intern">Intern</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Initial Password</Label><Input value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} required /></div>
                <Button type="submit" className="w-full bg-[#D96C5B] hover:bg-[#C25949]">Add Employee</Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <MagnifyingGlass size={20} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#A28B7A]" />
        <Input type="text" placeholder="Search employees..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} data-testid="search-employee-input" className="pl-12 bg-white border-[#E8E2D9] rounded-xl" />
      </div>

      {/* Employees Table */}
      <div className="bg-white border border-[#E8E2D9] rounded-2xl shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <img src="https://static.prod-images.emergentagent.com/jobs/38ca0ccc-3744-43d1-894a-950737bb637c/images/5de2358c1a56adc9db563ce14b83d67ad1c9fae255c5a3d3c84fbb215b362e23.png" alt="Empty" className="w-32 h-32 mx-auto mb-6 opacity-60" />
            <h3 className="text-xl font-semibold text-[#2A2624] mb-2">No Employees Found</h3>
            <p className="text-[#6A625E]">Add your first employee to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="employees-table">
              <thead className="bg-[#F9F6F0] border-b border-[#E8E2D9]">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Employee</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Code</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Department</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Designation</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Status</th>
                  {isAdmin && <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Permissions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E2D9]">
                {filtered.map((emp) => (
                  <tr key={emp.id} className="hover:bg-[#FDFBF9] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-[#D96C5B] flex items-center justify-center text-white font-semibold text-sm">
                          {emp.first_name.charAt(0)}{emp.last_name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-[#2A2624] text-sm">{emp.first_name} {emp.last_name}</p>
                          <p className="text-xs text-[#6A625E]">{emp.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-[#6A625E] text-sm">{emp.employee_code}</td>
                    <td className="px-6 py-4 text-[#6A625E] text-sm">{deptName(emp.department_id)}</td>
                    <td className="px-6 py-4 text-[#6A625E] text-sm">{desigName(emp.designation_id)}</td>
                    <td className="px-6 py-4">
                      <span className={`badge ${emp.status === 'active' ? 'badge-success' : 'badge-danger'}`}>{emp.status}</span>
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4">
                        <button
                          onClick={() => openPermissions(emp)}
                          data-testid={`manage-permissions-${emp.employee_code}`}
                          className="flex items-center space-x-1 text-[#D96C5B] hover:text-[#C25949] text-sm font-medium transition-colors"
                        >
                          <GearSix size={16} />
                          <span>Manage</span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Permissions Dialog */}
      <Dialog open={!!permEmployee} onOpenChange={() => setPermEmployee(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Manage Permissions - {permEmployee?.first_name} {permEmployee?.last_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-[#6A625E]">Toggle module access for this employee</p>
            {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between py-2 border-b border-[#E8E2D9] last:border-0">
                <span className="text-sm font-medium text-[#2A2624]">{label}</span>
                <Switch
                  checked={permValues[key] ?? true}
                  onCheckedChange={(checked) => setPermValues({...permValues, [key]: checked})}
                  data-testid={`permission-toggle-${key}`}
                />
              </div>
            ))}
            <Button onClick={savePermissions} className="w-full bg-[#D96C5B] hover:bg-[#C25949]" data-testid="save-permissions-button">
              Save Permissions
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmployeesPage;
