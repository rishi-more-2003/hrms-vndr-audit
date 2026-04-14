import React, { useEffect, useState } from 'react';
import { taxAPI, payslipAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { CurrencyDollar, Download, Calculator } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export default function PayrollPage() {
  var auth = useAuth();
  var isAdmin = auth.isAdmin;
  var [payslips, setPayslips] = useState([]);
  var [loading, setLoading] = useState(true);
  var [calcOpen, setCalcOpen] = useState(false);
  var [calcForm, setCalcForm] = useState({ basic: 30000, hra: 12000, da: 5000, other: 3000 });
  var [taxResult, setTaxResult] = useState(null);

  useEffect(function() { setLoading(false); }, []);

  async function handleCalculate() {
    try {
      var res = await taxAPI.calculate(calcForm.basic, calcForm.hra, calcForm.da, calcForm.other);
      setTaxResult(res.data);
    } catch (err) { toast.error('Calculation failed'); }
  }

  var fmt = function(n) { return '\u20B9' + Number(n || 0).toLocaleString('en-IN'); };

  return (
    <div className="space-y-6" data-testid="payroll-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Payroll</h1>
          <p className="text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>Indian tax compliance salary calculator</p>
        </div>
        <Dialog open={calcOpen} onOpenChange={setCalcOpen}>
          <DialogTrigger asChild>
            <Button data-testid="salary-calculator-button" className="bg-[#D96C5B] hover:bg-[#C25949] text-white rounded-xl">
              <Calculator size={20} className="mr-2" /> Salary Calculator
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Indian Tax Salary Calculator</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Basic Salary (Monthly)</Label><Input type="number" value={calcForm.basic} onChange={function(e) { setCalcForm({...calcForm, basic: parseFloat(e.target.value) || 0}); }} /></div>
                <div><Label>HRA (Monthly)</Label><Input type="number" value={calcForm.hra} onChange={function(e) { setCalcForm({...calcForm, hra: parseFloat(e.target.value) || 0}); }} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>DA (Monthly)</Label><Input type="number" value={calcForm.da} onChange={function(e) { setCalcForm({...calcForm, da: parseFloat(e.target.value) || 0}); }} /></div>
                <div><Label>Other Allowances</Label><Input type="number" value={calcForm.other} onChange={function(e) { setCalcForm({...calcForm, other: parseFloat(e.target.value) || 0}); }} /></div>
              </div>
              <Button onClick={handleCalculate} className="w-full bg-[#D96C5B] hover:bg-[#C25949]">Calculate</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tax Calculation Result */}
      {taxResult && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
            <p className="text-sm text-[#6A625E] mb-1">Gross Salary (Monthly)</p>
            <p className="text-3xl font-semibold text-[#2A2624]">{fmt(taxResult.earnings.gross_salary)}</p>
            <p className="text-xs text-[#A28B7A] mt-1">Annual: {fmt(taxResult.earnings.gross_annual)}</p>
          </div>
          <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
            <p className="text-sm text-[#6A625E] mb-1">Net Salary (Monthly)</p>
            <p className="text-3xl font-semibold text-[#7D9D85]">{fmt(taxResult.net_salary)}</p>
            <p className="text-xs text-[#A28B7A] mt-1">Deductions: {fmt(taxResult.deductions.total_deductions)}</p>
          </div>
          <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
            <p className="text-sm text-[#6A625E] mb-1">CTC (Annual)</p>
            <p className="text-3xl font-semibold text-[#D96C5B]">{fmt(taxResult.ctc_annual)}</p>
            <p className="text-xs text-[#A28B7A] mt-1">Monthly: {fmt(taxResult.ctc_monthly)}</p>
          </div>
        </div>
      )}

      {/* Detailed Breakdown */}
      {taxResult && (
        <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 lg:p-8 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
          <h3 className="text-xl font-semibold text-[#2A2624] mb-6" style={{ fontFamily: 'Outfit' }}>Salary Breakdown (Indian Compliance)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h4 className="text-xs font-bold text-[#2A2624] mb-3 uppercase tracking-[0.2em]">Earnings</h4>
              <div className="space-y-3">
                <div className="flex justify-between"><span className="text-[#6A625E] text-sm">Basic Salary</span><span className="text-[#2A2624] font-medium text-sm">{fmt(taxResult.earnings.basic_salary)}</span></div>
                <div className="flex justify-between"><span className="text-[#6A625E] text-sm">HRA</span><span className="text-[#2A2624] font-medium text-sm">{fmt(taxResult.earnings.hra)}</span></div>
                <div className="flex justify-between"><span className="text-[#6A625E] text-sm">DA</span><span className="text-[#2A2624] font-medium text-sm">{fmt(taxResult.earnings.da)}</span></div>
                <div className="flex justify-between"><span className="text-[#6A625E] text-sm">Other Allowances</span><span className="text-[#2A2624] font-medium text-sm">{fmt(taxResult.earnings.other_allowances)}</span></div>
                <div className="flex justify-between pt-2 border-t border-[#E8E2D9]"><span className="text-[#2A2624] font-semibold text-sm">Gross Salary</span><span className="text-[#2A2624] font-bold text-sm">{fmt(taxResult.earnings.gross_salary)}</span></div>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#2A2624] mb-3 uppercase tracking-[0.2em]">Deductions</h4>
              <div className="space-y-3">
                <div className="flex justify-between"><span className="text-[#6A625E] text-sm">PF (Employee 12%)</span><span className="text-[#2A2624] font-medium text-sm">{fmt(taxResult.deductions.pf_employee)}</span></div>
                {taxResult.deductions.esic_applicable && (
                  <div className="flex justify-between"><span className="text-[#6A625E] text-sm">ESIC (Employee 0.75%)</span><span className="text-[#2A2624] font-medium text-sm">{fmt(taxResult.deductions.esic_employee)}</span></div>
                )}
                <div className="flex justify-between"><span className="text-[#6A625E] text-sm">Professional Tax</span><span className="text-[#2A2624] font-medium text-sm">{fmt(taxResult.deductions.professional_tax)}</span></div>
                <div className="flex justify-between"><span className="text-[#6A625E] text-sm">TDS (Monthly)</span><span className="text-[#2A2624] font-medium text-sm">{fmt(taxResult.deductions.tds_monthly)}</span></div>
                <div className="flex justify-between pt-2 border-t border-[#E8E2D9]"><span className="text-[#2A2624] font-semibold text-sm">Total Deductions</span><span className="text-[#C65549] font-bold text-sm">{fmt(taxResult.deductions.total_deductions)}</span></div>
              </div>
              <div className="mt-4 p-3 bg-[#7D9D85]/10 rounded-xl">
                <h5 className="text-xs font-bold text-[#4A5D4E] mb-2">Employer Contributions</h5>
                <div className="flex justify-between"><span className="text-[#6A625E] text-xs">PF (Employer 12%)</span><span className="text-[#4A5D4E] font-medium text-xs">{fmt(taxResult.deductions.pf_employer)}</span></div>
                {taxResult.deductions.esic_applicable && (
                  <div className="flex justify-between mt-1"><span className="text-[#6A625E] text-xs">ESIC (Employer 3.25%)</span><span className="text-[#4A5D4E] font-medium text-xs">{fmt(taxResult.deductions.esic_employer)}</span></div>
                )}
              </div>
            </div>
          </div>
          <div className="mt-6 p-4 bg-[#D96C5B]/5 border border-[#D96C5B]/20 rounded-xl flex items-center justify-between">
            <span className="text-[#2A2624] font-semibold">Net Take-Home (Monthly)</span>
            <span className="text-2xl font-bold text-[#D96C5B]">{fmt(taxResult.net_salary)}</span>
          </div>
          <p className="mt-3 text-xs text-[#A28B7A]">* Calculated as per New Tax Regime 2024-25. Standard deduction of ₹75,000 applied.</p>
        </div>
      )}

      {/* Prompt if no calculation */}
      {!taxResult && (
        <div className="bg-white border border-[#E8E2D9] rounded-2xl p-12 text-center shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
          <CurrencyDollar size={64} className="mx-auto mb-4 text-[#A28B7A] opacity-50" />
          <h3 className="text-xl font-semibold text-[#2A2624] mb-2">Salary Calculator</h3>
          <p className="text-[#6A625E]">Click the calculator button to compute salary with Indian tax compliance (PF, ESIC, TDS, PT)</p>
        </div>
      )}
    </div>
  );
}
