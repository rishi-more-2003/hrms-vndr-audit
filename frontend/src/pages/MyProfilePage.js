import React, { useEffect, useState } from 'react';
import EmployeeProfileForm from '../components/EmployeeProfileForm';
import { departmentAPI, designationAPI, locationAPI, organizationAPI, salaryTemplateAPI, employeeAPI, meAPI } from '../services/api';
import { toast } from 'sonner';
import { ClockCounterClockwise, CheckCircle, XCircle, Clock } from '@phosphor-icons/react';

export default function MyProfilePage() {
  var [ctx, setCtx] = useState({ departments: [], designations: [], locations: [], grades: [], salaryTemplates: [], employees: [] });
  var [requests, setRequests] = useState([]);
  var [loaded, setLoaded] = useState(false);

  useEffect(function() { load(); }, []);
  async function load() {
    try {
      var r = await Promise.all([
        departmentAPI.getAll(), designationAPI.getAll(), locationAPI.getAll(),
        organizationAPI.get(), salaryTemplateAPI.getAll(), employeeAPI.getAll().catch(function() { return { data: [] }; }),
        meAPI.changeRequests().catch(function() { return { data: [] }; }),
      ]);
      setCtx({
        departments: r[0].data || [], designations: r[1].data || [],
        locations: r[2].data || [], grades: (r[3].data && r[3].data.grades) || [],
        salaryTemplates: r[4].data || [], employees: r[5].data || [],
      });
      setRequests(r[6].data || []);
    } catch (e) { /* ok */ }
    setLoaded(true);
  }

  if (!loaded) return <div className="flex items-center justify-center h-64 text-[#A28B7A]">Loading…</div>;

  return (
    <div className="space-y-6" data-testid="my-profile-page">
      <div>
        <h1 className="text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>My Profile</h1>
        <p className="text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>View your details, assigned policies and approval hierarchy</p>
      </div>

      <div className="bg-white border border-[#E8E2D9] rounded-2xl p-5">
        <EmployeeProfileForm
          selfMode={true}
          allEmployees={ctx.employees}
          departments={ctx.departments}
          designations={ctx.designations}
          locations={ctx.locations}
          grades={ctx.grades}
          salaryTemplates={ctx.salaryTemplates}
          onClose={function() {}}
          onSaved={load}
        />
      </div>

      {/* Change Requests */}
      <div className="bg-white border border-[#E8E2D9] rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <ClockCounterClockwise size={20} className="text-[#7D9D85]" />
          <h3 className="text-lg font-semibold text-[#2A2624]">My Change Requests</h3>
        </div>
        {requests.length === 0 ? (
          <p className="text-xs text-[#A28B7A] text-center py-4">No change requests yet. Use "Request Change" on any locked tab to submit one.</p>
        ) : (
          <div className="space-y-2">
            {requests.map(function(r) { return (
              <div key={r.id} className="flex items-start justify-between p-3 bg-[#F9F6F0] rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {r.status === 'pending' && <Clock size={14} className="text-[#E8B25C]" />}
                    {r.status === 'approved' && <CheckCircle size={14} className="text-[#7D9D85]" />}
                    {r.status === 'rejected' && <XCircle size={14} className="text-[#C65549]" />}
                    <span className="text-xs font-bold uppercase" style={{ color: r.status === 'pending' ? '#E8B25C' : r.status === 'approved' ? '#7D9D85' : '#C65549' }}>{r.status}</span>
                    <span className="text-[10px] text-[#A28B7A]">{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="text-xs text-[#2A2624]">{Object.entries(r.changes || {}).map(function(kv) { return kv[0] + ' → ' + kv[1]; }).join(', ')}</div>
                  {r.reason && <p className="text-[10px] text-[#A28B7A] mt-1">Reason: {r.reason}</p>}
                  {r.reject_reason && <p className="text-[10px] text-[#C65549] mt-1">Rejection: {r.reject_reason}</p>}
                </div>
              </div>
            ); })}
          </div>
        )}
      </div>
    </div>
  );
}
