import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getCurrentUser,
  getListings,
  getWishlist,
  getTrades,
  deactivateListing,
  archiveListing,
  updateListing,
  toggleWishlist
} from '../api';
import { User, Listing, Trade } from '../types';
import { ProductCard } from '../components/ui/ProductCard';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import {
  ShieldCheck,
  Star,
  GraduationCap,
  Mail,
  CheckCircle2,
  KeyRound,
  Edit,
  Power,
  Archive,
  Heart,
  Package,
  Layers,
  MapPin,
  Clock,
  ExternalLink,
  PlusCircle
} from 'lucide-react';

export const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { showToast } = useToast();

  const [user, setUser] = useState<User | null>(null);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [wishlistItems, setWishlistItems] = useState<Listing[]>([]);
  const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  // Active tab: 'listings' | 'wishlist' | 'orders'
  const [activeTab, setActiveTab] = useState<'listings' | 'wishlist' | 'orders'>('listings');

  // Edit Listing Modal State
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPickupSpot, setEditPickupSpot] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const loadData = async () => {
    try {
      const [u, allListings, saved, trades] = await Promise.all([
        getCurrentUser(),
        getListings(),
        getWishlist(),
        getTrades()
      ]);
      setUser(u);
      setWishlistItems(saved);
      setTradeHistory(trades);

      if (u) {
        // Current user listings
        const mine = allListings.filter(
          (l) => l.seller.id === u.id || l.collegeId === u.collegeId
        );
        setMyListings(mine);
      } else {
        setMyListings(allListings.slice(0, 4));
      }
    } catch {
      showToast('Error loading student profile data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ----------------------------------------------------------------
  // Listing Actions: Edit, Deactivate, Archive
  // ----------------------------------------------------------------
  const handleOpenEdit = (listing: Listing) => {
    setEditingListing(listing);
    setEditTitle(listing.title);
    setEditPrice(listing.price.toString());
    setEditDescription(listing.description);
    setEditPickupSpot(listing.campusPickupSpot);
  };

  const handleSaveEdit = async () => {
    if (!editingListing) return;
    setIsUpdating(true);
    try {
      await updateListing(editingListing.id, {
        title: editTitle,
        price: Number(editPrice) || editingListing.price,
        description: editDescription,
        campusPickupSpot: editPickupSpot
      });
      showToast('Listing updated successfully!', 'success');
      setEditingListing(null);
      await loadData();
    } catch {
      showToast('Failed to update listing', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleDeactivate = async (listingId: string) => {
    try {
      const updated = await deactivateListing(listingId);
      if (updated) {
        showToast(
          updated.status === 'Reserved'
            ? 'Listing marked as Inactive/Reserved.'
            : 'Listing reactivated and now Available!',
          'info'
        );
        await loadData();
      }
    } catch {
      showToast('Failed to change listing status', 'error');
    }
  };

  const handleArchive = async (listingId: string) => {
    if (!window.confirm('Are you sure you want to archive this listing? It will be removed from campus search.')) return;
    try {
      await archiveListing(listingId);
      showToast('Listing archived successfully.', 'info');
      await loadData();
    } catch {
      showToast('Failed to archive listing', 'error');
    }
  };

  const handleRemoveWishlist = async (listingId: string) => {
    await toggleWishlist(listingId);
    showToast('Removed from wishlist', 'info');
    await loadData();
  };

  if (loading || !user) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
        <Skeleton variant="rectangular" className="h-48 w-full rounded-3xl" />
        <Skeleton variant="rectangular" className="h-12 w-80 rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Skeleton variant="card" count={3} />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* 1. Verified Student ID Card Header */}
      <div className="bg-gradient-to-br from-white to-[#FFF8EC] rounded-3xl p-6 sm:p-8 border-2 border-[#EFE6D8] shadow-md shadow-[#FFC72C]/10 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6 border-b border-[#F2E7D7]">
          {/* Avatar & Info */}
          <div className="flex items-start gap-4 sm:gap-5">
            <img
              src={user.avatar}
              alt={user.name}
              className="w-20 h-20 rounded-3xl bg-[#FFF3C4] border-4 border-white shadow-md shadow-[#FF7A1A]/10 object-cover shrink-0"
            />
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-[#1F1A17]">{user.name}</h1>
                {/* Green Verified Badge (Not editable as requested) */}
                <span
                  title="Institutional Email Verified"
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#03543F] bg-[#DEF7EC] border border-[#84E1BC] px-2.5 py-0.5 rounded-full select-none"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-[#0E9F6E]" />
                  <span>Verified Student</span>
                </span>
              </div>

              {/* College (Not editable) */}
              <p className="text-xs sm:text-sm font-bold text-[#FF7A1A]">
                {user.collegeName} ({user.collegeShortName})
              </p>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6B625A] pt-1">
                <span className="flex items-center gap-1">
                  <GraduationCap className="w-3.5 h-3.5 text-[#8C6500]" />
                  <span>{user.branch} (Sem {user.semester})</span>
                </span>
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-[#8C6500]" />
                  <span>{user.email}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Quick stats pills */}
          <div className="flex sm:flex-col gap-2 shrink-0">
            <div className="px-4 py-2 bg-white rounded-2xl border border-[#EFE6D8] text-center shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-[#8C827A] block">Campus Trust</span>
              <div className="flex items-center justify-center gap-1 text-sm font-black text-[#1F1A17]">
                <Star className="w-4 h-4 fill-[#FF7A1A] text-[#FF7A1A]" />
                <span>{user.rating} / 5.0</span>
              </div>
            </div>

            <div className="px-4 py-2 bg-white rounded-2xl border border-[#EFE6D8] text-center shadow-2xs">
              <span className="text-[10px] font-bold uppercase text-[#8C827A] block">PIN Trades</span>
              <div className="flex items-center justify-center gap-1 text-sm font-black text-[#10B981]">
                <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                <span>{tradeHistory.filter(t => t.status === 'Completed').length || user.completedTrades} Done</span>
              </div>
            </div>

            <button
              type="button"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
              className="px-3 py-1.5 rounded-2xl border border-[#F8B4B4] bg-[#FFF8EC] text-[#E5383B] hover:bg-[#FDE8E8] text-xs font-bold transition-colors cursor-pointer text-center"
            >
              Log Out
            </button>
          </div>
        </div>

        {/* Hostel & Registration Details */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-2xl bg-white border border-[#EFE6D8] space-y-0.5">
            <span className="text-[#8C827A] font-semibold text-[11px] block">Campus Residence</span>
            <span className="font-bold text-[#1F1A17]">{user.hostel || 'Hostel Campus'}</span>
          </div>
          <div className="p-3.5 rounded-2xl bg-white border border-[#EFE6D8] space-y-0.5">
            <span className="text-[#8C827A] font-semibold text-[11px] block">Institutional Domain</span>
            <span className="font-bold text-[#1F1A17] truncate block">{user.email.split('@')[1] || 'rvce.edu.in'}</span>
          </div>
          <div className="p-3.5 rounded-2xl bg-white border border-[#EFE6D8] space-y-0.5">
            <span className="text-[#8C827A] font-semibold text-[11px] block">Student Since</span>
            <span className="font-bold text-[#1F1A17]">{user.joinedDate}</span>
          </div>
        </div>
      </div>

      {/* 2. Navigation Tabs: My Listings, Wishlist, Order History */}
      <div className="flex items-center gap-2 border-b-2 border-[#EFE6D8] pb-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('listings')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'listings'
              ? 'bg-[#FF7A1A] text-white shadow-sm'
              : 'text-[#6B625A] hover:bg-[#FFF3D6] hover:text-[#1F1A17]'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>My Listings</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-white/20">
            {myListings.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('wishlist')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'wishlist'
              ? 'bg-[#FF7A1A] text-white shadow-sm'
              : 'text-[#6B625A] hover:bg-[#FFF3D6] hover:text-[#1F1A17]'
          }`}
        >
          <Heart className="w-4 h-4" />
          <span>Wishlist</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-white/20">
            {wishlistItems.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'orders'
              ? 'bg-[#FF7A1A] text-white shadow-sm'
              : 'text-[#6B625A] hover:bg-[#FFF3D6] hover:text-[#1F1A17]'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          <span>Order History</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-white/20">
            {tradeHistory.length}
          </span>
        </button>
      </div>

      {/* 3. Tab Contents */}

      {/* TAB 1: MY LISTINGS (With Edit, Deactivate, Archive) */}
      {activeTab === 'listings' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-[#1F1A17]">Manage Your Listings</h2>
              <p className="text-xs text-[#6B625A]">
                Items posted to fellow students at {user.collegeShortName}. Update prices or mark items reserved.
              </p>
            </div>
            <Link to="/sell">
              <Button variant="primary" size="sm" icon={<PlusCircle className="w-3.5 h-3.5" />}>
                Post New Item
              </Button>
            </Link>
          </div>

          {myListings.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {myListings.map((listing) => (
                <div
                  key={listing.id}
                  className="bg-white rounded-3xl p-5 border-2 border-[#EFE6D8] shadow-sm hover:border-[#FFC72C] transition-all flex flex-col justify-between gap-4"
                >
                  <div className="flex items-start gap-4">
                    <img
                      src={listing.images[0]}
                      alt={listing.title}
                      className="w-20 h-20 rounded-2xl object-cover border border-[#EFE6D8] shrink-0"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF7A1A]">
                          {listing.category}
                        </span>
                        {/* Status Label */}
                        <StatusBadge status={listing.status} size="sm" />
                      </div>

                      <h3 className="font-extrabold text-sm text-[#1F1A17] truncate">
                        {listing.title}
                      </h3>

                      <div className="flex items-center gap-3 text-xs text-[#6B625A]">
                        <span className="font-black text-[#1F1A17]">
                          ₹{listing.price.toLocaleString('en-IN')}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-[#FF7A1A]" />
                          <span className="truncate max-w-[120px]">{listing.campusPickupSpot}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions: Edit, Deactivate, Archive */}
                  <div className="pt-3 border-t border-[#F2E7D7] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {/* Edit Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<Edit className="w-3 h-3 text-[#FF7A1A]" />}
                        onClick={() => handleOpenEdit(listing)}
                      >
                        Edit
                      </Button>

                      {/* Deactivate / Reactivate Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        icon={<Power className="w-3 h-3 text-[#8C6500]" />}
                        onClick={() => handleToggleDeactivate(listing.id)}
                      >
                        {listing.status === 'Reserved' ? 'Reactivate' : 'Deactivate'}
                      </Button>
                    </div>

                    {/* Archive Button */}
                    <button
                      type="button"
                      onClick={() => handleArchive(listing.id)}
                      title="Archive listing"
                      className="p-2 rounded-xl text-[#E5383B] hover:bg-[#FDE8E8] transition-colors cursor-pointer"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No listings yet"
              description="Have unused textbooks, a lab coat, or a dorm mini-cooler? List it on Campus Mart in 2 minutes."
              actionLabel="Create Listing"
              onAction={() => navigate('/sell')}
            />
          )}
        </div>
      )}

      {/* TAB 2: WISHLIST */}
      {activeTab === 'wishlist' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-[#1F1A17]">Saved Campus Items</h2>
              <p className="text-xs text-[#6B625A]">
                Items you bookmarked for later consideration or campus trade
              </p>
            </div>
            <Link to="/wishlist">
              <Button variant="outline" size="sm">
                Open Full Wishlist Page →
              </Button>
            </Link>
          </div>

          {wishlistItems.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {wishlistItems.map((item) => (
                <ProductCard
                  key={item.id}
                  listing={item}
                  onToggleWishlist={() => handleRemoveWishlist(item.id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Wishlist is empty"
              description="Explore campus listings and click the heart icon on any product to save it here."
              actionLabel="Browse Marketplace"
              onAction={() => navigate('/categories')}
            />
          )}
        </div>
      )}

      {/* TAB 3: ORDER HISTORY */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-[#1F1A17]">Campus Handover History</h2>
              <p className="text-xs text-[#6B625A]">
                Past and ongoing in-person transactions verified with 6-digit PIN
              </p>
            </div>
            <Link to="/orders">
              <Button variant="outline" size="sm">
                Open Orders Dashboard →
              </Button>
            </Link>
          </div>

          {tradeHistory.length > 0 ? (
            <div className="bg-white rounded-3xl border-2 border-[#EFE6D8] shadow-sm divide-y divide-[#F2E7D7] overflow-hidden">
              {tradeHistory.map((trade) => {
                const isBuyer = user.id === trade.buyerId;
                return (
                  <div
                    key={trade.id}
                    className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-[#FFFDF9] transition-colors"
                  >
                    <div className="flex items-start gap-4 min-w-0">
                      <img
                        src={trade.listingImage}
                        alt={trade.listingTitle}
                        className="w-14 h-14 rounded-2xl object-cover border border-[#EFE6D8] shrink-0"
                      />
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-[#8C827A]">
                            #{trade.id.slice(-6).toUpperCase()}
                          </span>
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                              isBuyer
                                ? 'bg-[#FFF3C4] text-[#8C6500]'
                                : 'bg-[#DEF7EC] text-[#03543F]'
                            }`}
                          >
                            {isBuyer ? 'Buying' : 'Selling'}
                          </span>
                          <StatusBadge status={trade.status} size="sm" />
                        </div>
                        <h4 className="font-extrabold text-sm text-[#1F1A17] truncate">
                          {trade.listingTitle}
                        </h4>
                        <div className="flex items-center gap-3 text-xs text-[#6B625A]">
                          <span className="font-bold text-[#1F1A17]">₹{trade.price.toLocaleString('en-IN')}</span>
                          <span>·</span>
                          <span>{trade.pickupSpot}</span>
                        </div>
                      </div>
                    </div>

                    <Link to={`/trades/${trade.id}`}>
                      <Button variant="outline" size="sm" icon={<ExternalLink className="w-3.5 h-3.5" />}>
                        View PIN / Details
                      </Button>
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No trade history"
              description="You have not participated in any campus trades yet."
              actionLabel="Browse Marketplace"
              onAction={() => navigate('/categories')}
            />
          )}
        </div>
      )}

      {/* Edit Listing Modal */}
      <Modal
        isOpen={!!editingListing}
        onClose={() => setEditingListing(null)}
        title="Edit Campus Listing"
        subtitle="Update title, price, description, or pickup landmark"
      >
        <div className="space-y-4 py-2">
          <div>
            <label className="block text-xs font-bold uppercase text-[#6B625A] mb-1">
              Title
            </label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#FFFBF2] border-2 border-[#EFE6D8] rounded-2xl text-xs sm:text-sm text-[#1F1A17] outline-none focus:border-[#FF7A1A]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-[#6B625A] mb-1">
              Price (₹)
            </label>
            <input
              type="number"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#FFFBF2] border-2 border-[#EFE6D8] rounded-2xl text-xs sm:text-sm text-[#1F1A17] outline-none focus:border-[#FF7A1A]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-[#6B625A] mb-1">
              Campus Handover Landmark
            </label>
            <input
              type="text"
              value={editPickupSpot}
              onChange={(e) => setEditPickupSpot(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#FFFBF2] border-2 border-[#EFE6D8] rounded-2xl text-xs sm:text-sm text-[#1F1A17] outline-none focus:border-[#FF7A1A]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-[#6B625A] mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#FFFBF2] border-2 border-[#EFE6D8] rounded-2xl text-xs sm:text-sm text-[#1F1A17] outline-none focus:border-[#FF7A1A] resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              fullWidth
              onClick={() => setEditingListing(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              fullWidth
              isLoading={isUpdating}
              onClick={handleSaveEdit}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
