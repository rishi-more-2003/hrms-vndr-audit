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
  create: (data) => api.post('/employees', data),
  update: (id, data) => api.put(`/employees/${id}`, data),
  updatePermissions: (id, permissions) => api.put(`/employees/${id}/permissions`, { permissions }),
  updateReportsTo: (id, reportsTo) => api.put(`/employees/${id}/reports-to`, null, { params: { reports_to: reportsTo } }),
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
  getAll: (employeeId) => api.get('/attendance', { params: { employee_id: employeeId } }),
  clockIn: () => api.post('/attendance/clock-in'),
  clockOut: () => api.post('/attendance/clock-out'),
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
  generate: (employeeId, month, year) => api.post('/payslips/generate', null, { params: { employee_id: employeeId, month, year } }),
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

export default api;
