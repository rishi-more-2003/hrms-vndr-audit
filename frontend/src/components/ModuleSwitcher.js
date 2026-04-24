import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  Users, ShieldCheck, Scroll, CheckSquare, ChatCircleText, CaretDown,
} from '@phosphor-icons/react';

const MODULE_META = {
  hrms:           { label: 'HRMS',            icon: Users,          path: '/dashboard' },
  vendor_audit:   { label: 'Vendor Audit',    icon: ShieldCheck,    path: '/vendor-audit/dashboard' },
  register_maker: { label: 'Register Maker',  icon: Scroll,         path: '/register-maker/dashboard' },
  internal_audit: { label: 'Internal Audit',  icon: CheckSquare,    path: '/internal-audit/dashboard' },
  consultancy:    { label: 'Consultancy',     icon: ChatCircleText, path: '/consultancy/dashboard' },
};

/**
 * Top-bar dropdown showing every Saffron module the current user can access.
 * Hidden entirely when the user only has one module (e.g., plain HRMS employee).
 * Used by both HRMS Layout.js and ModuleShell.js so employees granted extra
 * module roles (via /module-access) can navigate across modules without logging out.
 */
export default function ModuleSwitcher({ currentModule = 'hrms', tone = 'light' }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [access, setAccess] = useState([]);

  useEffect(() => {
    const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
    axios.get(`${API_URL}/module-roles/me`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    })
      .then((r) => setAccess(r.data.access || []))
      .catch(() => setAccess([]));
  }, []);

  if (access.length < 2) return null;

  const cur = MODULE_META[currentModule] || MODULE_META.hrms;
  const CurIcon = cur.icon;
  const isDark = tone === 'dark';

  return (
    <div className="relative" data-testid="module-switcher-root">
      <button
        onClick={() => setOpen((o) => !o)}
        data-testid="module-switcher-btn"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition ${
          isDark ? 'hover:bg-white/10 text-white' : 'hover:bg-[#F9F6F0] text-[#2A2624]'
        }`}
      >
        <CurIcon size={14} className="text-[#D96C5B]" />
        <span className="font-medium hidden sm:inline">{cur.label}</span>
        <CaretDown size={10} className={isDark ? 'text-white/60' : 'text-[#A28B7A]'} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            className="absolute top-full left-0 mt-1 bg-white border border-[#E8E2D9] rounded-xl shadow-xl min-w-[240px] overflow-hidden z-40"
            data-testid="module-switcher-menu"
          >
            <div className="px-3 py-2 bg-[#F9F6F0] border-b border-[#E8E2D9]">
              <p className="text-[9px] uppercase tracking-[0.18em] text-[#A28B7A] font-bold">Switch module</p>
            </div>
            {access.map((a) => {
              const m = MODULE_META[a.module];
              if (!m) return null;
              const MI = m.icon;
              const active = a.module === currentModule;
              return (
                <button
                  key={a.module}
                  onClick={() => { setOpen(false); nav(m.path); }}
                  data-testid={`switcher-${a.module}`}
                  className={`w-full px-3 py-2.5 flex items-center gap-3 hover:bg-[#F9F6F0] text-left ${
                    active ? 'bg-[#F9F6F0]' : ''
                  }`}
                >
                  <div className="w-7 h-7 rounded-md bg-[#D96C5B]/10 flex items-center justify-center">
                    <MI size={14} className="text-[#D96C5B]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#2A2624]">{m.label}</p>
                    <p className="text-[10px] uppercase text-[#A28B7A]">{a.role.replace(/_/g, ' ')}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
