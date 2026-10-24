import React from 'react';
import { Outlet, Link, Navigate } from 'react-router-dom';
import { ShoppingBag, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  CampusDoodleBicycle,
  CampusDoodleBook,
  CampusDoodleChai,
  CampusDoodleHostelLamp
} from '../ui/CampusDoodles';

export const AuthLayout: React.FC = () => {
  const { user, isAuthenticated, isVerified, loading } = useAuth();

  // If already logged in and email verified, redirect to home marketplace
  if (!loading && isAuthenticated && isVerified) {
    return <Navigate to="/" replace />;
  }
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FFF3D6] via-[#FFF8EC] to-[#FFF8EC] text-[#1F1A17] flex flex-col justify-between p-4 sm:p-6 lg:p-8 relative overflow-hidden">
      {/* Decorative background doodles */}
      <div className="absolute top-10 left-10 text-[#FFC72C]/40 pointer-events-none hidden md:block">
        <CampusDoodleBicycle className="w-20 h-20" />
      </div>
      <div className="absolute top-12 right-14 text-[#FF7A1A]/30 pointer-events-none hidden md:block">
        <CampusDoodleBook className="w-20 h-20" />
      </div>
      <div className="absolute bottom-16 left-12 text-[#FFC72C]/30 pointer-events-none hidden md:block">
        <CampusDoodleChai className="w-16 h-16" />
      </div>
      <div className="absolute bottom-14 right-16 text-[#FF7A1A]/25 pointer-events-none hidden md:block">
        <CampusDoodleHostelLamp className="w-16 h-16" />
      </div>

      {/* Top Header simple lockup */}
      <header className="max-w-6xl mx-auto w-full pt-2 pb-4 flex items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-2.5 group">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#FF7A1A] to-[#FFC72C] flex items-center justify-center shadow-lg shadow-[#FF7A1A]/25 group-hover:scale-105 transition-transform">
            <ShoppingBag className="w-6 h-6 text-white" />
          </div>
          <div className="text-left">
            <span className="text-2xl font-black tracking-tight text-[#1F1A17]">
              Campus<span className="text-[#FF7A1A]">Mart</span>
            </span>
            <p className="text-[10px] font-bold tracking-widest uppercase text-[#6B625A] -mt-1">
              Indian College Marketplace
            </p>
          </div>
        </Link>

        <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 backdrop-blur-xs text-[#03543F] font-bold text-xs border border-[#84E1BC] shadow-2xs">
          <ShieldCheck className="w-3.5 h-3.5 text-[#0E9F6E]" />
          <span>Strictly for verified @college.edu.in students</span>
        </div>
      </header>

      {/* Center dynamic content area */}
      <main className="w-full mx-auto my-4 flex-1 flex flex-col justify-center">
        <Outlet />
      </main>

      {/* Bottom verified info */}
      <footer className="max-w-4xl mx-auto w-full text-center pt-6 pb-2 text-xs text-[#6B625A] space-y-2">
        <p className="text-[#8C827A]">
          <Link to="/" className="hover:underline text-[#FF7A1A] font-semibold">← Explore Marketplace</Link>
          <span className="mx-2">·</span>
          <span>PIN-Confirmed Safe Campus Trades</span>
        </p>
      </footer>
    </div>
  );
};
