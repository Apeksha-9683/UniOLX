import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import {
  Mail,
  Lock,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  HelpCircle,
  KeyRound,
  CheckCircle2
} from 'lucide-react';
import {
  CampusDoodleBicycle,
  CampusDoodleBook,
  CampusDoodleChai
} from '../../components/ui/CampusDoodles';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, user } = useAuth();
  const { showToast } = useToast();

  const [email, setEmail] = useState('aarav.sharma.cs22@rvce.edu.in');
  const [password, setPassword] = useState('campus2026!');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Forgot password modal state
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please provide your college email and password.');
      return;
    }

    setIsLoading(true);
    const res = await login(email, password);
    setIsLoading(false);

    if (res.success && res.user) {
      if (!res.user.isVerified) {
        showToast('Please verify your college email address with the OTP code.', 'info');
        navigate('/verify');
      } else {
        showToast('Welcome back! Signed in with institutional credentials.', 'success');
        navigate('/');
      }
    } else {
      setError(res.error || 'Invalid credentials or college domain.');
      showToast(res.error || 'Failed to sign in', 'error');
    }
  };

  const handleDemoFill = () => {
    setEmail('aarav.sharma.cs22@rvce.edu.in');
    setPassword('campus2026!');
    setError('');
    showToast('Filled verified student demo credentials (RVCE)', 'info');
  };

  const handleResetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      showToast('Please enter your institutional email', 'error');
      return;
    }
    setResetSuccess(true);
    showToast(`Password reset link dispatched to ${resetEmail}`, 'success');
    setTimeout(() => {
      setIsForgotModalOpen(false);
      setResetSuccess(false);
      setResetEmail('');
    }, 2000);
  };

  return (
    <div className="max-w-md mx-auto w-full px-4">
      <div className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-[#EFE6D8] shadow-xl shadow-[#FFC72C]/10 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#DEF7EC] text-[#03543F] font-bold text-xs border border-[#84E1BC]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#0E9F6E]" />
            <span>Institutional Sign In</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-[#1F1A17] tracking-tight">
            Welcome to Campus Mart
          </h1>

          <p className="text-xs sm:text-sm text-[#6B625A]">
            Log in with your university credentials to buy, sell, and chat on campus
          </p>
        </div>

        {/* Demo Fast Fill Button */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#FFF8EC] to-[#FFF3C4] border border-[#FFD966] flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#FF7A1A] shrink-0" />
            <div className="text-left">
              <span className="font-bold text-[#1F1A17] block">Demo Account</span>
              <span className="text-[11px] text-[#8C6500]">Aarav Sharma · RVCE Bengaluru</span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDemoFill}
            className="px-3 py-1.5 rounded-full bg-[#FF7A1A] text-white font-bold text-xs hover:bg-[#E86707] transition-all cursor-pointer shadow-xs"
          >
            Auto Fill
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="p-3 rounded-2xl bg-[#FDE8E8] border border-[#F8B4B4] text-xs text-[#9B1C1C]">
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="College Institutional Email"
            type="email"
            placeholder="e.g. aarav.sharma.cs22@rvce.edu.in"
            icon={<Mail className="w-4 h-4" />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            helperText="Supports RVCE, BMSCE, IISc, NITK, IIT and other partner domains"
            required
          />

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#6B625A]">
                Password
              </label>
              <button
                type="button"
                onClick={() => {
                  setResetEmail(email);
                  setIsForgotModalOpen(true);
                }}
                className="text-xs font-bold text-[#FF7A1A] hover:underline cursor-pointer"
              >
                Forgot password?
              </button>
            </div>
            <Input
              type="password"
              placeholder="••••••••"
              icon={<Lock className="w-4 h-4" />}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="pt-2 space-y-3">
            <Button
              type="submit"
              variant="primary"
              fullWidth
              size="lg"
              isLoading={isLoading}
              icon={<ArrowRight className="w-5 h-5" />}
            >
              Login
            </Button>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-[#EFE6D8]" />
              <span className="flex-shrink mx-3 text-xs uppercase font-bold text-[#8C827A]">
                Don't have an account?
              </span>
              <div className="flex-grow border-t border-[#EFE6D8]" />
            </div>

            <Link
              to="/register"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border-2 border-[#FF7A1A] bg-white hover:bg-[#FFF3D6] text-[#FF7A1A] font-extrabold text-sm transition-all shadow-xs active:scale-98"
            >
              <span>Create account</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </form>
      </div>

      {/* Forgot Password Modal */}
      <Modal
        isOpen={isForgotModalOpen}
        onClose={() => setIsForgotModalOpen(false)}
        title="Reset Campus Password"
        subtitle="Enter your verified college email to receive a recovery link"
      >
        {resetSuccess ? (
          <div className="text-center py-6 space-y-3">
            <div className="w-14 h-14 rounded-full bg-[#DEF7EC] border-2 border-[#84E1BC] text-[#0E9F6E] flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-base text-[#1F1A17]">Recovery Link Sent</h3>
            <p className="text-xs text-[#6B625A] max-w-xs mx-auto">
              We sent a secure password reset link to <strong>{resetEmail}</strong>. Please check your college inbox.
            </p>
          </div>
        ) : (
          <form onSubmit={handleResetSubmit} className="space-y-4 py-2">
            <Input
              label="Registered College Email"
              type="email"
              placeholder="e.g. aarav.sharma.cs22@rvce.edu.in"
              icon={<Mail className="w-4 h-4" />}
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              required
            />

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                fullWidth
                onClick={() => setIsForgotModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" fullWidth>
                Send Recovery Link
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
