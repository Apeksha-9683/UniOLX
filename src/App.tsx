import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { AuthLayout } from './components/layout/AuthLayout';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider } from './context/AuthContext';

// Pages
import { HomePage } from './pages/HomePage';
import { CategoriesPage } from './pages/CategoriesPage';
import { ListingDetailPage } from './pages/ListingDetailPage';
import { MessagesPage } from './pages/MessagesPage';
import { OrdersPage } from './pages/OrdersPage';
import { SellPage } from './pages/SellPage';
import { WishlistPage } from './pages/WishlistPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProfilePage } from './pages/ProfilePage';
import { SearchPage } from './pages/SearchPage';
import { TradeDetailPage } from './pages/TradeDetailPage';

// Auth Pages
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { VerifyPage } from './pages/auth/VerifyPage';
import { CollegeSelectPage } from './pages/auth/CollegeSelectPage';

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Auth routes using AuthLayout */}
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/verify" element={<VerifyPage />} />
              <Route path="/auth/login" element={<Navigate to="/login" replace />} />
              <Route path="/auth/register" element={<Navigate to="/register" replace />} />
              <Route path="/auth/verify" element={<Navigate to="/verify" replace />} />
              <Route path="/auth/college-select" element={<CollegeSelectPage />} />
            </Route>

            {/* Protected Marketplace Routes: Requires logged-in and verified student session */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/categories" element={<CategoriesPage />} />
              <Route path="/listing/:id" element={<ListingDetailPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/trades/:id" element={<TradeDetailPage />} />
              <Route path="/sell" element={<SellPage />} />
              <Route path="/wishlist" element={<WishlistPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>

            {/* Catch-all route -> home (redirects to /login if unauthenticated) */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
