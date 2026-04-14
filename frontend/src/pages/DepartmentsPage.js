import React, { useEffect, useState } from 'react';
import { departmentAPI, designationAPI } from '../services/api';
import { Plus, Buildings } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';

const DepartmentsPage = () => {
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDeptDialogOpen, setIsDeptDialogOpen] = useState(false);
  const [isDesigDialogOpen, setIsDesigDialogOpen] = useState(false);
  const [deptForm, setDeptForm] = useState({ name: '', description: '' });
  const [desigForm, setDesigForm] = useState({ title: '', description: '', level: 1 });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [deptRes, desigRes] = await Promise.all([
        departmentAPI.getAll(),
        designationAPI.getAll()
      ]);
      setDepartments(deptRes.data);
      setDesignations(desigRes.data);
    } catch (error) {
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleDeptSubmit = async (e) => {
    e.preventDefault();
    try {
      await departmentAPI.create(deptForm);
      toast.success('Department created successfully');
      setIsDeptDialogOpen(false);
      fetchData();
      setDeptForm({ name: '', description: '' });
    } catch (error) {
      toast.error('Failed to create department');
    }
  };

  const handleDesigSubmit = async (e) => {
    e.preventDefault();
    try {
      await designationAPI.create(desigForm);
      toast.success('Designation created successfully');
      setIsDesigDialogOpen(false);
      fetchData();
      setDesigForm({ title: '', description: '', level: 1 });
    } catch (error) {
      toast.error('Failed to create designation');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6" data-testid="departments-page">
      <div>
        <h1 className="text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Departments & Designations</h1>
        <p className="text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>Manage organizational structure</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Departments */}
        <div className="bg-white border border-[#E8E2D9] rounded-2xl shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
          <div className="p-6 border-b border-[#E8E2D9] flex items-center justify-between">
            <h3 className="text-xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Departments</h3>
            <Dialog open={isDeptDialogOpen} onOpenChange={setIsDeptDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="add-department-button" size="sm" className="bg-[#D96C5B] hover:bg-[#C25949] text-white rounded-xl">
                  <Plus size={16} className="mr-2" /> Add
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Department</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleDeptSubmit} className="space-y-4">
                  <div>
                    <Label>Department Name</Label>
                    <Input
                      value={deptForm.name}
                      onChange={(e) => setDeptForm({...deptForm, name: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea
                      value={deptForm.description}
                      onChange={(e) => setDeptForm({...deptForm, description: e.target.value})}
                    />
                  </div>
                  <Button type="submit" className="w-full bg-[#D96C5B] hover:bg-[#C25949]">Add Department</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="p-6 space-y-3">
            {departments.length === 0 ? (
              <div className="text-center py-8">
                <Buildings size={48} className="mx-auto mb-2 text-[#A28B7A] opacity-50" />
                <p className="text-[#6A625E]">No departments yet</p>
              </div>
            ) : (
              departments.map((dept) => (
                <div key={dept.id} className="p-4 border border-[#E8E2D9] rounded-xl hover:border-[#D96C5B] transition-colors">
                  <h4 className="font-semibold text-[#2A2624] mb-1">{dept.name}</h4>
                  {dept.description && <p className="text-sm text-[#6A625E]">{dept.description}</p>}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Designations */}
        <div className="bg-white border border-[#E8E2D9] rounded-2xl shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
          <div className="p-6 border-b border-[#E8E2D9] flex items-center justify-between">
            <h3 className="text-xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Designations</h3>
            <Dialog open={isDesigDialogOpen} onOpenChange={setIsDesigDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="add-designation-button" size="sm" className="bg-[#D96C5B] hover:bg-[#C25949] text-white rounded-xl">
                  <Plus size={16} className="mr-2" /> Add
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Designation</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleDesigSubmit} className="space-y-4">
                  <div>
                    <Label>Designation Title</Label>
                    <Input
                      value={desigForm.title}
                      onChange={(e) => setDesigForm({...desigForm, title: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea
                      value={desigForm.description}
                      onChange={(e) => setDesigForm({...desigForm, description: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Level</Label>
                    <Input
                      type="number"
                      value={desigForm.level}
                      onChange={(e) => setDesigForm({...desigForm, level: parseInt(e.target.value)})}
                      min="1"
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full bg-[#D96C5B] hover:bg-[#C25949]">Add Designation</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="p-6 space-y-3">
            {designations.length === 0 ? (
              <div className="text-center py-8">
                <Buildings size={48} className="mx-auto mb-2 text-[#A28B7A] opacity-50" />
                <p className="text-[#6A625E]">No designations yet</p>
              </div>
            ) : (
              designations.map((desig) => (
                <div key={desig.id} className="p-4 border border-[#E8E2D9] rounded-xl hover:border-[#D96C5B] transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-semibold text-[#2A2624]">{desig.title}</h4>
                    <span className="badge badge-info">Level {desig.level}</span>
                  </div>
                  {desig.description && <p className="text-sm text-[#6A625E]">{desig.description}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DepartmentsPage;
