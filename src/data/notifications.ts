import { NotificationItem } from '../types';

export const mockNotifications: NotificationItem[] = [
  {
    id: 'notif_01',
    title: 'Trade Scheduled at Cauvery Hostel Gate 2',
    message: 'Your trade with Tanmay Varma for Sleepwell Mattress is set for 5:30 PM. Your trade PIN is 8419.',
    type: 'trade',
    read: false,
    timestamp: '15 mins ago',
    link: '/orders'
  },
  {
    id: 'notif_02',
    title: 'New Message from Tanmay Varma',
    message: 'Deal! See you at Cauvery Hostel Gate 2 around 5:30 PM.',
    type: 'message',
    read: false,
    timestamp: '1 hour ago',
    link: '/messages'
  },
  {
    id: 'notif_03',
    title: 'Price Drop on Saved Item',
    message: 'MacBook Air M1 at RVCE was dropped from ₹45,000 to ₹43,000!',
    type: 'price_drop',
    read: true,
    timestamp: '4 hours ago',
    link: '/listing/list_008'
  },
  {
    id: 'notif_04',
    title: 'College ID Verified',
    message: 'Your institutional email aarav.sharma.cs22@rvce.edu.in has been verified. Welcome to RVCE Campus Mart!',
    type: 'verification',
    read: true,
    timestamp: '2 days ago',
    link: '/profile'
  }
];
