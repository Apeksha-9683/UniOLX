import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { searchColleges, requestCollege, getCollegeById } from '../../api';
import { College } from '../../types';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import {
  Search,
  CheckCircle2,
  AlertCircle,
  Building2,
  MapPin,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
  Clock,
  Sparkles,
  Lock,
  Mail,
  User as UserIcon,
  PlusCircle,
  Check,
  X,
  ChevronRight,
  School
} from 'lucide-react';

const PUBLIC_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'yahoo.co.in',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'rediffmail.com',
  'yandex.com',
  'mail.com',
  'gmx.com'
];

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { register, verifyOtp, resendOtp, selectedCollege, setSelectedCollege, setPendingEmail } = useAuth();
  const { showToast } = useToast();

  // Multi-step: 1 = Find College, 2 = Account Details, 3 = Email Verification
  const initialStep = searchParams.get('step') === '3' ? 3 : searchParams.get('step') === '2' ? 2 : 1;
  const [step, setStep] = useState<number>(initialStep);

  // ================= STEP 1 STATE =================
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<College[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [chosenCollege, setChosenCollege] = useState<College | null>(selectedCollege);

  // Request unlisted college modal
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [newCollegeName, setNewCollegeName] = useState('');
  const [newCollegeCity, setNewCollegeCity] = useState('');
  const [newCollegeState, setNewCollegeState] = useState('');
  const [isSubmittingNewCollege, setIsSubmittingNewCollege] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // ================= STEP 2 STATE =================
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  // ================= STEP 3 STATE =================
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [expirySeconds, setExpirySeconds] = useState(60);
  const [resendCooldown, setResendCooldown] = useState(30);
  const [otpError, setOtpError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerifiedSuccess, setIsVerifiedSuccess] = useState(false);

  // Check URL college param on mount
  useEffect(() => {
    const colParam = searchParams.get('college');
    if (colParam) {
      getCollegeById(colParam).then((col) => {
        if (col) {
          setChosenCollege(col);
          setSelectedCollege(col);
        }
      });
    } else if (selectedCollege) {
      setChosenCollege(selectedCollege);
    }
  }, [searchParams, selectedCollege, setSelectedCollege]);

  // Click outside to close college dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search (300ms, min 2 chars)
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setSearchError('');
    setHighlightedIndex(-1);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (value.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      setIsDropdownOpen(false);
      return;
    }

    setIsSearching(true);
    setIsDropdownOpen(true);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchColleges(value);
        setSearchResults(results);
        setIsSearching(false);
      } catch {
        setSearchError('Failed to search colleges. Please try again.');
        setIsSearching(false);
      }
    }, 300);
  };

  // Keyboard navigation for college search dropdown
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen) {
      if (e.key === 'ArrowDown' && searchResults.length > 0) {
        setIsDropdownOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
        selectCollege(searchResults[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };

  const selectCollege = (col: College) => {
    setChosenCollege(col);
    setSelectedCollege(col);
    setSearchQuery('');
    setIsDropdownOpen(false);
    setSearchResults([]);
    showToast(`Selected ${col.shortName}`, 'info');
  };

  // Submit unlisted college form
  const handleRequestCollegeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCollegeName.trim() || !newCollegeCity.trim() || !newCollegeState.trim()) {
      showToast('Please fill all college details', 'error');
      return;
    }

    setIsSubmittingNewCollege(true);
    try {
      const added = await requestCollege({
        name: newCollegeName,
        city: newCollegeCity,
        state: newCollegeState
      });
      setIsSubmittingNewCollege(false);
      setIsRequestModalOpen(false);
      setNewCollegeName('');
      setNewCollegeCity('');
      setNewCollegeState('');

      // Auto select newly requested college
      selectCollege(added);
      showToast(`Added ${added.name} as a Pending Review college`, 'success');
    } catch {
      setIsSubmittingNewCollege(false);
      showToast('Could not register college request. Please try again.', 'error');
    }
  };

  // ================= STEP 2 HANDLERS =================
  const validateStep2 = (): boolean => {
    let valid = true;
    setNameError('');
    setEmailError('');
    setPasswordError('');
    setConfirmError('');

    if (!name.trim()) {
      setNameError('Please enter your full name.');
      valid = false;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setEmailError('Please enter a valid email address.');
      valid = false;
    } else {
      const parts = cleanEmail.split('@');
      const domain = parts[1] || '';

      // Block public domains
      if (PUBLIC_DOMAINS.includes(domain)) {
        setEmailError(`Public email providers like ${domain} are not allowed. Please use your official college email.`);
        valid = false;
      } else if (chosenCollege?.domain) {
        const expected = chosenCollege.domain.toLowerCase().replace('www.', '');
        if (!domain.includes(expected)) {
          setEmailError(`Email domain must match ${chosenCollege.shortName} (@${chosenCollege.domain}).`);
          valid = false;
        }
      } else {
        // Unlisted / pending college
        const isEduStyle =
          domain.endsWith('.ac.in') ||
          domain.endsWith('.edu.in') ||
          domain.endsWith('.edu') ||
          domain.endsWith('.ernet.in');
        if (!isEduStyle) {
          setEmailError('Please use your official education email ending in .ac.in, .edu.in, or .edu.');
          valid = false;
        }
      }
    }

    if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      valid = false;
    }

    if (password !== confirmPassword) {
      setConfirmError('Passwords do not match.');
      valid = false;
    }

    return valid;
  };

  const handleCreateAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosenCollege) {
      setStep(1);
      showToast('Please select your college first', 'error');
      return;
    }

    if (!validateStep2()) {
      return;
    }

    setIsCreatingAccount(true);
    const res = await register({
      collegeId: chosenCollege.id,
      name,
      email,
      password
    });
    setIsCreatingAccount(false);

    if (res.success) {
      setPendingEmail(email);
      setStep(3);
      showToast('Account created! A 6-digit OTP code has been sent.', 'success');
      // Start timers for Step 3
      setExpirySeconds(60);
      setResendCooldown(30);
    } else {
      setEmailError(res.error || 'Failed to create account.');
      showToast(res.error || 'Registration failed', 'error');
    }
  };

  // ================= STEP 3 HANDLERS =================
  // Live countdown timer for OTP
  useEffect(() => {
    if (step !== 3 || expirySeconds <= 0) return;
    const interval = setInterval(() => {
      setExpirySeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [step, expirySeconds]);

  // Live countdown timer for resend cooldown
  useEffect(() => {
    if (step !== 3 || resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [step, resendCooldown]);

  // Focus first OTP box on entering step 3
  useEffect(() => {
    if (step === 3) {
      setTimeout(() => {
        otpRefs.current[0]?.focus();
      }, 100);
    }
  }, [step]);

  const handleOtpBoxChange = (index: number, val: string) => {
    setOtpError('');
    const digitsOnly = val.replace(/\D/g, '');
    if (!digitsOnly) {
      const nextOtp = [...otp];
      nextOtp[index] = '';
      setOtp(nextOtp);
      return;
    }

    const char = digitsOnly[digitsOnly.length - 1];
    const nextOtp = [...otp];
    nextOtp[index] = char;
    setOtp(nextOtp);

    // Auto-focus next box
    if (index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    setOtpError('');
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const nextOtp = [...otp];
    for (let i = 0; i < 6; i++) {
      nextOtp[i] = pasted[i] || '';
    }
    setOtp(nextOtp);

    const focusIdx = Math.min(pasted.length, 5);
    otpRefs.current[focusIdx]?.focus();
  };

  const handleVerifyOtpSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const fullCode = otp.join('');
    if (fullCode.length !== 6) {
      setOtpError('Please enter all 6 digits of your verification code.');
      return;
    }

    setIsVerifying(true);
    setOtpError('');

    const res = await verifyOtp({ email, code: fullCode });
    setIsVerifying(false);

    if (res.success) {
      setIsVerifiedSuccess(true);
      showToast('Verified successfully! Logging you into Campus Mart.', 'success');
      setTimeout(() => {
        navigate('/');
      }, 1200);
    } else {
      setOtpError(res.error || 'Invalid verification code. Please check your inbox or resend.');
      showToast(res.error || 'Verification failed', 'error');
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setOtpError('');
    setOtp(['', '', '', '', '', '']);
    otpRefs.current[0]?.focus();
    setResendCooldown(30);
    setExpirySeconds(60);

    const res = await resendOtp(email);
    showToast(res.message, 'success');
  };

  return (
    <div className="max-w-xl mx-auto w-full px-4 py-4">
      <div className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-[#EFE6D8] shadow-xl shadow-[#FFC72C]/10 space-y-6">
        {/* Step Indicator Header */}
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-[#8C827A] px-2">
            <div className={`flex items-center gap-1.5 ${step >= 1 ? 'text-[#FF7A1A]' : ''}`}>
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black transition-colors ${
                  step > 1
                    ? 'bg-[#10B981] text-white'
                    : step === 1
                    ? 'bg-[#FF7A1A] text-white shadow-xs shadow-[#FF7A1A]/40'
                    : 'bg-[#EFE6D8] text-[#8C827A]'
                }`}
              >
                {step > 1 ? <Check className="w-3.5 h-3.5" /> : '1'}
              </div>
              <span>Find college</span>
            </div>

            <div className={`h-0.5 flex-1 mx-3 rounded-full transition-colors ${step > 1 ? 'bg-[#10B981]' : 'bg-[#EFE6D8]'}`} />

            <div className={`flex items-center gap-1.5 ${step >= 2 ? 'text-[#FF7A1A]' : ''}`}>
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black transition-colors ${
                  step > 2
                    ? 'bg-[#10B981] text-white'
                    : step === 2
                    ? 'bg-[#FF7A1A] text-white shadow-xs shadow-[#FF7A1A]/40'
                    : 'bg-[#EFE6D8] text-[#8C827A]'
                }`}
              >
                {step > 2 ? <Check className="w-3.5 h-3.5" /> : '2'}
              </div>
              <span>Account</span>
            </div>

            <div className={`h-0.5 flex-1 mx-3 rounded-full transition-colors ${step > 2 ? 'bg-[#10B981]' : 'bg-[#EFE6D8]'}`} />

            <div className={`flex items-center gap-1.5 ${step === 3 ? 'text-[#FF7A1A]' : ''}`}>
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black transition-colors ${
                  step === 3
                    ? 'bg-[#FF7A1A] text-white shadow-xs shadow-[#FF7A1A]/40'
                    : 'bg-[#EFE6D8] text-[#8C827A]'
                }`}
              >
                3
              </div>
              <span>Verify</span>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* STEP 1: FIND YOUR COLLEGE */}
        {/* ============================================================ */}
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="text-center space-y-1.5">
              <h1 className="text-2xl sm:text-3xl font-black text-[#1F1A17] tracking-tight">
                Find Your College
              </h1>
              <p className="text-xs sm:text-sm text-[#6B625A]">
                Select your verified campus to exchange items safely with fellow students
              </p>
            </div>

            {/* If college is already selected, show Chip with "Change" & "Continue" */}
            {chosenCollege && !isDropdownOpen && !searchQuery ? (
              <div className="p-4 rounded-3xl bg-gradient-to-r from-[#FFF8EC] to-[#FFF3C4] border-2 border-[#FFD966] space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-[#FF7A1A] text-white flex items-center justify-center font-black text-sm shrink-0 shadow-sm">
                      <School className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-base text-[#1F1A17] truncate">
                          {chosenCollege.name}
                        </span>
                        {chosenCollege.status === 'pending' || chosenCollege.status === 'new' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEF08A] text-[#854D0E] border border-[#FDE047]">
                            Pending review
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#DEF7EC] text-[#03543F] border border-[#84E1BC]">
                            <ShieldCheck className="w-3 h-3 text-[#0E9F6E]" />
                            Verified
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#6B625A] flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3.5 h-3.5 text-[#FF7A1A]" />
                        <span>{chosenCollege.city}, {chosenCollege.state}</span>
                        {chosenCollege.domain && (
                          <span className="text-[#8C6500] font-semibold ml-1">· @{chosenCollege.domain}</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setChosenCollege(null);
                      setTimeout(() => searchInputRef.current?.focus(), 50);
                    }}
                    className="px-3 py-1.5 rounded-full text-xs font-bold text-[#FF7A1A] hover:bg-white hover:shadow-xs transition-all cursor-pointer border border-[#FFD966]"
                  >
                    Change
                  </button>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={() => setStep(2)}
                    icon={<ArrowRight className="w-4 h-4" />}
                  >
                    Continue to Account Details
                  </Button>
                </div>
              </div>
            ) : (
              /* Search Box & Dropdown */
              <div ref={searchContainerRef} className="relative space-y-3">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#6B625A]">
                    <Search className="w-5 h-5 text-[#FF7A1A]" />
                  </div>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                      if (searchResults.length > 0 || searchQuery.length >= 2) {
                        setIsDropdownOpen(true);
                      }
                    }}
                    placeholder="Search over 60+ colleges by name, city, or code (e.g. RVCE, IIT, Delhi)..."
                    className="w-full pl-12 pr-10 py-3.5 rounded-2xl border border-[#E8DFD3] bg-white text-sm text-[#1F1A17] font-medium shadow-xs transition-all duration-200 placeholder:text-[#8C827A] outline-none focus:outline-none focus:border-[#FF7A1A] focus:ring-4 focus:ring-[#FF7A1A]/[0.18]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSearchResults([]);
                        setIsDropdownOpen(false);
                      }}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#8C827A] hover:text-[#1F1A17]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Dropdown Menu */}
                {isDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-3xl border-2 border-[#EFE6D8] shadow-2xl z-50 overflow-hidden divide-y divide-[#F2E7D7] max-h-96 flex flex-col">
                    {/* Loading State */}
                    {isSearching && (
                      <div className="p-4 flex items-center justify-center gap-2 text-xs font-bold text-[#8C6500]">
                        <div className="w-4 h-4 rounded-full border-2 border-[#FFC72C] border-t-[#FF7A1A] animate-spin" />
                        <span>Searching colleges...</span>
                      </div>
                    )}

                    {/* Error State */}
                    {searchError && (
                      <div className="p-4 bg-[#FDE8E8] text-xs text-[#9B1C1C] flex items-center justify-between">
                        <span>{searchError}</span>
                        <button
                          type="button"
                          onClick={() => handleSearchChange(searchQuery)}
                          className="font-bold underline hover:opacity-80"
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {/* Results list */}
                    {!isSearching && !searchError && searchResults.length > 0 && (
                      <div className="overflow-y-auto divide-y divide-[#F2E7D7]">
                        {searchResults.map((col, index) => {
                          const isHighlighted = highlightedIndex === index;
                          const isNew = col.status === 'new' || col.status === 'pending';
                          return (
                            <button
                              key={col.id}
                              type="button"
                              onClick={() => selectCollege(col)}
                              onMouseEnter={() => setHighlightedIndex(index)}
                              className={`w-full text-left p-3.5 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                                isHighlighted ? 'bg-[#FFF8EC]' : 'hover:bg-[#FFF8EC]/60'
                              }`}
                            >
                              <div className="min-w-0 flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-[#FFF3C4] text-[#8C6500] font-black text-xs flex items-center justify-center shrink-0">
                                  {col.shortName.slice(0, 3)}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-xs sm:text-sm text-[#1F1A17] truncate">
                                      {col.name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[11px] text-[#6B625A] truncate">
                                    <span>{col.city}, {col.state}</span>
                                    {col.domain && (
                                      <span className="text-[#8C6500]">· @{col.domain}</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="shrink-0">
                                {isNew ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEF08A] text-[#854D0E] border border-[#FDE047]">
                                    New
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#DEF7EC] text-[#03543F] border border-[#84E1BC]">
                                    <ShieldCheck className="w-3 h-3 text-[#0E9F6E]" />
                                    Verified
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Empty State */}
                    {!isSearching && !searchError && searchResults.length === 0 && searchQuery.trim().length >= 2 && (
                      <div className="p-6 text-center space-y-2">
                        <p className="text-xs font-bold text-[#1F1A17]">
                          No college found matching "{searchQuery}"
                        </p>
                        <p className="text-[11px] text-[#6B625A]">
                          Can't find your campus? You can add it in seconds below.
                        </p>
                      </div>
                    )}

                    {/* Bottom Action: "My college isn't listed" */}
                    <div className="p-3 bg-[#FFF8EC] border-t border-[#EFE6D8] flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-[#6B625A]">
                        Campus not in the list?
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsDropdownOpen(false);
                          setIsRequestModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[#FFD966] text-[#FF7A1A] hover:bg-[#FFF3D6] font-bold text-xs transition-all cursor-pointer shadow-xs"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        <span>My college isn't listed</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Quick Helper for Demo / Popular Campuses */}
            {!chosenCollege && (
              <div className="space-y-2 pt-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#8C827A] block">
                  Popular Campuses:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'rvce', name: 'RVCE Bengaluru' },
                    { id: 'bmsce', name: 'BMSCE Bengaluru' },
                    { id: 'iit-b', name: 'IIT Bombay' },
                    { id: 'iit-d', name: 'IIT Delhi' },
                    { id: 'nitk', name: 'NITK Surathkal' },
                    { id: 'pes', name: 'PES University' }
                  ].map((quick) => (
                    <button
                      key={quick.id}
                      type="button"
                      onClick={async () => {
                        const col = await getCollegeById(quick.id);
                        if (col) selectCollege(col);
                      }}
                      className="px-3 py-1 rounded-full bg-[#FFF8EC] border border-[#EFE6D8] hover:border-[#FF7A1A] hover:bg-[#FFF3D6] text-xs font-semibold text-[#1F1A17] transition-all cursor-pointer"
                    >
                      {quick.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* STEP 2: CREATE YOUR ACCOUNT */}
        {/* ============================================================ */}
        {step === 2 && (
          <form onSubmit={handleCreateAccountSubmit} className="space-y-5 animate-in fade-in duration-200">
            <div className="text-center space-y-1">
              <h1 className="text-2xl sm:text-3xl font-black text-[#1F1A17] tracking-tight">
                Create Your Account
              </h1>
              <p className="text-xs sm:text-sm text-[#6B625A]">
                Join the verified student community for {chosenCollege?.name || 'your college'}
              </p>
            </div>

            {/* Selected College Summary Banner */}
            {chosenCollege && (
              <div className="p-3 rounded-2xl bg-[#FFF8EC] border border-[#FFD966] flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <School className="w-4 h-4 text-[#FF7A1A] shrink-0" />
                  <span className="font-bold text-[#1F1A17] truncate">{chosenCollege.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="font-bold text-[#FF7A1A] hover:underline shrink-0 ml-2 cursor-pointer"
                >
                  Change college
                </button>
              </div>
            )}

            {/* Full Name */}
            <div className="space-y-1">
              <Input
                label="Full Name"
                type="text"
                placeholder="e.g. Priya Iyer"
                icon={<UserIcon className="w-4 h-4" />}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError('');
                }}
                error={nameError}
                required
              />
            </div>

            {/* College Email */}
            <div className="space-y-1">
              <Input
                label="Official College Email"
                type="email"
                placeholder={
                  chosenCollege?.domain
                    ? `e.g. student@${chosenCollege.domain}`
                    : 'e.g. student@college.edu.in'
                }
                icon={<Mail className="w-4 h-4" />}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError('');
                }}
                error={emailError}
                helperText={
                  chosenCollege?.domain
                    ? `Use your @${chosenCollege.domain} email`
                    : 'Use your official college email (usually ends in .ac.in or .edu.in)'
                }
                required
              />
            </div>

            {/* Password */}
            <div className="space-y-1">
              <Input
                label="Create Password"
                type="password"
                placeholder="At least 6 characters"
                icon={<Lock className="w-4 h-4" />}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError('');
                }}
                error={passwordError}
                required
              />
            </div>

            {/* Confirm Password */}
            <div className="space-y-1">
              <Input
                label="Confirm Password"
                type="password"
                placeholder="Re-enter your password"
                icon={<Lock className="w-4 h-4" />}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setConfirmError('');
                }}
                error={confirmError}
                required
              />
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setStep(1)}
              >
                Back
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                isLoading={isCreatingAccount}
                icon={<ArrowRight className="w-5 h-5" />}
              >
                Create account
              </Button>
            </div>
          </form>
        )}

        {/* ============================================================ */}
        {/* STEP 3: EMAIL VERIFICATION */}
        {/* ============================================================ */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="text-center space-y-1.5">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-tr from-[#FF7A1A] to-[#FFC72C] flex items-center justify-center text-white shadow-md shadow-[#FF7A1A]/30">
                <Mail className="w-6 h-6" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#1F1A17] tracking-tight">
                Verify Your Student Email
              </h1>
              <p className="text-xs sm:text-sm text-[#6B625A]">
                We sent a 6-digit confirmation code to{' '}
                <span className="font-bold text-[#1F1A17]">{email || 'your college email'}</span>
              </p>
            </div>

            {/* Testing Demo Hint */}
            <div className="p-3 rounded-2xl bg-gradient-to-r from-[#FFF8EC] to-[#FFF3C4] border border-[#FFD966] text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#FF7A1A] shrink-0" />
                <span className="text-[#8C6500]">
                  Mock Testing Code: <strong className="font-black text-[#1F1A17]">123456</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOtp(['1', '2', '3', '4', '5', '6']);
                  setOtpError('');
                }}
                className="px-2.5 py-1 rounded-full bg-[#FF7A1A] text-white text-[11px] font-bold hover:bg-[#E86707] transition-all cursor-pointer shadow-2xs"
              >
                Quick Fill
              </button>
            </div>

            {/* OTP Input Boxes */}
            <form onSubmit={handleVerifyOtpSubmit} className="space-y-5">
              <div className="flex justify-center gap-2 sm:gap-3" onPaste={handleOtpPaste}>
                {otp.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      otpRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpBoxChange(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    className={`w-11 h-14 sm:w-12 sm:h-16 text-center text-2xl font-black rounded-2xl border transition-all duration-200 shadow-xs outline-none focus:outline-none ${
                      otpError
                        ? 'border-[#E5383B] bg-[#FDE8E8] text-[#9B1C1C] focus:border-[#E5383B] focus:ring-4 focus:ring-[#E5383B]/[0.18]'
                        : digit
                        ? 'border-[#FF7A1A] bg-[#FFF8EC] text-[#1F1A17] focus:border-[#FF7A1A] focus:ring-4 focus:ring-[#FF7A1A]/[0.18]'
                        : 'border-[#E8DFD3] bg-white text-[#1F1A17] hover:border-[#FFC72C] focus:border-[#FF7A1A] focus:ring-4 focus:ring-[#FF7A1A]/[0.18]'
                    }`}
                  />
                ))}
              </div>

              {/* Error state */}
              {otpError && (
                <div className="p-3 rounded-2xl bg-[#FDE8E8] border border-[#F8B4B4] text-xs text-[#9B1C1C] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-[#E5383B] shrink-0" />
                  <span>{otpError}</span>
                </div>
              )}

              {/* Success state */}
              {isVerifiedSuccess && (
                <div className="p-3 rounded-2xl bg-[#DEF7EC] border border-[#84E1BC] text-xs text-[#03543F] flex items-center gap-2 font-bold animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-[#0E9F6E] shrink-0" />
                  <span>Verification successful! Launching your Campus Mart experience...</span>
                </div>
              )}

              {/* Expiry countdown and Resend button */}
              <div className="flex items-center justify-between text-xs text-[#6B625A] pt-1">
                <div className="flex items-center gap-1.5 font-medium">
                  <Clock className="w-3.5 h-3.5 text-[#FF7A1A]" />
                  <span>
                    Expires in:{' '}
                    <strong className="text-[#1F1A17]">
                      0:{expirySeconds.toString().padStart(2, '0')}
                    </strong>
                  </span>
                </div>

                <button
                  type="button"
                  disabled={resendCooldown > 0}
                  onClick={handleResend}
                  className={`flex items-center gap-1 font-bold transition-colors cursor-pointer ${
                    resendCooldown > 0
                      ? 'text-[#8C827A] cursor-not-allowed opacity-70'
                      : 'text-[#FF7A1A] hover:underline'
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>
                    {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : 'Resend code'}
                  </span>
                </button>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                isLoading={isVerifying}
                disabled={isVerifiedSuccess}
                icon={<ArrowRight className="w-5 h-5" />}
              >
                Verify & Enter Campus Mart
              </Button>
            </form>
          </div>
        )}

        {/* Footer Login Link */}
        <div className="pt-4 border-t border-[#F2E7D7] text-center text-xs text-[#6B625A]">
          <span>Already registered on Campus Mart? </span>
          <Link to="/login" className="text-[#FF7A1A] font-extrabold hover:underline">
            Login
          </Link>
        </div>
      </div>

      {/* "My college isn't listed" Modal */}
      <Modal
        isOpen={isRequestModalOpen}
        onClose={() => setIsRequestModalOpen(false)}
        title="Add Your College"
        subtitle="Submit your campus to start trading with your classmates"
      >
        <form onSubmit={handleRequestCollegeSubmit} className="space-y-4">
          <Input
            label="College / University Name"
            type="text"
            placeholder="e.g. National Institute of Design"
            value={newCollegeName}
            onChange={(e) => setNewCollegeName(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="City"
              type="text"
              placeholder="e.g. Ahmedabad"
              value={newCollegeCity}
              onChange={(e) => setNewCollegeCity(e.target.value)}
              required
            />
            <Input
              label="State"
              type="text"
              placeholder="e.g. Gujarat"
              value={newCollegeState}
              onChange={(e) => setNewCollegeState(e.target.value)}
              required
            />
          </div>

          <p className="text-[11px] text-[#6B625A]">
            Your college will be added immediately as a <strong>Pending review</strong> campus so you can proceed to create your account!
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsRequestModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSubmittingNewCollege}
            >
              Add Campus & Continue
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
