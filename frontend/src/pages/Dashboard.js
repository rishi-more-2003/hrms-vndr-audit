import React, { useEffect, useState } from 'react';
import { dashboardAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Users, Buildings, CalendarX, Briefcase, ClockCounterClockwise, ChartLineUp, Receipt } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
  const { isAdmin, hasPermission, user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    try {
      const response = await dashboardAPI.getStats();
      setStats(response.data);
    } catch { toast.error('Failed to fetch stats'); }
    finally { setLoading(false); }
  };

  const adminCards = [
    { title: 'Total Employees', value: stats?.total_employees || 0, icon: Users, color: '#D96C5B', bg: 'rgba(217,108,91,0.1)', path: '/employees' },
    { title: 'Departments', value: stats?.total_departments || 0, icon: Buildings, color: '#7D9D85', bg: 'rgba(125,157,133,0.1)', path: '/departments' },
    { title: 'Pending Leaves', value: stats?.pending_leaves || 0, icon: CalendarX, color: '#E8B25C', bg: 'rgba(232,178,92,0.1)', path: '/leave' },
    { title: 'Pending Reimbursements', value: stats?.pending_reimbursements || 0, icon: Receipt, color: '#A28B7A', bg: 'rgba(162,139,122,0.1)', path: '/reimbursements' },
    { title: 'Active Jobs', value: stats?.active_jobs || 0, icon: Briefcase, color: '#7D9D85', bg: 'rgba(125,157,133,0.1)', path: '/recruitment' },
    { title: 'Present Today', value: stats?.present_today || 0, icon: ClockCounterClockwise, color: '#D96C5B', bg: 'rgba(217,108,91,0.1)', path: '/attendance' },
  ];

  const employeeCards = [
    ...(hasPermission('attendance') ? [{ title: 'Attendance', value: 'Track', icon: ClockCounterClockwise, color: '#D96C5B', bg: 'rgba(217,108,91,0.1)', path: '/attendance' }] : []),
    ...(hasPermission('leave') ? [{ title: 'Leave', value: 'Apply', icon: CalendarX, color: '#E8B25C', bg: 'rgba(232,178,92,0.1)', path: '/leave' }] : []),
    ...(hasPermission('payroll') ? [{ title: 'Payroll', value: 'View', icon: ChartLineUp, color: '#7D9D85', bg: 'rgba(125,157,133,0.1)', path: '/payroll' }] : []),
    ...(hasPermission('reimbursements') ? [{ title: 'Reimbursements', value: 'Claim', icon: Receipt, color: '#A28B7A', bg: 'rgba(162,139,122,0.1)', path: '/reimbursements' }] : []),
    ...(hasPermission('performance') ? [{ title: 'Performance', value: 'Goals', icon: ChartLineUp, color: '#D96C5B', bg: 'rgba(217,108,91,0.1)', path: '/performance' }] : []),
  ];

  const cards = isAdmin ? adminCards : employeeCards;

  if (loading) return <div className="flex items-center justify-center h-64">Loading dashboard...</div>;

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      <div>
        <h1 className="text-4xl font-semibold text-[#2A2624] mb-2" style={{ fontFamily: 'Outfit' }}>
          {isAdmin ? 'Admin Dashboard' : `Welcome, ${user?.full_name?.split(' ')[0]}`}
        </h1>
        <p className="text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>
          {isAdmin ? 'Full overview of your organization' : 'Your personal workspace'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div
              key={i}
              onClick={() => navigate(card.path)}
              data-testid={`stat-card-${card.title.toLowerCase().replace(/\s+/g, '-')}`}
              className="bg-white border border-[#E8E2D9] rounded-2xl p-6 lg:p-8 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)] hover:shadow-[0_8px_30px_-4px_rgba(42,38,36,0.1)] transition-all duration-300 hover:-translate-y-1 cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-[#6A625E] mb-2" style={{ fontFamily: 'Manrope' }}>{card.title}</p>
                  <h3 className="text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>{card.value}</h3>
                </div>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: card.bg }}>
                  <Icon size={24} weight="duotone" style={{ color: card.color }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isAdmin && (
        <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 lg:p-8 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
          <h3 className="text-xl font-semibold text-[#2A2624] mb-6" style={{ fontFamily: 'Outfit' }}>Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Add Employee', icon: Users, path: '/employees' },
              { label: 'View Hierarchy', icon: Buildings, path: '/hierarchy' },
              { label: 'Review Leaves', icon: CalendarX, path: '/leave' },
              { label: 'Review Claims', icon: Receipt, path: '/reimbursements' },
            ].map((action, i) => {
              const Icon = action.icon;
              return (
                <button
                  key={i}
                  onClick={() => navigate(action.path)}
                  data-testid={`quick-action-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
                  className="flex items-center space-x-3 p-4 border border-[#E8E2D9] rounded-xl hover:border-[#D96C5B] hover:bg-[#D96C5B]/5 transition-all duration-200"
                >
                  <Icon size={20} className="text-[#D96C5B]" />
                  <span className="text-[#2A2624] font-medium text-sm">{action.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isAdmin && cards.length === 0 && (
        <div className="bg-white border border-[#E8E2D9] rounded-2xl p-12 text-center shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
          <img src="https://static.prod-images.emergentagent.com/jobs/38ca0ccc-3744-43d1-894a-950737bb637c/images/77ab1fb42c3c0cc76676d6d1dcfd40753b0fa964f24c75ef05b44d912b162033.png" alt="Empty" className="w-32 h-32 mx-auto mb-6 opacity-60" />
          <h3 className="text-xl font-semibold text-[#2A2624] mb-2">No Modules Available</h3>
          <p className="text-[#6A625E]">Contact your admin to get access to HRMS modules</p>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
