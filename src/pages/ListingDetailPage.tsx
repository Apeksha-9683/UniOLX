import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getListingById, createOrGetConversation, createTrade, toggleWishlist } from '../api';
import { Listing } from '../types';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Modal } from '../components/ui/Modal';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import {
  MapPin,
  ShieldCheck,
  Star,
  MessageSquare,
  KeyRound,
  Heart,
  ChevronLeft,
  ChevronRight,
  Share2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Tag,
  Plus,
  Minus,
  Sparkles,
  Info
} from 'lucide-react';

export const ListingDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [quantity, setQuantity] = useState(1);

  // Trade Modal State
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [pickupSpot, setPickupSpot] = useState('');
  const [scheduledTime, setScheduledTime] = useState('Today at 5:00 PM (After classes)');
  const [isSubmittingTrade, setIsSubmittingTrade] = useState(false);

  useEffect(() => {
    if (id) {
      getListingById(id).then((data) => {
        setListing(data);
        if (data) {
          setPickupSpot(data.campusPickupSpot);
          setIsWishlisted(!!data.isWishlisted);
        }
        setLoading(false);
      });
    }
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-12 space-y-6">
        <Skeleton variant="rectangular" className="h-8 w-40" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Skeleton variant="rectangular" className="h-96 w-full rounded-3xl" />
          <div className="space-y-4">
            <Skeleton variant="rectangular" className="h-8 w-3/4" />
            <Skeleton variant="rectangular" className="h-12 w-1/2" />
            <Skeleton variant="rectangular" className="h-40 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="max-w-md mx-auto text-center py-20 px-4 space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-[#FFF3C4] text-[#FF7A1A] flex items-center justify-center mx-auto">
          <Tag className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-[#1F1A17]">Item not found</h2>
        <p className="text-xs text-[#6B625A]">
          This listing may have been completed, sold, or moved by the student seller.
        </p>
        <Link to="/categories">
          <Button variant="primary">Browse Campus Marketplace</Button>
        </Link>
      </div>
    );
  }

  const isSeller = user?.id === listing.seller.id;
  const isUnavailable = listing.status === 'Reserved' || listing.status === 'Sold' || listing.status === 'Completed';
  const availableUnits = listing.quantity || 1;

  const handleChat = async () => {
    try {
      const conv = await createOrGetConversation(listing.id);
      navigate(`/messages?conv=${conv.id}`);
    } catch {
      showToast('Could not initiate conversation', 'error');
    }
  };

  const handleToggleWishlist = async () => {
    const saved = await toggleWishlist(listing.id);
    setIsWishlisted(saved);
    showToast(saved ? 'Added to your campus wishlist!' : 'Removed from wishlist', 'info');
  };

  const handleConfirmTrade = async () => {
    setIsSubmittingTrade(true);
    try {
      const trade = await createTrade({
        listingId: listing.id,
        pickupSpot,
        scheduledTime,
        quantity
      });
      setIsTradeModalOpen(false);
      document.body.style.overflow = '';
      window.scrollTo({ top: 0, behavior: 'instant' });
      showToast(`Trade scheduled! Your 6-digit PIN is ready.`, 'success');
      navigate(`/trades/${trade.id}`);
    } catch {
      showToast('Error scheduling campus trade', 'error');
    } finally {
      setIsSubmittingTrade(false);
    }
  };

  const discountPercent =
    listing.originalPrice > listing.price
      ? Math.round(((listing.originalPrice - listing.price) / listing.originalPrice) * 100)
      : null;

  const nextImage = () => {
    setSelectedImageIndex((prev) => (prev + 1) % listing.images.length);
  };

  const prevImage = () => {
    setSelectedImageIndex((prev) => (prev - 1 + listing.images.length) % listing.images.length);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Breadcrumb Nav */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6B625A] hover:text-[#1F1A17] transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Marketplace</span>
        </button>

        <div className="flex items-center gap-2 text-xs font-semibold text-[#8C6500] bg-[#FFF8EC] px-3 py-1 rounded-full border border-[#EFE6D8]">
          <MapPin className="w-3.5 h-3.5 text-[#FF7A1A]" />
          <span>{listing.collegeName}</span>
        </div>
      </div>

      {/* Main Grid: Gallery on left, Details on right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Image Gallery with Thumbnails & Safety Tip */}
        <div className="lg:col-span-7 space-y-6">
          {/* Main Hero Image */}
          <div className="relative aspect-[4/3] rounded-3xl overflow-hidden bg-white border-2 border-[#EFE6D8] shadow-md shadow-[#FFC72C]/10 group">
            <img
              src={listing.images[selectedImageIndex] || listing.images[0]}
              alt={listing.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover transition-transform duration-300"
            />

            {/* Status & Condition Overlay */}
            <div className="absolute top-4 left-4 flex items-center gap-2">
              <StatusBadge status={listing.status} />
              <span className="bg-white/95 text-[#1F1A17] font-bold text-xs px-3 py-1 rounded-full border border-[#EFE6D8] shadow-xs">
                {listing.condition}
              </span>
            </div>

            {/* Discount Badge */}
            {discountPercent && discountPercent > 5 && (
              <div className="absolute bottom-4 left-4 bg-[#E5383B] text-white text-xs font-black px-3.5 py-1 rounded-full shadow-md">
                {discountPercent}% OFF Original MRP
              </div>
            )}

            {/* Previous/Next Arrows (if multiple images) */}
            {listing.images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={prevImage}
                  aria-label="Previous image"
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 hover:bg-white text-[#1F1A17] shadow-md transition-all cursor-pointer opacity-80 group-hover:opacity-100"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={nextImage}
                  aria-label="Next image"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 hover:bg-white text-[#1F1A17] shadow-md transition-all cursor-pointer opacity-80 group-hover:opacity-100"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}
          </div>

          {/* Gallery Thumbnails Strip */}
          {listing.images.length > 1 && (
            <div className="flex items-center gap-3 overflow-x-auto pb-1">
              {listing.images.map((img, idx) => {
                const isSelected = selectedImageIndex === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedImageIndex(idx)}
                    className={`relative w-20 h-20 rounded-2xl overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
                      isSelected
                        ? 'border-[#FF7A1A] ring-2 ring-[#FF7A1A]/20 scale-105'
                        : 'border-[#EFE6D8] hover:border-[#FFC72C] opacity-75 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={img}
                      alt={`Thumbnail ${idx + 1}`}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </button>
                );
              })}
            </div>
          )}

          {/* Safety Tip Box */}
          <div className="p-5 rounded-3xl bg-gradient-to-r from-[#FFF8EC] to-[#FFF3C4] border-2 border-[#FFD966] flex items-start gap-3.5 shadow-2xs">
            <div className="w-10 h-10 rounded-2xl bg-[#FF7A1A] text-white flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#8C6500]">
                Campus Safety Protocol
              </h4>
              <p className="text-xs sm:text-sm font-semibold text-[#1F1A17] leading-relaxed">
                "Meet in a public campus spot and share your PIN only after you've received the item."
              </p>
              <p className="text-[11px] text-[#6B625A]">
                Check battery health, textbook edition, or cycle gears before releasing your 4-digit verification code.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Title, Price, Quantity, Actions, Seller & Specs */}
        <div className="lg:col-span-5 space-y-6">
          {/* Main Action & Pricing Card */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 border-2 border-[#EFE6D8] shadow-sm space-y-5">
            {/* Category & Title */}
            <div>
              <span className="text-xs font-bold text-[#FF7A1A] uppercase tracking-wider">
                {listing.category}
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-[#1F1A17] mt-1 leading-snug">
                {listing.title}
              </h1>
            </div>

            {/* Price Box */}
            <div className="flex items-baseline gap-3 p-4 rounded-2xl bg-[#FFFBF2] border border-[#EFE6D8]">
              <span className="text-3xl font-black text-[#1F1A17]">
                ₹{listing.price.toLocaleString('en-IN')}
              </span>
              {listing.originalPrice > listing.price && (
                <span className="text-sm sm:text-base text-[#A4998E] line-through font-semibold">
                  ₹{listing.originalPrice.toLocaleString('en-IN')}
                </span>
              )}
            </div>

            {/* Pickup Landmark */}
            <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-[#FFF8EC] border border-[#EFE6D8] text-xs">
              <MapPin className="w-4 h-4 text-[#FF7A1A] shrink-0" />
              <div>
                <span className="font-bold text-[#1F1A17]">Campus Pickup Spot: </span>
                <span className="text-[#6B625A]">{listing.campusPickupSpot}</span>
              </div>
            </div>

            {/* Quantity Selector (When listing has > 1 unit) */}
            {availableUnits > 1 && !isUnavailable && !isSeller && (
              <div className="p-3.5 rounded-2xl bg-[#FFFDF9] border border-[#EFE6D8] flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#1F1A17] block">Quantity</span>
                  <span className="text-[11px] text-[#6B625A]">{availableUnits} units available on campus</span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={quantity <= 1}
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-8 h-8 rounded-full bg-white border border-[#EFE6D8] hover:border-[#FF7A1A] disabled:opacity-40 flex items-center justify-center cursor-pointer text-[#1F1A17]"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-extrabold text-sm text-[#1F1A17] w-4 text-center">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    disabled={quantity >= availableUnits}
                    onClick={() => setQuantity((q) => Math.min(availableUnits, q + 1))}
                    className="w-8 h-8 rounded-full bg-white border border-[#EFE6D8] hover:border-[#FF7A1A] disabled:opacity-40 flex items-center justify-center cursor-pointer text-[#1F1A17]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Conditional Status Banner: Reserved or Sold */}
            {isUnavailable && (
              <div className="p-4 rounded-2xl bg-[#FFF3E0] border-2 border-[#FFB74D] flex items-start gap-3 text-xs text-[#D85A00]">
                <Lock className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <h4 className="font-bold text-sm">
                    {listing.status === 'Reserved'
                      ? 'Listing is Currently Reserved'
                      : 'Item Sold / Trade Completed'}
                  </h4>
                  <p>
                    {listing.status === 'Reserved'
                      ? 'Another verified student has scheduled an in-person trade for this item.'
                      : 'This item has already been handed over and confirmed with a 4-digit PIN.'}
                  </p>
                </div>
              </div>
            )}

            {/* Seller Self-Listing Notice */}
            {isSeller && (
              <div className="p-4 rounded-2xl bg-[#DEF7EC] border border-[#84E1BC] text-xs text-[#03543F] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#0E9F6E] shrink-0" />
                <span>You posted this campus listing. Manage inquiries from your Messages tab.</span>
              </div>
            )}

            {/* Action Buttons */}
            {!isSeller ? (
              <div className="space-y-3 pt-2">
                {/* Confirm Trading Solid Orange Button */}
                <Button
                  variant="primary"
                  fullWidth
                  size="lg"
                  disabled={isUnavailable}
                  icon={<KeyRound className="w-5 h-5" />}
                  onClick={() => setIsTradeModalOpen(true)}
                >
                  {isUnavailable
                    ? `Unavailable (${listing.status})`
                    : quantity > 1
                    ? `Confirm Trading (${quantity} Units · ₹${(listing.price * quantity).toLocaleString('en-IN')})`
                    : 'Confirm Trading'}
                </Button>

                {/* Chat with Seller (Outlined) & Wishlist */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    fullWidth
                    size="md"
                    icon={<MessageSquare className="w-4 h-4 text-[#FF7A1A]" />}
                    onClick={handleChat}
                  >
                    Chat with Seller
                  </Button>

                  <button
                    type="button"
                    onClick={handleToggleWishlist}
                    className={`p-3 rounded-full border-2 transition-all cursor-pointer ${
                      isWishlisted
                        ? 'border-[#E5383B] bg-[#FDE8E8] text-[#E5383B]'
                        : 'border-[#EFE6D8] bg-white text-[#6B625A] hover:text-[#E5383B] hover:bg-[#FFF8EC]'
                    }`}
                    aria-label="Wishlist heart"
                  >
                    <Heart className={`w-5 h-5 ${isWishlisted ? 'fill-[#E5383B]' : ''}`} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="pt-2">
                <Link to="/messages">
                  <Button variant="outline" fullWidth size="md" icon={<MessageSquare className="w-4 h-4" />}>
                    View Inquiries from Students
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Seller Card */}
          <div className="bg-white rounded-3xl p-6 border-2 border-[#EFE6D8] shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B625A]">
              Seller Details
            </h3>
            <div className="flex items-center gap-4">
              <img
                src={listing.seller.avatar}
                alt={listing.seller.name}
                className="w-14 h-14 rounded-2xl bg-[#FFF3C4] border-2 border-[#FFC72C] shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h4 className="font-extrabold text-base text-[#1F1A17] truncate">
                    {listing.seller.name}
                  </h4>
                  {listing.seller.isVerified && (
                    <span title="Verified College Student">
                      <ShieldCheck className="w-4 h-4 text-[#10B981] fill-[#10B981]/20" />
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#6B625A] truncate">{listing.seller.branch}</p>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-[#8C827A]">
                  <span className="flex items-center gap-1 text-[#FF7A1A] font-bold">
                    <Star className="w-3.5 h-3.5 fill-[#FF7A1A]" />
                    {listing.seller.rating}
                  </span>
                  <span>·</span>
                  <span>{listing.seller.totalReviews} reviews</span>
                  <span>·</span>
                  <span>{listing.seller.hostelOrArea}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Specifications Table */}
          {Object.keys(listing.specs || {}).length > 0 && (
            <div className="bg-white rounded-3xl p-6 border-2 border-[#EFE6D8] shadow-sm space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B625A]">
                Specifications
              </h3>
              <div className="overflow-hidden rounded-2xl border border-[#EFE6D8]">
                <table className="w-full text-xs text-left">
                  <tbody className="divide-y divide-[#EFE6D8]">
                    {Object.entries(listing.specs).map(([specKey, specVal]) => (
                      <tr key={specKey} className="hover:bg-[#FFFDF9]">
                        <td className="px-4 py-2.5 font-bold text-[#6B625A] bg-[#FFF8EC]/60 w-1/3">
                          {specKey}
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-[#1F1A17]">
                          {specVal}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Item Description */}
          <div className="bg-white rounded-3xl p-6 border-2 border-[#EFE6D8] shadow-sm space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B625A]">
              Item Description
            </h3>
            <p className="text-xs sm:text-sm text-[#554C44] leading-relaxed whitespace-pre-line">
              {listing.description}
            </p>
          </div>
        </div>
      </div>

      {/* Campus PIN Trade Modal */}
      <Modal
        isOpen={isTradeModalOpen}
        onClose={() => setIsTradeModalOpen(false)}
        title="Schedule Campus Trade"
        subtitle={`Trade "${listing.title}" for ₹${(listing.price * quantity).toLocaleString('en-IN')}`}
        footer={
          <div className="flex gap-3 w-full">
            <Button
              variant="outline"
              fullWidth
              onClick={() => setIsTradeModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              fullWidth
              isLoading={isSubmittingTrade}
              onClick={handleConfirmTrade}
            >
              Confirm & Generate PIN
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {availableUnits > 1 && (
            <div className="p-3 bg-[#FFF8EC] rounded-2xl border border-[#EFE6D8] text-xs flex justify-between items-center">
              <span className="font-bold text-[#1F1A17]">Selected Quantity:</span>
              <span className="font-extrabold text-sm text-[#FF7A1A]">{quantity} units</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#6B625A] uppercase mb-1">
              Campus Handover Landmark
            </label>
            <input
              type="text"
              value={pickupSpot}
              onChange={(e) => setPickupSpot(e.target.value)}
              placeholder="e.g. Cauvery Hostel Gate 2 or Food Court"
              className="w-full px-3.5 py-2.5 bg-white border border-[#E8DFD3] rounded-2xl text-xs sm:text-sm text-[#1F1A17] outline-none transition-all duration-200 focus:outline-none focus:border-[#FF7A1A] focus:ring-4 focus:ring-[#FF7A1A]/[0.18]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#6B625A] uppercase mb-1">
              Preferred Handover Time
            </label>
            <input
              type="text"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              placeholder="e.g. Today 5:00 PM (after lab)"
              className="w-full px-3.5 py-2.5 bg-white border border-[#E8DFD3] rounded-2xl text-xs sm:text-sm text-[#1F1A17] outline-none transition-all duration-200 focus:outline-none focus:border-[#FF7A1A] focus:ring-4 focus:ring-[#FF7A1A]/[0.18]"
            />
          </div>

          <div className="p-3.5 rounded-2xl bg-[#FFF3C4] border border-[#FFD966] text-xs text-[#8C6500] space-y-1">
            <div className="flex items-center gap-2 font-bold text-[#1F1A17]">
              <ShieldCheck className="w-4 h-4 text-[#FF7A1A] shrink-0" />
              <span>Payment happens in person</span>
            </div>
            <p className="leading-relaxed text-[11px]">
              Upon confirmation, a unique 6-digit security PIN will be generated. The trade is finalized only after you inspect the item and share your PIN with {listing.seller.name}.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
};
