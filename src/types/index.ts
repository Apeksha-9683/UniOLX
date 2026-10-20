export type ListingCondition = 'Like New' | 'Good' | 'Fair' | 'Heavily Used';

export type ListingStatus = 'Available' | 'Reserved' | 'Sold' | 'Pending' | 'Completed' | 'Cancelled';

export type ListingCategory =
  | 'Textbooks'
  | 'Electronics'
  | 'Cycles & Commute'
  | 'Hostel Essentials'
  | 'Lab & Drafting'
  | 'Audio & Gadgets'
  | 'Fashion & Sports';

export interface College {
  id: string;
  name: string;
  shortName: string;
  city: string;
  state: string;
  domain?: string;
  campusSpots?: string[];
  popularBranches?: string[];
  status?: 'verified' | 'pending' | 'new';
  isVerified?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  collegeId: string;
  collegeName: string;
  collegeShortName: string;
  branch: string;
  year: number;
  semester: number;
  hostel?: string;
  avatar: string;
  isVerified: boolean;
  rating: number;
  totalReviews: number;
  completedTrades: number;
  joinedDate: string;
}

export interface SellerInfo {
  id: string;
  name: string;
  collegeId: string;
  collegeName: string;
  branch: string;
  avatar: string;
  isVerified: boolean;
  rating: number;
  totalReviews: number;
  hostelOrArea: string;
}

export interface Listing {
  id: string;
  title: string;
  description: string;
  price: number;
  originalPrice: number;
  category: ListingCategory;
  condition: ListingCondition;
  status: ListingStatus;
  collegeId: string;
  collegeName: string;
  campusPickupSpot: string;
  seller: SellerInfo;
  images: string[];
  specs: Record<string, string>;
  tags: string[];
  postedAt: string;
  isWishlisted?: boolean;
  viewsCount?: number;
  quantity?: number;
}

export interface Trade {
  id: string;
  listingId: string;
  listingTitle: string;
  listingImage: string;
  price: number;
  quantity?: number;
  buyerId: string;
  buyerName: string;
  buyerCollege: string;
  sellerId: string;
  sellerName: string;
  sellerCollege: string;
  pickupSpot: string;
  scheduledTime: string;
  status: ListingStatus;
  confirmationPin: string;
  attemptsLeft?: number;
  isLocked?: boolean;
  expiresAt?: number;
  createdAt: string;
  completedAt?: string;
  cancelledAt?: string;
}

export type MessageDeliveryStatus = 'sending' | 'sent' | 'read' | 'failed';
export type SystemCardType = 'trade_started' | 'trade_completed' | 'trade_cancelled';

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  timestamp: string;
  isMine: boolean;
  status?: MessageDeliveryStatus;
  isSystemCard?: boolean;
  systemCardType?: SystemCardType;
  tradeId?: string;
  tradeTitle?: string;
  tradeAmount?: number;
  tradePickupSpot?: string;
  isTradeAction?: boolean;
  tradeDetails?: {
    tradeId: string;
    price: number;
    pickupSpot: string;
    pin?: string;
  };
}

export interface Conversation {
  id: string;
  listingId: string;
  listingTitle: string;
  listingPrice: number;
  listingImage: string;
  listingStatus: ListingStatus;
  otherUser: {
    id: string;
    name: string;
    avatar: string;
    college: string;
    isVerified: boolean;
  };
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'trade' | 'message' | 'price_drop' | 'verification';
  read: boolean;
  timestamp: string;
  link?: string;
}

export interface ListingFilters {
  query?: string;
  collegeId?: string;
  category?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'newest' | 'price_low' | 'price_high' | 'discount';
}

export interface ParsedCriterion {
  id: string;
  label: string;
  key: 'budget' | 'minPrice' | 'ram' | 'storage' | 'use' | 'category' | 'condition' | 'brand' | 'location';
  value: string;
  displayValue: string;
}

export interface AIRankedListing {
  listing: Listing;
  matchScore: number;
  matchReasons: string[];
  unmatchedReasons?: string[];
}

export interface AISearchResult {
  query: string;
  summary: string;
  isVagueOrGreeting?: boolean;
  parsedCriteria: ParsedCriterion[];
  results: AIRankedListing[];
  alternativeSuggestions: string[];
  closeMatches: AIRankedListing[];
}

