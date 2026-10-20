import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getWishlist, toggleWishlist, createOrGetConversation } from '../api';
import { Listing } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { ProductCard } from '../components/ui/ProductCard';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import {
  Heart,
  ShoppingBag,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Tag,
  KeyRound,
  MessageSquare,
  Trash2
} from 'lucide-react';

export const WishlistPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [savedItems, setSavedItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSaved = () => {
    getWishlist().then((res) => {
      setSavedItems(res);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchSaved();
  }, []);

  const handleRemove = async (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    await toggleWishlist(id);
    showToast('Removed from saved wishlist', 'info');
    fetchSaved();
  };

  const handleChat = async (listingId: string) => {
    try {
      const conv = await createOrGetConversation(listingId);
      navigate(`/messages?conv=${conv.id}`);
    } catch {
      showToast('Could not open conversation', 'error');
    }
  };

  // Stats calculation
  const totalValue = savedItems.reduce((acc, item) => acc + item.price, 0);
  const totalOriginal = savedItems.reduce((acc, item) => acc + item.originalPrice, 0);
  const totalSavedMoney = totalOriginal - totalValue;
  const avgSavings = totalOriginal > 0 ? Math.round((totalSavedMoney / totalOriginal) * 100) : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header with College Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FDE8E8] text-[#9B1C1C] font-bold text-xs mb-1 border border-[#F8B4B4]">
            <Heart className="w-3.5 h-3.5 fill-[#E5383B] text-[#E5383B]" />
            <span>Saved Campus Wishlist</span>
          </div>
          <h1 className="text-3xl font-black text-[#1F1A17] tracking-tight">
            My Saved Items
          </h1>
          <p className="text-xs sm:text-sm text-[#6B625A] mt-1">
            Tracking items listed by verified students at {user?.collegeName || 'RVCE'}
          </p>
        </div>

        <Link to="/categories">
          <Button variant="outline" size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />}>
            Explore More Items
          </Button>
        </Link>
      </div>

      {/* Summary Stats Strip (When items exist) */}
      {!loading && savedItems.length > 0 && (
        <div className="bg-gradient-to-r from-[#FFF8EC] via-[#FFF3D6] to-[#FFE8D6] rounded-3xl p-6 border-2 border-[#FFD966] shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#FF7A1A] text-white flex items-center justify-center font-bold text-lg shadow-sm">
              {savedItems.length}
            </div>
            <div>
              <h3 className="font-extrabold text-base text-[#1F1A17]">
                {savedItems.length} Item{savedItems.length > 1 ? 's' : ''} Saved for Campus Handover
              </h3>
              <p className="text-xs text-[#6B625A]">
                All items are eligible for in-person 4-digit PIN verification.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
            <div className="p-3 bg-white rounded-2xl border border-[#EFE6D8] text-center shadow-2xs">
              <span className="text-[10px] text-[#8C827A] block uppercase font-bold">Total Budget</span>
              <span className="font-black text-sm text-[#1F1A17]">₹{totalValue.toLocaleString('en-IN')}</span>
            </div>

            <div className="p-3 bg-white rounded-2xl border border-[#EFE6D8] text-center shadow-2xs">
              <span className="text-[10px] text-[#8C827A] block uppercase font-bold">Campus Savings</span>
              <span className="font-black text-sm text-[#0E9F6E]">Save ₹{totalSavedMoney.toLocaleString('en-IN')} ({avgSavings}%)</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Skeleton variant="card" count={4} />
        </div>
      ) : savedItems.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {savedItems.map((item) => (
            <div key={item.id} className="relative group flex flex-col">
              <ProductCard listing={item} onToggleWishlist={(id, e) => handleRemove(id, e)} />
            </div>
          ))}
        </div>
      ) : (
        /* Empty State */
        <EmptyState
          icon={<Heart className="w-8 h-8 text-[#E5383B]" />}
          title="Your campus wishlist is empty"
          description="Save textbooks, gear cycles, calculators, or hostel items to track prices and schedule PIN trades."
          actionLabel="Browse Campus Marketplace"
          onAction={() => navigate('/categories')}
        />
      )}
    </div>
  );
};
