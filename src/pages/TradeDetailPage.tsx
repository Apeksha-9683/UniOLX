import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getTradeById, confirmTradePin, cancelTrade, regenerateTradePin, getCurrentUser } from '../api';
import { Trade, User } from '../types';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import {
  KeyRound,
  ShieldCheck,
  MapPin,
  Clock,
  AlertTriangle,
  RotateCw,
  XCircle,
  CheckCircle2,
  Lock,
  MessageSquare,
  ArrowLeft,
  Copy,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';

export const TradeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [trade, setTrade] = useState<Trade | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Seller 6-box input state
  const [sellerPinDigits, setSellerPinDigits] = useState<string[]>(['', '', '', '', '', '']);
  const pinInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Buyer countdown state
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const fetchTrade = async () => {
    if (!id) return;
    try {
      const [t, u] = await Promise.all([getTradeById(id), getCurrentUser()]);
      setTrade(t);
      setCurrentUser(u);
      if (t) {
        setIsSuccess(t.status === 'Completed');
        if (t.expiresAt) {
          const rem = Math.max(0, Math.floor((t.expiresAt - Date.now()) / 1000));
          setTimeLeft(rem);
        }
      }
    } catch {
      showToast('Could not load trade details', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    fetchTrade();
  }, [id]);

  // Countdown timer effect for pending trades
  useEffect(() => {
    if (!trade || trade.status !== 'Pending') return;

    const interval = setInterval(() => {
      if (trade.expiresAt) {
        const rem = Math.max(0, Math.floor((trade.expiresAt - Date.now()) / 1000));
        setTimeLeft(rem);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [trade?.expiresAt, trade?.status]);

  if (loading) {
    return (
      <div className="max-w-[640px] w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        <Skeleton variant="rectangular" className="h-8 w-40 rounded-xl" />
        <Skeleton variant="rectangular" className="h-64 w-full rounded-3xl" />
        <Skeleton variant="rectangular" className="h-48 w-full rounded-3xl" />
      </div>
    );
  }

  if (!trade) {
    return (
      <div className="max-w-md mx-auto text-center py-20 px-4 space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-[#FDE8E8] text-[#E5383B] flex items-center justify-center mx-auto">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-[#1F1A17]">Trade Order Not Found</h2>
        <p className="text-xs text-[#6B625A]">
          This order might have expired or does not exist.
        </p>
        <Link to="/orders">
          <Button variant="primary">Return to My Orders</Button>
        </Link>
      </div>
    );
  }

  const isBuyer = currentUser?.id === trade.buyerId;
  const isExpired = timeLeft <= 0 && trade.status === 'Pending';
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ----------------------------------------------------
  // Seller 6-Digit PIN Verification Handlers
  // ----------------------------------------------------
  const handleDigitChange = (index: number, val: string) => {
    const clean = val.replace(/\D/g, '');
    const newDigits = [...sellerPinDigits];

    if (clean.length > 1) {
      // Paste support
      const pastedChars = clean.slice(0, 6).split('');
      pastedChars.forEach((ch, i) => {
        if (index + i < 6) {
          newDigits[index + i] = ch;
        }
      });
      setSellerPinDigits(newDigits);
      const nextIdx = Math.min(5, index + pastedChars.length);
      pinInputRefs.current[nextIdx]?.focus();
      return;
    }

    newDigits[index] = clean;
    setSellerPinDigits(newDigits);
    setVerificationError(null);

    // Auto-advance
    if (clean && index < 5) {
      pinInputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !sellerPinDigits[index] && index > 0) {
      pinInputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyPin = async () => {
    const fullPin = sellerPinDigits.join('');
    if (fullPin.length !== 6) {
      setVerificationError('Please enter all 6 digits of the confirmation PIN.');
      return;
    }

    setIsVerifying(true);
    setVerificationError(null);

    try {
      const res = await confirmTradePin(trade.id, fullPin);
      if (res.success) {
        setIsSuccess(true);
        showToast(res.message, 'success');
        fetchTrade();
      } else {
        setVerificationError(res.message);
        showToast(res.message, 'error');
        fetchTrade();
      }
    } catch {
      setVerificationError('Network error while verifying PIN.');
    } finally {
      setIsVerifying(false);
    }
  };

  // ----------------------------------------------------
  // Buyer Regenerate PIN & Cancel Handlers
  // ----------------------------------------------------
  const handleRegeneratePin = async () => {
    setIsRegenerating(true);
    try {
      const res = await regenerateTradePin(trade.id);
      showToast(res.message, 'success');
      fetchTrade();
    } catch {
      showToast('Failed to regenerate PIN', 'error');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleCancelTrade = async () => {
    if (!window.confirm('Are you sure you want to cancel this campus trade?')) return;
    setIsCancelling(true);
    try {
      const res = await cancelTrade(trade.id, 'Cancelled by user');
      showToast(res.message, 'info');
      fetchTrade();
    } catch {
      showToast('Failed to cancel trade', 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleCopyPin = (pin: string) => {
    navigator.clipboard.writeText(pin);
    showToast(`PIN ${pin} copied to clipboard!`, 'info');
  };

  return (
    <div className="max-w-[640px] w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Link
          to="/orders"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6B625A] hover:text-[#FF7A1A] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to My Orders</span>
        </Link>

        <StatusBadge status={trade.status} size="md" />
      </div>

      {/* Item Summary Card */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border-2 border-[#EFE6D8] shadow-sm flex items-start gap-4 sm:gap-6">
        <img
          src={trade.listingImage}
          alt={trade.listingTitle}
          className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border border-[#EFE6D8] shrink-0"
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black text-[#8C6500] bg-[#FFF3C4] px-2.5 py-0.5 rounded-full">
              {isBuyer ? 'You are Buyer' : 'You are Seller'}
            </span>
            <span className="text-[11px] text-[#8C827A]">Order #{trade.id.slice(-6).toUpperCase()}</span>
          </div>

          <h1 className="text-base sm:text-lg font-black text-[#1F1A17] truncate">
            {trade.listingTitle}
          </h1>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6B625A]">
            <span className="font-black text-sm text-[#1F1A17]">
              ₹{trade.price.toLocaleString('en-IN')}
              {trade.quantity && trade.quantity > 1 && (
                <span className="text-xs font-medium text-[#6B625A]"> ({trade.quantity} units)</span>
              )}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-[#FF7A1A]" />
              <span>{trade.pickupSpot}</span>
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-[#8C6500]" />
              <span>{trade.scheduledTime}</span>
            </span>
          </div>

          <div className="pt-1 flex items-center justify-between text-xs border-t border-[#F2E7D7]">
            <span className="text-[#8C827A]">
              {isBuyer
                ? `Seller: ${trade.sellerName} (${trade.sellerCollege})`
                : `Buyer: ${trade.buyerName} (${trade.buyerCollege})`}
            </span>
            <Link
              to={`/messages?listingId=${trade.listingId}`}
              className="text-[#FF7A1A] font-bold hover:underline flex items-center gap-1"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Open Chat</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* BUYER TRADE SCREEN: View 6-Digit PIN, Expiry, Regenerate     */}
      {/* ============================================================ */}
      {isBuyer && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-[#EFE6D8] shadow-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-[#FFF3C4] border border-[#FFD966] text-[#FF7A1A] flex items-center justify-center mx-auto shadow-xs">
              <KeyRound className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-black text-[#1F1A17]">Buyer 6-Digit Security PIN</h2>
            <p className="text-xs text-[#6B625A] max-w-md mx-auto">
              Share this PIN with the seller <strong>only after you have personally inspected the item and paid</strong>.
            </p>
          </div>

          {/* Large 6-digit PIN in rounded boxes */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 py-2">
            {trade.confirmationPin.split('').map((digit, idx) => (
              <div
                key={idx}
                className="w-11 h-14 sm:w-14 sm:h-16 rounded-2xl bg-[#FFF8EC] border-2 border-[#FFC72C] flex items-center justify-center font-mono font-black text-2xl sm:text-3xl text-[#1F1A17] shadow-inner select-all"
              >
                {digit}
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <button
              onClick={() => handleCopyPin(trade.confirmationPin)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#8C6500] hover:text-[#1F1A17] bg-[#FFF8EC] px-3 py-1.5 rounded-full border border-[#EFE6D8] transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy PIN</span>
            </button>
          </div>

          {/* Safety Tip Banner */}
          <div className="p-4 rounded-2xl bg-[#FFF3C4] border border-[#FFD966] flex items-start gap-3 text-xs text-[#8C6500]">
            <Lock className="w-4 h-4 text-[#FF7A1A] shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Campus Safety Protocol:</strong> Never share this PIN via message or phone. The seller enters this PIN on their device to complete the handover and mark the item sold.
            </p>
          </div>

          {/* Expiry Countdown & Actions */}
          {trade.status === 'Pending' && (
            <div className="pt-2 border-t border-[#F2E7D7] flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs">
                <Clock className="w-4 h-4 text-[#8C827A]" />
                {isExpired ? (
                  <span className="text-[#E5383B] font-bold">PIN has expired</span>
                ) : (
                  <span className="text-[#6B625A]">
                    Code expires in: <strong className="text-[#1F1A17] font-mono">{formatTime(timeLeft)}</strong>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                {isExpired ? (
                  <Button
                    variant="primary"
                    size="sm"
                    fullWidth
                    isLoading={isRegenerating}
                    icon={<RotateCw className="w-3.5 h-3.5" />}
                    onClick={handleRegeneratePin}
                  >
                    Regenerate PIN
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    isLoading={isRegenerating}
                    icon={<RotateCw className="w-3.5 h-3.5" />}
                    onClick={handleRegeneratePin}
                  >
                    Refresh PIN
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="text-[#E5383B] hover:bg-[#FDE8E8] hover:border-[#F8B4B4]"
                  isLoading={isCancelling}
                  icon={<XCircle className="w-3.5 h-3.5" />}
                  onClick={handleCancelTrade}
                >
                  Cancel Trade
                </Button>
              </div>
            </div>
          )}

          {trade.status === 'Completed' && (
            <div className="p-4 rounded-2xl bg-[#DEF7EC] border border-[#84E1BC] text-center space-y-1">
              <div className="flex items-center justify-center gap-1.5 text-sm font-extrabold text-[#03543F]">
                <CheckCircle2 className="w-5 h-5 text-[#0E9F6E]" />
                <span>Trade Completed & Item Received</span>
              </div>
              <p className="text-xs text-[#03543F]">
                Thank you for using Campus Mart verified in-person handover!
              </p>
            </div>
          )}

          {trade.status === 'Cancelled' && (
            <div className="p-4 rounded-2xl bg-[#FDE8E8] border border-[#F8B4B4] text-center space-y-1">
              <div className="flex items-center justify-center gap-1.5 text-sm font-extrabold text-[#9B1C1C]">
                <XCircle className="w-5 h-5 text-[#E5383B]" />
                <span>Trade Cancelled</span>
              </div>
              <p className="text-xs text-[#9B1C1C]">
                This trade was cancelled and the listing was made available again.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* SELLER TRADE SCREEN: 6 Input Boxes, Verify, Attempts Left    */}
      {/* Notice: "The seller must never be shown the PIN anywhere."  */}
      {/* ============================================================ */}
      {!isBuyer && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 border-2 border-[#EFE6D8] shadow-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-[#FFF3C4] border border-[#FFD966] text-[#FF7A1A] flex items-center justify-center mx-auto shadow-xs">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-black text-[#1F1A17]">Verify Buyer's PIN</h2>
            <p className="text-xs text-[#6B625A] max-w-md mx-auto">
              Ask <strong>{trade.buyerName}</strong> for their 6-digit confirmation PIN after handing over the item.
            </p>
          </div>

          {/* Success State */}
          {trade.status === 'Completed' || isSuccess ? (
            <div className="p-6 rounded-3xl bg-[#DEF7EC] border-2 border-[#84E1BC] text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-[#0E9F6E] text-white flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="font-black text-lg text-[#03543F]">Trade Completed Successfully!</h3>
              <p className="text-xs text-[#03543F]">
                Listing has been marked as sold and transferred to buyer. Great job maintaining campus trust!
              </p>
              <div className="pt-2">
                <Link to="/orders">
                  <Button variant="primary" size="sm">
                    View in Completed Orders
                  </Button>
                </Link>
              </div>
            </div>
          ) : trade.isLocked || (trade.attemptsLeft !== undefined && trade.attemptsLeft <= 0) ? (
            /* Locked State */
            <div className="p-6 rounded-3xl bg-[#FDE8E8] border-2 border-[#F8B4B4] text-center space-y-2">
              <ShieldAlert className="w-8 h-8 text-[#E5383B] mx-auto" />
              <h3 className="font-black text-base text-[#9B1C1C]">Trade Locked</h3>
              <p className="text-xs text-[#9B1C1C] max-w-sm mx-auto">
                Too many incorrect attempts (5/5). For campus security, this trade has been locked.
              </p>
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelTrade}
                  className="text-[#E5383B]"
                >
                  Cancel Trade & Unlock Item
                </Button>
              </div>
            </div>
          ) : trade.status === 'Cancelled' ? (
            /* Cancelled State */
            <div className="p-6 rounded-3xl bg-[#FDE8E8] border-2 border-[#F8B4B4] text-center space-y-2">
              <XCircle className="w-8 h-8 text-[#E5383B] mx-auto" />
              <h3 className="font-black text-base text-[#9B1C1C]">Trade Cancelled</h3>
              <p className="text-xs text-[#9B1C1C]">
                This trade order was cancelled.
              </p>
            </div>
          ) : (
            /* Active PIN Entry Screen for Seller */
            <div className="space-y-6">
              {/* 6 Input boxes */}
              <div>
                <label className="block text-center text-xs font-bold uppercase tracking-wider text-[#6B625A] mb-3">
                  Enter 6-Digit PIN
                </label>
                <div className="flex items-center justify-center gap-2 sm:gap-3">
                  {sellerPinDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => {
                        pinInputRefs.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(idx, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(idx, e)}
                      className={`w-11 h-14 sm:w-14 sm:h-16 text-center font-mono font-black text-2xl sm:text-3xl rounded-2xl border transition-all duration-200 outline-none focus:outline-none ${
                        verificationError
                          ? 'border-[#E5383B] bg-[#FDE8E8] text-[#9B1C1C] focus:border-[#E5383B] focus:ring-4 focus:ring-[#E5383B]/[0.18]'
                          : digit
                          ? 'border-[#FF7A1A] bg-[#FFF8EC] text-[#1F1A17] focus:border-[#FF7A1A] focus:ring-4 focus:ring-[#FF7A1A]/[0.18]'
                          : 'border-[#E8DFD3] bg-white text-[#1F1A17] hover:border-[#FFC72C] focus:border-[#FF7A1A] focus:ring-4 focus:ring-[#FF7A1A]/[0.18]'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Status or Error Display */}
              {verificationError && (
                <div className="p-3 rounded-2xl bg-[#FDE8E8] border border-[#F8B4B4] text-center text-xs font-bold text-[#E5383B] flex items-center justify-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{verificationError}</span>
                </div>
              )}

              {trade.attemptsLeft !== undefined && trade.attemptsLeft < 5 && (
                <div className="text-center text-xs font-bold text-[#E5383B]">
                  ⚠️ Warning: {trade.attemptsLeft} attempt{trade.attemptsLeft === 1 ? '' : 's'} remaining before security lock
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  variant="primary"
                  fullWidth
                  size="lg"
                  isLoading={isVerifying}
                  disabled={sellerPinDigits.join('').length !== 6}
                  onClick={handleVerifyPin}
                >
                  Verify PIN & Mark as Sold
                </Button>

                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleCancelTrade}
                  className="sm:w-36 text-[#E5383B]"
                >
                  Cancel
                </Button>
              </div>

              <div className="p-3 rounded-2xl bg-[#FFF8EC] border border-[#EFE6D8] text-[11px] text-[#6B625A] text-center">
                🛡️ Verified campus security: The PIN is stored in encrypted form and never exposed to the seller.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
