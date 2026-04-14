import React, { useEffect, useState } from 'react';
import { attendanceAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { ClockCounterClockwise, CalendarCheck } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';

const AttendancePage = () => {
  const { isAdmin } = useAuth();
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [todayAttendance, setTodayAttendance] = useState(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const res = await attendanceAPI.getAll();
      setAttendance(res.data);
      const today = new Date().toISOString().split('T')[0];
      setTodayAttendance(res.data.find(a => a.date === today) || null);
    } catch { setAttendance([]); }
    finally { setLoading(false); }
  };

  const handleClockIn = async () => {
    try {
      await attendanceAPI.clockIn();
      toast.success('Clocked in successfully');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to clock in');
    }
  };

  const handleClockOut = async () => {
    try {
      const res = await attendanceAPI.clockOut();
      toast.success(`Clocked out. Total hours: ${res.data.total_hours}`);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to clock out');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>;

  return (
    <div className="space-y-6" data-testid="attendance-page">
      <div>
        <h1 className="text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Attendance</h1>
        <p className="text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>Track your time and attendance</p>
      </div>

      {/* Clock In/Out */}
      {!isAdmin && (
        <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 lg:p-8 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-[#2A2624] mb-2" style={{ fontFamily: 'Outfit' }}>Today's Attendance</h3>
              <p className="text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>
                {todayAttendance ? (
                  <>
                    Clock In: {new Date(todayAttendance.clock_in).toLocaleTimeString()}
                    {todayAttendance.clock_out && <> | Clock Out: {new Date(todayAttendance.clock_out).toLocaleTimeString()}</>}
                    {todayAttendance.total_hours != null && <> | {todayAttendance.total_hours} hrs</>}
                  </>
                ) : "You haven't clocked in today"}
              </p>
            </div>
            <div className="flex space-x-4">
              <Button onClick={handleClockIn} disabled={!!todayAttendance} data-testid="clock-in-button" className="bg-[#7D9D85] hover:bg-[#6A8A72] text-white rounded-xl">
                <ClockCounterClockwise size={20} className="mr-2" /> Clock In
              </Button>
              <Button onClick={handleClockOut} disabled={!todayAttendance || !!todayAttendance?.clock_out} data-testid="clock-out-button" className="bg-[#D96C5B] hover:bg-[#C25949] text-white rounded-xl">
                <ClockCounterClockwise size={20} className="mr-2" /> Clock Out
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Records */}
      <div className="bg-white border border-[#E8E2D9] rounded-2xl shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
        <div className="p-6 border-b border-[#E8E2D9]">
          <h3 className="text-xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>
            {isAdmin ? 'All Attendance Records' : 'Your Attendance History'}
          </h3>
        </div>
        {attendance.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarCheck size={64} className="mx-auto mb-4 text-[#A28B7A] opacity-50" />
            <h3 className="text-xl font-semibold text-[#2A2624] mb-2">No Records</h3>
            <p className="text-[#6A625E]">Attendance records will appear here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="attendance-table">
              <thead className="bg-[#F9F6F0] border-b border-[#E8E2D9]">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Date</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Clock In</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Clock Out</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Hours</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-[#2A2624] uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E2D9]">
                {attendance.slice().reverse().map((att) => (
                  <tr key={att.id} className="hover:bg-[#FDFBF9] transition-colors">
                    <td className="px-6 py-4 text-[#2A2624] font-medium text-sm">{att.date}</td>
                    <td className="px-6 py-4 text-[#6A625E] text-sm">{att.clock_in ? new Date(att.clock_in).toLocaleTimeString() : '-'}</td>
                    <td className="px-6 py-4 text-[#6A625E] text-sm">{att.clock_out ? new Date(att.clock_out).toLocaleTimeString() : '-'}</td>
                    <td className="px-6 py-4 text-[#6A625E] text-sm">{att.total_hours != null ? `${att.total_hours} hrs` : '-'}</td>
                    <td className="px-6 py-4"><span className={`badge ${att.status === 'present' ? 'badge-success' : 'badge-danger'}`}>{att.status}</span></td>
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

export default AttendancePage;
