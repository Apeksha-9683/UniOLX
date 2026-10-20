import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, College } from '../types';
import {
  getCurrentUser,
  login,
  registerUser,
  verifyOtp,
  resendVerificationOtp,
  logout,
  getCollegeById
} from '../api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  isVerified: boolean;
  selectedCollege: College | null;
  setSelectedCollege: (college: College | null) => void;
  pendingEmail: string;
  setPendingEmail: (email: string) => void;
  login: (
    arg1: { email: string; password: string } | string,
    arg2?: string
  ) => Promise<{ success: boolean; user?: User; error?: string }>;
  register: (data: {
    collegeId: string;
    name: string;
    email: string;
    password: string;
    branch?: string;
  }) => Promise<{ success: boolean; user?: User; error?: string }>;
  verifyOtp: (
    arg1: { email?: string; code: string } | string,
    arg2?: string
  ) => Promise<{ success: boolean; user?: User; error?: string }>;
  resendOtp: (email?: string) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SELECTED_COLLEGE_KEY = 'campus_mart_selected_college';
const PENDING_EMAIL_KEY = 'campus_mart_pending_email';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCollege, setSelectedCollegeState] = useState<College | null>(null);
  const [pendingEmail, setPendingEmailState] = useState<string>(() => {
    return localStorage.getItem(PENDING_EMAIL_KEY) || '';
  });

  const setSelectedCollege = (col: College | null) => {
    setSelectedCollegeState(col);
    if (col) {
      localStorage.setItem(SELECTED_COLLEGE_KEY, JSON.stringify(col));
    } else {
      localStorage.removeItem(SELECTED_COLLEGE_KEY);
    }
  };

  const setPendingEmail = (email: string) => {
    setPendingEmailState(email);
    localStorage.setItem(PENDING_EMAIL_KEY, email);
  };

  const refreshUser = async () => {
    const u = await getCurrentUser();
    setUser(u);
    if (u) {
      const col = await getCollegeById(u.collegeId);
      if (col) {
        setSelectedCollegeState(col);
      }
    }
  };

  useEffect(() => {
    // Load stored college
    const storedCol = localStorage.getItem(SELECTED_COLLEGE_KEY);
    if (storedCol) {
      try {
        setSelectedCollegeState(JSON.parse(storedCol));
      } catch {
        // ignore
      }
    }

    refreshUser().finally(() => setLoading(false));
  }, []);

  const handleLogin = async (
    arg1: { email: string; password: string } | string,
    arg2?: string
  ) => {
    const res = await login(arg1, arg2);
    if (res.success && res.user) {
      setUser(res.user);
      const col = await getCollegeById(res.user.collegeId);
      if (col) setSelectedCollege(col);
      return { success: true, user: res.user };
    }
    return { success: false, error: res.error || 'Failed to sign in' };
  };

  const handleRegister = async (data: {
    collegeId: string;
    name: string;
    email: string;
    password: string;
    branch?: string;
  }) => {
    const res = await registerUser(data);
    if (res.success && res.user) {
      setUser(res.user);
      setPendingEmail(data.email);
      const col = await getCollegeById(data.collegeId);
      if (col) setSelectedCollege(col);
      return { success: true, user: res.user };
    }
    return { success: false, error: res.error || 'Failed to create account' };
  };

  const handleVerifyOtp = async (
    arg1: { email?: string; code: string } | string,
    arg2?: string
  ) => {
    let email = pendingEmail || user?.email || '';
    let code = '';
    if (typeof arg1 === 'object') {
      email = arg1.email || email;
      code = arg1.code;
    } else {
      if (arg2 !== undefined) {
        email = arg1;
        code = arg2;
      } else {
        code = arg1;
      }
    }

    const res = await verifyOtp({ email, code });
    if (res.success && res.user) {
      setUser(res.user);
      return { success: true, user: res.user };
    }
    return { success: false, error: res.error || 'Invalid verification code' };
  };

  const handleResendOtp = async (customEmail?: string) => {
    const targetEmail = customEmail || pendingEmail || user?.email || 'student@campus.edu.in';
    return await resendVerificationOtp(targetEmail);
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        isVerified: !!user?.isVerified,
        selectedCollege,
        setSelectedCollege,
        pendingEmail,
        setPendingEmail,
        login: handleLogin,
        register: handleRegister,
        verifyOtp: handleVerifyOtp,
        resendOtp: handleResendOtp,
        logout: handleLogout,
        refreshUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export { ProtectedRoute } from '../components/layout/ProtectedRoute';

