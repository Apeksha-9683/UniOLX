import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { searchListingsWithAI, createOrGetConversation, toggleWishlist } from '../api';
import { AISearchResult, ParsedCriterion, AIRankedListing } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  Sparkles,
  Search,
  Mic,
  MicOff,
  X,
  Edit2,
  Check,
  ShieldCheck,
  MapPin,
  Heart,
  ArrowRight,
  Bell,
  MessageSquare,
  CornerDownRight,
  Send,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';

interface SearchTurn {
  id: string;
  userQuery: string;
  timestamp: string;
  isLoading: boolean;
  data?: AISearchResult;
}

export const SearchPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const urlQuery = searchParams.get('q') || '';

  // Input states
  const [emptyStateInput, setEmptyStateInput] = useState('');
  const [followUpInput, setFollowUpInput] = useState('');
  const [isListening, setIsListening] = useState(false);

  // Conversation turns history in the session
  const [turns, setTurns] = useState<SearchTurn[]>([]);

  // Modals & alerts
  const [editingCriterion, setEditingCriterion] = useState<{
    crit: ParsedCriterion;
    turnId: string;
  } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [activeAlertQuery, setActiveAlertQuery] = useState('');
  const [alertSubscribedQueries, setAlertSubscribedQueries] = useState<Set<string>>(new Set());
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());

  // Scroll container ref
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const isExecutingSearchRef = useRef(false);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      if (resultsContainerRef.current) {
        resultsContainerRef.current.scrollTo({
          top: resultsContainerRef.current.scrollHeight,
          behavior
        });
      }
    });
  };

  // Sync with URL query parameter for browser back / forward navigation
  useEffect(() => {
    if (!urlQuery) {
      // Empty state
      setTurns([]);
      return;
    }

    // If query in URL is already the latest turn's query, no need to re-execute
    if (turns.length > 0 && turns[turns.length - 1].userQuery === urlQuery) {
      return;
    }

    // Execute search from URL query
    executeSearch(urlQuery, false);
  }, [urlQuery]);

  // Execute a search query (either fresh or follow-up)
  const executeSearch = async (
    queryText: string,
    isFollowUp: boolean,
    criteriaOverrides?: ParsedCriterion[]
  ) => {
    const q = queryText.trim();
    if (!q) return;

    if (isExecutingSearchRef.current) return;
    isExecutingSearchRef.current = true;

    const turnId = `turn_${Date.now()}`;
    const previousCriteria = isFollowUp && turns.length > 0
      ? turns[turns.length - 1].data?.parsedCriteria
      : undefined;

    // 1. Immediately display user's question bubble and the "Campus Buddy is thinking..." loader
    const newTurn: SearchTurn = {
      id: turnId,
      userQuery: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isLoading: true
    };

    if (isFollowUp) {
      setTurns((prev) => [...prev, newTurn]);
    } else {
      // Starting or replacing search
      setTurns([newTurn]);
    }

    // Update URL query parameter so the browser history & back button work
    setSearchParams({ q });

    scrollToBottom('smooth');

    // Requirement 3: "Campus Buddy is thinking..." loading state for about 1 second, then the real results.
    const startTime = Date.now();
    try {
      const dataPromise = searchListingsWithAI(q, criteriaOverrides, previousCriteria);
      const [aiData] = await Promise.all([
        dataPromise,
        new Promise((res) => setTimeout(res, 900)) // ~1 second thinking delay
      ]);

      setTurns((prev) =>
        prev.map((t) => (t.id === turnId ? { ...t, isLoading: false, data: aiData } : t))
      );
      scrollToBottom('smooth');
    } catch {
      showToast('Could not complete search', 'error');
      setTurns((prev) =>
        prev.map((t) => (t.id === turnId ? { ...t, isLoading: false } : t))
      );
    } finally {
      isExecutingSearchRef.current = false;
    }
  };

  // Form submit from empty state
  const handleEmptyStateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (emptyStateInput.trim()) {
      executeSearch(emptyStateInput.trim(), false);
      setEmptyStateInput('');
    }
  };

  // Form submit from follow-up bar
  const handleFollowUpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (followUpInput.trim()) {
      executeSearch(followUpInput.trim(), true);
      setFollowUpInput('');
    }
  };

  // Voice toggle
  const toggleVoice = (isFollowUpMode: boolean) => {
    if (!isListening) {
      setIsListening(true);
      showToast('Listening... Speak your campus request', 'info');
      setTimeout(() => {
        const spoken = isFollowUpMode ? 'only below ₹20,000' : 'Laptop under ₹25,000 for coding';
        if (isFollowUpMode) {
          setFollowUpInput(spoken);
        } else {
          setEmptyStateInput(spoken);
        }
        setIsListening(false);
      }, 1500);
    } else {
      setIsListening(false);
    }
  };

  // Remove parsed criterion chip
  const handleRemoveCriterion = async (turnId: string, critId: string) => {
    const turn = turns.find((t) => t.id === turnId);
    if (!turn || !turn.data) return;

    const removedCrit = turn.data.parsedCriteria.find((c) => c.id === critId);
    const updated = turn.data.parsedCriteria.filter((c) => c.id !== critId);

    showToast(`Removed filter: ${removedCrit?.label || 'Criterion'}`, 'info');

    // Re-run search with overridden criteria
    executeSearch(turn.userQuery, true, updated);
  };

  // Edit parsed criterion chip
  const handleStartEditCriterion = (turnId: string, crit: ParsedCriterion) => {
    setEditingCriterion({ crit, turnId });
    setEditValue(crit.value);
  };

  const handleSaveCriterion = () => {
    if (!editingCriterion) return;
    const turn = turns.find((t) => t.id === editingCriterion.turnId);
    if (!turn || !turn.data) return;

    const updated = turn.data.parsedCriteria.map((c) => {
      if (c.id === editingCriterion.crit.id) {
        if (c.key === 'budget' || c.key === 'minPrice') {
          const num = parseInt(editValue.replace(/\D/g, ''), 10) || 20000;
          const prefix = c.key === 'budget' ? 'Budget ≤' : 'Min Price ≥';
          return {
            ...c,
            value: num.toString(),
            label: `${prefix} ₹${num.toLocaleString('en-IN')}`,
            displayValue: `₹${num.toLocaleString('en-IN')}`
          };
        }
        return {
          ...c,
          value: editValue,
          label: `${c.key.toUpperCase()}: ${editValue}`,
          displayValue: editValue
        };
      }
      return c;
    });

    setEditingCriterion(null);
    showToast('Updated filter criteria', 'success');
    executeSearch(turn.userQuery, true, updated);
  };

  // Wishlist toggle
  const handleWishlist = async (listingId: string) => {
    await toggleWishlist(listingId);
    setWishlistIds((prev) => {
      const next = new Set(prev);
      if (next.has(listingId)) next.delete(listingId);
      else next.add(listingId);
      return next;
    });
    showToast('Wishlist updated', 'info');
  };

  // Chat with seller
  const handleChatWithSeller = async (listingId: string) => {
    try {
      const conv = await createOrGetConversation(listingId);
      navigate(`/messages?conv=${conv.id}`);
    } catch {
      showToast('Could not start conversation', 'error');
    }
  };

  // Example clickable chips for empty state
  // Requirement 2: "Clicking a chip fills the input but does not search. Nothing is searched until I press Ask or Enter."
  const exampleChips = [
    'Laptop under ₹25,000 for coding',
    'Engineering Mechanics textbook',
    'Casio scientific calculator',
    'Cycle under ₹3,000',
    'Single bed mattress',
    'Sony noise cancelling headphones'
  ];

  // If no search has been initiated, show clean empty state
  const hasActiveSearch = turns.length > 0 || Boolean(urlQuery);

  return (
    <div className="w-full h-[calc(100dvh-5rem)] flex flex-col bg-[#FFF8EC] overflow-hidden select-text">
      {!hasActiveSearch ? (
        /* ------------------------------------------------------------- */
        /* CLEAN EMPTY STATE                                             */
        /* ------------------------------------------------------------- */
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center px-4 sm:px-6 py-12 text-center">
          <div className="max-w-2xl mx-auto space-y-6 w-full">
            {/* Mascot Icon */}
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-3xl bg-gradient-to-tr from-[#FF7A1A] to-[#FFC72C] text-white flex items-center justify-center mx-auto shadow-xl shadow-[#FF7A1A]/20">
              <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 animate-pulse" />
            </div>

            {/* Heading */}
            <div className="space-y-2">
              <h1 className="text-3xl sm:text-4xl font-black text-[#1F1A17] tracking-tight">
                What are you looking for?
              </h1>
              <p className="text-sm sm:text-base text-[#6B625A] max-w-lg mx-auto leading-relaxed">
                Describe the item in your own words — mention specs, budget, or what you need it for.
              </p>
            </div>

            {/* Large Input Box */}
            <form
              onSubmit={handleEmptyStateSubmit}
              className="p-1.5 rounded-3xl bg-gradient-to-r from-[#FFC72C] via-[#FF9E2C] to-[#FF7A1A] shadow-xl shadow-[#FFC72C]/25 max-w-xl mx-auto ai-search-pill-container transition-all duration-200 focus-within:shadow-[0_0_0_4px_rgba(255,122,26,0.18),0_8px_24px_rgba(255,122,26,0.18)]"
            >
              <div className="bg-white rounded-[22px] flex items-center p-2 sm:p-2.5 gap-2">
                <div className="w-10 h-10 rounded-xl bg-[#FFF8EC] text-[#FF7A1A] flex items-center justify-center shrink-0 ml-1">
                  <Search className="w-5 h-5" />
                </div>

                <input
                  type="text"
                  value={emptyStateInput}
                  onChange={(e) => setEmptyStateInput(e.target.value)}
                  placeholder="e.g. Laptop under ₹25,000 for coding, or Hero cycle under ₹4,000"
                  className="flex-1 px-3 py-2 text-sm sm:text-base font-semibold text-[#1F1A17] placeholder-[#A4998E] bg-transparent border-0 shadow-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none ai-search-inner-input"
                  autoFocus
                />

                <button
                  type="button"
                  onClick={() => toggleVoice(false)}
                  aria-label={isListening ? 'Stop mic' : 'Voice input'}
                  className={`p-2.5 rounded-xl transition-all cursor-pointer ${
                    isListening
                      ? 'bg-[#E5383B] text-white animate-pulse'
                      : 'bg-[#FFF8EC] text-[#6B625A] hover:text-[#FF7A1A] border border-[#EFE6D8]'
                  }`}
                  title="Speak query"
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="px-6 rounded-xl font-bold shadow-md shadow-[#FF7A1A]/20"
                >
                  Ask
                </Button>
              </div>
            </form>

            {/* Clickable Example Chips */}
            {/* Requirement 2: "Clicking a chip fills the input but does not search. Nothing is searched until I press Ask or Enter." */}
            <div className="pt-2 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#8C827A] block">
                Tap an example to try:
              </span>
              <div className="flex flex-wrap items-center justify-center gap-2 max-w-xl mx-auto">
                {exampleChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setEmptyStateInput(chip)}
                    className="px-3.5 py-1.5 rounded-full bg-white hover:bg-[#FFF3C4] text-[#1F1A17] border border-[#EFE6D8] hover:border-[#FFC72C] text-xs font-semibold shadow-2xs hover:shadow-xs transition-all cursor-pointer"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ------------------------------------------------------------- */
        /* ACTIVE SEARCH CONVERSATION & PINNED INPUT                      */
        /* ------------------------------------------------------------- */
        <>
          {/* Top Bar with Clear / New Search button */}
          <div className="shrink-0 bg-white/90 backdrop-blur-md border-b border-[#EFE6D8] px-4 sm:px-6 py-2.5 flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-[#FF7A1A] to-[#FFC72C] text-white flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-[#1F1A17]">Campus Buddy AI Search</span>
            </div>

            <button
              type="button"
              onClick={() => {
                setTurns([]);
                setSearchParams({});
                setEmptyStateInput('');
                setFollowUpInput('');
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-[#6B625A] hover:text-[#1F1A17] bg-[#FFF8EC] hover:bg-[#FFEECB] border border-[#EFE6D8] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>New Search</span>
            </button>
          </div>

          {/* Results Area (The ONLY scrollable container) */}
          <div
            ref={resultsContainerRef}
            className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8"
          >
            <div className="max-w-5xl mx-auto space-y-8">
              {turns.map((turn, turnIdx) => (
                <div key={turn.id} className="space-y-6">
                  {/* 1. Student Question Bubble */}
                  <div className="flex items-start gap-3 justify-end">
                    <div className="bg-gradient-to-r from-[#FF7A1A] to-[#E86707] text-white px-5 py-3 rounded-2xl rounded-tr-none text-sm sm:text-base font-semibold shadow-sm max-w-xl break-words">
                      "{turn.userQuery}"
                    </div>
                    <div className="w-9 h-9 rounded-full bg-[#FFF3C4] border-2 border-[#FFD966] text-[#8C6500] flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                      {user?.name ? user.name.slice(0, 1).toUpperCase() : 'You'}
                    </div>
                  </div>

                  {/* 2. Loading State: "Campus Buddy is thinking..." */}
                  {turn.isLoading ? (
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#FFC72C] to-[#FF7A1A] text-white flex items-center justify-center shrink-0 shadow-md shadow-[#FF7A1A]/20 animate-spin">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div className="bg-white border-2 border-[#EFE6D8] p-5 rounded-2xl rounded-tl-none shadow-sm space-y-1.5 flex-1 max-w-lg">
                        <div className="flex items-center gap-2 text-sm font-bold text-[#1F1A17]">
                          <span className="w-2 h-2 rounded-full bg-[#FF7A1A] animate-ping" />
                          <span>Campus Buddy is thinking...</span>
                        </div>
                        <p className="text-xs text-[#6B625A]">
                          Checking available listings, specs, budget, and campus pickup spots...
                        </p>
                      </div>
                    </div>
                  ) : turn.data ? (
                    /* 3. Campus Buddy Response */
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#FFC72C] to-[#FF7A1A] text-white flex items-center justify-center shrink-0 shadow-md shadow-[#FF7A1A]/20">
                        <Sparkles className="w-5 h-5" />
                      </div>

                      <div className="space-y-5 flex-1 min-w-0">
                        {/* Header Box: Summary & Understood Chips */}
                        <div className="bg-white border-2 border-[#EFE6D8] p-5 sm:p-6 rounded-3xl rounded-tl-none shadow-sm space-y-4">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-sm text-[#1F1A17]">Campus Buddy</span>
                              <span className="text-[10px] font-extrabold text-[#8C6500] bg-[#FFF3C4] px-2 py-0.5 rounded-full border border-[#FFD966]">
                                Verified AI Match
                              </span>
                            </div>

                            {!turn.data.isVagueOrGreeting && (
                              <span className="text-xs font-bold text-[#10B981] bg-[#DEF7EC] px-2.5 py-0.5 rounded-full border border-[#84E1BC]">
                                {turn.data.results.length} Available Match{turn.data.results.length === 1 ? '' : 'es'}
                              </span>
                            )}
                          </div>

                          <p className="text-sm font-medium text-[#1F1A17] leading-relaxed">
                            {turn.data.summary}
                          </p>

                          {/* "What I Understood" Editable Chips */}
                          {turn.data.parsedCriteria && turn.data.parsedCriteria.length > 0 && (
                            <div className="pt-3 border-t border-[#F2E7D7] space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-[#8C827A]">
                                  What I Understood (Click to edit or remove):
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                {turn.data.parsedCriteria.map((crit) => (
                                  <div
                                    key={crit.id}
                                    className="group inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFFDF8] border-2 border-[#FFC72C] text-xs font-bold text-[#1F1A17] shadow-2xs hover:border-[#FF7A1A] transition-all"
                                  >
                                    <span className="text-[#8C6500]">{crit.label}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleStartEditCriterion(turn.id, crit)}
                                      title="Edit this requirement"
                                      className="p-0.5 rounded-full text-[#8C827A] hover:text-[#1F1A17] hover:bg-[#FFF8EC] transition-colors cursor-pointer"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveCriterion(turn.id, crit.id)}
                                      title="Remove this requirement"
                                      className="p-0.5 rounded-full text-[#8C827A] hover:text-[#E5383B] hover:bg-[#FDE8E8] transition-colors cursor-pointer"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Vague / Greeting Prompt Suggestions */}
                        {turn.data.isVagueOrGreeting && (
                          <div className="bg-[#FFF8EC] p-4 rounded-2xl border border-[#EFE6D8] space-y-2">
                            <span className="text-xs font-bold text-[#8C6500] uppercase tracking-wider block">
                              Try asking for example:
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {turn.data.alternativeSuggestions.map((sug) => (
                                <button
                                  key={sug}
                                  type="button"
                                  onClick={() => setFollowUpInput(sug)}
                                  className="px-3 py-1 rounded-full bg-white hover:bg-[#FFF3C4] border border-[#EFE6D8] text-xs font-semibold text-[#1F1A17] transition-colors cursor-pointer"
                                >
                                  {sug}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Results Cards List */}
                        {turn.data.results && turn.data.results.length > 0 ? (
                          <div className="space-y-4">
                            {turn.data.results.map(({ listing, matchScore, matchReasons, unmatchedReasons }) => (
                              <div
                                key={listing.id}
                                className="group bg-white rounded-3xl p-5 sm:p-6 border-2 border-[#EFE6D8] hover:border-[#FFC72C] shadow-sm hover:shadow-lg hover:shadow-[#FFC72C]/10 transition-all flex flex-col md:flex-row gap-6 items-start justify-between"
                              >
                                {/* Thumbnail Image & Match Badge */}
                                <div className="relative w-full md:w-56 aspect-[4/3] rounded-2xl overflow-hidden bg-[#FFF8EC] shrink-0 border border-[#EFE6D8]">
                                  <img
                                    src={listing.images[0]}
                                    alt={listing.title}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                  />
                                  <div className="absolute top-2.5 left-2.5">
                                    <span className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-[#FF7A1A] to-[#FFC72C] text-white font-extrabold text-[11px] shadow-sm">
                                      {matchScore}% Match
                                    </span>
                                  </div>
                                  <div className="absolute top-2.5 right-2.5">
                                    <button
                                      type="button"
                                      onClick={() => handleWishlist(listing.id)}
                                      className="p-1.5 rounded-full bg-white/80 backdrop-blur-xs text-[#6B625A] hover:text-[#E5383B] transition-colors cursor-pointer"
                                    >
                                      <Heart
                                        className={`w-4 h-4 ${
                                          wishlistIds.has(listing.id) ? 'fill-[#E5383B] text-[#E5383B]' : ''
                                        }`}
                                      />
                                    </button>
                                  </div>
                                </div>

                                {/* Details & Reasons */}
                                <div className="flex-1 min-w-0 space-y-3">
                                  <div>
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                      <StatusBadge status={listing.status} size="sm" />
                                      <span className="text-[11px] font-bold text-[#8C6500] bg-[#FFF3C4] px-2 py-0.5 rounded-full">
                                        {listing.condition}
                                      </span>
                                      <span className="text-[11px] text-[#A4998E] font-medium">
                                        {listing.collegeName}
                                      </span>
                                    </div>

                                    <Link
                                      to={`/listing/${listing.id}`}
                                      className="text-base sm:text-lg font-extrabold text-[#1F1A17] hover:text-[#FF7A1A] transition-colors leading-snug line-clamp-2"
                                    >
                                      {listing.title}
                                    </Link>
                                  </div>

                                  {/* Price */}
                                  <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-black text-[#1F1A17]">
                                      ₹{listing.price.toLocaleString('en-IN')}
                                    </span>
                                    {listing.originalPrice > listing.price && (
                                      <span className="text-xs text-[#A4998E] line-through font-semibold">
                                        ₹{listing.originalPrice.toLocaleString('en-IN')}
                                      </span>
                                    )}
                                  </div>

                                  {/* Why Campus Buddy picked this: 2-3 tick reasons & unmatched reasons */}
                                  <div className="space-y-1.5 bg-[#FFFDF8] p-3 rounded-2xl border border-[#F2E7D7] text-xs">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#8C827A] block mb-0.5">
                                      Match Analysis:
                                    </span>
                                    {matchReasons.map((reason, idx) => (
                                      <div key={idx} className="flex items-center gap-1.5 text-[#03543F] font-semibold text-xs">
                                        <Check className="w-3.5 h-3.5 text-[#0E9F6E] shrink-0" />
                                        <span>{reason}</span>
                                      </div>
                                    ))}
                                    {unmatchedReasons && unmatchedReasons.length > 0 && unmatchedReasons.map((u, idx) => (
                                      <div key={idx} className="flex items-center gap-1.5 text-[#C81E1E] font-medium text-xs">
                                        <AlertTriangle className="w-3.5 h-3.5 text-[#E02424] shrink-0" />
                                        <span>{u}</span>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Specs */}
                                  {listing.specs && Object.keys(listing.specs).length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                                      {Object.entries(listing.specs).slice(0, 3).map(([key, val]) => (
                                        <span
                                          key={key}
                                          className="px-2.5 py-0.5 rounded-md bg-[#FFF8EC] border border-[#EFE6D8] text-[#6B625A] font-medium"
                                        >
                                          <strong>{key}:</strong> {val}
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {/* Seller Info */}
                                  <div className="flex items-center gap-2 pt-1 text-xs text-[#6B625A]">
                                    <img
                                      src={listing.seller.avatar}
                                      alt={listing.seller.name}
                                      className="w-5 h-5 rounded-full bg-[#FFF3C4]"
                                    />
                                    <span className="font-bold text-[#1F1A17]">{listing.seller.name}</span>
                                    {listing.seller.isVerified && (
                                      <ShieldCheck className="w-3.5 h-3.5 text-[#10B981] fill-[#10B981]/20" />
                                    )}
                                    <span>·</span>
                                    <span className="flex items-center gap-1 text-[#8C6500]">
                                      <MapPin className="w-3 h-3 text-[#FF7A1A]" />
                                      {listing.campusPickupSpot}
                                    </span>
                                  </div>
                                </div>

                                {/* Right Actions */}
                                <div className="w-full md:w-36 shrink-0 flex flex-col gap-2 pt-2 md:pt-0">
                                  <Link to={`/listing/${listing.id}`} className="w-full">
                                    <Button variant="primary" fullWidth size="md">
                                      View Details
                                    </Button>
                                  </Link>
                                  <Button
                                    variant="yellow"
                                    fullWidth
                                    size="sm"
                                    icon={<MessageSquare className="w-3.5 h-3.5" />}
                                    onClick={() => handleChatWithSeller(listing.id)}
                                  >
                                    Chat
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : !turn.data.isVagueOrGreeting ? (
                          /* No Results State with Specific Suggestions */
                          <div className="bg-white rounded-3xl p-8 border-2 border-[#EFE6D8] text-center space-y-6">
                            <div className="w-14 h-14 rounded-2xl bg-[#FFF3C4] border-2 border-[#FFD966] text-[#FF7A1A] flex items-center justify-center mx-auto">
                              <AlertTriangle className="w-7 h-7 text-[#FF7A1A]" />
                            </div>

                            <div className="space-y-1.5 max-w-md mx-auto">
                              <h3 className="text-xl font-black text-[#1F1A17]">
                                No exact campus matches found
                              </h3>
                              <p className="text-xs sm:text-sm text-[#6B625A] leading-relaxed">
                                No available listings currently match all your exact filters. Try relaxing a spec or tap a suggestion below.
                              </p>
                            </div>

                            {/* Suggestions */}
                            {turn.data.alternativeSuggestions && turn.data.alternativeSuggestions.length > 0 && (
                              <div className="bg-[#FFF8EC] p-4 rounded-2xl border border-[#EFE6D8] max-w-lg mx-auto text-left space-y-2">
                                <span className="text-xs font-bold text-[#8C6500] uppercase tracking-wider block">
                                  Campus Buddy Suggestions:
                                </span>
                                <div className="space-y-1.5">
                                  {turn.data.alternativeSuggestions.map((sug, idx) => (
                                    <button
                                      key={idx}
                                      type="button"
                                      onClick={() => executeSearch(sug, true)}
                                      className="w-full text-left p-2.5 rounded-xl bg-white hover:bg-[#FFF3C4] border border-[#EFE6D8] text-xs font-semibold text-[#1F1A17] flex items-center justify-between transition-colors cursor-pointer"
                                    >
                                      <span>{sug}</span>
                                      <ArrowRight className="w-3.5 h-3.5 text-[#FF7A1A]" />
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* "Notify me when one is listed" Button */}
                            <div className="pt-2">
                              <Button
                                variant="primary"
                                size="md"
                                icon={<Bell className="w-4 h-4" />}
                                onClick={() => {
                                  setActiveAlertQuery(turn.userQuery);
                                  setIsAlertModalOpen(true);
                                }}
                              >
                                {alertSubscribedQueries.has(turn.userQuery)
                                  ? 'Alert Active ✓'
                                  : 'Notify Me When One is Listed'}
                              </Button>
                            </div>

                            {/* Close campus alternatives */}
                            {turn.data.closeMatches && turn.data.closeMatches.length > 0 && (
                              <div className="pt-6 border-t border-[#F2E7D7] text-left space-y-3">
                                <div className="flex items-center gap-1.5 text-xs font-bold text-[#8C6500] uppercase tracking-wider">
                                  <Sparkles className="w-3.5 h-3.5 text-[#FF7A1A]" />
                                  <span>Close Campus Alternatives:</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  {turn.data.closeMatches.map(({ listing }) => (
                                    <Link
                                      key={listing.id}
                                      to={`/listing/${listing.id}`}
                                      className="p-3 rounded-2xl bg-[#FFFDF9] border border-[#EFE6D8] hover:border-[#FF7A1A] transition-all flex items-center gap-3 group"
                                    >
                                      <img
                                        src={listing.images[0]}
                                        alt={listing.title}
                                        className="w-14 h-14 rounded-xl object-cover border border-[#EFE6D8] shrink-0"
                                      />
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between">
                                          <span className="font-extrabold text-sm text-[#1F1A17]">
                                            ₹{listing.price.toLocaleString('en-IN')}
                                          </span>
                                          <StatusBadge status={listing.status} size="sm" />
                                        </div>
                                        <p className="text-xs font-bold text-[#1F1A17] truncate group-hover:text-[#FF7A1A]">
                                          {listing.title}
                                        </p>
                                        <span className="text-[10px] text-[#6B625A] flex items-center gap-1 mt-0.5 truncate">
                                          <MapPin className="w-3 h-3 text-[#FF7A1A]" />
                                          {listing.campusPickupSpot}
                                        </span>
                                      </div>
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {/* 4. PINNED BOTTOM INPUT BAR (Never scrolled out of view) */}
          {/* Requirement 6: "keep the input at the bottom pinned (same layout rule as the chat: only the results area scrolls)" */}
          <div className="shrink-0 bg-white/95 backdrop-blur-md border-t-2 border-[#EFE6D8] p-3 sm:p-4 z-20 shadow-lg">
            <div className="max-w-5xl mx-auto">
              <form
                onSubmit={handleFollowUpSubmit}
                className="bg-[#FFFDF9] rounded-2xl p-1.5 sm:p-2 border border-[#E8DFD3] focus-within:border-[#FF7A1A] focus-within:ring-4 focus-within:ring-[#FF7A1A]/[0.18] transition-all duration-200 shadow-xs flex items-center gap-2"
              >
                <div className="w-8 h-8 rounded-xl bg-[#FFF3C4] text-[#FF7A1A] flex items-center justify-center shrink-0 ml-1">
                  <CornerDownRight className="w-4 h-4" />
                </div>

                <input
                  type="text"
                  value={followUpInput}
                  onChange={(e) => setFollowUpInput(e.target.value)}
                  placeholder="Ask a follow-up or refine (e.g. 'only below ₹20,000', 'show cycles instead')..."
                  className="flex-1 px-3 py-1.5 text-xs sm:text-sm font-semibold text-[#1F1A17] placeholder-[#A4998E] bg-transparent border-0 shadow-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none ai-search-inner-input"
                />

                <button
                  type="button"
                  onClick={() => toggleVoice(true)}
                  aria-label={isListening ? 'Stop mic' : 'Voice input'}
                  className={`p-2 rounded-xl transition-all cursor-pointer ${
                    isListening
                      ? 'bg-[#E5383B] text-white animate-pulse'
                      : 'bg-[#FFF8EC] text-[#6B625A] hover:text-[#FF7A1A]'
                  }`}
                  title="Voice follow-up"
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  className="rounded-xl px-4 font-bold"
                  icon={<Send className="w-3.5 h-3.5" />}
                >
                  Send
                </Button>
              </form>
            </div>
          </div>
        </>
      )}

      {/* Modal: Edit Parsed Criterion */}
      <Modal
        isOpen={!!editingCriterion}
        onClose={() => setEditingCriterion(null)}
        title="Edit Search Criterion"
        subtitle={`Adjust the filter value for ${editingCriterion?.crit.label}`}
        footer={
          <div className="flex gap-3 w-full">
            <Button
              variant="outline"
              fullWidth
              onClick={() => setEditingCriterion(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              fullWidth
              onClick={handleSaveCriterion}
            >
              Update Filter
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase text-[#6B625A] mb-1.5">
              Filter Value
            </label>
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full px-4 py-2.5 bg-white border border-[#E8DFD3] rounded-2xl text-sm font-semibold text-[#1F1A17] outline-none transition-all duration-200 focus:outline-none focus:border-[#FF7A1A] focus:ring-4 focus:ring-[#FF7A1A]/[0.18]"
              autoFocus
            />
          </div>
        </div>
      </Modal>

      {/* Modal: Notify Me Instant Alert */}
      <Modal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        title="Create Campus Item Alert"
        subtitle={`We'll notify you at ${user?.email || 'your verified email'}`}
        footer={
          <Button
            variant="primary"
            fullWidth
            onClick={() => {
              setAlertSubscribedQueries((prev) => new Set(prev).add(activeAlertQuery));
              setIsAlertModalOpen(false);
              showToast('Item alert activated! You will receive an instant notification.', 'success');
            }}
          >
            Activate Instant Alert
          </Button>
        }
      >
        <div className="space-y-4 py-2 text-center">
          <div className="w-14 h-14 rounded-full bg-[#DEF7EC] border-2 border-[#84E1BC] text-[#0E9F6E] flex items-center justify-center mx-auto">
            <Bell className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-base text-[#1F1A17]">Instant Campus Notification</h4>
            <p className="text-xs text-[#6B625A] leading-relaxed">
              Whenever any senior or batchmate lists an item matching <strong>"{activeAlertQuery}"</strong>, we will notify you immediately.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
};
