import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ProductCard } from '../components/ui/ProductCard';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';
import { getListings } from '../api';
import { Listing } from '../types';
import {
  Sparkles,
  ShieldCheck,
  KeyRound,
  Users,
  MapPin,
  ArrowRight,
  BookOpen,
  Laptop,
  Bike,
  Home as HomeIcon,
  Compass,
  Mic,
  MicOff,
  Check,
  X,
  MessageSquare,
  Search,
  Flame,
  Star,
  CheckCircle2,
  Clock,
  Layers,
  Zap,
  PackageOpen,
  Plus
} from 'lucide-react';
import {
  CampusDoodleBicycle,
  CampusDoodleBook,
  CampusDoodleChai,
  CampusDoodleHostelLamp
} from '../components/ui/CampusDoodles';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, selectedCollege } = useAuth();
  const { showToast } = useToast();

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroQuery, setHeroQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState('All');

  useEffect(() => {
    getListings().then((items) => {
      setListings(items);
      setLoading(false);
    });
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (heroQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(heroQuery.trim())}`);
    }
  };

  const handleChipClick = (queryText: string) => {
    navigate(`/search?q=${encodeURIComponent(queryText)}`);
  };

  const toggleMic = () => {
    if (!isListening) {
      setIsListening(true);
      showToast('Listening... Speak your campus request', 'info');
      setTimeout(() => {
        const spoken = 'Laptop under ₹25,000 for coding';
        setHeroQuery(spoken);
        setIsListening(false);
        navigate(`/search?q=${encodeURIComponent(spoken)}`);
      }, 1600);
    } else {
      setIsListening(false);
    }
  };

  const categoryChips = [
    { label: 'Books', query: 'Engineering books and syllabus notes', icon: <BookOpen className="w-4 h-4" /> },
    { label: 'Laptops', query: 'Laptops for coding and projects', icon: <Laptop className="w-4 h-4" /> },
    { label: 'Electronics', query: 'Calculators monitors and electronics', icon: <Zap className="w-4 h-4" /> },
    { label: 'Cycles', query: 'Gear cycles for campus commute', icon: <Bike className="w-4 h-4" /> },
    { label: 'Hostel', query: 'Mattress kettle and hostel essentials', icon: <HomeIcon className="w-4 h-4" /> },
    { label: 'Lab gear', query: 'Lab coat mini drafter and kits', icon: <Compass className="w-4 h-4" /> }
  ];

  // Specific filtered sections
  const justListed = listings.slice(0, 4);
  const studentEssentials = listings.filter((l) =>
    ['Hostel Essentials', 'Lab & Drafting'].includes(l.category)
  ).slice(0, 4);
  const recommendedDeals = [...listings]
    .sort((a, b) => {
      const discA = (a.originalPrice - a.price) / a.originalPrice;
      const discB = (b.originalPrice - b.price) / b.originalPrice;
      return discB - discA;
    })
    .slice(0, 4);

  return (
    <div className="space-y-16 pb-20">
      {/* 1. HERO SECTION WITH YELLOW-TO-ORANGE GRADIENT */}
      <section className="relative overflow-hidden pt-10 pb-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-[#FFF0C8] via-[#FFF8EC] to-[#FFF8EC]">
        {/* Playful background campus doodles */}
        <div className="absolute top-8 left-8 text-[#FFC72C]/35 pointer-events-none hidden lg:block">
          <CampusDoodleBicycle className="w-24 h-24" />
        </div>
        <div className="absolute top-10 right-12 text-[#FF7A1A]/25 pointer-events-none hidden lg:block">
          <CampusDoodleBook className="w-24 h-24" />
        </div>
        <div className="absolute bottom-8 right-24 text-[#E5383B]/20 pointer-events-none hidden lg:block">
          <CampusDoodleChai className="w-18 h-18" />
        </div>

        <div className="max-w-4xl mx-auto text-center relative z-10 space-y-5">
          {/* Active Campus Tag */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-[#EFE6D8] text-xs font-semibold text-[#1F1A17] shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
            <span>Active Campus:</span>
            <span className="text-[#FF7A1A] font-extrabold">
              {selectedCollege?.name || user?.collegeName || 'RV College of Engineering'}
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-[#1F1A17] leading-tight">
            Skip scrolling. <span className="bg-gradient-to-r from-[#FF7A1A] to-[#E5383B] bg-clip-text text-transparent">Just ask.</span>
          </h1>

          <p className="text-base sm:text-lg text-[#6B625A] max-w-2xl mx-auto leading-relaxed">
            Campus Buddy AI finds second-hand gear from verified seniors and hostel mates in plain words.
          </p>

          {/* Large Chat-Style Box with Campus Buddy Icon */}
          <div className="max-w-3xl mx-auto pt-2">
            <form
              onSubmit={handleSearchSubmit}
              className="relative p-1.5 rounded-3xl bg-gradient-to-r from-[#FFC72C] via-[#FF9E2C] to-[#FF7A1A] shadow-xl shadow-[#FFC72C]/25 ai-search-pill-container transition-all duration-200 focus-within:shadow-[0_0_0_4px_rgba(255,122,26,0.18),0_8px_24px_rgba(255,122,26,0.18)]"
            >
              <div className="relative bg-white rounded-[22px] flex items-center p-2 sm:p-2.5">
                {/* Campus Buddy Mascot Icon */}
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#FFC72C] to-[#FF7A1A] flex items-center justify-center text-white shrink-0 ml-1 shadow-sm">
                  <Sparkles className="w-6 h-6 animate-pulse" />
                </div>

                {/* Input Field */}
                <input
                  type="text"
                  value={heroQuery}
                  onChange={(e) => setHeroQuery(e.target.value)}
                  placeholder="Describe what you're looking for..."
                  className="flex-1 px-4 py-3 text-sm sm:text-base font-medium text-[#1F1A17] placeholder-[#A4998E] bg-transparent border-0 shadow-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none ai-search-inner-input"
                />

                {/* Actions: Mic & Ask Button */}
                <div className="flex items-center gap-2 shrink-0 pr-1">
                  <button
                    type="button"
                    onClick={toggleMic}
                    aria-label={isListening ? 'Stop listening' : 'Speak query'}
                    className={`p-2.5 rounded-xl transition-all cursor-pointer ${
                      isListening
                        ? 'bg-[#E5383B] text-white animate-pulse shadow-md'
                        : 'bg-[#FFF8EC] text-[#6B625A] hover:text-[#FF7A1A] hover:bg-[#FFEECB] border border-[#E8DFD3]'
                    }`}
                    title="Tap to speak"
                  >
                    {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>

                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    className="px-6 rounded-xl font-bold shadow-md shadow-[#FF7A1A]/25"
                  >
                    <span>Ask</span>
                  </Button>
                </div>
              </div>
            </form>

            {/* Clickable Example Chips */}
            <div className="mt-4 flex items-center justify-center gap-2 flex-wrap text-xs">
              <span className="text-[11px] font-bold text-[#8C827A] mr-1">
                Try asking:
              </span>
              {[
                'Laptop under ₹25,000 for coding',
                'Engineering Mechanics textbook',
                'Single bed mattress',
                'Cycle under ₹3,000'
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleChipClick(chip)}
                  className="px-3.5 py-1.5 rounded-full bg-white hover:bg-[#FFF3C4] text-[#1F1A17] border border-[#EFE6D8] hover:border-[#FFC72C] text-xs font-semibold shadow-2xs hover:shadow-xs transition-all cursor-pointer"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 3. CATEGORY CHIPS BAR */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-3xl p-5 sm:p-6 border-2 border-[#EFE6D8] shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="shrink-0">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#1F1A17]">
              Explore by Category
            </h2>
            <p className="text-xs text-[#6B625A]">Direct student handovers across campus</p>
          </div>

          <div className="flex items-center gap-2.5 overflow-x-auto pb-1 max-w-full no-scrollbar">
            {categoryChips.map((c) => (
              <button
                key={c.label}
                onClick={() => navigate(`/search?q=${encodeURIComponent(c.label)}`)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#FFF8EC] hover:bg-[#FFEECB] text-[#1F1A17] border border-[#EFE6D8] hover:border-[#FFC72C] text-xs font-bold transition-all cursor-pointer whitespace-nowrap shadow-2xs hover:shadow-xs active:scale-95"
              >
                <span className="text-[#FF7A1A]">{c.icon}</span>
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 4. SECTIONS: JUST LISTED, STUDENT ESSENTIALS, RECOMMENDED DEALS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <Skeleton variant="card" count={4} />
          </div>
        ) : listings.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 sm:p-12 border-2 border-dashed border-[#EFE6D8] text-center max-w-xl mx-auto space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-[#FFF3C4] to-[#FFE2BF] flex items-center justify-center text-[#FF7A1A] mx-auto shadow-xs">
              <PackageOpen className="w-8 h-8" />
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-[#1F1A17]">
              No listings yet. Be the first to sell something!
            </h3>
            <p className="text-xs sm:text-sm text-[#6B625A] max-w-sm mx-auto leading-relaxed">
              Have unused textbooks, a lab coat, electronics, or a cycle? List it on Campus Mart in under 2 minutes for direct student handover.
            </p>
            <div className="pt-2">
              <Link to="/sell">
                <Button variant="primary" size="md" icon={<Plus className="w-4 h-4" />}>
                  Post a Listing
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Section A: Just Listed on Your Campus */}
            {justListed.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FF7A1A] uppercase tracking-wider mb-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Fresh Campus Inventory</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-[#1F1A17] tracking-tight">
                      Just listed on your campus
                    </h2>
                  </div>
                  <Link to="/categories">
                    <Button variant="outline" size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />}>
                      View All
                    </Button>
                  </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {justListed.map((item) => (
                    <ProductCard key={item.id} listing={item} />
                  ))}
                </div>
              </div>
            )}

            {/* Section B: Student Essentials */}
            {studentEssentials.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#8C6500] uppercase tracking-wider mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-[#FF7A1A]" />
                      <span>Hostel & Academic Must-Haves</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-[#1F1A17] tracking-tight">
                      Student essentials
                    </h2>
                  </div>
                  <Link to="/categories?category=Hostel+Essentials">
                    <Button variant="outline" size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />}>
                      See Essentials
                    </Button>
                  </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {studentEssentials.map((item) => (
                    <ProductCard key={item.id} listing={item} />
                  ))}
                </div>
              </div>
            )}

            {/* Section C: Recommended Deals */}
            {recommendedDeals.length > 0 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#E5383B] uppercase tracking-wider mb-1">
                      <Flame className="w-3.5 h-3.5" />
                      <span>High Discount Value</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-[#1F1A17] tracking-tight">
                      Recommended deals
                    </h2>
                  </div>
                  <Link to="/categories?sort=discount">
                    <Button variant="outline" size="sm" icon={<ArrowRight className="w-3.5 h-3.5" />}>
                      Top Discounts
                    </Button>
                  </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {recommendedDeals.map((item) => (
                    <ProductCard key={item.id} listing={item} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* 5. NORMAL WAY VS CAMPUS MART WAY COMPARISON */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-3xl p-8 sm:p-12 border-2 border-[#EFE6D8] shadow-sm space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#FF7A1A]">
              Why College Students Love Us
            </span>
            <h2 className="text-2xl sm:text-4xl font-black text-[#1F1A17] tracking-tight">
              The Normal Way vs The Campus Mart Way
            </h2>
            <p className="text-xs sm:text-sm text-[#6B625A]">
              Why waste hours scrolling random listings when you can ask once and trade securely inside campus gates?
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* The Normal Way (Frustrating) */}
            <div className="bg-[#FFFBF5] rounded-3xl p-6 sm:p-8 border-2 border-[#F0E4D5] space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-[#6B625A] flex items-center gap-2">
                  <span>The Normal Way</span>
                </h3>
                <span className="text-xs font-bold text-[#9B1C1C] bg-[#FDE8E8] px-2.5 py-1 rounded-full border border-[#F8B4B4]">
                  Tiring & Risky
                </span>
              </div>

              <ul className="space-y-3.5 text-xs sm:text-sm text-[#6B625A]">
                <li className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#FDE8E8] text-[#E02424] flex items-center justify-center shrink-0 mt-0.5">
                    <X className="w-3.5 h-3.5" />
                  </div>
                  <span><strong>15+ open tabs & infinite scrolling:</strong> Sifting through random spam, out-of-stock items, and irrelevant cities.</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#FDE8E8] text-[#E02424] flex items-center justify-center shrink-0 mt-0.5">
                    <X className="w-3.5 h-3.5" />
                  </div>
                  <span><strong>Unknown strangers & outside sellers:</strong> Meeting off-campus in sketchy locations with zero student verification.</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#FDE8E8] text-[#E02424] flex items-center justify-center shrink-0 mt-0.5">
                    <X className="w-3.5 h-3.5" />
                  </div>
                  <span><strong>Courier charges & online UPI scams:</strong> Sellers demanding advance payments before shipping broken gear.</span>
                </li>
              </ul>
            </div>

            {/* The Campus Mart Way (Delightful) */}
            <div className="bg-gradient-to-br from-[#FFF8EC] to-[#FFF0D4] rounded-3xl p-6 sm:p-8 border-2 border-[#FFC72C] shadow-md shadow-[#FFC72C]/15 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-[#1F1A17] flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#FF7A1A]" />
                  <span>The Campus Mart Way</span>
                </h3>
                <span className="text-xs font-bold text-[#03543F] bg-[#DEF7EC] px-2.5 py-1 rounded-full border border-[#84E1BC]">
                  Fast & Safe
                </span>
              </div>

              <ul className="space-y-3.5 text-xs sm:text-sm text-[#1F1A17]">
                <li className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#DEF7EC] text-[#0E9F6E] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                  <span><strong>Ask once in your own words:</strong> Campus Buddy AI parses budget, RAM, and course requirements instantly.</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#DEF7EC] text-[#0E9F6E] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                  <span><strong>100% verified campus peers:</strong> Only students with confirmed institutional @college.edu.in emails can trade.</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-[#DEF7EC] text-[#0E9F6E] flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                  <span><strong>PIN-secured daylight handovers:</strong> Inspect cycle gears or calculator screens at your canteen before releasing PIN.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 6. "HOW IT WORKS" ROW WITH 4 STEPS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-[#FFFDF9] rounded-3xl p-8 sm:p-12 border-2 border-[#EFE6D8] space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-[#FF7A1A]">
              Simple 4-Step Journey
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-[#1F1A17] tracking-tight">
              How Campus Mart Works
            </h2>
            <p className="text-xs sm:text-sm text-[#6B625A]">
              From searching to handover in under 24 hours inside your college
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Step 1 */}
            <div className="p-6 rounded-3xl bg-white border-2 border-[#EFE6D8] space-y-3 relative hover:border-[#FFC72C] transition-all">
              <div className="w-10 h-10 rounded-2xl bg-[#FFF3C4] border border-[#FFD966] text-[#8C6500] font-black text-base flex items-center justify-center">
                1
              </div>
              <h3 className="font-bold text-base text-[#1F1A17]">Verify College</h3>
              <p className="text-xs text-[#6B625A] leading-relaxed">
                Sign in with your institutional .edu.in email to unlock listings exclusive to your campus network.
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-6 rounded-3xl bg-white border-2 border-[#EFE6D8] space-y-3 relative hover:border-[#FFC72C] transition-all">
              <div className="w-10 h-10 rounded-2xl bg-[#FFE2BF] border border-[#FFBA88] text-[#FF7A1A] font-black text-base flex items-center justify-center">
                2
              </div>
              <h3 className="font-bold text-base text-[#1F1A17]">Ask or Browse</h3>
              <p className="text-xs text-[#6B625A] leading-relaxed">
                Describe what you need to Campus Buddy AI or filter by textbook, cycles, laptops, and hostel items.
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-6 rounded-3xl bg-white border-2 border-[#EFE6D8] space-y-3 relative hover:border-[#FFC72C] transition-all">
              <div className="w-10 h-10 rounded-2xl bg-[#FDE8E8] border border-[#F8B4B4] text-[#E5383B] font-black text-base flex items-center justify-center">
                3
              </div>
              <h3 className="font-bold text-base text-[#1F1A17]">Chat & Meet</h3>
              <p className="text-xs text-[#6B625A] leading-relaxed">
                Chat in-app to agree on price and schedule an in-person meetup at your canteen or hostel gate.
              </p>
            </div>

            {/* Step 4 */}
            <div className="p-6 rounded-3xl bg-white border-2 border-[#EFE6D8] space-y-3 relative hover:border-[#84E1BC] transition-all">
              <div className="w-10 h-10 rounded-2xl bg-[#DEF7EC] border border-[#84E1BC] text-[#0E9F6E] font-black text-base flex items-center justify-center">
                4
              </div>
              <h3 className="font-bold text-base text-[#1F1A17]">Confirm with PIN</h3>
              <p className="text-xs text-[#6B625A] leading-relaxed">
                Inspect item condition in daylight. Share your 4-digit security PIN to complete the trade safely.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
