import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const employeeAPI = {
  getAll: () => api.get('/employees'),
  getById: (id) => api.get(`/employees/${id}`),
  getProfile: (id) => api.get(`/employees/${id}/profile`),
  create: (data) => api.post('/employees', data),
  createProfile: (data) => api.post('/employees/profile', data),
  update: (id, data) => api.put(`/employees/${id}`, data),
  updateProfile: (id, data) => api.put(`/employees/${id}/profile`, data),
  updatePermissions: (id, permissions) => api.put(`/employees/${id}/permissions`, { permissions }),
  updateReportsTo: (id, reportsTo) => api.put(`/employees/${id}/reports-to`, null, { params: { reports_to: reportsTo } }),
  updateApprovalHierarchy: (id, data) => api.put(`/employees/${id}/approval-hierarchy`, data),
  updatePolicies: (id, data) => api.put(`/employees/${id}/policies`, data),
  effectivePolicies: (id) => api.get(`/employees/${id}/effective-policies`),
  lastCode: () => api.get('/employees/meta/last-code'),
  bulkUploadTemplate: () => api.get('/employees/meta/bulk-upload-template'),
  bulkUpload: (rows, continue_on_error = true) => api.post('/employees/bulk-upload', { rows, continue_on_error }),
  listDocuments: (id, category) => api.get(`/employees/${id}/documents${category ? '?category=' + category : ''}`),
  addDocument: (id, data) => api.post(`/employees/${id}/documents`, data),
  deleteDocument: (id, docId) => api.delete(`/employees/${id}/documents/${docId}`),
};

export const meAPI = {
  profile: () => api.get('/me/employee-profile'),
  updateProfile: (data) => api.put('/me/employee-profile', data),
  effectivePolicies: () => api.get('/me/effective-policies'),
  changeRequests: () => api.get('/me/change-requests'),
  createChangeRequest: (data) => api.post('/me/change-requests', data),
};

export const changeRequestAPI = {
  list: (status) => api.get('/employee-change-requests' + (status ? '?status=' + status : '')),
  approve: (id) => api.put(`/employee-change-requests/${id}/approve`),
  reject: (id, reason) => api.put(`/employee-change-requests/${id}/reject`, { reason }),
};

export const auditAPI = {
  list: (params) => api.get('/audit-log', { params }),
};

export const departmentAPI = {
  getAll: () => api.get('/departments'),
  create: (data) => api.post('/departments', data),
};

export const designationAPI = {
  getAll: () => api.get('/designations'),
  create: (data) => api.post('/designations', data),
};

export const attendanceAPI = {
  getAll: (employeeId, month) => api.get('/attendance', { params: { employee_id: employeeId, month } }),
  clockIn: (method) => api.post('/attendance/clock-in', null, { params: { method: method || 'self_clockin' } }),
  clockOut: (method) => api.post('/attendance/clock-out', null, { params: { method: method || 'self_clockin' } }),
  manualEntry: (data) => api.post('/attendance/manual-entry', data),
  adminEntry: (data) => api.post('/attendance/admin-entry', data),
  bulkEntry: (data) => api.post('/attendance/bulk-entry', data),
  missedPunch: (data) => api.post('/attendance/missed-punch', data),
  getMissedPunches: () => api.get('/attendance/missed-punches'),
  approveMissedPunch: (id) => api.put(`/attendance/missed-punches/${id}/approve`),
  rejectMissedPunch: (id) => api.put(`/attendance/missed-punches/${id}/reject`),
  approveEntry: (id) => api.put(`/attendance/${id}/approve`),
  rejectEntry: (id) => api.put(`/attendance/${id}/reject`),
};

export const leaveAPI = {
  getAll: () => api.get('/leaves'),
  apply: (data) => api.post('/leaves', data),
  approve: (id) => api.put(`/leaves/${id}/approve`),
  reject: (id) => api.put(`/leaves/${id}/reject`),
  getBalance: (employeeId) => api.get(`/leave-balance/${employeeId}`),
  getPolicy: () => api.get('/leave-policy'),
  updatePolicy: (policy) => api.put('/leave-policy', policy),
};

export const reimbursementAPI = {
  getAll: () => api.get('/reimbursements'),
  create: (data) => api.post('/reimbursements', data),
  approve: (id) => api.put(`/reimbursements/${id}/approve`),
  reject: (id) => api.put(`/reimbursements/${id}/reject`),
  disburse: (id) => api.put(`/reimbursements/${id}/disburse`),
};

export const salaryAPI = {
  get: (employeeId) => api.get(`/salaries/${employeeId}`),
  create: (data) => api.post('/salaries', data),
};

export const payslipAPI = {
  getAll: (employeeId) => api.get(`/payslips/${employeeId}`),
  generate: (data) => api.post('/payslip/generate', data, { responseType: 'blob' }),
  // legacy:
  generateLegacy: (employeeId, month, year) => api.post('/payslips/generate', null, { params: { employee_id: employeeId, month, year } }),
};

export const taxAPI = {
  calculate: (basic, hra, da, other) => api.post('/tax/calculate', null, { params: { basic, hra, da, other } }),
};

export const jobAPI = {
  getAll: () => api.get('/jobs'),
  create: (data) => api.post('/jobs', data),
};

export const applicationAPI = {
  getAll: (jobId) => api.get('/applications', { params: { job_id: jobId } }),
  submit: (data) => api.post('/applications', data),
  updateStatus: (id, status) => api.put(`/applications/${id}/status`, null, { params: { status } }),
};

export const performanceAPI = {
  getGoals: (employeeId) => api.get('/performance/goals', { params: { employee_id: employeeId } }),
  createGoal: (data) => api.post('/performance/goals', data),
  getReviews: (employeeId) => api.get('/performance/reviews', { params: { employee_id: employeeId } }),
  createReview: (data) => api.post('/performance/reviews', data),
};

export const dashboardAPI = {
  getStats: () => api.get('/dashboard/stats'),
};

export const hierarchyAPI = {
  get: () => api.get('/hierarchy'),
};

export const notificationAPI = {
  getAll: () => api.get('/notifications'),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
  getUnreadCount: () => api.get('/notifications/unread-count'),
};

export const documentAPI = {
  upload: (employeeId, documentType, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/documents/upload?employee_id=${employeeId}&document_type=${documentType}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  getAll: (employeeId) => api.get(`/documents/${employeeId}`),
  download: (docId) => api.get(`/documents/download/${docId}`, { responseType: 'blob' }),
  delete: (docId) => api.delete(`/documents/${docId}`),
};

export const onboardingAPI = {
  get: (employeeId) => api.get(`/onboarding/${employeeId}`),
  updateItem: (employeeId, itemId, completed) => api.put(`/onboarding/${employeeId}/item/${itemId}`, null, { params: { completed } }),
};

export const authAPI = {
  changePassword: (oldPassword, newPassword) => api.post('/auth/change-password', null, { params: { old_password: oldPassword, new_password: newPassword } }),
  resetPassword: (email, newPassword) => api.post('/auth/reset-password', null, { params: { employee_email: email, new_password: newPassword } }),
};

export const organizationAPI = {
  get: () => api.get('/organization'),
  save: (data) => api.post('/organization', data),
};

export const locationAPI = {
  getAll: () => api.get('/locations'),
  create: (data) => api.post('/locations', data),
  update: (id, data) => api.put(`/locations/${id}`, data),
  delete: (id) => api.delete(`/locations/${id}`),
};

export const gradeAPI = {
  getAll: () => api.get('/employee-grades'),
  save: (grades) => api.post('/employee-grades', grades),
};

export const levelAPI = {
  getAll: () => api.get('/employee-levels'),
  save: (levels) => api.post('/employee-levels', levels),
};

export const shiftAPI = {
  getAll: () => api.get('/shifts'),
  create: (data) => api.post('/shifts', data),
  update: (id, data) => api.put(`/shifts/${id}`, data),
  delete: (id) => api.delete(`/shifts/${id}`),
};

export const complianceTemplateAPI = {
  getAll: (type) => api.get(`/compliance-templates/${type}`),
  create: (type, data) => api.post(`/compliance-templates/${type}`, data),
  update: (type, id, data) => api.put(`/compliance-templates/${type}/${id}`, data),
  delete: (type, id) => api.delete(`/compliance-templates/${type}/${id}`),
};

export const complianceAssignmentAPI = {
  get: (employeeId) => api.get(`/compliance-assignments/${employeeId}`),
  update: (employeeId, data) => api.put(`/compliance-assignments/${employeeId}`, data),
  bulkAssign: (data) => api.post('/compliance-assignments/bulk', data),
  getAll: () => api.get('/compliance-assignments'),
};

export const policyTemplateAPI = {
  getAll: (type) => api.get(`/policy-templates/${type}`),
  create: (type, data) => api.post(`/policy-templates/${type}`, data),
  update: (type, id, data) => api.put(`/policy-templates/${type}/${id}`, data),
  delete: (type, id) => api.delete(`/policy-templates/${type}/${id}`),
};

export const policyAssignmentAPI = {
  get: (employeeId) => api.get(`/policy-assignments/${employeeId}`),
  update: (employeeId, data) => api.put(`/policy-assignments/${employeeId}`, data),
  bulkAssign: (data) => api.post('/policy-assignments/bulk', data),
  getAll: () => api.get('/policy-assignments'),
};

export const salaryComponentAPI = {
  getAll: () => api.get('/salary-components'),
  create: (data) => api.post('/salary-components', data),
  update: (id, data) => api.put(`/salary-components/${id}`, data),
  delete: (id) => api.delete(`/salary-components/${id}`),
  seedDefaults: (wipe) => api.post('/salary-components/seed-defaults' + (wipe ? '?wipe=true' : '')),
};

export const salaryTemplateAPI = {
  getAll: () => api.get('/salary-templates'),
  getById: (id) => api.get(`/salary-templates/${id}`),
  resolvedLinks: (id) => api.get(`/salary-templates/${id}/resolved-links`),
  create: (data) => api.post('/salary-templates', data),
  update: (id, data) => api.put(`/salary-templates/${id}`, data),
  delete: (id) => api.delete(`/salary-templates/${id}`),
};

export const salaryAssignmentAPI = {
  get: (employeeId) => api.get(`/salary-assignments/${employeeId}`),
  update: (employeeId, data) => api.put(`/salary-assignments/${employeeId}`, data),
  bulkAssign: (data) => api.post('/salary-assignments/bulk', data),
  getAll: () => api.get('/salary-assignments'),
};

export const salaryComputeAPI = {
  compute: (data) => api.post('/salary-compute', data),
};

export const bonusAPI = {
  compute: (data) => api.post('/bonus/compute', data),
};
export const gratuityAPI = {
  compute: (data) => api.post('/gratuity/compute', data),
};
export const incentiveAPI = {
  compute: (data) => api.post('/incentive/compute', data),
};
export const advanceAPI = {
  compute: (data) => api.post('/advance/compute', data),
  getAll: (employeeId) => api.get('/advances' + (employeeId ? '?employee_id=' + employeeId : '')),
  create: (data) => api.post('/advances', data),
  update: (id, data) => api.put(`/advances/${id}`, data),
  delete: (id) => api.delete(`/advances/${id}`),
};
export const loanAPI = {
  compute: (data) => api.post('/loan/compute', data),
  getAll: (employeeId) => api.get('/loans' + (employeeId ? '?employee_id=' + employeeId : '')),
  create: (data) => api.post('/loans', data),
  update: (id, data) => api.put(`/loans/${id}`, data),
  delete: (id) => api.delete(`/loans/${id}`),
};
export const payrollRunAPI = {
  getAll: () => api.get('/payroll/runs'),
  getById: (id) => api.get(`/payroll/runs/${id}`),
  create: (data) => api.post('/payroll/runs', data),
  freeze: (id) => api.put(`/payroll/runs/${id}/freeze`),
  markPaid: (id) => api.put(`/payroll/runs/${id}/mark-paid`),
  delete: (id) => api.delete(`/payroll/runs/${id}`),
};
export const fnfAPI = {
  compute: (data) => api.post('/fnf/compute', data),
};

export default api;
