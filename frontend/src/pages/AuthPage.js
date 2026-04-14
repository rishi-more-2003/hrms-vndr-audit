import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ShieldCheck, User, EnvelopeSimple, LockKey } from '@phosphor-icons/react';
import { toast } from 'sonner';

const AuthPage = () => {
  const [loginAs, setLoginAs] = useState('admin');
  const [formData, setFormData] = useState({ email: '', password: '' });
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const result = await login(formData.email, formData.password, loginAs);
    if (result.success) {
      toast.success(`Logged in as ${loginAs}`);
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Hero */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <img
          src="https://static.prod-images.emergentagent.com/jobs/38ca0ccc-3744-43d1-894a-950737bb637c/images/b5042902ac5440e490d965893cb5e38ffda2f71226bb16ae44231fedcc99537b.png"
          alt="HRMS"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#D96C5B]/80 to-[#7D9D85]/80 flex items-center justify-center">
          <div className="text-white text-center px-12">
            <h1 className="text-5xl font-bold mb-4" style={{ fontFamily: 'Outfit' }}>Modern HRMS</h1>
            <p className="text-xl opacity-90" style={{ fontFamily: 'Manrope' }}>
              Manage your workforce with warmth and efficiency
            </p>
          </div>
        </div>
      </div>

      {/* Right Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-[#FDFBF9]">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-semibold text-[#2A2624]" style={{ fontFamily: 'Outfit' }}>
              Sign In
            </h2>
            <p className="text-[#6A625E] mt-2" style={{ fontFamily: 'Manrope' }}>
              Choose your login portal
            </p>
          </div>

          {/* Login Tabs */}
          <div className="flex rounded-xl border border-[#E8E2D9] bg-white p-1 mb-8" data-testid="login-tabs">
            <button
              onClick={() => setLoginAs('admin')}
              data-testid="admin-login-tab"
              className={`flex-1 flex items-center justify-center space-x-2 py-3 rounded-lg font-medium transition-all duration-200 ${
                loginAs === 'admin'
                  ? 'bg-[#D96C5B] text-white shadow-sm'
                  : 'text-[#6A625E] hover:text-[#D96C5B]'
              }`}
              style={{ fontFamily: 'Manrope' }}
            >
              <ShieldCheck size={20} weight={loginAs === 'admin' ? 'fill' : 'regular'} />
              <span>Admin</span>
            </button>
            <button
              onClick={() => setLoginAs('employee')}
              data-testid="employee-login-tab"
              className={`flex-1 flex items-center justify-center space-x-2 py-3 rounded-lg font-medium transition-all duration-200 ${
                loginAs === 'employee'
                  ? 'bg-[#D96C5B] text-white shadow-sm'
                  : 'text-[#6A625E] hover:text-[#D96C5B]'
              }`}
              style={{ fontFamily: 'Manrope' }}
            >
              <User size={20} weight={loginAs === 'employee' ? 'fill' : 'regular'} />
              <span>Employee</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6" data-testid="auth-form">
            <div>
              <label className="block text-sm font-medium text-[#2A2624] mb-2" style={{ fontFamily: 'Manrope' }}>
                Email Address
              </label>
              <div className="relative">
                <EnvelopeSimple size={20} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#A28B7A]" />
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  data-testid="email-input"
                  className="w-full pl-12 pr-4 py-3 bg-white border border-[#E8E2D9] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D96C5B]/20 focus:border-[#D96C5B]"
                  placeholder={loginAs === 'admin' ? 'admin@hrms.com' : 'employee@hrms.com'}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#2A2624] mb-2" style={{ fontFamily: 'Manrope' }}>
                Password
              </label>
              <div className="relative">
                <LockKey size={20} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#A28B7A]" />
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  data-testid="password-input"
                  className="w-full pl-12 pr-4 py-3 bg-white border border-[#E8E2D9] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D96C5B]/20 focus:border-[#D96C5B]"
                  placeholder="Enter your password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              data-testid="auth-submit-button"
              className="w-full bg-[#D96C5B] text-white py-3 px-4 rounded-xl font-medium hover:bg-[#C25949] transition-all duration-200 active:scale-95 disabled:opacity-50"
              style={{ fontFamily: 'Manrope' }}
            >
              {loading ? 'Signing in...' : `Sign In as ${loginAs === 'admin' ? 'Admin' : 'Employee'}`}
            </button>
          </form>

          <div className="mt-8 p-4 bg-[#7D9D85]/10 border border-[#7D9D85]/20 rounded-xl">
            <p className="text-xs text-[#4A5D4E] mb-2 font-bold" style={{ fontFamily: 'Manrope' }}>
              Demo Credentials:
            </p>
            {loginAs === 'admin' ? (
              <p className="text-xs text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>
                Admin: admin@hrms.com / admin123
              </p>
            ) : (
              <p className="text-xs text-[#6A625E]" style={{ fontFamily: 'Manrope' }}>
                Rahul: employee@hrms.com / emp123<br />
                Priya: priya@hrms.com / priya123
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
