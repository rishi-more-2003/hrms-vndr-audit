import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  House, Users, ClockCounterClockwise, CalendarX,
  CurrencyDollar, Briefcase, ChartLine, SignOut,
  List, X, Buildings, Receipt, TreeStructure,
  FileText, Rocket, GearSix, ShieldCheck, Scroll, Wallet
} from '@phosphor-icons/react';
import NotificationBell from './NotificationBell';

const Layout = ({ children }) => {
  const { user, logout, isAdmin, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigation = [
    { name: 'Dashboard', path: '/dashboard', icon: House, module: 'dashboard' },
    ...(isAdmin ? [
      { name: 'Organization', path: '/organization', icon: GearSix, module: 'organization' },
      { name: 'Compliance', path: '/compliance', icon: ShieldCheck, module: 'compliance' },
      { name: 'Policies', path: '/policies', icon: Scroll, module: 'policies' },
      { name: 'Salary', path: '/salary-structure', icon: Wallet, module: 'salary' },
      { name: 'Payroll Runs', path: '/payroll-runs', icon: CurrencyDollar, module: 'payroll_runs' },
      { name: 'Employees', path: '/employees', icon: Users, module: 'employees' },
      { name: 'Departments', path: '/departments', icon: Buildings, module: 'departments' },
      { name: 'Hierarchy', path: '/hierarchy', icon: TreeStructure, module: 'hierarchy' },
    ] : []),
    { name: 'Attendance', path: '/attendance', icon: ClockCounterClockwise, module: 'attendance' },
    { name: 'Leave', path: '/leave', icon: CalendarX, module: 'leave' },
    { name: 'Payroll', path: '/payroll', icon: CurrencyDollar, module: 'payroll' },
    { name: 'Reimbursements', path: '/reimbursements', icon: Receipt, module: 'reimbursements' },
    { name: 'Documents', path: '/documents', icon: FileText, module: 'documents' },
    ...(isAdmin ? [
      { name: 'Recruitment', path: '/recruitment', icon: Briefcase, module: 'recruitment' },
    ] : (hasPermission('recruitment') ? [
      { name: 'Recruitment', path: '/recruitment', icon: Briefcase, module: 'recruitment' },
    ] : [])),
    { name: 'Performance', path: '/performance', icon: ChartLine, module: 'performance' },
    { name: 'Onboarding', path: '/onboarding', icon: Rocket, module: 'onboarding' },
  ].filter(item => isAdmin || hasPermission(item.module));

  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  const SidebarContent = ({ onNavClick }) => (
    <>
      <div className="p-6 border-b border-[#E8E2D9]">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-[#D96C5B] flex items-center justify-center">
            <span className="text-white font-bold text-lg" style={{ fontFamily: 'Outfit' }}>H</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>HRMS</h1>
            <p className="text-xs text-[#A28B7A] capitalize" style={{ fontFamily: 'Manrope' }}>
              {isAdmin ? 'Admin Panel' : 'Employee Portal'}
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => { navigate(item.path); onNavClick?.(); }}
              data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-[#D96C5B] text-white'
                  : 'text-[#6A625E] hover:bg-[#D96C5B]/10 hover:text-[#D96C5B]'
              }`}
              style={{ fontFamily: 'Manrope' }}
            >
              <Icon size={20} weight={isActive ? 'fill' : 'regular'} />
              <span className="font-medium text-sm">{item.name}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[#E8E2D9]">
        <div className="flex items-center space-x-3 px-4 py-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-[#D96C5B] flex items-center justify-center text-white font-semibold text-sm">
            {user?.full_name?.charAt(0) || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#2A2624] truncate">{user?.full_name || 'User'}</p>
            <p className="text-xs text-[#A28B7A] capitalize">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          data-testid="logout-button"
          className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-[#C65549] hover:bg-[#C65549]/10 transition-all duration-200"
        >
          <SignOut size={20} />
          <span className="font-medium text-sm">Logout</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-[#FDFBF9]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-[#FDFBF9] border-r border-[#E8E2D9] flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-[#FDFBF9] border-r border-[#E8E2D9] flex flex-col">
            <div className="absolute top-4 right-4">
              <button onClick={() => setSidebarOpen(false)} className="text-[#6A625E]"><X size={24} /></button>
            </div>
            <SidebarContent onNavClick={() => setSidebarOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-[#FDFBF9]/80 backdrop-blur-xl border-b border-[#E8E2D9] px-6 py-4 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-[#2A2624]" data-testid="mobile-menu-button">
              <List size={24} />
            </button>
            <h2 className="text-xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>
              {navigation.find(item => item.path === location.pathname)?.name || 'HRMS'}
            </h2>
            <div className="flex items-center space-x-2">
              <NotificationBell />
              {isAdmin && (
                <span className="badge badge-info text-xs px-3 py-1">Admin</span>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
};

export default Layout;
