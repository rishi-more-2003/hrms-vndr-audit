import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Users, ShieldCheck, Scroll, CheckSquare, ChatCircleText, Leaf,
  SignOut, House, User,
} from '@phosphor-icons/react';
import ModuleSwitcher from './ModuleSwitcher';

const MODULE_META = {
  hrms: { label: 'HRMS', icon: Users, path: '/dashboard' },
  vendor_audit: { label: 'Vendor Audit', icon: ShieldCheck, path: '/vendor-audit/dashboard' },
  register_maker: { label: 'Register Maker', icon: Scroll, path: '/register-maker/dashboard' },
  internal_audit: { label: 'Internal Audit', icon: CheckSquare, path: '/internal-audit/dashboard' },
  consultancy: { label: 'Consultancy', icon: ChatCircleText, path: '/consultancy/dashboard' },
};

export default function ModuleShell({ moduleKey, title, subtitle, children, rightActions = null, dataTestId }) {
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const cur = MODULE_META[moduleKey];

  function doLogout() { logout(); nav(`/${moduleKey.replace('_','-')}/login`); }

  return (
    <div className="min-h-screen bg-[#FDFBF9]" data-testid={dataTestId || `${moduleKey}-dashboard`}>
      {/* Topbar */}
      <header className="bg-white border-b border-[#E8E2D9] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <a href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#D96C5B] to-[#E8B25C] flex items-center justify-center"><Leaf size={14} weight="fill" color="white" /></div>
              <div className="hidden sm:block">
                <p className="text-[9px] uppercase tracking-[0.18em] text-[#A28B7A] font-bold">Saffron Services</p>
                <p className="text-sm font-bold" style={{ fontFamily: 'Outfit' }}>{cur?.label}</p>
              </div>
            </a>
            <ModuleSwitcher currentModule={moduleKey} />
          </div>
          <div className="flex items-center gap-2">
            {rightActions}
            <div className="relative">
              <button onClick={() => setMenuOpen(!menuOpen)} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-[#F9F6F0]" data-testid="user-menu-btn">
                <div className="w-8 h-8 rounded-full bg-[#D96C5B]/15 flex items-center justify-center"><User size={14} className="text-[#D96C5B]" /></div>
                <span className="hidden sm:inline text-sm text-[#2A2624]">{user?.full_name || user?.email}</span>
              </button>
              {menuOpen && (
                <div className="absolute top-full right-0 mt-1 bg-white border border-[#E8E2D9] rounded-xl shadow-xl min-w-[200px] overflow-hidden">
                  <div className="px-3 py-2 bg-[#F9F6F0] border-b border-[#E8E2D9]">
                    <p className="text-sm font-medium truncate">{user?.email}</p>
                    <p className="text-[10px] uppercase text-[#A28B7A]">{user?.role}</p>
                  </div>
                  <button onClick={() => { setMenuOpen(false); nav('/'); }} className="w-full px-3 py-2 text-sm text-left hover:bg-[#F9F6F0] flex items-center gap-2"><House size={14} /> Home</button>
                  <button onClick={doLogout} data-testid="module-logout-btn" className="w-full px-3 py-2 text-sm text-left hover:bg-[#F9F6F0] text-[#D96C5B] flex items-center gap-2"><SignOut size={14} /> Logout</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Page header */}
      {title && (
        <div className="max-w-7xl mx-auto px-6 pt-8 pb-2">
          <h1 className="text-3xl md:text-4xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>{title}</h1>
          {subtitle && <p className="text-sm text-[#6A625E] mt-1">{subtitle}</p>}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 pb-12">{children}</main>
    </div>
  );
}
