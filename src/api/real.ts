/**
 * Real API implementation of the `src/api` surface.
 *
 * Every function here has the same signature and return shape as the old
 * in-memory mock, so the pages never had to change.
 */
import {
  College,
  Listing,
  ListingFilters,
  ListingStatus,
  Trade,
  Conversation,
  ChatMessage,
  NotificationItem,
  ParsedCriterion,
  AISearchResult,
  User,
} from '../types';
import { api, ApiError, setTokens, clearTokens } from './http';
import { socket } from './socket';

export { socket };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

function toDate(value: string | number | Date | undefined | null): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Turns an ISO timestamp into the short strings the UI already expects. */
export function formatRelative(value: string | number | Date | undefined | null): string {
  const date = toDate(value);
  if (!date) return '';

  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 45) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;

  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString() === date.toDateString();
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  if (sameDay) return `Today, ${time}`;
  if (yesterday) return `Yesterday, ${time}`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function withListingTimes(listing: Listing): Listing {
  return { ...listing, postedAt: formatRelative(listing.postedAt) };
}

function withTradeTimes(trade: Trade): Trade {
  return {
    ...trade,
    createdAt: formatRelative(trade.createdAt),
    completedAt: trade.completedAt ? formatRelative(trade.completedAt) : undefined,
    cancelledAt: trade.cancelledAt ? formatRelative(trade.cancelledAt) : undefined,
  };
}

function withConversationTimes(conversation: Conversation): Conversation {
  return {
    ...conversation,
    lastMessageTime: conversation.lastMessageTime
      ? formatRelative(conversation.lastMessageTime)
      : '',
  };
}

function withMessageTimes(message: ChatMessage): ChatMessage {
  return { ...message, timestamp: formatRelative(message.timestamp) };
}

interface AuthResponse {
  success: boolean;
  user?: User;
  error?: string;
  accessToken?: string;
  refreshToken?: string;
  devOtp?: string;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export async function login(
  arg1: { email: string; password: string } | string,
  arg2?: string
): Promise<{ success: boolean; user?: User; error?: string }> {
  const email = typeof arg1 === 'object' ? arg1.email : arg1;
  const password = typeof arg1 === 'object' ? arg1.password : arg2 || '';

  try {
    const res = await api.post<AuthResponse>('/api/auth/login', { email, password });
    if (res.success && res.user) {
      setTokens(res.accessToken ?? null, res.refreshToken ?? null);
      socket.connect();
      return { success: true, user: res.user };
    }
    return { success: false, error: res.error || 'Failed to sign in' };
  } catch (error) {
    return { success: false, error: errorMessage(error, 'Failed to sign in') };
  }
}

export const loginUser = login;

export async function registerUser(data: {
  collegeId: string;
  name: string;
  email: string;
  password: string;
  branch?: string;
}): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const res = await api.post<AuthResponse>('/api/auth/register', {
      collegeId: data.collegeId,
      name: data.name,
      email: data.email,
      password: data.password,
      branch: data.branch,
    });
    if (res.success && res.user) {
      return { success: true, user: res.user };
    }
    return { success: false, error: res.error || 'Failed to create account' };
  } catch (error) {
    return { success: false, error: errorMessage(error, 'Failed to create account') };
  }
}

export async function verifyOtp(
  arg1: { email?: string; code: string } | string,
  arg2?: string
): Promise<{ success: boolean; user?: User; error?: string }> {
  const email = typeof arg1 === 'object' ? arg1.email || '' : arg1;
  const code = typeof arg1 === 'object' ? arg1.code : arg2 || '';

  try {
    const res = await api.post<AuthResponse>('/api/auth/verify-otp', { email, code });
    if (res.success && res.user) {
      setTokens(res.accessToken ?? null, res.refreshToken ?? null);
      socket.connect();
      return { success: true, user: res.user };
    }
    return { success: false, error: res.error || 'Invalid verification code' };
  } catch (error) {
    return { success: false, error: errorMessage(error, 'Invalid verification code') };
  }
}

export const verifyEmailOtp = verifyOtp;

export async function resendVerificationOtp(
  email: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await api.post<{ success: boolean; message: string }>('/api/auth/resend-otp', {
      email,
    });
    return { success: res.success, message: res.message };
  } catch (error) {
    return { success: false, message: errorMessage(error, 'Could not resend the code') };
  }
}

export async function logout(): Promise<void> {
  try {
    await api.post('/api/auth/logout');
  } catch {
    // signing out locally is enough
  } finally {
    clearTokens();
    socket.disconnect();
  }
}

export const logoutUser = logout;

export async function getCurrentUser(): Promise<User | null> {
  try {
    return await api.get<User>('/api/auth/me');
  } catch (error) {
    if (isNotFound(error) || (error instanceof ApiError && error.status === 401)) {
      return null;
    }
    return null;
  }
}

export async function updateCurrentUser(patch: Partial<User>): Promise<User> {
  return api.patch<User>('/api/users/me', patch);
}

// ---------------------------------------------------------------------------
// Colleges
// ---------------------------------------------------------------------------
export async function getColleges(): Promise<College[]> {
  try {
    return await api.get<College[]>('/api/colleges');
  } catch {
    return [];
  }
}

export async function getCollegeById(id: string): Promise<College | null> {
  try {
    return await api.get<College>(`/api/colleges/${id}`);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function searchColleges(query: string): Promise<College[]> {
  const clean = (query || '').trim();
  if (clean.length < 2) return [];
  return api.get<College[]>('/api/colleges/search', { q: clean });
}

export async function requestCollege(data: {
  name: string;
  city: string;
  state?: string;
  domain?: string;
}): Promise<College> {
  const res = await api.post<{ success: boolean; message: string; college?: College }>(
    '/api/colleges/requests',
    {
      name: data.name,
      city: data.city,
      state: data.state || 'India',
      domain: data.domain,
    }
  );
  if (!res.college) throw new ApiError(res.message || 'Could not add the college', 400);
  return res.college;
}

export async function requestNewCollege(data: {
  collegeName: string;
  city: string;
  domain?: string;
  requesterEmail?: string;
  notes?: string;
}): Promise<{ success: boolean; message: string; college?: College }> {
  try {
    const res = await api.post<{ success: boolean; message: string; college?: College }>(
      '/api/colleges/requests',
      {
        name: data.collegeName,
        city: data.city,
        state: 'India',
        domain: data.domain,
      }
    );
    return res;
  } catch (error) {
    return { success: false, message: errorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------
export async function getListings(filters?: ListingFilters): Promise<Listing[]> {
  const items = await api.get<Listing[]>('/api/listings', {
    query: filters?.query,
    category: filters?.category,
    condition: filters?.condition,
    minPrice: filters?.minPrice,
    maxPrice: filters?.maxPrice,
    sortBy: filters?.sortBy,
  });
  return items.map(withListingTimes);
}

export async function getListingById(id: string): Promise<Listing | null> {
  try {
    const listing = await api.get<Listing>(`/api/listings/${id}`);
    return withListingTimes(listing);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function getFeaturedListings(collegeId?: string): Promise<Listing[]> {
  const items = await api.get<Listing[]>('/api/listings/featured');
  return items.map(withListingTimes);
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
  const listing = await api.post<Listing>('/api/listings', {
    title: data.title,
    description: data.description,
    price: data.price,
    originalPrice: data.originalPrice,
    category: data.category,
    condition: data.condition,
    campusPickupSpot: data.campusPickupSpot,
    images: data.images,
    specs: data.specs,
    tags: data.tags,
    quantity: data.quantity,
  });
  return withListingTimes(listing);
}

export async function updateListingStatus(
  id: string,
  status: ListingStatus
): Promise<Listing | null> {
  try {
    const listing = await api.post<Listing>(`/api/listings/${id}/status`, { status });
    return withListingTimes(listing);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function toggleWishlist(listingId: string): Promise<boolean> {
  const res = await api.post<{ success: boolean; isWishlisted: boolean }>(
    `/api/wishlist/${listingId}/toggle`
  );
  return res.isWishlisted;
}

export async function getWishlist(): Promise<Listing[]> {
  const items = await api.get<Listing[]>('/api/wishlist');
  return items.map(withListingTimes);
}

export async function deactivateListing(listingId: string): Promise<Listing | null> {
  try {
    const listing = await api.post<Listing>(`/api/listings/${listingId}/deactivate`);
    return withListingTimes(listing);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function archiveListing(listingId: string): Promise<boolean> {
  try {
    await api.delete(`/api/listings/${listingId}`);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

export async function updateListing(
  listingId: string,
  updates: Partial<Listing>
): Promise<Listing | null> {
  try {
    const listing = await api.patch<Listing>(`/api/listings/${listingId}`, updates);
    return withListingTimes(listing);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Trades
// ---------------------------------------------------------------------------
export async function getTrades(): Promise<Trade[]> {
  const trades = await api.get<Trade[]>('/api/trades');
  return trades.map(withTradeTimes);
}

export async function getTradeById(id: string): Promise<Trade | null> {
  try {
    const trade = await api.get<Trade>(`/api/trades/${id}`);
    return withTradeTimes(trade);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function createTrade(data: {
  listingId: string;
  pickupSpot: string;
  scheduledTime: string;
  quantity?: number;
}): Promise<Trade> {
  const trade = await api.post<Trade>('/api/trades', {
    listingId: data.listingId,
    pickupSpot: data.pickupSpot,
    scheduledTime: data.scheduledTime,
    quantity: data.quantity,
  });
  return withTradeTimes(trade);
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
  try {
    const res = await api.post<{
      success: boolean;
      message: string;
      attemptsLeft?: number;
      locked?: boolean;
      expired?: boolean;
      unavailable?: boolean;
    }>(`/api/trades/${tradeId}/confirm-pin`, { pin: enteredPin });

    return {
      success: res.success,
      message: res.message,
      attemptsLeft: res.attemptsLeft,
      locked: res.locked,
      expired: res.expired,
      unavailable: res.unavailable,
    };
  } catch (error) {
    return { success: false, message: errorMessage(error, 'Could not verify the PIN') };
  }
}

export async function cancelTrade(
  tradeId: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await api.post<{ success: boolean; message: string }>(
      `/api/trades/${tradeId}/cancel`,
      { reason }
    );
    return res;
  } catch (error) {
    return { success: false, message: errorMessage(error, 'Could not cancel the trade') };
  }
}

export async function regenerateTradePin(
  tradeId: string
): Promise<{ success: boolean; newPin: string; message: string }> {
  try {
    const res = await api.post<{ success: boolean; newPin: string; message: string }>(
      `/api/trades/${tradeId}/regenerate-pin`
    );
    return res;
  } catch (error) {
    return { success: false, newPin: '', message: errorMessage(error, 'Could not regenerate the PIN') };
  }
}

// ---------------------------------------------------------------------------
// Conversations and messages
// ---------------------------------------------------------------------------
export async function getConversations(): Promise<Conversation[]> {
  const conversations = await api.get<Conversation[]>('/api/conversations');
  return conversations.map(withConversationTimes);
}

export async function getConversationById(id: string): Promise<Conversation | null> {
  try {
    const conversation = await api.get<Conversation>(`/api/conversations/${id}`);
    return withConversationTimes(conversation);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function getMessages(conversationId: string): Promise<ChatMessage[]> {
  const messages = await api.get<ChatMessage[]>(`/api/conversations/${conversationId}/messages`);
  return messages.map(withMessageTimes);
}

export async function sendMessage(
  conversationId: string,
  text: string
): Promise<ChatMessage> {
  const message = await api.post<ChatMessage>(`/api/conversations/${conversationId}/messages`, {
    text,
  });
  return withMessageTimes(message);
}

export async function retrySendMessage(
  conversationId: string,
  messageId: string
): Promise<ChatMessage | null> {
  const messages = await getMessages(conversationId);
  const target = messages.find((message) => message.id === messageId);
  if (!target) {
    throw new Error('The message was never delivered, please type it again.');
  }
  return sendMessage(conversationId, target.text);
}

export async function createOrGetConversation(listingId: string): Promise<Conversation> {
  const conversation = await api.post<Conversation>('/api/conversations', { listingId });
  return withConversationTimes(conversation);
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export async function getNotifications(): Promise<NotificationItem[]> {
  try {
    const items = await api.get<NotificationItem[]>('/api/notifications');
    return items.map((item) => ({ ...item, timestamp: formatRelative(item.timestamp) }));
  } catch {
    // A signed out user simply has no notifications.
    return [];
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.post(`/api/notifications/${id}/read`);
}

// ---------------------------------------------------------------------------
// Campus Buddy
// ---------------------------------------------------------------------------
export interface CampusBuddyResponse {
  answer: string;
  matchedListings: Listing[];
  collegeSpotTip: string;
  suggestedPrompts: string[];
}

export async function searchCampusBuddy(
  query: string,
  collegeId?: string
): Promise<CampusBuddyResponse> {
  const res = await api.post<CampusBuddyResponse>('/api/search/campus-buddy', { query });
  return {
    answer: res.answer,
    matchedListings: (res.matchedListings || []).map(withListingTimes),
    collegeSpotTip: res.collegeSpotTip,
    suggestedPrompts: res.suggestedPrompts || [],
  };
}

export async function searchListingsWithAI(
  query: string,
  criteriaOverrides?: ParsedCriterion[],
  previousCriteria?: ParsedCriterion[]
): Promise<AISearchResult> {
  const res = await api.post<AISearchResult>('/api/search/ai', {
    query,
    criteriaOverrides,
    previousCriteria,
  });
  return {
    query: res.query,
    summary: res.summary,
    isVagueOrGreeting: res.isVagueOrGreeting,
    parsedCriteria: res.parsedCriteria || [],
    results: (res.results || []).map((entry) => ({
      ...entry,
      listing: withListingTimes(entry.listing),
    })),
    alternativeSuggestions: res.alternativeSuggestions || [],
    closeMatches: (res.closeMatches || []).map((entry) => ({
      ...entry,
      listing: withListingTimes(entry.listing),
    })),
  };
}
