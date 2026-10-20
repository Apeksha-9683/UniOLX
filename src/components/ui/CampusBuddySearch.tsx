import React, { useState } from 'react';
import { Mic, MicOff, Sparkles, ArrowRight, Compass } from 'lucide-react';

export interface CampusBuddySearchProps {
  onSearch?: (query: string) => void;
  initialQuery?: string;
  placeholder?: string;
  compact?: boolean;
  className?: string;
}

export const CampusBuddySearch: React.FC<CampusBuddySearchProps> = ({
  onSearch,
  initialQuery = '',
  placeholder = "Ask Campus Buddy in plain words: 'Need a cheap gear cycle under 4000 near Cauvery hostel'...",
  compact = false,
  className = ''
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [isListening, setIsListening] = useState(false);

  const samplePrompts = [
    '🚲 Gear cycle for metro commute',
    '📐 Casio fx-991CW calculator',
    '🛏️ Single bed mattress',
    '💻 MacBook Air for coding',
    '🥼 Chemistry lab coat size L',
    '📚 B.S. Grewal Maths book'
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && onSearch) {
      onSearch(query.trim());
    }
  };

  const handlePromptClick = (promptText: string) => {
    // Strip leading emoji
    const clean = promptText.replace(/^[^\w\s]+\s*/, '');
    setQuery(clean);
    if (onSearch) {
      onSearch(clean);
    }
  };

  const toggleMic = () => {
    if (!isListening) {
      setIsListening(true);
      // Simulate quick voice query pick up
      setTimeout(() => {
        setQuery('Gear cycle near hostel');
        setIsListening(false);
        if (onSearch) {
          onSearch('Gear cycle near hostel');
        }
      }, 1500);
    } else {
      setIsListening(false);
    }
  };

  if (compact) {
    return (
      <form onSubmit={handleSubmit} className={`relative flex items-center w-full ${className}`}>
        <div className="relative flex-1 flex items-center rounded-full border border-[#E8DFD3] bg-white transition-all duration-200 focus-within:border-[#FF7A1A] focus-within:ring-4 focus-within:ring-[#FF7A1A]/[0.18]">
          <div className="absolute left-3.5 flex items-center pointer-events-none">
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-[#FFC72C] to-[#FF7A1A] flex items-center justify-center text-white shadow-xs">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask Campus Buddy: 'lab coat' or 'cycle'..."
            className="w-full pl-12 pr-20 py-2.5 bg-transparent border-0 shadow-none rounded-full text-sm text-[#1F1A17] placeholder-[#A4998E] outline-none focus:outline-none focus:ring-0 focus-visible:outline-none ai-search-inner-input"
          />
          <div className="absolute right-2 flex items-center gap-1">
            <button
              type="button"
              onClick={toggleMic}
              aria-label={isListening ? 'Stop voice recording' : 'Ask using voice'}
              className={`p-1.5 rounded-full transition-all cursor-pointer ${
                isListening
                  ? 'bg-[#E5383B] text-white animate-pulse'
                  : 'text-[#6B625A] hover:text-[#FF7A1A] hover:bg-[#FFF0D4]'
              }`}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button
              type="submit"
              aria-label="Search"
              className="p-1.5 rounded-full bg-[#FF7A1A] text-white hover:bg-[#E86707] transition-all cursor-pointer"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div
      className={`relative w-full max-w-3xl mx-auto rounded-3xl p-1 bg-gradient-to-r from-[#FFC72C] via-[#FF9E2C] to-[#FF7A1A] shadow-xl shadow-[#FFC72C]/20 ${className}`}
    >
      <div className="bg-white rounded-[22px] p-4 sm:p-6 backdrop-blur-md">
        {/* Campus Buddy Header Pill */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#FFC72C] to-[#FF7A1A] flex items-center justify-center text-white shadow-md shadow-[#FF7A1A]/20">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-[#1F1A17] text-base">Campus Buddy</span>
                <span className="bg-[#FFF3C4] text-[#8C6500] font-semibold text-[11px] px-2 py-0.5 rounded-full border border-[#FFD966]">
                  AI Assistant
                </span>
              </div>
              <p className="text-xs text-[#6B625A]">
                Ask for anything on campus in conversational Hinglish or English
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-[#8C6500] bg-[#FFF8EC] px-3 py-1 rounded-full border border-[#F2E7D7]">
            <Compass className="w-3.5 h-3.5 text-[#FF7A1A]" />
            <span>RVCE Campus Radar</span>
          </div>
        </div>

        {/* Big conversational chat-style input box */}
        <form onSubmit={handleSubmit} className="relative mt-2">
          <div className="relative flex items-center rounded-2xl bg-[#FFFBF2] border border-[#E8DFD3] transition-all duration-200 focus-within:border-[#FF7A1A] focus-within:ring-4 focus-within:ring-[#FF7A1A]/[0.18] focus-within:bg-white">
            <textarea
              rows={2}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder={placeholder}
              className="w-full resize-none pl-4 pr-28 py-3.5 text-sm sm:text-base font-medium text-[#1F1A17] placeholder-[#A4998E] bg-transparent border-0 shadow-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none chat-inner-textarea leading-relaxed"
            />

            {/* Action buttons embedded inside text box */}
            <div className="absolute right-3 bottom-3 flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMic}
                aria-label={isListening ? 'Stop voice recording' : 'Ask with voice microphone'}
                className={`p-2.5 rounded-xl transition-all cursor-pointer ${
                  isListening
                    ? 'bg-[#E5383B] text-white animate-pulse shadow-md'
                    : 'bg-white border border-[#EFE6D8] text-[#6B625A] hover:text-[#FF7A1A] hover:border-[#FF7A1A]'
                }`}
                title="Tap to speak"
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#FF7A1A] to-[#E86707] text-white font-semibold text-xs sm:text-sm flex items-center gap-1.5 shadow-md shadow-[#FF7A1A]/20 hover:brightness-105 active:scale-95 transition-all cursor-pointer"
              >
                <span>Ask Buddy</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </form>

        {/* Suggestion prompt pills */}
        <div className="mt-3.5 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <span className="text-[11px] font-semibold text-[#8C827A] whitespace-nowrap shrink-0">
            Try asking:
          </span>
          {samplePrompts.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handlePromptClick(p)}
              className="whitespace-nowrap shrink-0 px-3 py-1 rounded-full bg-[#FFF8EC] hover:bg-[#FFEECB] text-[#554C44] hover:text-[#1F1A17] border border-[#EFE6D8] text-[11px] font-medium transition-colors cursor-pointer"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
