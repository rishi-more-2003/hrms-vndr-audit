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
import PayrollRunPage from './pages/PayrollRunPage';
import MyProfilePage from './pages/MyProfilePage';
import VendorAuditPage from './pages/VendorAuditPage';
import AuditRunPage from './pages/AuditRunPage';
import ContractorLoginPage from './pages/ContractorLoginPage';
import ContractorDashboardPage from './pages/ContractorDashboardPage';
import LandingPage from './pages/LandingPage';
import SignupPage from './pages/SignupPage';
import ModuleChooserPage from './pages/ModuleChooserPage';
import ModuleLoginPage from './pages/ModuleLoginPage';
import ComingSoonPage from './pages/ComingSoonPage';
import VendorAuditDashboard from './pages/VendorAuditDashboard';
import RegisterMakerDashboard from './pages/RegisterMakerDashboard';
import InternalAuditDashboard from './pages/InternalAuditDashboard';
import ConsultancyDashboard from './pages/ConsultancyDashboard';
import PlatformAdminPage, { PlatformAdminLoginPage } from './pages/PlatformAdminPage';
import ModuleAccessPage from './pages/ModuleAccessPage';
import BookDemoPage from './pages/BookDemoPage';
import FineTuneDashboard from './pages/FineTuneDashboard';
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
  if (user) {
    if (user.role === 'contractor') return <Navigate to="/contractor/dashboard" />;
    if (user.role === 'platform_admin') return <Navigate to="/platform-admin" />;
    return <Navigate to="/dashboard" />;
  }
  return children;
};

const PlatformAdminRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#FDFBF9]"><p className="text-[#6A625E]">Loading...</p></div>;
  if (!user) return <Navigate to="/platform-admin/login" />;
  if (user.role !== 'platform_admin') return <Navigate to="/" />;
  return children;
};

const ContractorRoute = ({ children }) => {
  const { user, loading, isContractor } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#FDFBF9]"><p className="text-[#6A625E]">Loading...</p></div>;
  if (!user) return <Navigate to="/contractor/login" />;
  if (!isContractor) return <Navigate to="/dashboard" />;
  return children;
};

const AdminRoute = ({ children }) => {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#FDFBF9]"><p className="text-[#6A625E]">Loading...</p></div>;
  if (!user) return <Navigate to="/auth" />;
  if (!isAdmin) return <Navigate to="/dashboard" />;
  return children;
};

// Gate for per-module Saffron dashboards. Allows access if the user has an
// explicit module_roles[moduleKey] entry OR is a legacy admin (who implicitly
// gets access to every module their org has enabled — backend enforces).
const ModuleRoute = ({ moduleKey, children }) => {
  const { user, loading, hasModuleAccess } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#FDFBF9]"><p className="text-[#6A625E]">Loading...</p></div>;
  if (!user) return <Navigate to={`/${moduleKey.replace('_', '-')}/login`} />;
  if (user.role === 'contractor') return <Navigate to="/contractor/dashboard" />;
  if (user.role === 'platform_admin') return <Navigate to="/platform-admin" />;
  if (!hasModuleAccess(moduleKey)) return <Navigate to="/dashboard" />;
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
      <Route path="/payroll-runs" element={<AdminRoute><Layout><PayrollRunPage /></Layout></AdminRoute>} />
      <Route path="/my-profile" element={<PrivateRoute><Layout><MyProfilePage /></Layout></PrivateRoute>} />
      <Route path="/hierarchy" element={<AdminRoute><Layout><HierarchyPage /></Layout></AdminRoute>} />
      <Route path="/attendance" element={<PrivateRoute requiredModule="attendance"><Layout><AttendancePage /></Layout></PrivateRoute>} />
      <Route path="/leave" element={<PrivateRoute requiredModule="leave"><Layout><LeavePage /></Layout></PrivateRoute>} />
      <Route path="/payroll" element={<PrivateRoute requiredModule="payroll"><Layout><PayrollPage /></Layout></PrivateRoute>} />
      <Route path="/reimbursements" element={<PrivateRoute requiredModule="reimbursements"><Layout><ReimbursementsPage /></Layout></PrivateRoute>} />
      <Route path="/documents" element={<PrivateRoute requiredModule="documents"><Layout><DocumentsPage /></Layout></PrivateRoute>} />
      <Route path="/recruitment" element={<PrivateRoute requiredModule="recruitment"><Layout><RecruitmentPage /></Layout></PrivateRoute>} />
      <Route path="/performance" element={<PrivateRoute requiredModule="performance"><Layout><PerformancePage /></Layout></PrivateRoute>} />
      <Route path="/onboarding" element={<PrivateRoute requiredModule="onboarding"><Layout><OnboardingPage /></Layout></PrivateRoute>} />

      {/* Vendor Audit — admin */}
      <Route path="/vendor-audit" element={<AdminRoute><Layout><VendorAuditPage /></Layout></AdminRoute>} />
      <Route path="/vendor-audit/audits/:id" element={<AdminRoute><Layout><AuditRunPage /></Layout></AdminRoute>} />

      {/* Contractor portal — separate branded experience */}
      <Route path="/contractor/login" element={<PublicRoute><ContractorLoginPage /></PublicRoute>} />
      <Route path="/contractor/dashboard" element={<ContractorRoute><ContractorDashboardPage /></ContractorRoute>} />
      <Route path="/contractor/audits/:id" element={<ContractorRoute><div className="min-h-screen bg-[#FDFBF9] p-6 max-w-6xl mx-auto"><AuditRunPage isContractor={true} /></div></ContractorRoute>} />

      {/* Saffron Services — SaaS landing + signup + branded module logins */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/book-demo" element={<BookDemoPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/login" element={<ModuleChooserPage />} />
      <Route path="/hrms/login" element={<PublicRoute><ModuleLoginPage moduleKey="hrms" /></PublicRoute>} />
      <Route path="/vendor-audit/login" element={<PublicRoute><ModuleLoginPage moduleKey="vendor_audit" /></PublicRoute>} />
      <Route path="/register-maker/login" element={<PublicRoute><ModuleLoginPage moduleKey="register_maker" /></PublicRoute>} />
      <Route path="/internal-audit/login" element={<PublicRoute><ModuleLoginPage moduleKey="internal_audit" /></PublicRoute>} />
      <Route path="/consultancy/login" element={<PublicRoute><ModuleLoginPage moduleKey="consultancy" /></PublicRoute>} />

      {/* Saffron module dashboards — gated by module_roles (not legacy admin-only) */}
      <Route path="/vendor-audit/dashboard" element={<ModuleRoute moduleKey="vendor_audit"><VendorAuditDashboard /></ModuleRoute>} />
      <Route path="/module-access" element={<AdminRoute><Layout><ModuleAccessPage /></Layout></AdminRoute>} />
      <Route path="/register-maker" element={<ModuleRoute moduleKey="register_maker"><RegisterMakerDashboard /></ModuleRoute>} />
      <Route path="/register-maker/dashboard" element={<ModuleRoute moduleKey="register_maker"><RegisterMakerDashboard /></ModuleRoute>} />
      <Route path="/internal-audit" element={<ModuleRoute moduleKey="internal_audit"><InternalAuditDashboard /></ModuleRoute>} />
      <Route path="/internal-audit/dashboard" element={<ModuleRoute moduleKey="internal_audit"><InternalAuditDashboard /></ModuleRoute>} />
      <Route path="/consultancy" element={<ModuleRoute moduleKey="consultancy"><ConsultancyDashboard /></ModuleRoute>} />
      <Route path="/consultancy/dashboard" element={<ModuleRoute moduleKey="consultancy"><ConsultancyDashboard /></ModuleRoute>} />

      {/* Platform admin */}
      <Route path="/platform-admin/login" element={<PublicRoute><PlatformAdminLoginPage /></PublicRoute>} />
      <Route path="/platform-admin" element={<PlatformAdminRoute><PlatformAdminPage /></PlatformAdminRoute>} />
      <Route path="/platform-admin/finetune" element={<PlatformAdminRoute><FineTuneDashboard /></PlatformAdminRoute>} />
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
