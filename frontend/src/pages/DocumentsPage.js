import React, { useEffect, useState, useRef } from 'react';
import { documentAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { employeeAPI } from '../services/api';
import { FileText, Upload, Trash, Download, Folder } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Label } from '../components/ui/label';

const DOC_TYPES = [
  { value: 'aadhaar', label: 'Aadhaar Card' },
  { value: 'pan', label: 'PAN Card' },
  { value: 'resume', label: 'Resume' },
  { value: 'offer_letter', label: 'Offer Letter' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'photo', label: 'Passport Photo' },
  { value: 'other', label: 'Other' },
];

export default function DocumentsPage() {
  var auth = useAuth();
  var isAdmin = auth.isAdmin;
  var [documents, setDocuments] = useState([]);
  var [employees, setEmployees] = useState([]);
  var [selectedEmp, setSelectedEmp] = useState('');
  var [docType, setDocType] = useState('aadhaar');
  var [loading, setLoading] = useState(true);
  var [uploading, setUploading] = useState(false);
  var fileRef = useRef(null);

  useEffect(function() { fetchData(); }, []);

  async function fetchData() {
    try {
      if (isAdmin) {
        var empRes = await employeeAPI.getAll();
        setEmployees(empRes.data);
        if (empRes.data.length > 0) {
          setSelectedEmp(empRes.data[0].id);
          var docRes = await documentAPI.getAll(empRes.data[0].id);
          setDocuments(docRes.data);
        }
      } else {
        var docRes2 = await documentAPI.getAll('current');
        setDocuments(docRes2.data);
      }
    } catch (err) { setDocuments([]); }
    setLoading(false);
  }

  async function fetchDocs(empId) {
    try {
      var res = await documentAPI.getAll(empId);
      setDocuments(res.data);
    } catch (err) { setDocuments([]); }
  }

  async function handleUpload(e) {
    var file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      await documentAPI.upload(selectedEmp || 'current', docType, file);
      toast.success('Document uploaded');
      fetchDocs(selectedEmp || 'current');
    } catch (err) {
      toast.error('Upload failed');
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleDownload(doc) {
    try {
      var res = await documentAPI.download(doc.id);
      var url = window.URL.createObjectURL(new Blob([res.data]));
      var a = document.createElement('a');
      a.href = url;
      a.download = doc.original_filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) { toast.error('Download failed'); }
  }

  async function handleDelete(docId) {
    try {
      await documentAPI.delete(docId);
      toast.success('Document deleted');
      fetchDocs(selectedEmp || 'current');
    } catch (err) { toast.error('Delete failed'); }
  }

  function handleEmpChange(empId) {
    setSelectedEmp(empId);
    fetchDocs(empId);
  }

  var typeLabel = function(v) { return DOC_TYPES.find(function(d) { return d.value === v; })?.label || v; };

  if (loading) return <div className="flex items-center justify-center h-64">Loading...</div>;

  return (
    <div className="space-y-6" data-testid="documents-page">
      <div>
        <h1 className="text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Documents</h1>
        <p className="text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>Upload and manage employee documents</p>
      </div>

      {/* Upload Section */}
      <div className="bg-white border border-[#E8E2D9] rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
        <h3 className="text-lg font-semibold text-[#2A2624] mb-4" style={{ fontFamily: 'Outfit' }}>Upload Document</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {isAdmin && (
            <div>
              <Label>Employee</Label>
              <Select value={selectedEmp} onValueChange={handleEmpChange}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map(function(emp) {
                    return <SelectItem key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Document Type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map(function(dt) {
                  return <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>File</Label>
            <input ref={fileRef} type="file" onChange={handleUpload} disabled={uploading} className="w-full text-sm border border-[#E8E2D9] rounded-xl p-2" data-testid="document-file-input" />
          </div>
          <div>
            {uploading && <p className="text-sm text-[#D96C5B]">Uploading...</p>}
          </div>
        </div>
      </div>

      {/* Documents List */}
      <div className="bg-white border border-[#E8E2D9] rounded-2xl shadow-[0_4px_20px_-4px_rgba(42,38,36,0.05)]">
        <div className="p-6 border-b border-[#E8E2D9]">
          <h3 className="text-lg font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>Uploaded Documents</h3>
        </div>
        {documents.length === 0 ? (
          <div className="p-12 text-center">
            <Folder size={64} className="mx-auto mb-4 text-[#A28B7A] opacity-50" />
            <h3 className="text-xl font-semibold text-[#2A2624] mb-2">No Documents</h3>
            <p className="text-[#6A625E]">Upload documents to see them here</p>
          </div>
        ) : (
          <div className="divide-y divide-[#E8E2D9]">
            {documents.map(function(doc) {
              return (
                <div key={doc.id} className="flex items-center justify-between px-6 py-4 hover:bg-[#FDFBF9] transition-colors">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 rounded-xl bg-[#D96C5B]/10 flex items-center justify-center">
                      <FileText size={20} className="text-[#D96C5B]" />
                    </div>
                    <div>
                      <p className="font-medium text-[#2A2624] text-sm">{doc.original_filename}</p>
                      <p className="text-xs text-[#6A625E]">{typeLabel(doc.document_type)} - {new Date(doc.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button onClick={function() { handleDownload(doc); }} className="p-2 hover:bg-[#7D9D85]/10 rounded-lg" data-testid={'download-doc-' + doc.id}>
                      <Download size={18} className="text-[#7D9D85]" />
                    </button>
                    <button onClick={function() { handleDelete(doc.id); }} className="p-2 hover:bg-[#C65549]/10 rounded-lg" data-testid={'delete-doc-' + doc.id}>
                      <Trash size={18} className="text-[#C65549]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
