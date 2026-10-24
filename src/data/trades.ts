import { Trade } from '../types';

export const mockTrades: Trade[] = [
  {
    id: 'trd_101',
    listingId: 'list_004',
    listingTitle: 'Sleepwell 4-Inch Single Bed High-Density Foam Mattress',
    listingImage: 'https://images.unsplash.com/photo-1582533561751-ef6f6ab93a2e?w=600&auto=format&fit=crop&q=80',
    price: 1200,
    buyerId: 'usr_rvce_001',
    buyerName: 'Aarav Sharma',
    buyerCollege: 'RVCE',
    sellerId: 'usr_seller_04',
    sellerName: 'Tanmay Varma',
    sellerCollege: 'RVCE',
    pickupSpot: 'Cauvery Hostel Gate 2',
    scheduledTime: 'Today at 5:30 PM (After Lab Hours)',
    status: 'Pending',
    confirmationPin: '8419',
    createdAt: 'Today, 10:15 AM'
  },
  {
    id: 'trd_102',
    listingId: 'list_001',
    listingTitle: 'Casio fx-991CW ClassWiz Scientific Calculator',
    listingImage: 'https://images.unsplash.com/photo-1594980596870-8aa52a78d8cd?w=600&auto=format&fit=crop&q=80',
    price: 950,
    buyerId: 'usr_rvce_001',
    buyerName: 'Aarav Sharma',
    buyerCollege: 'RVCE',
    sellerId: 'usr_seller_01',
    sellerName: 'Rohan Deshmukh',
    sellerCollege: 'RVCE',
    pickupSpot: 'Near Food Court & Canteen',
    scheduledTime: 'Yesterday, 1:15 PM',
    status: 'Completed',
    confirmationPin: '3742',
    createdAt: 'Yesterday, 11:30 AM',
    completedAt: 'Yesterday, 1:22 PM'
  },
  {
    id: 'trd_103',
    listingId: 'list_007',
    listingTitle: 'Engineering Mini Drafter (Omega Deluxe) with Sheet Container',
    listingImage: 'https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=600&auto=format&fit=crop&q=80',
    price: 420,
    buyerId: 'usr_fresh_09',
    buyerName: 'Rahul Shenoy',
    buyerCollege: 'RVCE',
    sellerId: 'usr_rvce_001',
    sellerName: 'Aarav Sharma',
    sellerCollege: 'RVCE',
    pickupSpot: 'Mechanical Dept Portico',
    scheduledTime: 'Tomorrow at 12:45 PM',
    status: 'Pending',
    confirmationPin: '5920',
    createdAt: 'Today, 2:40 PM'
  }
];
