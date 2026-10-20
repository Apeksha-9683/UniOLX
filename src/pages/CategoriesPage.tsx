import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getListings, getColleges } from '../api';
import { Listing, College } from '../types';
import { ProductCard } from '../components/ui/ProductCard';
import { Chip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import {
  Filter,
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  X,
  SlidersHorizontal,
  MapPin,
  Check,
  Tag
} from 'lucide-react';

export const CategoriesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCategory = searchParams.get('category') || 'All';
  const initialSearch = searchParams.get('q') || '';
  const initialSort = (searchParams.get('sort') as any) || 'newest';

  const [allListings, setAllListings] = useState<Listing[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [selectedCollege, setSelectedCollege] = useState('all');
  const [selectedCondition, setSelectedCondition] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'Available'>('all');
  const [minPrice, setMinPrice] = useState<number | ''>('');
  const [maxPrice, setMaxPrice] = useState<number | ''>('');
  const [sortBy, setSortBy] = useState<'newest' | 'price_low' | 'price_high' | 'discount'>(initialSort);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const categories = [
    'All',
    'Textbooks',
    'Electronics',
    'Cycles & Commute',
    'Hostel Essentials',
    'Lab & Drafting',
    'Audio & Gadgets',
    'Fashion & Sports'
  ];

  const conditions = [
    { label: 'All Conditions', value: 'all' },
    { label: 'Like New', value: 'Like New' },
    { label: 'Good', value: 'Good' },
    { label: 'Fair', value: 'Fair' }
  ];

  useEffect(() => {
    Promise.all([getListings(), getColleges()]).then(([items, cols]) => {
      setAllListings(items);
      setColleges(cols);
      setLoading(false);
    });
  }, []);

  // Filter & sort logic
  const filteredAndSortedListings = useMemo(() => {
    let result = [...allListings];

    // Category
    if (selectedCategory !== 'All') {
      result = result.filter((item) => item.category === selectedCategory);
    }

    // College
    if (selectedCollege !== 'all') {
      result = result.filter((item) => item.collegeId.toLowerCase() === selectedCollege.toLowerCase());
    }

    // Condition
    if (selectedCondition !== 'all') {
      result = result.filter((item) => item.condition === selectedCondition);
    }

    // Status
    if (selectedStatus === 'Available') {
      result = result.filter((item) => item.status === 'Available');
    }

    // Price range
    if (minPrice !== '') {
      result = result.filter((item) => item.price >= Number(minPrice));
    }
    if (maxPrice !== '') {
      result = result.filter((item) => item.price <= Number(maxPrice));
    }

    // Text search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.tags.some((t) => t.toLowerCase().includes(q)) ||
          item.campusPickupSpot.toLowerCase().includes(q)
      );
    }

    // Sort
    if (sortBy === 'price_low') {
      result.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price_high') {
      result.sort((a, b) => b.price - a.price);
    } else if (sortBy === 'discount') {
      result.sort((a, b) => {
        const discA = (a.originalPrice - a.price) / a.originalPrice;
        const discB = (b.originalPrice - b.price) / b.originalPrice;
        return discB - discA;
      });
    }

    return result;
  }, [allListings, selectedCategory, selectedCollege, selectedCondition, selectedStatus, minPrice, maxPrice, searchQuery, sortBy]);

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, selectedCollege, selectedCondition, selectedStatus, minPrice, maxPrice, searchQuery, sortBy]);

  // Pagination slices
  const totalPages = Math.ceil(filteredAndSortedListings.length / itemsPerPage) || 1;
  const paginatedListings = filteredAndSortedListings.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const activeFiltersCount = [
    selectedCategory !== 'All',
    selectedCollege !== 'all',
    selectedCondition !== 'all',
    selectedStatus !== 'all',
    minPrice !== '',
    maxPrice !== '',
    searchQuery.trim() !== ''
  ].filter(Boolean).length;

  const handleResetFilters = () => {
    setSelectedCategory('All');
    setSelectedCollege('all');
    setSelectedCondition('all');
    setSelectedStatus('all');
    setMinPrice('');
    setMaxPrice('');
    setSearchQuery('');
    setSortBy('newest');
    setSearchParams({});
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-[#1F1A17] tracking-tight">
            Campus Marketplace
          </h1>
          <p className="text-xs sm:text-sm text-[#6B625A] mt-1">
            Verified student listings across textbooks, electronics, cycles, and hostel items
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8C827A]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search keywords or item..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#E8DFD3] rounded-full text-xs sm:text-sm font-medium text-[#1F1A17] placeholder-[#A4998E] outline-none transition-all duration-200 focus:outline-none focus:border-[#FF7A1A] focus:ring-4 focus:ring-[#FF7A1A]/[0.18]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C827A] hover:text-[#1F1A17]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Category Pills Strip */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full no-scrollbar">
        {categories.map((cat) => (
          <Chip
            key={cat}
            label={cat}
            selected={selectedCategory === cat}
            onClick={() => setSelectedCategory(cat)}
          />
        ))}
      </div>

      {/* Filter & Sorting Toolbar */}
      <div className="bg-white rounded-3xl p-5 border-2 border-[#EFE6D8] shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Left dropdown controls */}
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-[#6B625A]">
            {/* Campus selector */}
            <div className="flex items-center gap-1.5 bg-[#FFF8EC] px-3 py-1.5 rounded-full border border-[#EFE6D8]">
              <MapPin className="w-3.5 h-3.5 text-[#FF7A1A]" />
              <span>Campus:</span>
              <select
                value={selectedCollege}
                onChange={(e) => setSelectedCollege(e.target.value)}
                className="bg-transparent text-[#1F1A17] font-bold outline-none cursor-pointer"
              >
                <option value="all">All 13 Colleges</option>
                {colleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.shortName} ({c.city})
                  </option>
                ))}
              </select>
            </div>

            {/* Condition selector */}
            <div className="flex items-center gap-1.5 bg-[#FFF8EC] px-3 py-1.5 rounded-full border border-[#EFE6D8]">
              <Tag className="w-3.5 h-3.5 text-[#8C6500]" />
              <span>Condition:</span>
              <select
                value={selectedCondition}
                onChange={(e) => setSelectedCondition(e.target.value)}
                className="bg-transparent text-[#1F1A17] font-bold outline-none cursor-pointer"
              >
                {conditions.map((cond) => (
                  <option key={cond.value} value={cond.value}>
                    {cond.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Availability Filter Toggle */}
            <button
              type="button"
              onClick={() => setSelectedStatus(selectedStatus === 'all' ? 'Available' : 'all')}
              className={`px-3 py-1.5 rounded-full border transition-all cursor-pointer flex items-center gap-1.5 ${
                selectedStatus === 'Available'
                  ? 'bg-[#DEF7EC] border-[#84E1BC] text-[#03543F] font-bold'
                  : 'bg-[#FFF8EC] border-[#EFE6D8] text-[#6B625A] hover:border-[#FFC72C]'
              }`}
            >
              {selectedStatus === 'Available' && <Check className="w-3.5 h-3.5 text-[#0E9F6E]" />}
              <span>Available Only</span>
            </button>

            {/* Price Inputs */}
            <div className="flex items-center gap-1.5 bg-[#FFF8EC] px-3 py-1.5 rounded-full border border-[#E8DFD3] transition-all duration-200 focus-within:border-[#FF7A1A] focus-within:ring-2 focus-within:ring-[#FF7A1A]/[0.18]">
              <span>₹</span>
              <input
                type="number"
                placeholder="Min"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value ? Number(e.target.value) : '')}
                className="w-14 bg-transparent text-[#1F1A17] font-semibold outline-none focus:outline-none"
              />
              <span>-</span>
              <input
                type="number"
                placeholder="Max"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value ? Number(e.target.value) : '')}
                className="w-14 bg-transparent text-[#1F1A17] font-semibold outline-none focus:outline-none"
              />
            </div>
          </div>

          {/* Right Sort & Reset */}
          <div className="flex items-center gap-3 text-xs">
            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-[#FF7A1A] font-bold hover:underline"
              >
                Clear all ({activeFiltersCount})
              </button>
            )}

            <div className="flex items-center gap-1.5 bg-[#FFF8EC] px-3 py-1.5 rounded-full border border-[#EFE6D8]">
              <ArrowUpDown className="w-3.5 h-3.5 text-[#FF7A1A]" />
              <span className="font-semibold text-[#6B625A]">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent text-[#1F1A17] font-bold outline-none cursor-pointer"
              >
                <option value="newest">Newest First</option>
                <option value="price_low">Price: Low to High</option>
                <option value="price_high">Price: High to Low</option>
                <option value="discount">Biggest Discount</option>
              </select>
            </div>
          </div>
        </div>

        {/* Item count line */}
        <div className="text-xs text-[#8C827A] font-medium pt-1 border-t border-[#F5ECE0] flex items-center justify-between">
          <span>
            Showing {filteredAndSortedListings.length} campus listings
            {selectedCategory !== 'All' ? ` in ${selectedCategory}` : ''}
          </span>
          <span>Page {currentPage} of {totalPages}</span>
        </div>
      </div>

      {/* Product Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Skeleton variant="card" count={8} />
        </div>
      ) : paginatedListings.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {paginatedListings.map((item) => (
            <ProductCard key={item.id} listing={item} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No campus items match your filters"
          description="Try broadening your price range, clearing some filters, or asking Campus Buddy in natural language."
          actionLabel="Reset All Filters"
          onAction={handleResetFilters}
        />
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="p-2.5 rounded-full bg-white border-2 border-[#EFE6D8] hover:border-[#FF7A1A] disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer text-[#1F1A17]"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {Array.from({ length: totalPages }).map((_, idx) => {
            const pageNum = idx + 1;
            const isCurrent = currentPage === pageNum;
            return (
              <button
                key={pageNum}
                type="button"
                onClick={() => setCurrentPage(pageNum)}
                className={`w-10 h-10 rounded-full font-bold text-xs transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-[#FF7A1A] text-white shadow-md shadow-[#FF7A1A]/20 scale-105'
                    : 'bg-white border-2 border-[#EFE6D8] text-[#1F1A17] hover:border-[#FFC72C]'
                }`}
              >
                {pageNum}
              </button>
            );
          })}

          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="p-2.5 rounded-full bg-white border-2 border-[#EFE6D8] hover:border-[#FF7A1A] disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer text-[#1F1A17]"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
