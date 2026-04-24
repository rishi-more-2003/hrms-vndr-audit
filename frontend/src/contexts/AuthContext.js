import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [contractor, setContractor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));

  const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';

  const fetchCurrentUser = useCallback(async () => {
    const stored = localStorage.getItem('auth_role');
    try {
      if (stored === 'contractor') {
        const r = await axios.get(`${API_URL}/contractor/auth/me`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        setUser(r.data.user);
        setContractor(r.data.contractor);
      } else if (stored === 'platform_admin') {
        // Minimal user shape from token — platform admin doesn't have a /me endpoint yet
        setUser({ role: 'platform_admin', email: 'founder@saffronservices.in', full_name: 'Saffron Founder' });
        setContractor(null);
      } else {
        const response = await axios.get(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        setUser(response.data);
        setContractor(null);
      }
    } catch (error) {
      logout();
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    // Pickup impersonation/preview token from URL hash
    if (window.location.hash.includes('impersonate=')) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const imp = params.get('impersonate');
      const mode = params.get('mode') || 'preview';
      const from = params.get('from') || '';
      if (imp) {
        localStorage.setItem('token', imp);
        localStorage.setItem('auth_role', 'contractor');
        localStorage.setItem('impersonation_mode', mode);
        localStorage.setItem('impersonation_from', from);
        setToken(imp);
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      fetchCurrentUser();
    } else {
      setLoading(false);
    }
  }, [token, fetchCurrentUser]);

  const login = async (email, password, loginAs) => {
    try {
      const response = await axios.post(`${API_URL}/auth/login`, { email, password, login_as: loginAs });
      const { access_token, user: userData } = response.data;
      localStorage.setItem('token', access_token);
      localStorage.setItem('auth_role', userData.role);
      setToken(access_token);
      setUser(userData);
      setContractor(null);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || 'Login failed' };
    }
  };

  const contractorLogin = async (email, password) => {
    try {
      const response = await axios.post(`${API_URL}/contractor/auth/login`, { email, password });
      const { access_token, user: userData, contractor: c } = response.data;
      localStorage.setItem('token', access_token);
      localStorage.setItem('auth_role', 'contractor');
      setToken(access_token);
      setUser(userData);
      setContractor(c);
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      return { success: true, must_change_password: userData.must_change_password };
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || 'Login failed' };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('auth_role');
    localStorage.removeItem('impersonation_mode');
    localStorage.removeItem('impersonation_from');
    setToken(null);
    setUser(null);
    setContractor(null);
    delete axios.defaults.headers.common['Authorization'];
  };

  const impersonationMode = localStorage.getItem('impersonation_mode'); // 'preview' | 'impersonate' | null
  const impersonationFrom = localStorage.getItem('impersonation_from');
  const isAdmin = user?.role === 'admin';
  const isContractor = user?.role === 'contractor';
  const hasPermission = (module) => {
    if (isAdmin) return true;
    return user?.permissions?.[module] === true;
  };

  // Cross-module access helper. Checks /auth/me shape (module_roles) plus legacy admin fallback.
  // Mirrors backend logic in module_roles.accessible_modules() — admins are granted access
  // to every module their org has enabled (enforced server-side on endpoints).
  const moduleRoles = user?.module_roles || {};
  const hasModuleAccess = (moduleKey) => {
    if (!user) return false;
    if (moduleRoles[moduleKey]) return true;
    // Legacy admin fallback — admins implicitly access all modules (server enforces org.modules)
    if (user.role === 'admin') return true;
    // Legacy employee has implicit hrms access
    if (moduleKey === 'hrms' && user.role === 'employee') return true;
    return false;
  };

  return (
    <AuthContext.Provider value={{ user, contractor, loading, login, contractorLogin, logout, token, isAdmin, isContractor, hasPermission, impersonationMode, impersonationFrom, moduleRoles, hasModuleAccess }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
