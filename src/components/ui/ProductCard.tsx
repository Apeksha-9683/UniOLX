import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Listing } from '../../types';
import { StatusBadge } from './StatusBadge';
import { MapPin, Heart, ShieldCheck, Tag } from 'lucide-react';

export interface ProductCardProps {
  listing: Listing;
  onToggleWishlist?: (id: string, e: React.MouseEvent) => void;
}

export const ProductCard: React.FC<ProductCardProps> = ({ listing, onToggleWishlist }) => {
  const [imageError, setImageError] = useState(false);
  const [isWishlisted, setIsWishlisted] = useState(!!listing.isWishlisted);

  const discountPercent =
    listing.originalPrice > listing.price
      ? Math.round(((listing.originalPrice - listing.price) / listing.originalPrice) * 100)
      : null;

  const handleWishlistClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsWishlisted(!isWishlisted);
    if (onToggleWishlist) {
      onToggleWishlist(listing.id, e);
    }
  };

  return (
    <div className="group relative bg-white rounded-3xl border-2 border-[#EFE6D8] overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-[#FFC72C]/10 hover:border-[#FFC72C] flex flex-col h-full">
      {/* Top Image Container */}
      <Link to={`/listing/${listing.id}`} className="relative block aspect-[4/3] overflow-hidden bg-[#FFF8EC]">
        {!imageError && listing.images?.[0] ? (
          <img
            src={listing.images[0]}
            alt={listing.title}
            onError={() => setImageError(true)}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#FFF3D6] to-[#FFE2BF] p-4 text-center">
            <Tag className="w-10 h-10 text-[#FF7A1A]/70 mb-2" />
            <span className="text-xs font-semibold text-[#6B625A] line-clamp-1">
              {listing.category}
            </span>
          </div>
        )}

        {/* Status Badge overlay */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          <StatusBadge status={listing.status} size="sm" />
          {listing.condition && (
            <span className="bg-white/90 backdrop-blur-xs text-[#1F1A17] font-semibold text-[11px] px-2 py-0.5 rounded-full border border-[#EFE6D8] shadow-xs">
              {listing.condition}
            </span>
          )}
        </div>

        {/* Wishlist Button */}
        <button
          type="button"
          onClick={handleWishlistClick}
          aria-label={isWishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
          className={`absolute top-3 right-3 p-2 rounded-full backdrop-blur-md transition-all duration-200 cursor-pointer ${
            isWishlisted
              ? 'bg-[#E5383B] text-white shadow-md'
              : 'bg-white/80 text-[#6B625A] hover:bg-white hover:text-[#E5383B] shadow-xs'
          }`}
        >
          <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-white' : ''}`} />
        </button>

        {/* Discount Badge */}
        {discountPercent && discountPercent > 10 && (
          <div className="absolute bottom-3 left-3 bg-[#E5383B] text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-sm">
            {discountPercent}% OFF
          </div>
        )}
      </Link>

      {/* Card Content */}
      <div className="p-4 sm:p-5 flex flex-col flex-1 justify-between">
        <div>
          {/* Price section */}
          <div className="flex items-baseline gap-2 mb-1.5">
            <span className="text-xl sm:text-2xl font-extrabold text-[#1F1A17]">
              ₹{listing.price.toLocaleString('en-IN')}
            </span>
            {listing.originalPrice > listing.price && (
              <span className="text-xs sm:text-sm text-[#A4998E] line-through font-medium">
                ₹{listing.originalPrice.toLocaleString('en-IN')}
              </span>
            )}
          </div>

          {/* Title */}
          <Link
            to={`/listing/${listing.id}`}
            className="block text-sm sm:text-base font-semibold text-[#1F1A17] line-clamp-2 group-hover:text-[#FF7A1A] transition-colors leading-snug mb-2"
          >
            {listing.title}
          </Link>

          {/* Campus Pickup Spot */}
          <div className="flex items-center gap-1.5 text-xs text-[#6B625A] mb-3">
            <MapPin className="w-3.5 h-3.5 text-[#FF7A1A] shrink-0" />
            <span className="truncate">{listing.campusPickupSpot}</span>
          </div>
        </div>

        {/* Seller Info Footer */}
        <div className="pt-3 border-t border-[#F2E7D7] flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={listing.seller.avatar}
              alt={listing.seller.name}
              className="w-6 h-6 rounded-full bg-[#FFF3C4] border border-[#EFE6D8] shrink-0"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-xs font-semibold text-[#1F1A17] truncate">
                  {listing.seller.name}
                </span>
                {listing.seller.isVerified && (
                  <span title="Verified College Student">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#10B981] shrink-0 fill-[#10B981]/20" />
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#8C827A] truncate">
                {listing.seller.collegeName || listing.collegeName}
              </p>
            </div>
          </div>

          <span className="text-[11px] text-[#A4998E] shrink-0 font-medium ml-2">
            {listing.postedAt}
          </span>
        </div>
      </div>
    </div>
  );
};
