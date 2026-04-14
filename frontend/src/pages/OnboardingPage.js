import React, { useEffect, useState } from 'react';
import { onboardingAPI, employeeAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle, Circle, Rocket } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Label } from '../components/ui/label';
import { Progress } from '../components/ui/progress';

var CATEGORY_COLORS = {
  documents: { bg: 'bg-[#D96C5B]/10', text: 'text-[#D96C5B]' },
  finance: { bg: 'bg-[#7D9D85]/10', text: 'text-[#7D9D85]' },
  personal: { bg: 'bg-[#E8B25C]/10', text: 'text-[#E8B25C]' },
  it: { bg: 'bg-[#A28B7A]/10', text: 'text-[#A28B7A]' },
  orientation: { bg: 'bg-[#4A5D4E]/10', text: 'text-[#4A5D4E]' },
  compliance: { bg: 'bg-[#D96C5B]/10', text: 'text-[#D96C5B]' },
};

export default function OnboardingPage() {
  var auth = useAuth();
  var isAdmin = auth.isAdmin;
  var [checklist, setChecklist] = useState(null);
  var [employees, setEmployees] = useState([]);
  var [selectedEmp, setSelectedEmp] = useState('');
  var [loading, setLoading] = useState(true);

  useEffect(function() { fetchData(); }, []);

  async function fetchData() {
    try {
      if (isAdmin) {
        var empRes = await employeeAPI.getAll();
        setEmployees(empRes.data);
        if (empRes.data.length > 0) {
          setSelectedEmp(empRes.data[0].id);
          var res = await onboardingAPI.get(empRes.data[0].id);
          setChecklist(res.data);
        }
      } else {
        var res2 = await onboardingAPI.get('current');
        setChecklist(res2.data);
      }
    } catch (err) { /* ok */ }
    setLoading(false);
  }

  async function fetchChecklist(empId) {
    try {
      var res = await onboardingAPI.get(empId);
      setChecklist(res.data);
    } catch (err) { setChecklist(null); }
  }

  function handleEmpChange(empId) {
    setSelectedEmp(empId);
    fetchChecklist(empId);
  }

  async function toggleItem(itemId, currentVal) {
    try {
      var empId = selectedEmp || 'current';
      await onboardingAPI.updateItem(empId, itemId, !currentVal);
      toast.success(!currentVal ? 'Marked complete' : 'Marked incomplete');
      fetchChecklist(empId);
    } catch (err) { toast.error('Failed to update'); }
  }

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>;

  var items = checklist?.items || [];
  var progress = checklist?.overall_progress || 0;

  return (
    <div className="space-y-6" data-testid="onboarding-page">
      <div>
        <h1 className="text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Onboarding Checklist</h1>
        <p className="text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>Track onboarding progress</p>
      </div>

      {isAdmin && (
        <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
          <Label>Select Employee</Label>
          <Select value={selectedEmp} onValueChange={handleEmpChange}>
            <SelectTrigger className="mt-2"><SelectValue placeholder="Select employee" /></SelectTrigger>
            <SelectContent>
              {employees.map(function(emp) {
                return <SelectItem key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} ({emp.employee_code})</SelectItem>;
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Progress */}
      <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Overall Progress</h3>
          <span className="text-2xl font-bold text-[#D96C5B]">{progress}%</span>
        </div>
        <Progress value={progress} className="h-3" />
        <p className="text-sm text-[#6A625E] mt-2">
          {items.filter(function(i) { return i.completed; }).length} of {items.length} tasks completed
        </p>
      </div>

      {/* Checklist Items */}
      <div className="bg-white border border-[#E8E2D9] rounded-2xl shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
        {items.length === 0 ? (
          <div className="p-12 text-center">
            <Rocket size={64} className="mx-auto mb-4 text-[#A28B7A] opacity-50" />
            <h3 className="text-xl font-semibold text-[#2A2624] mb-2">No Checklist</h3>
            <p className="text-[#6A625E]">Select an employee to view their checklist</p>
          </div>
        ) : (
          <div className="divide-y divide-[#E8E2D9]">
            {items.map(function(item) {
              var cat = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.documents;
              return (
                <div
                  key={item.id}
                  onClick={function() { toggleItem(item.id, item.completed); }}
                  className="flex items-center space-x-4 px-6 py-4 hover:bg-[#FDFBF9] cursor-pointer transition-colors"
                  data-testid={'onboarding-item-' + item.id}
                >
                  {item.completed ? (
                    <CheckCircle size={24} weight="fill" className="text-[#7D9D85] flex-shrink-0" />
                  ) : (
                    <Circle size={24} className="text-[#E8E2D9] flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className={'font-medium text-sm ' + (item.completed ? 'text-[#6A625E] line-through' : 'text-[#2A2624]')}>
                      {item.label}
                    </p>
                    {item.completed_at && (
                      <p className="text-xs text-[#A28B7A]">Completed {new Date(item.completed_at).toLocaleDateString()}</p>
                    )}
                  </div>
                  <span className={'badge text-xs px-2 py-1 rounded-full ' + cat.bg + ' ' + cat.text}>
                    {item.category}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
