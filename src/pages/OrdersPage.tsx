import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getTrades, cancelTrade, getCurrentUser } from '../api';
import { Trade, User } from '../types';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import {
  KeyRound,
  MapPin,
  Clock,
  ShieldCheck,
  MessageSquare,
  XCircle,
  Eye,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight
} from 'lucide-react';

export const OrdersPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [trades, setTrades] = useState<Trade[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'Pending' | 'Completed' | 'Cancelled'>('Pending');
  const [cancellingTradeId, setCancellingTradeId] = useState<string | null>(null);

  const fetchAll = async () => {
    try {
      const [tList, u] = await Promise.all([getTrades(), getCurrentUser()]);
      setTrades(tList);
      setCurrentUser(u);
    } catch {
      showToast('Failed to load orders', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleCancelTrade = async (tradeId: string) => {
    if (!window.confirm('Are you sure you want to cancel this campus order?')) return;
    setCancellingTradeId(tradeId);
    try {
      const res = await cancelTrade(tradeId, 'Cancelled from orders');
      showToast(res.message, 'info');
      await fetchAll();
    } catch {
      showToast('Failed to cancel order', 'error');
    } finally {
      setCancellingTradeId(null);
    }
  };

  const filteredTrades = trades.filter((t) => {
    if (activeTab === 'Pending') return t.status === 'Pending' || t.status === 'Reserved';
    if (activeTab === 'Completed') return t.status === 'Completed' || t.status === 'Sold';
    if (activeTab === 'Cancelled') return t.status === 'Cancelled';
    return true;
  });

  const pendingCount = trades.filter((t) => t.status === 'Pending' || t.status === 'Reserved').length;
  const completedCount = trades.filter((t) => t.status === 'Completed' || t.status === 'Sold').length;
  const cancelledCount = trades.filter((t) => t.status === 'Cancelled').length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFF3C4] text-[#8C6500] font-bold text-xs mb-1 border border-[#FFD966]">
            <KeyRound className="w-3.5 h-3.5 text-[#FF7A1A]" />
            <span>PIN-Secured Handover</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#1F1A17] tracking-tight">
            My Campus Orders
          </h1>
          <p className="text-xs sm:text-sm text-[#6B625A] mt-1">
            Track student trades, view your confidential PINs, or enter buyer codes to confirm sales
          </p>
        </div>

        <Link to="/categories">
          <Button variant="outline" size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />}>
            Browse More Listings
          </Button>
        </Link>
      </div>

      {/* Safety Protocol Banner */}
      <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-[#FFF3C4] via-[#FFE2BF] to-[#FFF3C4] border-2 border-[#FFD966] flex items-start gap-3.5 shadow-2xs">
        <div className="w-10 h-10 rounded-2xl bg-[#FF7A1A] text-white flex items-center justify-center shrink-0 shadow-sm">
          <KeyRound className="w-5 h-5" />
        </div>
        <div className="space-y-0.5">
          <h3 className="font-extrabold text-xs sm:text-sm text-[#1F1A17]">
            How Campus Mart 6-Digit PIN Security Works
          </h3>
          <p className="text-xs text-[#6B625A] leading-relaxed">
            <strong>Buyers:</strong> Share your 6-digit PIN only after inspecting the item in person at the campus spot and paying.
            <br />
            <strong>Sellers:</strong> Tap "Enter PIN" to verify the buyer's code. Once verified, the listing is instantly marked as sold.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b-2 border-[#EFE6D8] pb-1 overflow-x-auto">
        {(
          [
            { id: 'Pending', label: 'Pending', count: pendingCount },
            { id: 'Completed', label: 'Completed', count: completedCount },
            { id: 'Cancelled', label: 'Cancelled', count: cancelledCount }
          ] as const
        ).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-[#FF7A1A] text-white shadow-sm'
                  : 'text-[#6B625A] hover:bg-[#FFF3D6] hover:text-[#1F1A17]'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  isActive ? 'bg-white/20 text-white' : 'bg-[#FFF3C4] text-[#8C6500]'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {loading ? (
          <div className="space-y-4">
            <Skeleton variant="rectangular" className="h-32 w-full rounded-3xl" count={3} />
          </div>
        ) : filteredTrades.length > 0 ? (
          filteredTrades.map((trade) => {
            const isBuyer = currentUser?.id === trade.buyerId;
            const isPending = trade.status === 'Pending' || trade.status === 'Reserved';

            return (
              <div
                key={trade.id}
                className="bg-white rounded-3xl p-5 sm:p-6 border-2 border-[#EFE6D8] shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 hover:border-[#FFC72C] transition-all"
              >
                {/* Left side: Item snapshot & Details */}
                <div className="flex items-start gap-4 sm:gap-5 min-w-0 flex-1">
                  <img
                    src={trade.listingImage}
                    alt={trade.listingTitle}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border border-[#EFE6D8] shrink-0"
                  />
                  <div className="min-w-0 space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-mono text-[#8C827A] font-semibold">
                        #{trade.id.slice(-6).toUpperCase()}
                      </span>
                      {/* Role Badge: Buying / Selling */}
                      <span
                        className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full tracking-wide ${
                          isBuyer
                            ? 'bg-[#FFF3C4] text-[#8C6500] border border-[#FFD966]'
                            : 'bg-[#DEF7EC] text-[#03543F] border border-[#84E1BC]'
                        }`}
                      >
                        {isBuyer ? 'Buying' : 'Selling'}
                      </span>
                      {/* Status Badge */}
                      <StatusBadge status={trade.status} size="sm" />
                    </div>

                    <h3 className="font-extrabold text-sm sm:text-base text-[#1F1A17] truncate">
                      {trade.listingTitle}
                    </h3>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6B625A]">
                      <span className="font-black text-[#1F1A17] text-sm">
                        ₹{trade.price.toLocaleString('en-IN')}
                        {trade.quantity && trade.quantity > 1 && (
                          <span className="text-xs font-normal text-[#6B625A]"> ({trade.quantity} units)</span>
                        )}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-[#FF7A1A]" />
                        <span className="truncate max-w-[150px] sm:max-w-none">{trade.pickupSpot}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-[#8C6500]" />
                        <span>{trade.scheduledTime}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-[#8C827A] pt-0.5">
                      <span>
                        {isBuyer
                          ? `Seller: ${trade.sellerName} (${trade.sellerCollege})`
                          : `Buyer: ${trade.buyerName} (${trade.buyerCollege})`}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>{trade.createdAt}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right side: Action Buttons */}
                <div className="w-full lg:w-auto shrink-0 flex flex-wrap sm:flex-nowrap items-center gap-2.5 pt-3 lg:pt-0 border-t lg:border-t-0 border-[#F2E7D7]">
                  {/* Open Chat Button */}
                  <Link
                    to={`/messages?listingId=${trade.listingId}`}
                    className="flex-1 sm:flex-initial"
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      fullWidth
                      icon={<MessageSquare className="w-3.5 h-3.5 text-[#6B625A]" />}
                    >
                      Open Chat
                    </Button>
                  </Link>

                  {/* Buyer View PIN button */}
                  {isBuyer && isPending && (
                    <Link to={`/trades/${trade.id}`} className="flex-1 sm:flex-initial">
                      <Button
                        variant="primary"
                        size="sm"
                        fullWidth
                        icon={<Eye className="w-3.5 h-3.5" />}
                      >
                        View PIN
                      </Button>
                    </Link>
                  )}

                  {/* Seller Enter PIN button */}
                  {!isBuyer && isPending && (
                    <Link to={`/trades/${trade.id}`} className="flex-1 sm:flex-initial">
                      <Button
                        variant="yellow"
                        size="sm"
                        fullWidth
                        icon={<KeyRound className="w-3.5 h-3.5 text-[#FF7A1A]" />}
                      >
                        Enter PIN
                      </Button>
                    </Link>
                  )}

                  {/* View Details if completed/cancelled */}
                  {!isPending && (
                    <Link to={`/trades/${trade.id}`} className="flex-1 sm:flex-initial">
                      <Button variant="outline" size="sm" fullWidth>
                        Trade Details
                      </Button>
                    </Link>
                  )}

                  {/* Cancel Button */}
                  {isPending && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-[#E5383B] hover:bg-[#FDE8E8] hover:border-[#F8B4B4]"
                      isLoading={cancellingTradeId === trade.id}
                      icon={<XCircle className="w-3.5 h-3.5" />}
                      onClick={() => handleCancelTrade(trade.id)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <EmptyState
            title={`No ${activeTab.toLowerCase()} orders`}
            description={
              activeTab === 'Pending'
                ? 'You have no active pending trades. Find textbooks, cycles, or electronics to trade on campus!'
                : `You have no ${activeTab.toLowerCase()} orders in your transaction history.`
            }
            actionLabel="Browse Campus Marketplace"
            onAction={() => navigate('/categories')}
          />
        )}
      </div>
    </div>
  );
};
