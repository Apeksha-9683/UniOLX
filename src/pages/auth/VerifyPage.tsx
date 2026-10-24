import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import {
  MailCheck,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Clock,
  ArrowRight,
  Sparkles
} from 'lucide-react';

export const VerifyPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { verifyOtp, resendOtp, pendingEmail, user, selectedCollege } = useAuth();
  const { showToast } = useToast();

  const targetEmail = searchParams.get('email') || pendingEmail || user?.email || 'aarav.sharma.cs22@rvce.edu.in';

  // 6 OTP digits
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Timer: 10 minutes countdown (600 seconds)
  const [expirySeconds, setExpirySeconds] = useState(582); // 09:42 default
  // Resend cooldown (30 seconds)
  const [resendCooldown, setResendCooldown] = useState(30);

  const [errorMessage, setErrorMessage] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Live timer for expiry
  useEffect(() => {
    if (expirySeconds <= 0) return;
    const interval = setInterval(() => {
      setExpirySeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [expirySeconds]);

  // Live timer for resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const formatExpiry = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleInputChange = (index: number, value: string) => {
    setErrorMessage('');
    // Take only numbers
    const cleaned = value.replace(/\D/g, '');
    if (!cleaned) {
      const newOtp = [...otp];
      newOtp[index] = '';
      setOtp(newOtp);
      return;
    }

    // Handle single character
    const char = cleaned[cleaned.length - 1];
    const newOtp = [...otp];
    newOtp[index] = char;
    setOtp(newOtp);

    // Auto-focus next input
    if (index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    setErrorMessage('');
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pastedData) return;

    const newOtp = [...otp];
    for (let i = 0; i < 6; i++) {
      newOtp[i] = pastedData[i] || '';
    }
    setOtp(newOtp);

    // Focus last filled box
    const focusIndex = Math.min(pastedData.length, 5);
    inputRefs.current[focusIndex]?.focus();

    // If all 6 digits pasted, trigger validation automatically
    if (pastedData.length === 6) {
      performVerification(pastedData);
    }
  };

  const performVerification = async (codeToVerify: string) => {
    setIsVerifying(true);
    setErrorMessage('');

    // If code is 000000, simulate invalid code error state
    if (codeToVerify === '000000') {
      setIsVerifying(false);
      setErrorMessage('Invalid verification code. Please check your inbox or try demo code 123456.');
      return;
    }

    const res = await verifyOtp(codeToVerify);
    setIsVerifying(false);

    if (res.success) {
      setIsSuccess(true);
      showToast('Institutional email verified! Welcome to Campus Mart.', 'success');
      setTimeout(() => {
        navigate('/');
      }, 1600);
    } else {
      setErrorMessage(res.error || 'Invalid verification code. Please try demo code 123456.');
    }
  };

  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fullCode = otp.join('');
    if (fullCode.length !== 6) {
      setErrorMessage('Please enter all 6 digits of the verification code.');
      return;
    }
    performVerification(fullCode);
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setResendCooldown(30);
    setErrorMessage('');
    const res = await resendOtp();
    showToast(res.message, 'info');
  };

  const handleDemoFill = () => {
    const demo = ['1', '2', '3', '4', '5', '6'];
    setOtp(demo);
    setErrorMessage('');
    inputRefs.current[5]?.focus();
  };

  // SUCCESS STATE
  if (isSuccess) {
    return (
      <div className="max-w-md mx-auto w-full px-4">
        <div className="bg-white rounded-3xl p-8 border-2 border-[#84E1BC] shadow-xl shadow-[#10B981]/15 text-center space-y-5 animate-in zoom-in-95 duration-300">
          <div className="w-20 h-20 rounded-full bg-[#DEF7EC] border-4 border-[#84E1BC] text-[#0E9F6E] flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="w-10 h-10 animate-bounce" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#DEF7EC] text-[#03543F] font-bold text-xs border border-[#84E1BC]">
              <ShieldCheck className="w-3.5 h-3.5 text-[#0E9F6E]" />
              <span>Campus Verified Student</span>
            </div>
            <h2 className="text-2xl font-black text-[#1F1A17]">Email Verified!</h2>
            <p className="text-xs sm:text-sm text-[#6B625A] leading-relaxed">
              Your institutional address <strong>{targetEmail}</strong> has been successfully verified for{' '}
              {selectedCollege?.name || 'RV College of Engineering'}.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#FFF8EC] border border-[#EFE6D8] text-xs text-[#8C6500] font-semibold flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4 text-[#FF7A1A]" />
            <span>Redirecting to your campus marketplace...</span>
          </div>

          <Button
            variant="primary"
            fullWidth
            size="lg"
            onClick={() => navigate('/')}
            icon={<ArrowRight className="w-4 h-4" />}
          >
            Enter Campus Mart Now
          </Button>
        </div>
      </div>
    );
  }

  // STANDARD FORM STATE
  return (
    <div className="max-w-lg mx-auto w-full px-4">
      <div className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-[#EFE6D8] shadow-xl shadow-[#FFC72C]/10 text-center space-y-6">
        {/* Step Indicator Header */}
        <div className="flex items-center justify-between text-xs font-bold text-[#8C827A] px-2 mb-2">
          <div className="flex items-center gap-1.5 text-[#10B981]">
            <div className="w-6 h-6 rounded-full bg-[#10B981] text-white flex items-center justify-center text-xs font-black">
              ✓
            </div>
            <span>Find college</span>
          </div>

          <div className="h-0.5 flex-1 mx-3 rounded-full bg-[#10B981]" />

          <div className="flex items-center gap-1.5 text-[#10B981]">
            <div className="w-6 h-6 rounded-full bg-[#10B981] text-white flex items-center justify-center text-xs font-black">
              ✓
            </div>
            <span>Account</span>
          </div>

          <div className="h-0.5 flex-1 mx-3 rounded-full bg-[#10B981]" />

          <div className="flex items-center gap-1.5 text-[#FF7A1A]">
            <div className="w-6 h-6 rounded-full bg-[#FF7A1A] text-white flex items-center justify-center text-xs font-black shadow-xs shadow-[#FF7A1A]/40">
              3
            </div>
            <span>Verify</span>
          </div>
        </div>

        {/* Top Icon Badge */}
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#FFF3C4] to-[#FFE2BF] border-2 border-[#FFD966] text-[#FF7A1A] flex items-center justify-center mx-auto shadow-xs">
          <MailCheck className="w-8 h-8" />
        </div>

        {/* Headline & Target Email */}
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-black text-[#1F1A17] tracking-tight">
            Verify College Email
          </h1>
          <p className="text-xs sm:text-sm text-[#6B625A]">
            We sent a 6-digit code to your college email:
          </p>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFF8EC] border border-[#EFE6D8] text-xs font-bold text-[#FF7A1A]">
            <span>{targetEmail}</span>
          </div>
        </div>

        {/* Countdown Expire Pill */}
        <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-[#8C6500] bg-[#FFF8E1] py-1.5 px-3 rounded-full border border-[#FFE082] max-w-fit mx-auto">
          <Clock className="w-3.5 h-3.5 text-[#FF7A1A]" />
          <span>Code expires in {formatExpiry(expirySeconds)}</span>
        </div>

        {/* 6 OTP Input Boxes */}
        <form onSubmit={handleVerifySubmit} className="space-y-6">
          <div
            className="flex justify-center items-center gap-2 sm:gap-3"
            onPaste={handlePaste}
          >
            {otp.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => { inputRefs.current[idx] = el; }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleInputChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                className={`w-11 h-14 sm:w-13 sm:h-16 text-center text-xl sm:text-2xl font-black font-mono rounded-2xl border-2 transition-all outline-none ${
                  errorMessage
                    ? 'border-[#E5383B] bg-[#FDE8E8]/30 text-[#E5383B] focus:ring-2 focus:ring-[#E5383B]/20'
                    : digit
                    ? 'border-[#FF7A1A] bg-[#FFFBF2] text-[#1F1A17] ring-2 ring-[#FF7A1A]/10'
                    : 'border-[#EFE6D8] bg-[#FFFDF9] text-[#1F1A17] focus:border-[#FF7A1A] focus:bg-white'
                }`}
              />
            ))}
          </div>

          {/* Invalid-code error state */}
          {errorMessage && (
            <div className="p-3 rounded-2xl bg-[#FDE8E8] border border-[#F8B4B4] text-xs text-[#9B1C1C] flex items-center justify-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-[#E02424] shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Submit Action */}
          <div className="space-y-3">
            <Button
              type="submit"
              variant="primary"
              fullWidth
              size="lg"
              isLoading={isVerifying}
              icon={<ShieldCheck className="w-5 h-5" />}
            >
              Verify Code & Continue
            </Button>

            {/* Quick Demo Fill Helper */}
            <button
              type="button"
              onClick={handleDemoFill}
              className="text-[11px] font-bold text-[#8C6500] hover:text-[#5C4300] bg-[#FFF9EE] hover:bg-[#FFEECB] px-3 py-1 rounded-full border border-[#FFD966] transition-colors cursor-pointer"
            >
              ⚡ Fast Demo: Fill Code 123456
            </button>
          </div>
        </form>

        {/* Resend Code Section with cooldown */}
        <div className="pt-4 border-t border-[#F2E7D7] flex items-center justify-between text-xs text-[#6B625A]">
          <span>Didn't receive the email?</span>
          <button
            type="button"
            disabled={resendCooldown > 0}
            onClick={handleResend}
            className={`font-bold inline-flex items-center gap-1 transition-colors ${
              resendCooldown > 0
                ? 'text-[#A4998E] cursor-not-allowed'
                : 'text-[#FF7A1A] hover:underline cursor-pointer'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code now'}
            </span>
          </button>
        </div>

        <div className="text-center">
          <Link
            to="/auth/register"
            className="text-xs text-[#8C827A] hover:text-[#FF7A1A] hover:underline"
          >
            ← Change email address or college
          </Link>
        </div>
      </div>
    </div>
  );
};
