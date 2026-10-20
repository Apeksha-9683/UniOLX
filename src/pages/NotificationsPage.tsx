import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getNotifications, markNotificationRead } from '../api';
import { NotificationItem } from '../types';
import { Skeleton } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../components/ui/Toast';
import {
  Bell,
  KeyRound,
  MessageSquare,
  Tag,
  ShieldCheck,
  Check,
  CheckCheck,
  CheckCircle2,
  XCircle,
  ExternalLink
} from 'lucide-react';

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');

  const fetchNotifs = async () => {
    try {
      const res = await getNotifications();
      setNotifications(res);
    } catch {
      showToast('Could not load notifications', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifs();
  }, []);

  const handleMarkRead = async (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    await markNotificationRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const handleMarkAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    await Promise.all(unreadIds.map((id) => markNotificationRead(id)));
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    showToast('All notifications marked as read', 'info');
  };

  const handleOpenNotification = async (notif: NotificationItem) => {
    if (!notif.read) {
      await markNotificationRead(notif.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
      );
    }
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const getIcon = (type: NotificationItem['type'], title: string) => {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('completed')) {
      return <CheckCircle2 className="w-5 h-5 text-[#10B981]" />;
    }
    if (lowerTitle.includes('cancelled')) {
      return <XCircle className="w-5 h-5 text-[#E5383B]" />;
    }
    switch (type) {
      case 'trade':
        return <KeyRound className="w-5 h-5 text-[#FF7A1A]" />;
      case 'message':
        return <MessageSquare className="w-5 h-5 text-[#8C6500]" />;
      case 'price_drop':
        return <Tag className="w-5 h-5 text-[#E5383B]" />;
      case 'verification':
        return <ShieldCheck className="w-5 h-5 text-[#10B981]" />;
      default:
        return <Bell className="w-5 h-5 text-[#FF7A1A]" />;
    }
  };

  const filtered = notifications.filter((n) => {
    if (activeTab === 'unread') return !n.read;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#1F1A17] tracking-tight">
            Notifications
          </h1>
          <p className="text-xs sm:text-sm text-[#6B625A] mt-1">
            Real-time updates on new messages, started trades, PIN completions, and student safety
          </p>
        </div>

        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            icon={<CheckCheck className="w-3.5 h-3.5" />}
            onClick={handleMarkAllRead}
          >
            Mark All as Read
          </Button>
        )}
      </div>

      {/* Tabs: All & Unread */}
      <div className="flex items-center gap-2 border-b-2 border-[#EFE6D8] pb-1">
        <button
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-2xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
            activeTab === 'all'
              ? 'bg-[#FF7A1A] text-white shadow-xs'
              : 'text-[#6B625A] hover:bg-[#FFF3D6] hover:text-[#1F1A17]'
          }`}
        >
          <span>All</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-white/20">
            {notifications.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('unread')}
          className={`flex items-center gap-2 px-4 py-2 rounded-2xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
            activeTab === 'unread'
              ? 'bg-[#FF7A1A] text-white shadow-xs'
              : 'text-[#6B625A] hover:bg-[#FFF3D6] hover:text-[#1F1A17]'
          }`}
        >
          <span>Unread</span>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#E5383B] text-white">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-3xl border-2 border-[#EFE6D8] shadow-sm divide-y divide-[#F2E7D7] overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            <Skeleton variant="rectangular" className="h-16 w-full rounded-2xl" count={4} />
          </div>
        ) : filtered.length > 0 ? (
          filtered.map((notif) => {
            const isTradeStart = notif.title.toLowerCase().includes('started') || notif.title.toLowerCase().includes('scheduled');
            const isTradeComplete = notif.title.toLowerCase().includes('completed');
            const isTradeCancel = notif.title.toLowerCase().includes('cancelled');

            return (
              <div
                key={notif.id}
                className={`p-4 sm:p-5 flex items-start gap-3.5 sm:gap-4 transition-colors hover:bg-[#FFFDF9] ${
                  notif.read ? 'bg-white' : 'bg-[#FFF9EE]'
                }`}
              >
                {/* Red unread dot */}
                <div className="pt-2">
                  {!notif.read ? (
                    <span
                      title="Unread notification"
                      className="w-2.5 h-2.5 rounded-full bg-[#E5383B] block ring-4 ring-[#E5383B]/20 animate-pulse shrink-0"
                    />
                  ) : (
                    <span className="w-2.5 h-2.5 block shrink-0" />
                  )}
                </div>

                {/* Icon */}
                <div className="p-2.5 rounded-2xl bg-[#FFF3C4] border border-[#FFD966] shrink-0">
                  {getIcon(notif.type, notif.title)}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-extrabold text-xs sm:text-sm text-[#1F1A17] flex items-center gap-1.5">
                      <span>{notif.title}</span>
                      {isTradeStart && (
                        <span className="text-[10px] bg-[#FFF3C4] text-[#8C6500] font-bold px-1.5 py-0.2 rounded-md">
                          Trade Started
                        </span>
                      )}
                      {isTradeComplete && (
                        <span className="text-[10px] bg-[#DEF7EC] text-[#03543F] font-bold px-1.5 py-0.2 rounded-md">
                          Completed
                        </span>
                      )}
                      {isTradeCancel && (
                        <span className="text-[10px] bg-[#FDE8E8] text-[#9B1C1C] font-bold px-1.5 py-0.2 rounded-md">
                          Cancelled
                        </span>
                      )}
                    </h3>
                    <span className="text-[11px] text-[#A4998E] shrink-0 font-medium">
                      {notif.timestamp}
                    </span>
                  </div>

                  <p className="text-xs text-[#6B625A] leading-relaxed">
                    {notif.message}
                  </p>
                </div>

                {/* Right side: Open Button */}
                <div className="shrink-0 flex items-center gap-2 pl-2">
                  <Button
                    variant="yellow"
                    size="sm"
                    className="text-xs px-3 py-1.5"
                    icon={<ExternalLink className="w-3 h-3 text-[#FF7A1A]" />}
                    onClick={() => handleOpenNotification(notif)}
                  >
                    Open
                  </Button>
                </div>
              </div>
            );
          })
        ) : (
          <EmptyState
            title={activeTab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            description={
              activeTab === 'unread'
                ? 'You are all caught up on your campus trades and messages!'
                : 'Updates about your trades and peer chats will appear here.'
            }
            actionLabel="Explore Campus Marketplace"
            onAction={() => navigate('/categories')}
          />
        )}
      </div>
    </div>
  );
};
