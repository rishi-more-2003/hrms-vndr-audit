import React, { useEffect, useState } from 'react';
import { hierarchyAPI, employeeAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { TreeStructure } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';

function flattenHierarchy(nodes, depth, result) {
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    result.push({ ...n, depth: depth });
    if (n.subordinates && n.subordinates.length > 0) {
      flattenHierarchy(n.subordinates, depth + 1, result);
    }
  }
  return result;
}

export default function HierarchyPage() {
  var auth = useAuth();
  var isAdmin = auth.isAdmin;
  var stateHierarchy = useState([]);
  var hierarchy = stateHierarchy[0];
  var setHierarchy = stateHierarchy[1];
  var stateEmployees = useState([]);
  var employees = stateEmployees[0];
  var setEmployees = stateEmployees[1];
  var stateLoading = useState(true);
  var loading = stateLoading[0];
  var setLoading = stateLoading[1];
  var stateDialog = useState(false);
  var isDialogOpen = stateDialog[0];
  var setIsDialogOpen = stateDialog[1];
  var stateSelEmp = useState('');
  var selectedEmployee = stateSelEmp[0];
  var setSelectedEmployee = stateSelEmp[1];
  var stateSelMgr = useState('');
  var selectedManager = stateSelMgr[0];
  var setSelectedManager = stateSelMgr[1];

  useEffect(function() {
    fetchData();
  }, []);

  function fetchData() {
    Promise.all([hierarchyAPI.get(), employeeAPI.getAll()])
      .then(function(results) {
        setHierarchy(results[0].data);
        setEmployees(results[1].data);
      })
      .catch(function() { toast.error('Failed to fetch hierarchy'); })
      .finally(function() { setLoading(false); });
  }

  function handleAssign() {
    if (!selectedEmployee) return;
    var mgr = selectedManager === 'none' ? null : selectedManager;
    employeeAPI.updateReportsTo(selectedEmployee, mgr)
      .then(function() {
        toast.success('Hierarchy updated');
        setIsDialogOpen(false);
        setSelectedEmployee('');
        setSelectedManager('');
        fetchData();
      })
      .catch(function(error) {
        toast.error((error.response && error.response.data && error.response.data.detail) || 'Failed to update');
      });
  }

  if (loading) {
    return React.createElement('div', { className: 'flex items-center justify-center h-64' }, 'Loading...');
  }

  var flatNodes = flattenHierarchy(hierarchy, 0, []);

  return (
    <div className="space-y-6" data-testid="hierarchy-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Organization Hierarchy</h1>
          <p className="text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>Approval chain and reporting structure</p>
        </div>
        {isAdmin && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="assign-hierarchy-button" className="bg-[#D96C5B] hover:bg-[#C25949] text-white rounded-xl">
                <TreeStructure size={20} className="mr-2" /> Assign Reporting
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign Reporting Manager</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Employee</Label>
                  <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                    <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                    <SelectContent>
                      {employees.map(function(emp) {
                        return (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.first_name + ' ' + emp.last_name + ' (' + emp.employee_code + ')'}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Reports To</Label>
                  <Select value={selectedManager} onValueChange={setSelectedManager}>
                    <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Manager (Top Level)</SelectItem>
                      {employees.filter(function(e) { return e.id !== selectedEmployee; }).map(function(emp) {
                        return (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.first_name + ' ' + emp.last_name + ' (' + emp.employee_code + ')'}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleAssign} className="w-full bg-[#D96C5B] hover:bg-[#C25949]">
                  Update Hierarchy
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 lg:p-8 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
        {flatNodes.length === 0 ? (
          <div className="text-center py-12">
            <TreeStructure size={64} className="mx-auto mb-4 text-[#A28B7A] opacity-50" />
            <h3 className="text-xl font-semibold text-[#2A2624] mb-2">No Hierarchy Set</h3>
            <p className="text-[#6A625E]">Assign reporting managers to build the hierarchy</p>
          </div>
        ) : (
          <div className="space-y-2">
            {flatNodes.map(function(node) {
              var ml = node.depth * 40;
              return (
                <div
                  key={node.id}
                  style={{ marginLeft: ml }}
                  className="flex items-center space-x-3 px-4 py-3 border border-[#E8E2D9] rounded-xl bg-white hover:border-[#D96C5B] transition-colors"
                  data-testid={'hierarchy-node-' + node.employee_code}
                >
                  {node.depth > 0 && (
                    <div className="w-4 h-4 border-l-2 border-b-2 border-[#E8E2D9] flex-shrink-0" />
                  )}
                  <div className="w-10 h-10 rounded-full bg-[#D96C5B] flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                    {(node.first_name || '').charAt(0)}{(node.last_name || '').charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[#2A2624] text-sm">{node.first_name} {node.last_name}</p>
                    <p className="text-xs text-[#6A625E]">{node.designation} - {node.department}</p>
                  </div>
                  <span className="badge badge-info text-xs">{node.employee_code}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-[#7D9D85]/10 border border-[#7D9D85]/20 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-[#2A2624] mb-3" style={{ fontFamily: 'Outfit' }}>How Approvals Work</h3>
        <ul className="space-y-2 text-sm text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>
          <li className="flex items-start space-x-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#7D9D85] mt-2 flex-shrink-0" />
            <span>Leave requests go to the direct reporting manager for approval.</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#7D9D85] mt-2 flex-shrink-0" />
            <span>Reimbursement claims follow the same approval chain.</span>
          </li>
          <li className="flex items-start space-x-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#7D9D85] mt-2 flex-shrink-0" />
            <span>Admin can approve or reject any request regardless of hierarchy.</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
