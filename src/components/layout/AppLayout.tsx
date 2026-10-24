import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Sparkles,
  ShoppingBag,
  MessageSquare,
  Package,
  PlusCircle,
  Bell,
  Heart,
  ChevronDown,
  ShieldCheck,
  Menu,
  X,
  Compass,
  KeyRound
} from 'lucide-react';
import { getNotifications, getColleges } from '../../api';
import { User, NotificationItem, College } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { CollegeSelectorModal } from '../ui/CollegeSelectorModal';
import { CampusBuddySearch } from '../ui/CampusBuddySearch';
import { Modal } from '../ui/Modal';
import { CampusDoodleBicycle, CampusDoodleBook, CampusDoodleChai } from '../ui/CampusDoodles';

export const AppLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, logout, setSelectedCollege } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isCollegeModalOpen, setIsCollegeModalOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);

  const isMessagesPage = location.pathname.startsWith('/messages');
  const isSearchPage = location.pathname.startsWith('/search');
  const isChatOrSearch = isMessagesPage || isSearchPage;
  const isMobileChatActive =
    (isMessagesPage && (Boolean(searchParams.get('conv')) || Boolean(searchParams.get('listingId')))) || isSearchPage;

  useEffect(() => {
    getNotifications().then(setNotifications);
  }, []);

  const unreadNotifsCount = notifications.filter((n) => !n.read).length;

  const handleSelectCollege = (col: College) => {
    setSelectedCollege(col);
  };

  const navLinks = [
    { label: 'Home', path: '/' },
    { label: 'Categories', path: '/categories' },
    { label: 'Messages', path: '/messages', badge: '1' },
    { label: 'My Orders', path: '/orders' }
  ];

  const handleAiSearch = (query: string) => {
    setIsAiModalOpen(false);
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  return (
    <div
      className={`min-h-screen flex flex-col bg-[#FFF8EC] text-[#1F1A17] font-sans selection:bg-[#FFC72C]/40 ${
        isMessagesPage ? 'h-[100dvh] max-h-[100dvh] overflow-hidden' : ''
      }`}
    >
      {/* Top Notification / Campus Announcement Banner (suppressed on Messages page to maximize viewport) */}
      {!isMessagesPage && (
        <div className="bg-gradient-to-r from-[#FFC72C] via-[#FF9E2C] to-[#FF7A1A] text-[#1F1A17] text-xs font-semibold py-1.5 px-4 text-center flex items-center justify-center gap-2 shrink-0">
          <span className="hidden sm:inline">🎓</span>
          <span>
            Exclusive to verified students of 13 Indian campuses. PIN-secured in-person safe trades!
          </span>
          <button
            onClick={() => setIsCollegeModalOpen(true)}
            className="underline font-bold text-black hover:opacity-80 ml-1 cursor-pointer"
          >
            {user ? `Active: ${user.collegeShortName}` : 'Switch College'}
          </button>
        </div>
      )}

      {/* Main Header */}
      <header className="shrink-0 sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b-2 border-[#EFE6D8]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          {/* Left: Brand Logo & College Selector */}
          <div className="flex items-center gap-4 shrink-0">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#FF7A1A] to-[#FFC72C] flex items-center justify-center shadow-md shadow-[#FF7A1A]/20 group-hover:scale-105 transition-transform">
                <ShoppingBag className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-extrabold tracking-tight text-[#1F1A17] flex items-center gap-1">
                  Campus<span className="text-[#FF7A1A]">Mart</span>
                </span>
                <span className="text-[10px] uppercase font-bold tracking-widest text-[#6B625A] -mt-1">
                  College Exchange
                </span>
              </div>
            </Link>

            {/* Quick Campus Switcher Chip */}
            {user && (
              <button
                type="button"
                onClick={() => setIsCollegeModalOpen(true)}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FFF8EC] border border-[#EFE6D8] hover:border-[#FFC72C] hover:bg-[#FFF2D6] text-xs font-semibold text-[#1F1A17] transition-all cursor-pointer"
                title="Change active college"
              >
                <Compass className="w-3.5 h-3.5 text-[#FF7A1A]" />
                <span className="truncate max-w-[110px]">{user.collegeShortName}</span>
                <ChevronDown className="w-3.5 h-3.5 text-[#6B625A]" />
              </button>
            )}
          </div>

          {/* Middle: Ask AI Star Button & Nav Links */}
          <div className="hidden lg:flex items-center gap-6">
            {/* Ask AI Pill Button */}
            <button
              onClick={() => setIsAiModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[#FFF3C4] via-[#FFE2BF] to-[#FFF3C4] border border-[#FFD966] text-[#8C6500] hover:text-[#5C4300] hover:shadow-sm font-semibold text-xs transition-all cursor-pointer"
            >
              <div className="w-4 h-4 rounded-full bg-[#FF7A1A] text-white flex items-center justify-center">
                <Sparkles className="w-2.5 h-2.5" />
              </div>
              <span>Ask Campus Buddy AI</span>
            </button>

            {/* Main Navigation */}
            <nav className="flex items-center gap-6">
              {navLinks.map((link) => {
                const isActive = location.pathname === link.path;
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className={`relative text-sm font-semibold transition-colors whitespace-nowrap ${
                      isActive ? 'text-[#FF7A1A]' : 'text-[#554C44] hover:text-[#1F1A17]'
                    }`}
                  >
                    <span>{link.label}</span>
                    {link.badge && (
                      <span className="ml-1.5 px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-[#FF7A1A] text-white">
                        {link.badge}
                      </span>
                    )}
                    {isActive && (
                      <span className="absolute -bottom-2 left-0 right-0 h-0.5 bg-[#FF7A1A] rounded-full" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Action Icons & Profile */}
          <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
            {/* Sell Button */}
            <Link
              to="/sell"
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#FF7A1A] text-white hover:bg-[#E86707] font-semibold text-xs shadow-sm shadow-[#FF7A1A]/30 active:scale-95 transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Sell Item</span>
            </Link>

            {/* Wishlist Heart */}
            <Link
              to="/wishlist"
              aria-label="Wishlist"
              className="p-2 rounded-full bg-[#FFF8EC] border border-[#EFE6D8] text-[#554C44] hover:text-[#E5383B] hover:border-[#FFC72C] transition-colors"
            >
              <Heart className="w-4 h-4" />
            </Link>

            {/* Notification Bell with Red Badge */}
            <Link
              to="/notifications"
              aria-label="Notifications"
              className="relative p-2 rounded-full bg-[#FFF8EC] border border-[#EFE6D8] text-[#554C44] hover:text-[#1F1A17] hover:border-[#FFC72C] transition-colors"
            >
              <Bell className="w-4 h-4" />
              {unreadNotifsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#E5383B] text-white text-[10px] font-extrabold flex items-center justify-center shadow-xs">
                  {unreadNotifsCount}
                </span>
              )}
            </Link>

            {/* Profile Menu with College & Green Verified Tick */}
            {user && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                  className="flex items-center gap-2 p-1.5 pr-2.5 rounded-full bg-[#FFF8EC] border border-[#EFE6D8] hover:border-[#FFC72C] transition-all cursor-pointer"
                >
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-7 h-7 rounded-full bg-[#FFC72C] border border-white"
                  />
                  <div className="hidden xl:flex flex-col text-left">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-bold text-[#1F1A17] truncate max-w-[80px]">
                        {user.name.split(' ')[0]}
                      </span>
                      {user.isVerified && (
                        <span title="Verified College Student">
                          <ShieldCheck className="w-3.5 h-3.5 text-[#10B981] fill-[#10B981]/20" />
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-semibold text-[#8C6500] bg-[#FFF3C4] px-1.5 rounded-xs leading-tight">
                      {user.collegeShortName}
                    </span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-[#6B625A]" />
                </button>

                {/* Profile Dropdown */}
                {isProfileDropdownOpen && (
                  <div
                    className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border-2 border-[#EFE6D8] py-2 z-50 animate-in fade-in zoom-in-95"
                    onClick={() => setIsProfileDropdownOpen(false)}
                  >
                    <div className="px-4 py-3 border-b border-[#F2E7D7]">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-bold text-[#1F1A17] truncate">{user.name}</p>
                        <ShieldCheck className="w-3.5 h-3.5 text-[#10B981] fill-[#10B981]/20" />
                      </div>
                      <p className="text-[11px] text-[#6B625A] truncate">{user.email}</p>
                      <div className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-[#10B981]">
                        <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                        <span>Verified Student ({user.collegeShortName})</span>
                      </div>
                    </div>

                    <Link
                      to="/profile"
                      className="block px-4 py-2 text-xs font-semibold text-[#1F1A17] hover:bg-[#FFF8EC] hover:text-[#FF7A1A]"
                    >
                      My Student Profile
                    </Link>
                    <Link
                      to="/orders"
                      className="block px-4 py-2 text-xs font-semibold text-[#1F1A17] hover:bg-[#FFF8EC] hover:text-[#FF7A1A]"
                    >
                      My Orders & PIN Trades
                    </Link>
                    <Link
                      to="/wishlist"
                      className="block px-4 py-2 text-xs font-semibold text-[#1F1A17] hover:bg-[#FFF8EC] hover:text-[#FF7A1A]"
                    >
                      Saved Items
                    </Link>
                    <div className="border-t border-[#F2E7D7] my-1" />
                    <button
                      onClick={() => setIsCollegeModalOpen(true)}
                      className="w-full text-left px-4 py-2 text-xs font-semibold text-[#8C6500] hover:bg-[#FFF8EC]"
                    >
                      Switch Campus ({user.collegeShortName})
                    </button>
                    <button
                      onClick={async () => {
                        await logout();
                        navigate('/login');
                      }}
                      className="w-full text-left px-4 py-2 text-xs font-semibold text-[#E5383B] hover:bg-[#FDE8E8] cursor-pointer"
                    >
                      Log Out
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 rounded-2xl bg-[#FFF8EC] border border-[#EFE6D8] text-[#1F1A17]"
              aria-label="Toggle navigation menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden bg-white border-t border-[#EFE6D8] px-4 pt-3 pb-6 space-y-3 shadow-lg">
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                setIsAiModalOpen(true);
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-gradient-to-r from-[#FFF3C4] to-[#FFE2BF] border border-[#FFD966] text-[#8C6500] font-semibold text-xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#FF7A1A]" />
              <span>Ask Campus Buddy AI</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              {navLinks.map((l) => (
                <Link
                  key={l.path}
                  to={l.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`p-2.5 rounded-2xl text-center text-xs font-bold border transition-colors ${
                    location.pathname === l.path
                      ? 'bg-[#FF7A1A] text-white border-[#FF7A1A]'
                      : 'bg-[#FFF8EC] text-[#1F1A17] border-[#EFE6D8]'
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <Link
                to="/sell"
                onClick={() => setIsMobileMenuOpen(false)}
                className="w-full py-2.5 rounded-full bg-[#FF7A1A] text-white text-xs font-bold text-center shadow-xs"
              >
                + Sell an Item
              </Link>
              <button
                type="button"
                onClick={async () => {
                  setIsMobileMenuOpen(false);
                  await logout();
                  navigate('/login');
                }}
                className="w-full py-2 rounded-full border border-[#F8B4B4] bg-white text-[#E5383B] text-xs font-bold text-center cursor-pointer"
              >
                Log Out
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Outlet Body */}
      <main
        className={`flex-1 min-h-0 ${
          isChatOrSearch
            ? 'h-[calc(100dvh-5rem)] max-h-[calc(100dvh-5rem)] overflow-hidden flex flex-col'
            : 'pb-24 md:pb-0'
        }`}
      >
        <Outlet />
      </main>

      {/* Campus Mart Footer (suppressed on Messages and Search pages) */}
      {!isChatOrSearch && (
        <footer className="mt-20 bg-white border-t-2 border-[#EFE6D8] pt-12 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-[#F2E7D7]">
            {/* Col 1: Brand & Safety */}
            <div className="md:col-span-1 space-y-3">
              <Link to="/" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#FF7A1A] to-[#FFC72C] flex items-center justify-center text-white">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <span className="font-extrabold text-lg text-[#1F1A17]">
                  Campus<span className="text-[#FF7A1A]">Mart</span>
                </span>
              </Link>
              <p className="text-xs text-[#6B625A] leading-relaxed">
                The student-only marketplace verified by institutional .edu.in emails. Safe, in-person campus pickups with 4-digit PIN guarantee.
              </p>
              <div className="flex items-center gap-2 pt-1 text-[#6B625A]">
                <CampusDoodleBicycle className="w-5 h-5 text-[#FF7A1A]" />
                <CampusDoodleBook className="w-5 h-5 text-[#FFC72C]" />
                <CampusDoodleChai className="w-5 h-5 text-[#E5383B]" />
              </div>
            </div>

            {/* Col 2: Top Colleges */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#1F1A17] mb-3">
                13 Verified Campuses
              </h4>
              <ul className="space-y-1.5 text-xs text-[#6B625A]">
                <li>RVCE · BMSCE · MSRIT</li>
                <li>IISc Bangalore · NITK Surathkal</li>
                <li>IIT Dharwad · IIT Bombay · IIT Delhi</li>
                <li>PES · DSCE · UVCE · Christ · BVB</li>
              </ul>
            </div>

            {/* Col 3: Student Safety Trade */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#1F1A17] mb-3">
                Safe Campus Trades
              </h4>
              <ul className="space-y-1.5 text-xs text-[#6B625A]">
                <li className="flex items-center gap-1.5">
                  <span className="text-[#10B981]">✓</span> Verified institutional email only
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-[#10B981]">✓</span> Designated campus pickup spots
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-[#10B981]">✓</span> 4-digit PIN confirmation
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-[#10B981]">✓</span> Zero spam or outside sellers
                </li>
              </ul>
            </div>

            {/* Col 4: Quick Links */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#1F1A17] mb-3">
                Platform Links
              </h4>
              <ul className="space-y-2 text-xs font-medium text-[#6B625A]">
                <li>
                  <Link to="/categories" className="hover:text-[#1F1A17]">Browse All Categories</Link>
                </li>
                <li>
                  <Link to="/orders" className="hover:text-[#1F1A17]">My Orders & PIN Verification</Link>
                </li>
                <li>
                  <Link to="/auth/college-select" className="hover:text-[#1F1A17]">Campus Verification Portal</Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-[#8C827A] gap-3">
            <p>© 2026 Campus Mart. Built with pride for Indian college students.</p>
            <div className="flex items-center gap-4">
              <span>Zero Dark Blue Guarantee</span>
              <span>•</span>
              <span className="text-[#10B981] font-semibold">100% Student Verified</span>
            </div>
          </div>
        </div>
      </footer>
      )}

      {/* College Switcher Modal */}
      <CollegeSelectorModal
        isOpen={isCollegeModalOpen}
        onClose={() => setIsCollegeModalOpen(false)}
        selectedCollegeId={user?.collegeId || 'rvce'}
        onSelectCollege={handleSelectCollege}
      />

      {/* Quick AI Search Modal */}
      <Modal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        title="Campus Buddy AI"
        subtitle="What are you looking to buy, sell, or borrow today?"
        maxWidth="2xl"
      >
        <CampusBuddySearch onSearch={handleAiSearch} />
      </Modal>

      {/* Mobile Sticky Bottom Navigation Bar (hidden on Messages page when viewing conversation) */}
      {(!isMessagesPage || !isMobileChatActive) && (
        <nav
          aria-label="Mobile Navigation"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t-2 border-[#EFE6D8] px-2 py-1.5 shadow-lg flex items-center justify-around pb-[env(safe-area-inset-bottom,6px)]"
        >
        <Link
          to="/"
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-colors ${
            location.pathname === '/' ? 'text-[#FF7A1A]' : 'text-[#6B625A] hover:text-[#1F1A17]'
          }`}
        >
          <ShoppingBag className="w-5 h-5" />
          <span className="text-[10px] font-bold">Home</span>
        </Link>

        <Link
          to="/categories"
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-colors ${
            location.pathname === '/categories' ? 'text-[#FF7A1A]' : 'text-[#6B625A] hover:text-[#1F1A17]'
          }`}
        >
          <Compass className="w-5 h-5" />
          <span className="text-[10px] font-bold">Browse</span>
        </Link>

        {/* Center Floating Sell Button */}
        <Link
          to="/sell"
          className="-mt-5 bg-gradient-to-tr from-[#FF7A1A] to-[#FFC72C] text-white p-3 rounded-full shadow-lg shadow-[#FF7A1A]/30 flex flex-col items-center justify-center hover:scale-105 active:scale-95 transition-all border-2 border-white"
          aria-label="Sell an item"
        >
          <PlusCircle className="w-6 h-6" />
          <span className="text-[8px] font-black tracking-wider uppercase">SELL</span>
        </Link>

        <Link
          to="/messages"
          className={`relative flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-colors ${
            location.pathname === '/messages' ? 'text-[#FF7A1A]' : 'text-[#6B625A] hover:text-[#1F1A17]'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-[10px] font-bold">Chats</span>
          <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-[#FF7A1A]" />
        </Link>

        <Link
          to="/orders"
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-colors ${
            location.pathname.startsWith('/orders') || location.pathname.startsWith('/trades')
              ? 'text-[#FF7A1A]'
              : 'text-[#6B625A] hover:text-[#1F1A17]'
          }`}
        >
          <KeyRound className="w-5 h-5" />
          <span className="text-[10px] font-bold">Orders</span>
        </Link>

        <Link
          to="/profile"
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-colors ${
            location.pathname === '/profile' ? 'text-[#FF7A1A]' : 'text-[#6B625A] hover:text-[#1F1A17]'
          }`}
        >
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt={user.name}
              className={`w-5 h-5 rounded-full object-cover border ${
                location.pathname === '/profile' ? 'border-[#FF7A1A]' : 'border-[#EFE6D8]'
              }`}
            />
          ) : (
            <ShieldCheck className="w-5 h-5" />
          )}
          <span className="text-[10px] font-bold">Profile</span>
        </Link>
      </nav>
      )}
    </div>
  );
};
