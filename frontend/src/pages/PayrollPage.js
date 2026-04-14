import React, { useEffect, useState } from 'react';
import { payslipAPI } from '../services/api';
import { CurrencyDollar, Download } from '@phosphor-icons/react';
import { toast } from 'sonner';

const PayrollPage = () => {
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPayslips();
  }, []);

  const fetchPayslips = async () => {
    try {
      const empId = 'current-employee-id'; // In real app, get from current user
      const response = await payslipAPI.getAll(empId);
      setPayslips(response.data);
    } catch (error) {
      // It's okay if there are no payslips
      setPayslips([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <div className="space-y-6" data-testid="payroll-page">
      <div>
        <h1 className="text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Payroll</h1>
        <p className="text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>View your salary and payslips</p>
      </div>

      {/* Salary Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
          <p className="text-sm text-[#6A625E] mb-1">Gross Salary</p>
          <p className="text-3xl font-semibold text-[#2A2624]">₹50,000</p>
        </div>
        <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
          <p className="text-sm text-[#6A625E] mb-1">Deductions</p>
          <p className="text-3xl font-semibold text-[#2A2624]">₹5,000</p>
        </div>
        <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
          <p className="text-sm text-[#6A625E] mb-1">Net Salary</p>
          <p className="text-3xl font-semibold text-[#2A2624]">₹45,000</p>
        </div>
      </div>

      {/* Salary Breakdown */}
      <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 lg:p-8 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
        <h3 className="text-xl font-semibold text-[#2A2624] mb-6" style={{ fontFamily: 'Outfit' }}>Salary Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-bold text-[#2A2624] mb-3 uppercase tracking-wide">Earnings</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-[#6A625E]">Basic Salary</span>
                <span className="text-[#2A2624] font-medium">₹30,000</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6A625E]">HRA</span>
                <span className="text-[#2A2624] font-medium">₹12,000</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6A625E]">DA</span>
                <span className="text-[#2A2624] font-medium">₹5,000</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6A625E]">Other Allowances</span>
                <span className="text-[#2A2624] font-medium">₹3,000</span>
              </div>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-bold text-[#2A2624] mb-3 uppercase tracking-wide">Deductions</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-[#6A625E]">PF</span>
                <span className="text-[#2A2624] font-medium">₹1,800</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6A625E]">ESI</span>
                <span className="text-[#2A2624] font-medium">₹750</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6A625E]">TDS</span>
                <span className="text-[#2A2624] font-medium">₹2,000</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6A625E]">Professional Tax</span>
                <span className="text-[#2A2624] font-medium">₹200</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payslips */}
      <div className="bg-white border border-[#E8E2D9] rounded-2xl shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
        <div className="p-6 border-b border-[#E8E2D9]">
          <h3 className="text-xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Payslip History</h3>
        </div>
        {payslips.length === 0 ? (
          <div className="p-12 text-center">
            <CurrencyDollar size={64} className="mx-auto mb-4 text-[#A28B7A] opacity-50" />
            <h3 className="text-xl font-semibold text-[#2A2624] mb-2">No Payslips Yet</h3>
            <p className="text-[#6A625E]">Your payslip history will appear here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="payslips-table">
              <thead className="bg-[#F9F6F0] border-b border-[#E8E2D9]">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Month</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Year</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Gross Salary</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Deductions</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Net Salary</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E2D9]">
                {payslips.map((payslip) => (
                  <tr key={payslip.id} className="hover:bg-[#FDFBF9] transition-colors">
                    <td className="px-6 py-4 text-[#2A2624] font-medium">{payslip.month}</td>
                    <td className="px-6 py-4 text-[#6A625E]">{payslip.year}</td>
                    <td className="px-6 py-4 text-[#6A625E]">₹{payslip.gross_salary}</td>
                    <td className="px-6 py-4 text-[#6A625E]">₹{payslip.total_deductions}</td>
                    <td className="px-6 py-4 text-[#2A2624] font-semibold">₹{payslip.net_salary}</td>
                    <td className="px-6 py-4">
                      <button className="flex items-center space-x-2 text-[#D96C5B] hover:text-[#C25949] transition-colors">
                        <Download size={18} />
                        <span className="text-sm font-medium">Download</span>
                      </button>
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

export default PayrollPage;
