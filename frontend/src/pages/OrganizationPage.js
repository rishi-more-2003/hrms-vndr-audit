import React, { useEffect, useState } from 'react';
import { organizationAPI, locationAPI, gradeAPI, levelAPI, shiftAPI, departmentAPI, designationAPI } from '../services/api';
import { Buildings, Plus, Trash, MapPin, Clock, GraduationCap, ListNumbers, PencilSimple } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';

var DEFAULT_GRADES = [
  { name: 'Unskilled', code: 'USK', order: 1 },
  { name: 'Semi-skilled', code: 'SSK', order: 2 },
  { name: 'Skilled', code: 'SK', order: 3 },
  { name: 'Highly Skilled', code: 'HSK', order: 4 },
];

export default function OrganizationPage() {
  var [org, setOrg] = useState({ name: '', address: '', nature_of_business: '', setup_complete: false });
  var [locations, setLocations] = useState([]);
  var [grades, setGrades] = useState([]);
  var [levels, setLevels] = useState([]);
  var [shifts, setShifts] = useState([]);
  var [loading, setLoading] = useState(true);
  var [locForm, setLocForm] = useState({ name: '', address: '', code: '' });
  var [shiftForm, setShiftForm] = useState({ name: '', start_time: '09:00', end_time: '18:00', break_duration: 60 });
  var [levelInput, setLevelInput] = useState('');
  var [locDialog, setLocDialog] = useState(false);
  var [shiftDialog, setShiftDialog] = useState(false);

  useEffect(function() { fetchAll(); }, []);

  async function fetchAll() {
    try {
      var results = await Promise.all([
        organizationAPI.get(), locationAPI.getAll(), gradeAPI.getAll(), levelAPI.getAll(), shiftAPI.getAll()
      ]);
      if (results[0].data && results[0].data.name) setOrg(results[0].data);
      setLocations(results[1].data || []);
      setGrades(results[2].data?.length > 0 ? results[2].data : DEFAULT_GRADES);
      setLevels(results[3].data || []);
      setShifts(results[4].data || []);
    } catch (e) { /* ok */ }
    setLoading(false);
  }

  async function saveOrg() {
    try {
      await organizationAPI.save(org);
      toast.success('Organization details saved');
    } catch (e) { toast.error('Failed to save'); }
  }

  async function addLocation(e) {
    e.preventDefault();
    try {
      await locationAPI.create(locForm);
      toast.success('Location added');
      setLocDialog(false);
      setLocForm({ name: '', address: '', code: '' });
      var res = await locationAPI.getAll();
      setLocations(res.data);
    } catch (e) { toast.error('Failed'); }
  }

  async function deleteLocation(id) {
    await locationAPI.delete(id);
    setLocations(locations.filter(function(l) { return l.id !== id; }));
    toast.success('Deleted');
  }

  async function saveGrades() {
    try {
      await gradeAPI.save(grades);
      toast.success('Grades saved');
    } catch (e) { toast.error('Failed'); }
  }

  function addLevel() {
    if (!levelInput.trim()) return;
    var newLevels = [...levels, { id: 'lvl-' + Date.now(), name: levelInput.trim(), order: levels.length + 1 }];
    setLevels(newLevels);
    setLevelInput('');
  }

  async function saveLevels() {
    try {
      await levelAPI.save(levels);
      toast.success('Levels saved');
    } catch (e) { toast.error('Failed'); }
  }

  async function addShift(e) {
    e.preventDefault();
    try {
      await shiftAPI.create(shiftForm);
      toast.success('Shift added');
      setShiftDialog(false);
      setShiftForm({ name: '', start_time: '09:00', end_time: '18:00', break_duration: 60 });
      var res = await shiftAPI.getAll();
      setShifts(res.data);
    } catch (e) { toast.error('Failed'); }
  }

  async function deleteShift(id) {
    await shiftAPI.delete(id);
    setShifts(shifts.filter(function(s) { return s.id !== id; }));
    toast.success('Deleted');
  }

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>;

  return (
    <div className="space-y-6" data-testid="organization-page">
      <div>
        <h1 className="text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Organization Settings</h1>
        <p className="text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>Configure your company details and structure</p>
      </div>

      {/* Company Info */}
      <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
        <h3 className="text-lg font-semibold text-[#2A2624] mb-4" style={{ fontFamily: 'Outfit' }}>Company Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>Company Name</Label><Input value={org.name || ''} onChange={function(e) { setOrg({...org, name: e.target.value}); }} data-testid="org-name-input" /></div>
          <div><Label>Nature of Business</Label><Input value={org.nature_of_business || ''} onChange={function(e) { setOrg({...org, nature_of_business: e.target.value}); }} /></div>
        </div>
        <div className="mt-4"><Label>Registered Address</Label><Textarea value={org.address || ''} onChange={function(e) { setOrg({...org, address: e.target.value}); }} /></div>
        <Button onClick={saveOrg} className="mt-4 bg-[#D96C5B] hover:bg-[#C25949]" data-testid="save-org-button">Save Company Info</Button>
      </div>

      {/* Locations */}
      <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Locations / Sub-units</h3>
          <Dialog open={locDialog} onOpenChange={setLocDialog}>
            <DialogTrigger asChild><Button size="sm" className="bg-[#D96C5B] hover:bg-[#C25949] rounded-xl" data-testid="add-location-button"><Plus size={16} className="mr-1" /> Add</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Location</DialogTitle></DialogHeader>
              <form onSubmit={addLocation} className="space-y-4">
                <div><Label>Location Name</Label><Input value={locForm.name} onChange={function(e) { setLocForm({...locForm, name: e.target.value}); }} required /></div>
                <div><Label>Code</Label><Input value={locForm.code} onChange={function(e) { setLocForm({...locForm, code: e.target.value}); }} required /></div>
                <div><Label>Address</Label><Textarea value={locForm.address} onChange={function(e) { setLocForm({...locForm, address: e.target.value}); }} /></div>
                <Button type="submit" className="w-full bg-[#D96C5B] hover:bg-[#C25949]">Add Location</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        {locations.length === 0 ? (
          <p className="text-[#6A625E] text-sm py-4">No locations added yet</p>
        ) : (
          <div className="space-y-2">
            {locations.map(function(loc) {
              return (
                <div key={loc.id} className="flex items-center justify-between p-4 border border-[#E8E2D9] rounded-xl">
                  <div className="flex items-center space-x-3">
                    <MapPin size={20} className="text-[#D96C5B]" />
                    <div><p className="font-medium text-[#2A2624] text-sm">{loc.name}</p><p className="text-xs text-[#6A625E]">{loc.code} - {loc.address}</p></div>
                  </div>
                  <button onClick={function() { deleteLocation(loc.id); }} className="p-2 hover:bg-[#C65549]/10 rounded-lg"><Trash size={16} className="text-[#C65549]" /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Grades */}
      <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
        <h3 className="text-lg font-semibold text-[#2A2624] mb-4" style={{ fontFamily: 'Outfit' }}>Employee Grades</h3>
        <div className="space-y-2">
          {grades.map(function(g, i) {
            return (
              <div key={i} className="flex items-center space-x-3 p-3 border border-[#E8E2D9] rounded-xl">
                <GraduationCap size={18} className="text-[#7D9D85]" />
                <Input value={g.name} onChange={function(e) { var ng = [...grades]; ng[i] = {...ng[i], name: e.target.value}; setGrades(ng); }} className="flex-1" />
                <Input value={g.code || ''} onChange={function(e) { var ng = [...grades]; ng[i] = {...ng[i], code: e.target.value}; setGrades(ng); }} className="w-24" placeholder="Code" />
                <button onClick={function() { setGrades(grades.filter(function(_, idx) { return idx !== i; })); }} className="p-1 text-[#C65549]"><Trash size={16} /></button>
              </div>
            );
          })}
          <div className="flex space-x-2 mt-2">
            <Button size="sm" variant="outline" onClick={function() { setGrades([...grades, { name: '', code: '', order: grades.length + 1 }]); }}>
              <Plus size={14} className="mr-1" /> Add Grade
            </Button>
            <Button size="sm" onClick={saveGrades} className="bg-[#D96C5B] hover:bg-[#C25949]">Save Grades</Button>
          </div>
        </div>
      </div>

      {/* Levels */}
      <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
        <h3 className="text-lg font-semibold text-[#2A2624] mb-4" style={{ fontFamily: 'Outfit' }}>Employee Levels (Customizable)</h3>
        <div className="flex space-x-2 mb-4">
          <Input value={levelInput} onChange={function(e) { setLevelInput(e.target.value); }} placeholder="e.g. L1, L2, Director, VP" className="flex-1" onKeyDown={function(e) { if (e.key === 'Enter') { e.preventDefault(); addLevel(); } }} />
          <Button onClick={addLevel} size="sm" variant="outline"><Plus size={14} /></Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {levels.map(function(l, i) {
            return (
              <span key={l.id || i} className="badge badge-info flex items-center space-x-2 px-3 py-2">
                <span>{l.name}</span>
                <button onClick={function() { setLevels(levels.filter(function(_, idx) { return idx !== i; })); }} className="text-[#C65549]"><Trash size={12} /></button>
              </span>
            );
          })}
        </div>
        {levels.length > 0 && <Button size="sm" onClick={saveLevels} className="mt-4 bg-[#D96C5B] hover:bg-[#C25949]">Save Levels</Button>}
      </div>

      {/* Shifts */}
      <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Shift Master</h3>
          <Dialog open={shiftDialog} onOpenChange={setShiftDialog}>
            <DialogTrigger asChild><Button size="sm" className="bg-[#D96C5B] hover:bg-[#C25949] rounded-xl" data-testid="add-shift-button"><Plus size={16} className="mr-1" /> Add</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Shift</DialogTitle></DialogHeader>
              <form onSubmit={addShift} className="space-y-4">
                <div><Label>Shift Name</Label><Input value={shiftForm.name} onChange={function(e) { setShiftForm({...shiftForm, name: e.target.value}); }} required placeholder="e.g. Morning Shift" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Start Time</Label><Input type="time" value={shiftForm.start_time} onChange={function(e) { setShiftForm({...shiftForm, start_time: e.target.value}); }} required /></div>
                  <div><Label>End Time</Label><Input type="time" value={shiftForm.end_time} onChange={function(e) { setShiftForm({...shiftForm, end_time: e.target.value}); }} required /></div>
                </div>
                <div><Label>Break Duration (minutes)</Label><Input type="number" value={shiftForm.break_duration} onChange={function(e) { setShiftForm({...shiftForm, break_duration: parseInt(e.target.value)}); }} /></div>
                <Button type="submit" className="w-full bg-[#D96C5B] hover:bg-[#C25949]">Add Shift</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
        {shifts.length === 0 ? (
          <p className="text-[#6A625E] text-sm py-4">No shifts configured</p>
        ) : (
          <div className="space-y-2">
            {shifts.map(function(s) {
              return (
                <div key={s.id} className="flex items-center justify-between p-4 border border-[#E8E2D9] rounded-xl">
                  <div className="flex items-center space-x-3">
                    <Clock size={20} className="text-[#7D9D85]" />
                    <div><p className="font-medium text-[#2A2624] text-sm">{s.name}</p><p className="text-xs text-[#6A625E]">{s.start_time} - {s.end_time} | Break: {s.break_duration}min</p></div>
                  </div>
                  <button onClick={function() { deleteShift(s.id); }} className="p-2 hover:bg-[#C65549]/10 rounded-lg"><Trash size={16} className="text-[#C65549]" /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
