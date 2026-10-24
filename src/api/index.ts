import {
  College,
  User,
  Listing,
  ListingFilters,
  ListingStatus,
  Trade,
  Conversation,
  ChatMessage,
  NotificationItem,
  ParsedCriterion,
  AIRankedListing,
  AISearchResult
} from '../types';
import { colleges } from '../data/colleges';
import { currentUser } from '../data/user';
import { mockListings } from '../data/listings';
import { mockTrades } from '../data/trades';
import { mockConversations, mockMessages } from '../data/conversations';
import { mockNotifications } from '../data/notifications';
import {
  backendLogin,
  backendRegister,
  isBackendConfigured,
  searchWithBackend
} from './backend';

// In-memory clones with localStorage persistence to allow mutations during runtime session
const LISTINGS_STORAGE_KEY = 'campus_mart_listings';

function loadListings(): Listing[] {
  try {
    const raw = localStorage.getItem(LISTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [...mockListings];
}

let memoryListings: Listing[] = loadListings();

function saveListings() {
  try {
    localStorage.setItem(LISTINGS_STORAGE_KEY, JSON.stringify(memoryListings));
  } catch {
    // ignore
  }
}

let memoryTrades: Trade[] = [...mockTrades];
let memoryConversations: Conversation[] = [...mockConversations];
let memoryMessages: Record<string, ChatMessage[]> = { ...mockMessages };
let memoryNotifications: NotificationItem[] = [...mockNotifications];
const AUTH_STORAGE_KEY = 'campus_mart_user';

const COLLEGES_STORAGE_KEY = 'campus_mart_colleges';
const TOKEN_STORAGE_KEY = 'campus_mart_token';

function loadColleges(): College[] {
  try {
    const raw = localStorage.getItem(COLLEGES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  return [...colleges];
}

let memoryColleges: College[] = loadColleges();

function loadStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id) return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

let memoryUser: User | null = loadStoredUser();

const delay = (ms: number = 80) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getColleges(): Promise<College[]> {
  await delay(60);
  return [...memoryColleges];
}

export async function getCollegeById(id: string): Promise<College | null> {
  await delay(40);
  return memoryColleges.find((c) => c.id.toLowerCase() === id.toLowerCase()) || null;
}

/**
 * searchColleges(query):
 * Debounced search across name, shortName, city, state, domain.
 * Returns up to 8 matched colleges.
 */
export async function searchColleges(query: string): Promise<College[]> {
  await delay(120);
  const q = (query || '').trim().toLowerCase();
  if (!q || q.length < 2) {
    return [];
  }

  const matches = memoryColleges.filter((c) => {
    return (
      c.name.toLowerCase().includes(q) ||
      c.shortName.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      c.state.toLowerCase().includes(q) ||
      (c.domain && c.domain.toLowerCase().includes(q))
    );
  });

  return matches.slice(0, 8);
}

/**
 * requestCollege({ name, city, state }):
 * Creates a new pending review college, adds to list, and returns it.
 */
export async function requestCollege(data: {
  name: string;
  city: string;
  state: string;
  domain?: string;
}): Promise<College> {
  await delay(150);
  const newCol: College = {
    id: `col_req_${Date.now()}`,
    name: data.name.trim(),
    shortName: data.name.trim().split(' ')[0],
    city: data.city.trim(),
    state: data.state.trim(),
    domain: data.domain?.trim().toLowerCase() || undefined,
    status: 'pending',
    popularBranches: ['General Academics', 'Technology', 'Science']
  };

  memoryColleges.unshift(newCol);
  try {
    localStorage.setItem(COLLEGES_STORAGE_KEY, JSON.stringify(memoryColleges));
  } catch {
    // ignore
  }
  return newCol;
}

export async function requestNewCollege(data: {
  collegeName: string;
  city: string;
  domain?: string;
  requesterEmail?: string;
  notes?: string;
}): Promise<{ success: boolean; message: string; college?: College }> {
  const col = await requestCollege({
    name: data.collegeName,
    city: data.city,
    state: 'India',
    domain: data.domain
  });
  return {
    success: true,
    message: `Thank you! ${col.name} has been added as a pending review campus.`,
    college: col
  };
}

export async function getCurrentUser(): Promise<User | null> {
  await delay(40);
  return memoryUser ? { ...memoryUser } : null;
}

export async function updateCurrentUser(patch: Partial<User>): Promise<User> {
  await delay(50);
  if (!memoryUser) {
    throw new Error('No user is logged in');
  }
  memoryUser = { ...memoryUser, ...patch };
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(memoryUser));
  } catch {
    // ignore
  }
  return { ...memoryUser };
}

const PUBLIC_EMAIL_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'yahoo.co.in',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'rediffmail.com',
  'yandex.com',
  'mail.com',
  'gmx.com'
];

/**
 * login({ email, password }):
 * Supports object argument or positional arguments.
 */
export async function login(
  arg1: { email: string; password: string } | string,
  arg2?: string
): Promise<{ success: boolean; user?: User; error?: string }> {
  if (isBackendConfigured()) {
    try {
      const result = await backendLogin(
        typeof arg1 === 'object' ? arg1.email : arg1,
        typeof arg1 === 'object' ? arg1.password : arg2 || ''
      );
      memoryUser = result.user;
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(result.user));
      localStorage.setItem(TOKEN_STORAGE_KEY, result.token);
      return { success: true, user: result.user };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Login failed' };
    }
  }

  await delay(120);
  const email = typeof arg1 === 'object' ? arg1.email : arg1;
  const password = typeof arg1 === 'object' ? arg1.password : arg2 || '';

  const cleanEmail = (email || '').trim().toLowerCase();

  if (!cleanEmail || !cleanEmail.includes('@')) {
    return {
      success: false,
      error: 'Please enter a valid official institutional email address.'
    };
  }

  const domain = cleanEmail.split('@')[1] || '';

  if (PUBLIC_EMAIL_DOMAINS.includes(domain)) {
    return {
      success: false,
      error: 'Public email addresses like Gmail, Yahoo, or Outlook are not allowed. Please enter your college email.'
    };
  }

  // Look for matching college from domain
  const matchedCollege =
    memoryColleges.find((c) => c.domain && domain.includes(c.domain.replace('www.', ''))) ||
    memoryColleges[0];

  // If logging in with demo user Aarav
  if (cleanEmail === currentUser.email.toLowerCase()) {
    memoryUser = { ...currentUser };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(memoryUser));
    localStorage.setItem(TOKEN_STORAGE_KEY, `mock_token_${Date.now()}`);
    return { success: true, user: memoryUser };
  }

  // If there is an existing registered user in localStorage with this email
  const existingRaw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (existingRaw) {
    try {
      const parsed: User = JSON.parse(existingRaw);
      if (parsed.email.toLowerCase() === cleanEmail) {
        memoryUser = parsed;
        localStorage.setItem(TOKEN_STORAGE_KEY, `mock_token_${Date.now()}`);
        return { success: true, user: memoryUser };
      }
    } catch {
      // ignore
    }
  }

  // Generic institutional login
  const displayName = cleanEmail.split('@')[0].split('.')[0];
  const capitalizedName = displayName.charAt(0).toUpperCase() + displayName.slice(1);

  memoryUser = {
    id: `usr_${Date.now()}`,
    name: capitalizedName,
    email: cleanEmail,
    collegeId: matchedCollege.id,
    collegeName: matchedCollege.name,
    collegeShortName: matchedCollege.shortName,
    branch: 'Engineering & Technology',
    year: 2,
    semester: 4,
    avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${capitalizedName}&backgroundColor=ffc72c`,
    isVerified: true,
    rating: 5.0,
    totalReviews: 1,
    completedTrades: 0,
    joinedDate: 'October 2026'
  };

  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(memoryUser));
  localStorage.setItem(TOKEN_STORAGE_KEY, `mock_token_${Date.now()}`);
  return { success: true, user: memoryUser };
}

export const loginUser = login;

/**
 * registerUser({ collegeId, name, email, password }):
 * Rejects public email domains.
 * Enforces college domain matching when known.
 * For colleges without known domains, requires .ac.in, .edu.in, or .edu.
 */
export async function registerUser(data: {
  collegeId: string;
  name: string;
  email: string;
  password: string;
  branch?: string;
}): Promise<{ success: boolean; user?: User; error?: string }> {
  if (isBackendConfigured()) {
    try {
      const result = await backendRegister({
        name: data.name,
        email: data.email,
        password: data.password,
        collegeId: data.collegeId,
        branch: data.branch
      });
      memoryUser = result.user;
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(result.user));
      localStorage.setItem(TOKEN_STORAGE_KEY, result.token);
      return { success: true, user: result.user };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed'
      };
    }
  }

  await delay(150);
  const cleanEmail = (data.email || '').trim().toLowerCase();
  const college = memoryColleges.find((c) => c.id === data.collegeId) || memoryColleges[0];

  if (!cleanEmail.includes('@')) {
    return {
      success: false,
      error: 'Please enter a valid email address.'
    };
  }

  const domain = cleanEmail.split('@')[1] || '';

  // 1. Block public email domains
  if (PUBLIC_EMAIL_DOMAINS.includes(domain)) {
    return {
      success: false,
      error: `Public email providers (${domain}) are not allowed. Please use your official college email.`
    };
  }

  // 2. College domain validation
  if (college.domain) {
    const expectedDomain = college.domain.toLowerCase().replace('www.', '');
    if (!domain.includes(expectedDomain)) {
      return {
        success: false,
        error: `Email domain does not match ${college.shortName}. Please use your official @${college.domain} institutional email.`
      };
    }
  } else {
    // For colleges without known domains, accept education-style domains (.ac.in, .edu.in, .edu, .ernet.in)
    const isEduStyle =
      domain.endsWith('.ac.in') ||
      domain.endsWith('.edu.in') ||
      domain.endsWith('.edu') ||
      domain.endsWith('.ernet.in');

    if (!isEduStyle) {
      return {
        success: false,
        error: 'For unlisted or pending campuses, your official email must end with .ac.in, .edu.in, or .edu.'
      };
    }
  }

  // 3. Password rule
  if (!data.password || data.password.length < 6) {
    return {
      success: false,
      error: 'Password must be at least 6 characters long.'
    };
  }

  // Create unverified user awaiting 6-digit OTP verification
  const newUser: User = {
    id: `usr_${Date.now()}`,
    name: data.name.trim(),
    email: cleanEmail,
    collegeId: college.id,
    collegeName: college.name,
    collegeShortName: college.shortName,
    branch: data.branch || 'Undergraduate',
    year: 1,
    semester: 1,
    hostel: 'Freshers Hostel Block',
    avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(data.name)}&backgroundColor=ffc72c`,
    isVerified: false, // Must be verified in Step 3
    rating: 5.0,
    totalReviews: 0,
    completedTrades: 0,
    joinedDate: 'October 2026'
  };

  memoryUser = newUser;
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(memoryUser));
  localStorage.setItem(TOKEN_STORAGE_KEY, `mock_token_${Date.now()}`);

  return { success: true, user: newUser };
}

/**
 * verifyOtp({ email, code }):
 * Supports object argument or (email, code) positional arguments.
 */
export async function verifyOtp(
  arg1: { email?: string; code: string } | string,
  arg2?: string
): Promise<{ success: boolean; user?: User; error?: string }> {
  await delay(180);
  const email = typeof arg1 === 'object' ? arg1.email || '' : arg1;
  const code = typeof arg1 === 'object' ? arg1.code : arg2 || '';

  if (code === '000000') {
    return {
      success: false,
      error: 'Invalid verification code. Please check your college inbox or click Resend code.'
    };
  }

  if (code.length !== 6 || !/^\d{6}$/.test(code)) {
    return {
      success: false,
      error: 'Please enter a complete 6-digit verification code.'
    };
  }

  if (memoryUser) {
    memoryUser = { ...memoryUser, isVerified: true };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(memoryUser));
  } else {
    const cleanEmail = email || 'student@campus.edu.in';
    const displayName = cleanEmail.split('@')[0].split('.')[0];
    const cap = displayName.charAt(0).toUpperCase() + displayName.slice(1);
    memoryUser = {
      ...currentUser,
      name: cap || 'Student',
      email: cleanEmail,
      isVerified: true
    };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(memoryUser));
    localStorage.setItem(TOKEN_STORAGE_KEY, `mock_token_${Date.now()}`);
  }

  return { success: true, user: memoryUser };
}

export const verifyEmailOtp = verifyOtp;

export async function resendVerificationOtp(email: string): Promise<{ success: boolean; message: string }> {
  await delay(100);
  return {
    success: true,
    message: `A fresh 6-digit verification code has been dispatched to ${email}.`
  };
}

export async function logout(): Promise<void> {
  await delay(50);
  memoryUser = null;
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export const logoutUser = logout;

export async function getListings(filters?: ListingFilters): Promise<Listing[]> {
  await delay();
  let results = [...memoryListings];

  if (filters?.collegeId && filters.collegeId !== 'all') {
    results = results.filter((item) => item.collegeId.toLowerCase() === filters.collegeId!.toLowerCase());
  }

  if (filters?.category && filters.category !== 'All') {
    results = results.filter((item) => item.category === filters.category);
  }

  if (filters?.condition && filters.condition !== 'All') {
    results = results.filter((item) => item.condition === filters.condition);
  }

  if (filters?.minPrice !== undefined) {
    results = results.filter((item) => item.price >= filters.minPrice!);
  }

  if (filters?.maxPrice !== undefined) {
    results = results.filter((item) => item.price <= filters.maxPrice!);
  }

  if (filters?.query && filters.query.trim() !== '') {
    const q = filters.query.toLowerCase().trim();
    results = results.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.campusPickupSpot.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q))
    );
  }

  if (filters?.sortBy) {
    if (filters.sortBy === 'price_low') {
      results.sort((a, b) => a.price - b.price);
    } else if (filters.sortBy === 'price_high') {
      results.sort((a, b) => b.price - a.price);
    } else if (filters.sortBy === 'discount') {
      results.sort((a, b) => {
        const discA = (a.originalPrice - a.price) / a.originalPrice;
        const discB = (b.originalPrice - b.price) / b.originalPrice;
        return discB - discA;
      });
    }
  }

  return results;
}

export async function getListingById(id: string): Promise<Listing | null> {
  await delay();
  const listing = memoryListings.find((l) => l.id === id);
  return listing ? { ...listing } : null;
}

export async function getFeaturedListings(collegeId?: string): Promise<Listing[]> {
  await delay();
  let items = [...memoryListings];
  if (collegeId && collegeId !== 'all') {
    items = items.filter((l) => l.collegeId.toLowerCase() === collegeId.toLowerCase());
  }
  return items.slice(0, 6);
}

export async function createListing(data: {
  title: string;
  description: string;
  price: number;
  originalPrice: number;
  category: Listing['category'];
  condition: Listing['condition'];
  campusPickupSpot: string;
  images: string[];
  specs?: Record<string, string>;
  tags?: string[];
  quantity?: number;
}): Promise<Listing> {
  await delay(150);
  const activeUser = memoryUser || currentUser;
  const newListing: Listing = {
    id: `list_${Date.now()}`,
    title: data.title,
    description: data.description,
    price: data.price,
    originalPrice: data.originalPrice || data.price,
    category: data.category,
    condition: data.condition,
    status: 'Available',
    collegeId: activeUser.collegeId,
    collegeName: activeUser.collegeName,
    campusPickupSpot: data.campusPickupSpot,
    quantity: data.quantity || 1,
    seller: {
      id: activeUser.id,
      name: activeUser.name,
      collegeId: activeUser.collegeId,
      collegeName: activeUser.collegeShortName,
      branch: `${activeUser.branch} ${activeUser.semester}th Sem`,
      avatar: activeUser.avatar,
      isVerified: activeUser.isVerified,
      rating: activeUser.rating,
      totalReviews: activeUser.totalReviews,
      hostelOrArea: activeUser.hostel || 'Hostel Campus'
    },
    images: data.images.length > 0 ? data.images : ['https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80'],
    specs: data.specs || {},
    tags: data.tags || [data.category.toLowerCase()],
    postedAt: 'Just now',
    isWishlisted: false,
    viewsCount: 1
  };

  memoryListings.unshift(newListing);
  saveListings();
  return newListing;
}

export async function updateListingStatus(id: string, status: ListingStatus): Promise<Listing | null> {
  await delay();
  const index = memoryListings.findIndex((l) => l.id === id);
  if (index === -1) return null;
  memoryListings[index] = { ...memoryListings[index], status };
  saveListings();
  return { ...memoryListings[index] };
}

export async function toggleWishlist(listingId: string): Promise<boolean> {
  await delay();
  const index = memoryListings.findIndex((l) => l.id === listingId);
  if (index === -1) return false;
  const current = !!memoryListings[index].isWishlisted;
  memoryListings[index] = { ...memoryListings[index], isWishlisted: !current };
  saveListings();
  return !current;
}

export async function getWishlist(): Promise<Listing[]> {
  await delay();
  return memoryListings.filter((l) => l.isWishlisted);
}

export async function getTrades(): Promise<Trade[]> {
  await delay();
  return [...memoryTrades];
}

export async function getTradeById(id: string): Promise<Trade | null> {
  await delay();
  const trade = memoryTrades.find((t) => t.id === id);
  return trade ? { ...trade } : null;
}

export async function createTrade(data: {
  listingId: string;
  pickupSpot: string;
  scheduledTime: string;
  quantity?: number;
}): Promise<Trade> {
  await delay(150);
  const listing = memoryListings.find((l) => l.id === data.listingId);
  if (!listing) {
    throw new Error('Listing not found');
  }

  const activeUser = memoryUser || currentUser;
  // Generate safe 6-digit PIN for pickup verification
  const randomPin = Math.floor(100000 + Math.random() * 900000).toString();
  const tradeQty = data.quantity || 1;

  const newTrade: Trade = {
    id: `trd_${Date.now()}`,
    listingId: listing.id,
    listingTitle: listing.title,
    listingImage: listing.images[0],
    price: listing.price * tradeQty,
    quantity: tradeQty,
    buyerId: activeUser.id,
    buyerName: activeUser.name,
    buyerCollege: activeUser.collegeShortName,
    sellerId: listing.seller.id,
    sellerName: listing.seller.name,
    sellerCollege: listing.seller.collegeName,
    pickupSpot: data.pickupSpot || listing.campusPickupSpot,
    scheduledTime: data.scheduledTime,
    status: 'Pending',
    confirmationPin: randomPin,
    attemptsLeft: 5,
    isLocked: false,
    expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes expiry
    createdAt: 'Just now'
  };

  memoryTrades.unshift(newTrade);
  listing.status = 'Reserved';

  // Also add notifications for both sides
  memoryNotifications.unshift({
    id: `notif_${Date.now()}`,
    title: 'Trade Started: ' + listing.title.slice(0, 30) + '...',
    message: `Scheduled pickup at ${newTrade.pickupSpot}. Keep your PIN confidential until in-person inspection.`,
    type: 'trade',
    read: false,
    timestamp: 'Just now',
    link: `/trades/${newTrade.id}`
  });

  return newTrade;
}

export async function confirmTradePin(
  tradeId: string,
  enteredPin: string
): Promise<{
  success: boolean;
  message: string;
  attemptsLeft?: number;
  locked?: boolean;
  expired?: boolean;
  unavailable?: boolean;
}> {
  await delay(200);
  const trade = memoryTrades.find((t) => t.id === tradeId);
  if (!trade) {
    return { success: false, message: 'Trade not found' };
  }

  // Check if locked
  if (trade.isLocked || (trade.attemptsLeft !== undefined && trade.attemptsLeft <= 0)) {
    trade.isLocked = true;
    return {
      success: false,
      message: 'Trade is locked due to too many failed attempts (5/5). Please contact campus support or cancel.',
      locked: true,
      attemptsLeft: 0
    };
  }

  // Check if expired
  if (trade.expiresAt && Date.now() > trade.expiresAt) {
    return {
      success: false,
      message: 'Trade PIN has expired. The buyer must regenerate a new PIN from their trade screen.',
      expired: true
    };
  }

  // Check if listing is still available / reserved for this trade
  const listing = memoryListings.find((l) => l.id === trade.listingId);
  if (!listing || (listing.status === 'Sold' && listing.quantity === 0)) {
    return {
      success: false,
      message: 'Item is no longer available.',
      unavailable: true
    };
  }

  // Check PIN match
  if (trade.confirmationPin !== enteredPin.trim()) {
    const remaining = Math.max(0, (trade.attemptsLeft ?? 5) - 1);
    trade.attemptsLeft = remaining;
    if (remaining === 0) {
      trade.isLocked = true;
      return {
        success: false,
        message: 'Incorrect PIN! 0 attempts left. Trade has been locked for security.',
        attemptsLeft: 0,
        locked: true
      };
    }
    return {
      success: false,
      message: `Incorrect PIN! ${remaining} attempt${remaining === 1 ? '' : 's'} left.`,
      attemptsLeft: remaining
    };
  }

  // Successful match
  trade.status = 'Completed';
  trade.completedAt = 'Just now';

  // Update listing stock or status
  if (listing) {
    const qtyDeducted = trade.quantity || 1;
    const newQty = Math.max(0, (listing.quantity || 1) - qtyDeducted);
    listing.quantity = newQty;
    if (newQty <= 0) {
      listing.status = 'Sold';
    } else {
      listing.status = 'Available';
    }
  }

  // Add completion notification
  memoryNotifications.unshift({
    id: `notif_comp_${Date.now()}`,
    title: 'Trade Completed: ' + listing.title.slice(0, 30),
    message: 'Your in-person trade was confirmed via PIN. Listing marked as sold!',
    type: 'trade',
    read: false,
    timestamp: 'Just now',
    link: `/trades/${trade.id}`
  });

  return { success: true, message: 'Trade completed, listing marked as sold!' };
}

export async function cancelTrade(tradeId: string, reason?: string): Promise<{ success: boolean; message: string }> {
  await delay(150);
  const trade = memoryTrades.find((t) => t.id === tradeId);
  if (!trade) {
    return { success: false, message: 'Trade not found' };
  }
  trade.status = 'Cancelled';
  trade.cancelledAt = 'Just now';

  // Restore listing availability
  const listing = memoryListings.find((l) => l.id === trade.listingId);
  if (listing && listing.status === 'Reserved') {
    listing.status = 'Available';
  }

  // Add cancellation notification
  memoryNotifications.unshift({
    id: `notif_canc_${Date.now()}`,
    title: 'Trade Cancelled: ' + trade.listingTitle.slice(0, 30),
    message: `The campus trade was cancelled${reason ? ` (${reason})` : ''}.`,
    type: 'trade',
    read: false,
    timestamp: 'Just now',
    link: '/orders'
  });

  return { success: true, message: 'Campus trade has been cancelled.' };
}

export async function regenerateTradePin(tradeId: string): Promise<{ success: boolean; newPin: string; message: string }> {
  await delay(150);
  const trade = memoryTrades.find((t) => t.id === tradeId);
  if (!trade) {
    throw new Error('Trade not found');
  }
  const newPin = Math.floor(100000 + Math.random() * 900000).toString();
  trade.confirmationPin = newPin;
  trade.attemptsLeft = 5;
  trade.isLocked = false;
  trade.expiresAt = Date.now() + 15 * 60 * 1000;

  return { success: true, newPin, message: 'New 6-digit PIN generated! Valid for 15 minutes.' };
}

export async function deactivateListing(listingId: string): Promise<Listing | null> {
  await delay(100);
  const listing = memoryListings.find((l) => l.id === listingId);
  if (!listing) return null;
  listing.status = listing.status === 'Reserved' ? 'Available' : 'Reserved';
  saveListings();
  return { ...listing };
}

export async function archiveListing(listingId: string): Promise<boolean> {
  await delay(100);
  const index = memoryListings.findIndex((l) => l.id === listingId);
  if (index !== -1) {
    memoryListings.splice(index, 1);
    saveListings();
    return true;
  }
  return false;
}

export async function updateListing(listingId: string, updates: Partial<Listing>): Promise<Listing | null> {
  await delay(150);
  const listing = memoryListings.find((l) => l.id === listingId);
  if (!listing) return null;
  Object.assign(listing, updates);
  saveListings();
  return { ...listing };
}

export async function getConversations(): Promise<Conversation[]> {
  await delay(30);
  // Requirement 3: A conversation appears in the left sidebar ONLY after at least one message has been sent
  return memoryConversations.filter(
    (c) => memoryMessages[c.id] && memoryMessages[c.id].length > 0
  );
}

export async function getConversationById(id: string): Promise<Conversation | null> {
  await delay(30);
  const conv = memoryConversations.find((c) => c.id === id);
  return conv ? { ...conv } : null;
}

import { mockSocket } from './mockSocket';
export { mockSocket };

// Save mock replies delivered via mockSocket into in-memory storage
mockSocket.on<ChatMessage>('message', (incomingMsg) => {
  if (!incomingMsg.isMine && incomingMsg.conversationId) {
    if (!memoryMessages[incomingMsg.conversationId]) {
      memoryMessages[incomingMsg.conversationId] = [];
    }
    if (!memoryMessages[incomingMsg.conversationId].some((m) => m.id === incomingMsg.id)) {
      memoryMessages[incomingMsg.conversationId].push(incomingMsg);
      const c = memoryConversations.find((item) => item.id === incomingMsg.conversationId);
      if (c) {
        c.lastMessage = incomingMsg.text;
        c.lastMessageTime = 'Just now';
      }
    }
  }
});

export async function getMessages(conversationId: string): Promise<ChatMessage[]> {
  await delay(30);
  return memoryMessages[conversationId] ? [...memoryMessages[conversationId]] : [];
}

export async function sendMessage(conversationId: string, text: string): Promise<ChatMessage> {
  await delay(80);
  const activeUser = memoryUser || currentUser;
  const newMsg: ChatMessage = {
    id: `msg_${Date.now()}`,
    conversationId,
    senderId: activeUser.id,
    text,
    timestamp: 'Just now',
    isMine: true,
    status: 'sending'
  };

  if (!memoryMessages[conversationId]) {
    memoryMessages[conversationId] = [];
  }
  memoryMessages[conversationId].push(newMsg);

  // Update conversation preview and move to top
  const conv = memoryConversations.find((c) => c.id === conversationId);
  const listing = conv ? memoryListings.find((l) => l.id === conv.listingId) : null;

  if (conv) {
    conv.lastMessage = text;
    conv.lastMessageTime = 'Just now';
    const idx = memoryConversations.indexOf(conv);
    if (idx > 0) {
      memoryConversations.splice(idx, 1);
      memoryConversations.unshift(conv);
    }
  }

  // Trigger mock socket real-time typing and rule-based reply
  mockSocket.handleUserMessageSent({
    conversationId,
    userMsg: newMsg,
    conv,
    listing,
    currentUser: activeUser
  });

  return newMsg;
}

export async function retrySendMessage(conversationId: string, messageId: string): Promise<ChatMessage | null> {
  await delay(80);
  const msgs = memoryMessages[conversationId];
  if (!msgs) return null;
  const target = msgs.find((m) => m.id === messageId);
  if (!target) return null;
  target.status = 'sent';
  const conv = memoryConversations.find((c) => c.id === conversationId);
  const listing = conv ? memoryListings.find((l) => l.id === conv.listingId) : null;
  const activeUser = memoryUser || currentUser;

  mockSocket.handleUserMessageSent({
    conversationId,
    userMsg: target,
    conv,
    listing,
    currentUser: activeUser
  });
  return target;
}

export async function createOrGetConversation(listingId: string): Promise<Conversation> {
  await delay(60);
  const existing = memoryConversations.find((c) => c.listingId === listingId);
  if (existing) return existing;

  const listing = memoryListings.find((l) => l.id === listingId);
  if (!listing) throw new Error('Listing not found');

  const activeUser = memoryUser || currentUser;
  const isSellerViewing = activeUser.id === listing.seller.id;

  // If the logged-in user is the seller viewing, peer is an interested student (buyer)
  // If the logged-in user is the buyer, peer is the seller
  const otherUser = isSellerViewing
    ? {
        id: 'usr_buyer_01',
        name: 'Arjun Mehta',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Arjun&backgroundColor=ffc72c',
        college: `${activeUser.collegeShortName || 'RVCE'} (Student Buyer)`,
        isVerified: true
      }
    : {
        id: listing.seller.id,
        name: listing.seller.name,
        avatar: listing.seller.avatar,
        college: `${listing.seller.collegeName} (${listing.seller.branch})`,
        isVerified: listing.seller.isVerified
      };

  const newConv: Conversation = {
    id: `conv_${listing.id}_${Date.now()}`,
    listingId: listing.id,
    listingTitle: listing.title,
    listingPrice: listing.price,
    listingImage: listing.images[0],
    listingStatus: listing.status,
    otherUser,
    lastMessage: '',
    lastMessageTime: 'Just now',
    unreadCount: 0
  };

  // Requirement 1 & 2: Conversation starts completely empty.
  // No initial message is sent. It only begins when the user sends their first message.
  memoryConversations.unshift(newConv);
  memoryMessages[newConv.id] = [];

  return newConv;
}

export async function getNotifications(): Promise<NotificationItem[]> {
  await delay();
  return [...memoryNotifications];
}

export async function markNotificationRead(id: string): Promise<void> {
  await delay();
  const n = memoryNotifications.find((item) => item.id === id);
  if (n) {
    n.read = true;
  }
}

// Campus Buddy AI Assistant Search Logic
export interface CampusBuddyResponse {
  answer: string;
  matchedListings: Listing[];
  collegeSpotTip: string;
  suggestedPrompts: string[];
}

export async function searchCampusBuddy(query: string, collegeId?: string): Promise<CampusBuddyResponse> {
  await delay(250);
  const q = query.toLowerCase().trim();
  let matched = [...memoryListings];

  if (collegeId && collegeId !== 'all') {
    matched = matched.filter((l) => l.collegeId.toLowerCase() === collegeId.toLowerCase());
  }

  // Smart keyword association
  if (q.includes('cycle') || q.includes('bicycle') || q.includes('commute') || q.includes('metro')) {
    matched = matched.filter((l) => l.category === 'Cycles & Commute' || l.tags.includes('cycle'));
    return {
      answer: `Found ${matched.length} great campus bicycles! Cycles with Shimano gears are top picks for traveling between RVCE, Mysore Road Metro, and hostels. All sellers offer a test ride before you confirm the trade!`,
      matchedListings: matched,
      collegeSpotTip: 'Pro-tip: Test ride bicycles near the RVCE Football Ground or Cauvery Hostel Quadrangle during daylight hours.',
      suggestedPrompts: [
        'Cycles under ₹4,000 with gear and lock',
        'Single bed mattresses near Cauvery hostel',
        'Engineering Maths B.S. Grewal textbook'
      ]
    };
  }

  if (q.includes('calc') || q.includes('casio') || q.includes('991')) {
    matched = matched.filter((l) => l.title.toLowerCase().includes('casio') || l.tags.includes('calculator'));
    return {
      answer: `Found ${matched.length} scientific calculator for your engineering exams! The Casio fx-991CW is VTU-compliant and allowed in midterms and finals.`,
      matchedListings: matched,
      collegeSpotTip: 'Check that the battery cover and solar strip work properly before confirming trade PIN with the seller at the Canteen.',
      suggestedPrompts: [
        'Lab coat size L for Chemistry',
        'Omega mini drafter for CAED graphics',
        'GATE CSE study books'
      ]
    };
  }

  if (q.includes('hostel') || q.includes('room') || q.includes('mattress') || q.includes('kettle') || q.includes('lamp') || q.includes('maggi')) {
    matched = matched.filter((l) => l.category === 'Hostel Essentials');
    return {
      answer: `Here are essential hostel room items available right now! Hostellers in Cauvery and Krishna hostel are offering clean mattresses, fast electric kettles, and rechargeable desk lamps.`,
      matchedListings: matched,
      collegeSpotTip: 'Most hostel sellers prefer meeting at Hostel Gate 2 or Mess Entrance during evening hours (5:00 PM - 8:00 PM).',
      suggestedPrompts: [
        'Electric kettle under ₹600 for Maggi',
        'Study lamp with rechargeable battery',
        'B.S. Grewal Higher Engineering Maths'
      ]
    };
  }

  if (q.includes('book') || q.includes('math') || q.includes('grewal') || q.includes('gate') || q.includes('os') || q.includes('notes')) {
    matched = matched.filter((l) => l.category === 'Textbooks');
    return {
      answer: `Found ${matched.length} verified course textbooks and GATE materials from senior students! Save up to 60-70% compared to new editions.`,
      matchedListings: matched,
      collegeSpotTip: 'Pickup near Central Library Lawns is the most convenient spot for book handovers between classes.',
      suggestedPrompts: [
        'Engineering Mini Drafter for Graphics',
        'Apple MacBook Air M1 for coding',
        'Sony WH-1000XM4 noise cancelling headphones'
      ]
    };
  }

  if (q.includes('laptop') || q.includes('macbook') || q.includes('coding') || q.includes('arduino') || q.includes('pi') || q.includes('screen') || q.includes('monitor')) {
    matched = matched.filter((l) => l.category === 'Electronics');
    return {
      answer: `Here are electronics and coding gear listed by verified students! Every electronic item can be inspected on the spot before entering your trade PIN.`,
      matchedListings: matched,
      collegeSpotTip: 'You can test electronics at the RVCE Food Court or Library Foyer where charging outlets are readily available.',
      suggestedPrompts: [
        'MacBook Air M1 under ₹45,000',
        'Arduino Uno starter kit with sensors',
        'LG 24-inch IPS monitor'
      ]
    };
  }

  // Fallback match or generic query
  const genericMatch = matched.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.tags.some((t) => t.toLowerCase().includes(q))
  );

  const finalItems = genericMatch.length > 0 ? genericMatch : matched.slice(0, 4);

  return {
    answer: `Campus Buddy found ${finalItems.length} matching items across campus for "${query}". Only verified students can sell or trade.`,
    matchedListings: finalItems,
    collegeSpotTip: 'Always inspect the condition thoroughly and exchange the 4-digit PIN in person at designated campus pickup spots!',
    suggestedPrompts: [
      'Casio fx-991CW scientific calculator',
      'Hero gear cycle under ₹4,000',
      'Sleepwell mattress for Cauvery hostel',
      'Lab coat size L for Chemistry lab'
    ]
  };
}

/**
 * Intelligent AI Search parsing and semantic ranking against mock listings:
 * - Extracts: category, max price, min price, RAM, storage, brand, condition, and purpose keywords
 * - Filters listings by extracted category, price, and specs, only those with status Available
 * - Ranks the rest by how many requirements and keywords they match
 * - Returns match percentage, 2-3 verified checkmark reasons, and unmatched reasons
 * - Generates "What I understood" editable criteria chips
 * - Handles follow-up refinements and vague queries ("hello")
 * - Generates targeted suggestions and close matches if nothing matches
 */
export async function searchListingsWithAI(
  query: string,
  criteriaOverrides?: ParsedCriterion[],
  previousCriteria?: ParsedCriterion[]
): Promise<AISearchResult> {
  if (isBackendConfigured() && !criteriaOverrides && !previousCriteria) {
    const activeUser = memoryUser || currentUser;
    return searchWithBackend(query, activeUser.collegeId);
  }

  await delay(250);
  const rawQ = (query || '').trim();
  const q = rawQ.toLowerCase();

  // 1. Detect vague or greeting queries (e.g. "hello", "hi", "hey", "test", "asdf")
  const greetings = ['hello', 'hi', 'hey', 'yo', 'sup', 'hola', 'good morning', 'good afternoon', 'good evening', 'help', 'who are you', 'what can you do', 'test', 'testing', 'asdf', 'xyz'];
  const isGreetingOrVague = greetings.includes(q) || (q.length < 3 && !/\d/.test(q));

  if (isGreetingOrVague && (!criteriaOverrides || criteriaOverrides.length === 0)) {
    return {
      query: rawQ,
      isVagueOrGreeting: true,
      summary: "Hey there! What campus gear are you looking for, and do you have a target budget? (For example: 'Laptop under ₹25k for coding' or 'Hero cycle under ₹4,000')",
      parsedCriteria: [],
      results: [],
      alternativeSuggestions: [
        'Laptop under ₹25,000 for coding',
        'Engineering Mechanics textbook',
        'Hero cycle under ₹4,000',
        'Casio scientific calculator',
        'Single bed mattress for hostel'
      ],
      closeMatches: []
    };
  }

  if (memoryListings.length === 0) {
    return {
      query: rawQ,
      isVagueOrGreeting: false,
      summary: "No listings yet. Be the first to sell something!",
      parsedCriteria: [],
      results: [],
      alternativeSuggestions: [],
      closeMatches: []
    };
  }

  let criteria: ParsedCriterion[] = [];

  if (criteriaOverrides) {
    criteria = [...criteriaOverrides];
  } else {
    // Start from previous criteria if this is a follow-up refinement
    if (previousCriteria && previousCriteria.length > 0) {
      criteria = previousCriteria.map(c => ({ ...c }));
    }

    // A. Parse Category & Synonyms
    let detectedCategory: { cat: string; sub?: string; label: string } | null = null;
    if (q.includes('laptop') || q.includes('macbook') || q.includes('thinkpad') || q.includes('notebook') || q.includes('computer')) {
      detectedCategory = { cat: 'Electronics', sub: 'laptop', label: 'Category: Laptops' };
    } else if (q.includes('calculator') || q.includes('casio') || q.includes('991') || q.includes('classwiz')) {
      detectedCategory = { cat: 'Electronics', sub: 'calculator', label: 'Category: Calculators' };
    } else if (q.includes('cycle') || q.includes('bicycle') || q.includes('bike') || q.includes('firefox') || q.includes('atlas') || q.includes('sprint')) {
      detectedCategory = { cat: 'Cycles & Commute', sub: 'cycle', label: 'Category: Cycles' };
    } else if (q.includes('textbook') || q.includes('book') || q.includes('notes') || q.includes('grewal') || q.includes('timoshenko') || q.includes('chaurasia') || q.includes('silberschatz')) {
      detectedCategory = { cat: 'Textbooks', sub: 'book', label: 'Category: Textbooks' };
    } else if (q.includes('mattress') || q.includes('bed') || q.includes('bedding') || q.includes('sleepwell')) {
      detectedCategory = { cat: 'Hostel Essentials', sub: 'mattress', label: 'Category: Mattresses' };
    } else if (q.includes('headphone') || q.includes('headphones') || q.includes('earphone') || q.includes('speaker') || q.includes('audio') || q.includes('anc') || q.includes('sony wh')) {
      detectedCategory = { cat: 'Audio & Gadgets', sub: 'audio', label: 'Category: Audio & Headphones' };
    } else if (q.includes('kettle') || q.includes('lamp') || q.includes('drying stand') || q.includes('bottle') || q.includes('flask')) {
      detectedCategory = { cat: 'Hostel Essentials', label: 'Category: Hostel Essentials' };
    } else if (q.includes('lab coat') || q.includes('drafter') || q.includes('mini drafter') || q.includes('goggles')) {
      detectedCategory = { cat: 'Lab & Drafting', label: 'Category: Lab & Drafting' };
    } else if (q.includes('monitor') || q.includes('screen') || q.includes('keyboard') || q.includes('arduino') || q.includes('raspberry pi') || q.includes('rpi')) {
      detectedCategory = { cat: 'Electronics', label: 'Category: Electronics' };
    } else if (q.includes('backpack') || q.includes('badminton') || q.includes('racquet')) {
      detectedCategory = { cat: 'Fashion & Sports', label: 'Category: Sports & Gear' };
    }

    if (detectedCategory) {
      // If category changed, prune old category-specific specs (like RAM/storage) if not electronics
      if (detectedCategory.cat !== 'Electronics') {
        criteria = criteria.filter(c => c.key !== 'ram' && c.key !== 'storage');
      }
      criteria = criteria.filter(c => c.key !== 'category');
      criteria.push({
        id: 'crit_category',
        label: detectedCategory.label,
        key: 'category',
        value: detectedCategory.sub ? `${detectedCategory.cat}:${detectedCategory.sub}` : detectedCategory.cat,
        displayValue: detectedCategory.label.replace('Category: ', '')
      });
    }

    // B. Parse Max Price / Budget (e.g. "under ₹20,000", "below 20k", "under 4000", "20k budget", "max 5000", "₹25000")
    const maxBudgetMatch =
      q.match(/(?:under|below|less than|within|up to|max|maximum|<=?)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?(?:,\d+)*(?:\s*k)?)/i) ||
      q.match(/(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?(?:,\d+)*(?:\s*k)?)/i) ||
      q.match(/\b(\d+(?:,\d+)*(?:\s*k)?)\s*(?:budget|or less|max)\b/i) ||
      q.match(/\b(\d+)\s*k\b/i);

    if (maxBudgetMatch) {
      let rawVal = maxBudgetMatch[1].replace(/,/g, '').toLowerCase().trim();
      let numVal = 0;
      if (rawVal.endsWith('k')) {
        numVal = parseFloat(rawVal.replace('k', '')) * 1000;
      } else {
        numVal = parseInt(rawVal, 10);
      }
      if (numVal > 0) {
        criteria = criteria.filter(c => c.key !== 'budget');
        criteria.push({
          id: 'crit_budget',
          label: `Budget ≤ ₹${numVal.toLocaleString('en-IN')}`,
          key: 'budget',
          value: numVal.toString(),
          displayValue: `≤ ₹${numVal.toLocaleString('en-IN')}`
        });
      }
    }

    // C. Parse Min Price (e.g. "above 1000", "at least ₹500", "from ₹2000")
    const minPriceMatch = q.match(/(?:above|more than|greater than|at least|min|minimum|>=?|from)\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?(?:,\d+)*(?:\s*k)?)/i);
    if (minPriceMatch) {
      let rawVal = minPriceMatch[1].replace(/,/g, '').toLowerCase().trim();
      let numVal = rawVal.endsWith('k') ? parseFloat(rawVal.replace('k', '')) * 1000 : parseInt(rawVal, 10);
      if (numVal > 0) {
        criteria = criteria.filter(c => c.key !== 'minPrice');
        criteria.push({
          id: 'crit_min_price',
          label: `Min Price ≥ ₹${numVal.toLocaleString('en-IN')}`,
          key: 'minPrice',
          value: numVal.toString(),
          displayValue: `≥ ₹${numVal.toLocaleString('en-IN')}`
        });
      }
    }

    // D. Parse RAM (e.g. "16 gb", "8gb ram", "4 gb")
    const ramMatch = q.match(/\b(4|8|16|32)\s*(?:gb|gig)\s*(?:ram|memory)?\b/i) || q.match(/\b(\d+)\s*gb\s*ram\b/i);
    if (ramMatch) {
      const ramAmount = `${ramMatch[1]} GB`;
      criteria = criteria.filter(c => c.key !== 'ram');
      criteria.push({
        id: 'crit_ram',
        label: `RAM: ${ramAmount}`,
        key: 'ram',
        value: `${ramMatch[1]}GB`,
        displayValue: ramAmount
      });
    }

    // E. Parse Storage (e.g. "256 gb ssd", "512 gb", "1 tb")
    const storageMatch = q.match(/\b(128|256|512)\s*(?:gb|gig)\s*(?:ssd|storage|nvme|rom)?\b/i) || q.match(/\b(1|2)\s*tb\b/i);
    if (storageMatch) {
      const storageVal = storageMatch[0].toUpperCase();
      criteria = criteria.filter(c => c.key !== 'storage');
      criteria.push({
        id: 'crit_storage',
        label: `Storage: ${storageVal}`,
        key: 'storage',
        value: storageVal,
        displayValue: storageVal
      });
    }

    // F. Parse Brand
    const brands = [
      { name: 'Apple', keywords: ['apple', 'macbook'] },
      { name: 'Lenovo', keywords: ['lenovo', 'thinkpad'] },
      { name: 'Casio', keywords: ['casio'] },
      { name: 'Sony', keywords: ['sony'] },
      { name: 'Hero', keywords: ['hero'] },
      { name: 'Firefox', keywords: ['firefox'] },
      { name: 'Atlas', keywords: ['atlas'] },
      { name: 'LG', keywords: ['lg'] },
      { name: 'Redragon', keywords: ['redragon'] },
      { name: 'Wildcraft', keywords: ['wildcraft'] },
      { name: 'Bajaj', keywords: ['bajaj'] },
      { name: 'Wipro', keywords: ['wipro'] },
      { name: 'Arduino', keywords: ['arduino'] },
      { name: 'Raspberry Pi', keywords: ['raspberry pi', 'rpi'] },
      { name: 'Sleepwell', keywords: ['sleepwell'] },
      { name: 'Boat', keywords: ['boat'] },
      { name: 'Yonex', keywords: ['yonex'] }
    ];
    for (const b of brands) {
      if (b.keywords.some(k => q.includes(k))) {
        criteria = criteria.filter(c => c.key !== 'brand');
        criteria.push({
          id: 'crit_brand',
          label: `Brand: ${b.name}`,
          key: 'brand',
          value: b.name,
          displayValue: b.name
        });
        break;
      }
    }

    // G. Parse Condition (e.g. "like new", "good", "fair")
    if (q.includes('like new') || q.includes('mint') || q.includes('brand new')) {
      criteria = criteria.filter(c => c.key !== 'condition');
      criteria.push({
        id: 'crit_condition',
        label: 'Condition: Like New',
        key: 'condition',
        value: 'Like New',
        displayValue: 'Like New'
      });
    } else if (q.includes('good condition') || (q.includes('good') && !q.includes('morning'))) {
      criteria = criteria.filter(c => c.key !== 'condition');
      criteria.push({
        id: 'crit_condition',
        label: 'Condition: Good',
        key: 'condition',
        value: 'Good',
        displayValue: 'Good'
      });
    }

    // H. Parse Purpose / Use Keywords
    if (q.includes('coding') || q.includes('programming') || q.includes('developer') || q.includes('software') || q.includes('web dev') || q.includes('dev')) {
      criteria = criteria.filter(c => c.key !== 'use');
      criteria.push({
        id: 'crit_use',
        label: 'Purpose: Coding',
        key: 'use',
        value: 'coding',
        displayValue: 'Coding & Dev'
      });
    } else if (q.includes('gaming') || q.includes('game')) {
      criteria = criteria.filter(c => c.key !== 'use');
      criteria.push({
        id: 'crit_use',
        label: 'Purpose: Gaming',
        key: 'use',
        value: 'gaming',
        displayValue: 'Gaming'
      });
    } else if (q.includes('design') || q.includes('graphics') || q.includes('cad')) {
      criteria = criteria.filter(c => c.key !== 'use');
      criteria.push({
        id: 'crit_use',
        label: 'Purpose: Design',
        key: 'use',
        value: 'design',
        displayValue: 'Design & CAD'
      });
    } else if (q.includes('studying') || q.includes('study') || q.includes('exam') || q.includes('midterm') || q.includes('vtu') || q.includes('gate')) {
      criteria = criteria.filter(c => c.key !== 'use');
      criteria.push({
        id: 'crit_use',
        label: 'Purpose: Studying',
        key: 'use',
        value: 'study',
        displayValue: 'Studying & Exams'
      });
    } else if (q.includes('commute') || q.includes('metro') || q.includes('travel')) {
      criteria = criteria.filter(c => c.key !== 'use');
      criteria.push({
        id: 'crit_use',
        label: 'Purpose: Campus Commute',
        key: 'use',
        value: 'commute',
        displayValue: 'Campus Commute'
      });
    }
  }

  // 2. Extract active filter variables from criteria
  const categoryCrit = criteria.find(c => c.key === 'category');
  const budgetCrit = criteria.find(c => c.key === 'budget');
  const minPriceCrit = criteria.find(c => c.key === 'minPrice');
  const ramCrit = criteria.find(c => c.key === 'ram');
  const storageCrit = criteria.find(c => c.key === 'storage');
  const brandCrit = criteria.find(c => c.key === 'brand');
  const conditionCrit = criteria.find(c => c.key === 'condition');
  const useCrit = criteria.find(c => c.key === 'use');

  const maxBudget = budgetCrit ? parseInt(budgetCrit.value, 10) : undefined;
  const minPrice = minPriceCrit ? parseInt(minPriceCrit.value, 10) : undefined;
  const targetRam = ramCrit ? ramCrit.value.toUpperCase() : undefined;
  const targetStorage = storageCrit ? storageCrit.value.toUpperCase() : undefined;
  const targetBrand = brandCrit ? brandCrit.value.toLowerCase() : undefined;
  const targetCondition = conditionCrit ? conditionCrit.value : undefined;
  const targetUse = useCrit ? useCrit.value.toLowerCase() : undefined;

  let targetCat = '';
  let targetSub = '';
  if (categoryCrit) {
    if (categoryCrit.value.includes(':')) {
      const parts = categoryCrit.value.split(':');
      targetCat = parts[0];
      targetSub = parts[1];
    } else {
      targetCat = categoryCrit.value;
    }
  }

  // 3. Score and Filter Listings
  const scoredItems: AIRankedListing[] = [];
  const closeMatchItems: AIRankedListing[] = [];

  for (const item of memoryListings) {
    // Exclude non-Available items from primary results (they may go to closeMatches if relevant)
    const isAvailable = item.status === 'Available';
    let matchedRequirementsCount = 0;
    let totalRequirementsCount = 0;
    const reasons: string[] = [];
    const unmatched: string[] = [];
    let isHardMismatch = false;

    // A. Category matching
    if (targetCat) {
      totalRequirementsCount++;
      let catMatch = false;
      if (targetSub) {
        if (targetSub === 'laptop') {
          catMatch = item.tags.includes('laptop') || item.title.toLowerCase().includes('thinkpad') || item.title.toLowerCase().includes('macbook') || item.title.toLowerCase().includes('laptop');
        } else if (targetSub === 'calculator') {
          catMatch = item.tags.includes('calculator') || item.title.toLowerCase().includes('casio') || item.title.toLowerCase().includes('calculator');
        } else if (targetSub === 'cycle') {
          catMatch = item.category === 'Cycles & Commute' || item.tags.includes('cycle') || item.tags.includes('bicycle');
        } else if (targetSub === 'book') {
          catMatch = item.category === 'Textbooks' || item.tags.includes('textbook') || item.tags.includes('book');
        } else if (targetSub === 'mattress') {
          catMatch = item.tags.includes('mattress') || item.title.toLowerCase().includes('mattress');
        } else if (targetSub === 'audio') {
          catMatch = item.category === 'Audio & Gadgets' || item.tags.includes('headphones') || item.tags.includes('speaker');
        }
      } else {
        catMatch = item.category === targetCat || item.tags.some(t => t.toLowerCase().includes(targetCat.toLowerCase()));
      }

      if (catMatch) {
        matchedRequirementsCount++;
        reasons.push(`${categoryCrit?.displayValue || targetCat} category ✓`);
      } else {
        isHardMismatch = true;
        unmatched.push(`Not in ${categoryCrit?.displayValue || targetCat} (not matched)`);
      }
    }

    // B. Budget matching (Max price)
    if (maxBudget !== undefined) {
      totalRequirementsCount++;
      if (item.price <= maxBudget) {
        matchedRequirementsCount++;
        reasons.push(`₹${item.price.toLocaleString('en-IN')} is under your budget ✓`);
      } else {
        unmatched.push(`₹${item.price.toLocaleString('en-IN')} exceeds ₹${maxBudget.toLocaleString('en-IN')} budget (not matched)`);
        if (item.price > maxBudget * 1.35) {
          isHardMismatch = true;
        }
      }
    } else {
      reasons.push(`Priced at ₹${item.price.toLocaleString('en-IN')} ✓`);
    }

    // C. Min Price matching
    if (minPrice !== undefined) {
      totalRequirementsCount++;
      if (item.price >= minPrice) {
        matchedRequirementsCount++;
        reasons.push(`₹${item.price.toLocaleString('en-IN')} meets min ₹${minPrice.toLocaleString('en-IN')} ✓`);
      } else {
        unmatched.push(`Below ₹${minPrice.toLocaleString('en-IN')} min price (not matched)`);
      }
    }

    // D. RAM matching
    if (targetRam) {
      totalRequirementsCount++;
      const itemRam = (item.specs?.['RAM'] || item.specs?.['Memory'] || '').toUpperCase();
      if (itemRam.includes(targetRam) || item.title.toUpperCase().includes(targetRam)) {
        matchedRequirementsCount++;
        reasons.push(`${targetRam} RAM confirmed ✓`);
      } else {
        unmatched.push(`${targetRam} requested (has ${itemRam || 'unspecified'}) (not matched)`);
        if (targetSub === 'laptop') {
          isHardMismatch = true;
        }
      }
    }

    // E. Storage matching
    if (targetStorage) {
      totalRequirementsCount++;
      const itemStorage = (item.specs?.['Storage'] || item.specs?.['ROM'] || '').toUpperCase();
      if (itemStorage.includes(targetStorage) || item.title.toUpperCase().includes(targetStorage)) {
        matchedRequirementsCount++;
        reasons.push(`${targetStorage} storage ✓`);
      } else {
        unmatched.push(`${targetStorage} requested (has ${itemStorage || 'unspecified'}) (not matched)`);
      }
    }

    // F. Brand matching
    if (targetBrand) {
      totalRequirementsCount++;
      const itemTitle = item.title.toLowerCase();
      const itemBrand = (item.specs?.['Brand'] || item.specs?.['Author'] || '').toLowerCase();
      if (itemTitle.includes(targetBrand) || itemBrand.includes(targetBrand) || item.tags.some(t => t.toLowerCase().includes(targetBrand))) {
        matchedRequirementsCount++;
        reasons.push(`${brandCrit?.displayValue} brand ✓`);
      } else {
        unmatched.push(`Brand ${brandCrit?.displayValue} not matched`);
      }
    }

    // G. Condition matching
    if (targetCondition) {
      totalRequirementsCount++;
      if (item.condition === targetCondition || (targetCondition === 'Good' && item.condition === 'Like New')) {
        matchedRequirementsCount++;
        reasons.push(`${item.condition} condition ✓`);
      } else {
        unmatched.push(`Condition is ${item.condition} (requested ${targetCondition}) (not matched)`);
      }
    }

    // H. Purpose matching
    if (targetUse) {
      totalRequirementsCount++;
      const matchInTags = item.tags.some(t => t.toLowerCase().includes(targetUse));
      const matchInDesc = item.description.toLowerCase().includes(targetUse);
      if (matchInTags || matchInDesc) {
        matchedRequirementsCount++;
        reasons.push(`Tailored for ${useCrit?.displayValue || targetUse} ✓`);
      } else {
        unmatched.push(`Not explicitly optimized for ${useCrit?.displayValue || targetUse}`);
      }
    }

    // General keyword bonus for search ranking
    const queryWords = q
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !['for', 'the', 'and', 'with', 'under', 'below', 'only', 'near', 'from', 'show', 'item'].includes(w));

    let keywordHits = 0;
    for (const w of queryWords) {
      if (item.title.toLowerCase().includes(w) || item.tags.some(t => t.toLowerCase().includes(w))) {
        keywordHits++;
      }
    }

    // Add pickup location reason
    if (item.campusPickupSpot && reasons.length < 3) {
      reasons.push(`In-person pickup at ${item.campusPickupSpot} ✓`);
    }

    // Compute match score percentage
    let matchScore = 75;
    if (totalRequirementsCount > 0) {
      const ratio = matchedRequirementsCount / totalRequirementsCount;
      matchScore = Math.round(65 + ratio * 32);
    }
    matchScore = Math.min(matchScore + Math.min(keywordHits * 2, 4), 98);

    const rankedEntry: AIRankedListing = {
      listing: item,
      matchScore,
      matchReasons: reasons.slice(0, 3),
      unmatchedReasons: unmatched.slice(0, 2)
    };

    if (isAvailable && !isHardMismatch && (maxBudget === undefined || item.price <= maxBudget)) {
      scoredItems.push(rankedEntry);
    } else if (
      (targetCat && (item.category === targetCat || item.tags.some(t => t.toLowerCase().includes(targetCat.toLowerCase())))) ||
      keywordHits > 0 ||
      (maxBudget !== undefined && item.price <= maxBudget * 1.25)
    ) {
      // Put in closeMatches
      closeMatchItems.push(rankedEntry);
    }
  }

  // Sort by match score descending
  scoredItems.sort((a, b) => b.matchScore - a.matchScore);
  closeMatchItems.sort((a, b) => b.matchScore - a.matchScore);

  // Friendly summary
  let summary = '';
  if (scoredItems.length > 0) {
    summary = `Campus Buddy found ${scoredItems.length} verified available item${scoredItems.length > 1 ? 's' : ''} on campus matching your request!`;
  } else {
    summary = `No exact campus listings matched every requirement right now. Here are targeted suggestions to find what you need:`;
  }

  // Generate specific suggestions if results are empty or low
  const alternatives: string[] = [];
  if (maxBudget) {
    if (targetSub === 'laptop' && maxBudget < 21500) {
      alternatives.push('Raise budget to ₹21,500 to match Lenovo ThinkPad T480 (16GB RAM)');
    } else if (targetSub === 'cycle' && maxBudget < 2600) {
      alternatives.push('Raise budget to ₹2,600 to match Atlas 26T Commuter Bicycle');
    } else {
      alternatives.push(`Raise budget to ₹${Math.round(maxBudget * 1.25).toLocaleString('en-IN')}`);
    }
  }
  if (targetRam && targetRam.includes('16')) {
    alternatives.push('Relax spec to 8 GB RAM models (e.g. Apple MacBook Air M1)');
  }
  if (targetCondition && targetCondition === 'Like New') {
    alternatives.push("Include items in 'Good' condition for more options");
  }
  if (alternatives.length === 0) {
    alternatives.push('Check items from nearby partner campuses in Bangalore');
  }

  return {
    query: rawQ,
    summary,
    parsedCriteria: criteria,
    results: scoredItems,
    alternativeSuggestions: alternatives,
    closeMatches: closeMatchItems.slice(0, 3)
  };
}
