import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Toaster } from './components/ui/sonner';
import Layout from './components/Layout';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import EmployeesPage from './pages/EmployeesPage';
import DepartmentsPage from './pages/DepartmentsPage';
import HierarchyPage from './pages/HierarchyPage';
import AttendancePage from './pages/AttendancePage';
import LeavePage from './pages/LeavePage';
import PayrollPage from './pages/PayrollPage';
import ReimbursementsPage from './pages/ReimbursementsPage';
import RecruitmentPage from './pages/RecruitmentPage';
import PerformancePage from './pages/PerformancePage';
import DocumentsPage from './pages/DocumentsPage';
import OnboardingPage from './pages/OnboardingPage';
import OrganizationPage from './pages/OrganizationPage';
import CompliancePage from './pages/CompliancePage';
import PolicyPage from './pages/PolicyPage';
import SalaryStructurePage from './pages/SalaryStructurePage';
import '@/App.css';

const PrivateRoute = ({ children, requiredModule }) => {
  const { user, loading, isAdmin, hasPermission } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#FDFBF9]"><p className="text-[#6A625E]">Loading...</p></div>;
  if (!user) return <Navigate to="/auth" />;
  if (requiredModule && !isAdmin && !hasPermission(requiredModule)) return <Navigate to="/dashboard" />;
  return children;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#FDFBF9]"><p className="text-[#6A625E]">Loading...</p></div>;
  return user ? <Navigate to="/dashboard" /> : children;
};

const AdminRoute = ({ children }) => {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#FDFBF9]"><p className="text-[#6A625E]">Loading...</p></div>;
  if (!user) return <Navigate to="/auth" />;
  if (!isAdmin) return <Navigate to="/dashboard" />;
  return children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<PublicRoute><AuthPage /></PublicRoute>} />
      <Route path="/dashboard" element={<PrivateRoute requiredModule="dashboard"><Layout><Dashboard /></Layout></PrivateRoute>} />
      <Route path="/employees" element={<AdminRoute><Layout><EmployeesPage /></Layout></AdminRoute>} />
      <Route path="/departments" element={<AdminRoute><Layout><DepartmentsPage /></Layout></AdminRoute>} />
      <Route path="/organization" element={<AdminRoute><Layout><OrganizationPage /></Layout></AdminRoute>} />
      <Route path="/compliance" element={<AdminRoute><Layout><CompliancePage /></Layout></AdminRoute>} />
      <Route path="/policies" element={<AdminRoute><Layout><PolicyPage /></Layout></AdminRoute>} />
      <Route path="/salary-structure" element={<AdminRoute><Layout><SalaryStructurePage /></Layout></AdminRoute>} />
      <Route path="/hierarchy" element={<AdminRoute><Layout><HierarchyPage /></Layout></AdminRoute>} />
      <Route path="/attendance" element={<PrivateRoute requiredModule="attendance"><Layout><AttendancePage /></Layout></PrivateRoute>} />
      <Route path="/leave" element={<PrivateRoute requiredModule="leave"><Layout><LeavePage /></Layout></PrivateRoute>} />
      <Route path="/payroll" element={<PrivateRoute requiredModule="payroll"><Layout><PayrollPage /></Layout></PrivateRoute>} />
      <Route path="/reimbursements" element={<PrivateRoute requiredModule="reimbursements"><Layout><ReimbursementsPage /></Layout></PrivateRoute>} />
      <Route path="/documents" element={<PrivateRoute requiredModule="documents"><Layout><DocumentsPage /></Layout></PrivateRoute>} />
      <Route path="/recruitment" element={<PrivateRoute requiredModule="recruitment"><Layout><RecruitmentPage /></Layout></PrivateRoute>} />
      <Route path="/performance" element={<PrivateRoute requiredModule="performance"><Layout><PerformancePage /></Layout></PrivateRoute>} />
      <Route path="/onboarding" element={<PrivateRoute requiredModule="onboarding"><Layout><OnboardingPage /></Layout></PrivateRoute>} />
      <Route path="/" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="App">
          <AppRoutes />
          <Toaster position="top-right" />
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
