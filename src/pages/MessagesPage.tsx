import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import {
  getConversations,
  getConversationById,
  getMessages,
  sendMessage,
  retrySendMessage,
  createOrGetConversation,
  socket
} from '../api';
import { Conversation, ChatMessage } from '../types';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Skeleton } from '../components/ui/Skeleton';
import {
  Send,
  ShieldCheck,
  KeyRound,
  Check,
  CheckCheck,
  Clock,
  AlertCircle,
  RotateCw,
  ExternalLink,
  ChevronDown,
  ChevronLeft,
  Search,
  Lock,
  CheckCircle2,
  Ban,
  MessageSquare,
  Sparkles,
  ShoppingBag,
  Info
} from 'lucide-react';

export const MessagesPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const activeConvParam = searchParams.get('conv');
  const activeListingParam = searchParams.get('listingId');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Real-time typing state
  const [otherIsTyping, setOtherIsTyping] = useState(false);

  // Auto-scroll and new messages notification
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessagesBelow, setHasNewMessagesBelow] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mobile conversation list vs chat view toggle
  const [showMobileChat, setShowMobileChat] = useState(false);

  // 1. Initial Load: Fetch conversations and handle direct links (conv or listingId)
  useEffect(() => {
    let isMounted = true;

    async function loadInitial() {
      setLoadingConvs(true);
      try {
        const convList = await getConversations();

        // If listingId was specified in query, ensure conversation exists
        if (activeListingParam) {
          const createdOrFound = await createOrGetConversation(activeListingParam);
          if (isMounted) {
            setConversations(convList);
            setSelectedConv(createdOrFound);
            setShowMobileChat(true);
            setLoadingConvs(false);
            return;
          }
        }

        // If conv was specified in query
        if (activeConvParam) {
          const found =
            convList.find((c) => c.id === activeConvParam) ||
            ((await getConversationById(activeConvParam)) ?? undefined);
          if (isMounted && found) {
            setConversations(convList);
            setSelectedConv(found);
            setShowMobileChat(true);
            setLoadingConvs(false);
            return;
          }
        }

        if (isMounted) {
          setConversations(convList);
          if (convList.length > 0) {
            setSelectedConv(convList[0]);
          } else {
            setSelectedConv(null);
          }
          setLoadingConvs(false);
        }
      } catch (err) {
        console.error('Failed to load conversations:', err);
        if (isMounted) setLoadingConvs(false);
      }
    }

    loadInitial();

    return () => {
      isMounted = false;
    };
  }, [activeConvParam, activeListingParam]);

  // 2. Load messages whenever selected conversation changes
  useEffect(() => {
    if (!selectedConv) return;

    setLoadingMessages(true);
    setOtherIsTyping(false);
    setHasNewMessagesBelow(false);

    getMessages(selectedConv.id)
      .then((msgs) => {
        setMessages(msgs);
        setLoadingMessages(false);
        // Tell the server the conversation is read, so the peer sees the
        // read receipt over the socket.
        socket.emit('read', { conversationId: selectedConv.id });
        // Scroll to bottom immediately on conversation switch
        setTimeout(() => {
          scrollToBottom('auto');
        }, 50);
      })
      .catch(() => {
        setLoadingMessages(false);
      });
  }, [selectedConv?.id]);

  // 3. Listen to mock real-time WebSocket events
  useEffect(() => {
    // A: Listen for incoming messages
    const unsubscribeMessage = socket.on<ChatMessage>('message', (incomingMsg) => {
      if (selectedConv && incomingMsg.conversationId === selectedConv.id) {
        setMessages((prev) => {
          // Avoid duplicate messages
          if (prev.some((m) => m.id === incomingMsg.id)) return prev;
          return [...prev, incomingMsg];
        });

        // Check if user is currently near bottom
        const el = chatScrollContainerRef.current;
        const currentDistance = el ? el.scrollHeight - el.scrollTop - el.clientHeight : 0;
        if (currentDistance < 100) {
          setTimeout(() => scrollToBottom('smooth'), 50);
        } else {
          setHasNewMessagesBelow(true);
        }
      }

      // Update conversations list preview and move to top
      setConversations((prevConvs) => {
        const target = prevConvs.find((c) => c.id === incomingMsg.conversationId);
        if (!target) {
          if (selectedConv && selectedConv.id === incomingMsg.conversationId) {
            return [
              {
                ...selectedConv,
                lastMessage: incomingMsg.text,
                lastMessageTime: 'Just now',
                unreadCount: 0
              },
              ...prevConvs
            ];
          }
          return prevConvs;
        }
        const updatedTarget = {
          ...target,
          lastMessage: incomingMsg.text,
          lastMessageTime: 'Just now',
          unreadCount:
            selectedConv?.id === incomingMsg.conversationId ? 0 : target.unreadCount + 1
        };
        const remaining = prevConvs.filter((c) => c.id !== incomingMsg.conversationId);
        return [updatedTarget, ...remaining];
      });
    });

    // B: Listen for message delivery status updates (sending -> sent -> read)
    const unsubscribeStatus = socket.on<{
      messageId: string;
      conversationId: string;
      status: 'sent' | 'read' | 'failed';
    }>('message:status', ({ messageId, conversationId, status }) => {
      if (selectedConv && selectedConv.id === conversationId) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, status } : m))
        );
      }
    });

    // C: Listen for typing indicators
    const unsubscribeTyping = socket.on<{
      conversationId: string;
      isTyping: boolean;
      userName: string;
    }>('typing', ({ conversationId, isTyping }) => {
      if (selectedConv && selectedConv.id === conversationId) {
        setOtherIsTyping(isTyping);
        if (isTyping && isAtBottom) {
          setTimeout(() => scrollToBottom('smooth'), 50);
        }
      }
    });

    return () => {
      unsubscribeMessage();
      unsubscribeStatus();
      unsubscribeTyping();
    };
  }, [selectedConv?.id, isAtBottom]);

  // Handle user scroll detection for auto-scroll and floating "New messages" button
  const handleScroll = useCallback(() => {
    const el = chatScrollContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceToBottom < 80;
    setIsAtBottom(atBottom);
    if (atBottom) {
      setHasNewMessagesBelow(false);
    }
  }, []);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = chatScrollContainerRef.current;
    if (el) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior
      });
    }
    setHasNewMessagesBelow(false);
  };

  // Send message handler
  const handleSendMessage = async () => {
    if (!inputText.trim() || !selectedConv) return;
    const textToSend = inputText.trim();
    setInputText('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Check for demo failure command
    const isSimulateFail = textToSend.startsWith('!fail');
    const cleanedText = isSimulateFail
      ? textToSend.replace('!fail', '').trim() || 'Simulated failed message'
      : textToSend;

    if (isSimulateFail) {
      // Create a local failed message to demonstrate the failed state & retry button
      const failedMsg: ChatMessage = {
        id: `msg_fail_${Date.now()}`,
        conversationId: selectedConv.id,
        senderId: 'usr_rvce_001',
        text: cleanedText,
        timestamp: 'Just now',
        isMine: true,
        status: 'failed'
      };
      setMessages((prev) => [...prev, failedMsg]);
      showToast('Message delivery failed. Tap Retry to send.', 'error');
      setTimeout(() => scrollToBottom('smooth'), 50);
      return;
    }

    try {
      // Optimistic message addition with 'sending' status
      const tempId = `msg_${Date.now()}`;
      const tempMsg: ChatMessage = {
        id: tempId,
        conversationId: selectedConv.id,
        senderId: 'usr_rvce_001',
        text: cleanedText,
        timestamp: 'Just now',
        isMine: true,
        status: 'sending'
      };

      setMessages((prev) => [...prev, tempMsg]);
      setTimeout(() => scrollToBottom('smooth'), 50);

      // Call the API layer, which persists the message and pushes it over the socket
      const serverMsg = await sendMessage(selectedConv.id, cleanedText);

      // Replace with confirmed server message
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...serverMsg, status: 'sending' } : m))
      );

      // Update sidebar conversation preview (add to sidebar if first message)
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === selectedConv.id);
        if (idx === -1) {
          const newSidebarEntry = {
            ...selectedConv,
            lastMessage: cleanedText,
            lastMessageTime: 'Just now',
            unreadCount: 0
          };
          return [newSidebarEntry, ...prev];
        }
        const updated = {
          ...prev[idx],
          lastMessage: cleanedText,
          lastMessageTime: 'Just now'
        };
        const rest = prev.filter((_, i) => i !== idx);
        return [updated, ...rest];
      });
    } catch {
      showToast('Failed to deliver message', 'error');
    }
  };

  // Keyboard shortcut: Enter to send, Shift+Enter for new line
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  // Retry sending failed message
  const handleRetryMessage = async (msgId: string) => {
    if (!selectedConv) return;
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, status: 'sending' } : m))
    );
    try {
      await retrySendMessage(selectedConv.id, msgId);
      showToast('Message resent successfully!', 'success');
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, status: 'failed' } : m))
      );
      showToast('Retry failed, please try again.', 'error');
    }
  };

  // Filter conversations by name or item
  const filteredConversations = conversations.filter((c) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      c.otherUser.name.toLowerCase().includes(term) ||
      c.listingTitle.toLowerCase().includes(term) ||
      c.lastMessage.toLowerCase().includes(term)
    );
  });

  return (
    <div className="w-full h-full min-h-0 max-h-full flex flex-col overflow-hidden bg-[#FFFDF9] md:p-3 lg:p-4">
      {/* Main 2-Panel Card */}
      <div className="max-w-7xl mx-auto w-full h-full min-h-0 max-h-full flex-1 bg-white md:rounded-3xl md:border-2 md:border-[#EFE6D8] md:shadow-xs overflow-hidden flex flex-col md:flex-row">
        {/* ============================================================ */}
        {/* LEFT COLUMN: Conversation List                                */}
        {/* ============================================================ */}
        <div
          className={`w-full md:w-80 lg:w-96 md:shrink-0 md:border-r-2 md:border-[#EFE6D8] flex flex-col h-full min-h-0 max-h-full bg-[#FFFDF9] overflow-hidden ${
            showMobileChat ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* List Header & Search (fixed height, shrink-0) */}
          <div className="p-3.5 sm:p-4 border-b border-[#F2E7D7] bg-[#FFF8EC] shrink-0 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#FF7A1A] to-[#FFC72C] flex items-center justify-center text-white shadow-xs">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h1 className="text-sm font-black text-[#1F1A17] tracking-tight">Messages</h1>
                  <p className="text-[10px] text-[#8C6500] font-semibold">Campus Peer Chats</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="bg-[#FF7A1A] text-white px-2 py-0.5 rounded-full text-[10px] font-black">
                  {conversations.length}
                </span>
                <Link
                  to="/orders"
                  className="text-[11px] font-bold text-[#FF7A1A] hover:underline hidden sm:inline ml-1"
                >
                  My PIN Orders
                </Link>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#8C827A]" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search peers or listings..."
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#EFE6D8] rounded-xl text-xs text-[#1F1A17] placeholder-[#A4998E] outline-none focus:border-[#FF7A1A] transition-all"
              />
            </div>
          </div>

          {/* Conversations Scroll Area (Independent overflow-y-auto scroll area) */}
          <div className="overflow-y-auto flex-1 min-h-0 divide-y divide-[#F2E7D7] pb-20 md:pb-0">
            {loadingConvs ? (
              <div className="p-4 space-y-3">
                <Skeleton variant="rectangular" className="h-20 w-full rounded-2xl" count={4} />
              </div>
            ) : filteredConversations.length > 0 ? (
              filteredConversations.map((conv) => {
                const isSelected = selectedConv?.id === conv.id;
                return (
                  <button
                    key={conv.id}
                    onClick={() => {
                      setSelectedConv(conv);
                      setSearchParams({ conv: conv.id });
                      setShowMobileChat(true);
                    }}
                    className={`w-full text-left p-3 sm:p-3.5 transition-all flex items-start gap-3 cursor-pointer group ${
                      isSelected
                        ? 'bg-[#FFF3D6] border-l-4 border-l-[#FF7A1A] shadow-inner'
                        : 'hover:bg-[#FFF8EC]'
                    }`}
                  >
                    {/* Peer Avatar & Listing Thumbnail Overlay */}
                    <div className="relative shrink-0">
                      <img
                        src={conv.otherUser.avatar}
                        alt={conv.otherUser.name}
                        className="w-10 h-10 rounded-2xl bg-[#FFF3C4] border-2 border-white shadow-xs object-cover"
                      />
                      <img
                        src={conv.listingImage}
                        alt={conv.listingTitle}
                        className="w-4 h-4 rounded-md object-cover border border-white absolute -bottom-1 -right-1 shadow-xs"
                      />
                    </div>

                    {/* Conversation Content Details */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-xs font-black text-[#1F1A17] truncate">
                            {conv.otherUser.name}
                          </span>
                          {conv.otherUser.isVerified && (
                            <span title="Verified College Student">
                              <ShieldCheck className="w-3.5 h-3.5 text-[#10B981] fill-[#10B981]/20 shrink-0" />
                            </span>
                          )}
                        </div>

                        <span className="text-[10px] text-[#A4998E] font-semibold shrink-0">
                          {conv.lastMessageTime}
                        </span>
                      </div>

                      {/* Listing Title & Price */}
                      <div className="flex items-center justify-between text-[11px] mt-0.5 gap-1">
                        <p className="font-bold text-[#FF7A1A] truncate">
                          {conv.listingTitle}
                        </p>
                        <span className="font-black text-[#1F1A17] shrink-0">
                          ₹{conv.listingPrice.toLocaleString('en-IN')}
                        </span>
                      </div>

                      {/* Last Message Preview & Unread Badge */}
                      <div className="flex items-center justify-between mt-0.5 gap-2">
                        <p className="text-xs text-[#6B625A] truncate leading-tight">
                          {conv.lastMessage}
                        </p>
                        {conv.unreadCount > 0 && (
                          <span className="shrink-0 bg-[#E5383B] text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-xs animate-pulse">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            ) : (
              /* Empty state: No active chats yet */
              <div className="p-8 text-center space-y-3 my-auto">
                <div className="w-12 h-12 rounded-2xl bg-[#FFF3C4] text-[#FF7A1A] flex items-center justify-center mx-auto">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-xs text-[#1F1A17]">No active chats yet</h3>
                <p className="text-[11px] text-[#6B625A] max-w-xs mx-auto">
                  Conversations will appear here once you send a message to a campus seller.
                </p>
                <Link to="/categories">
                  <Button variant="yellow" size="sm">
                    Browse Marketplace
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* RIGHT COLUMN: The Open Conversation Thread                   */}
        {/* ============================================================ */}
        <div
          className={`flex-1 min-h-0 flex flex-col h-full max-h-full bg-white overflow-hidden ${
            !showMobileChat ? 'hidden md:flex' : 'flex'
          }`}
        >
          {selectedConv ? (
            <>
              {/* 1. TOP BAR: Product Preview & Peer Info (Fixed height, does not shrink) */}
              <div className="shrink-0 p-3 sm:p-3.5 border-b border-[#F2E7D7] bg-[#FFFBF2] flex items-center justify-between gap-2.5 shadow-2xs">
                {/* Mobile Back Button */}
                <button
                  type="button"
                  onClick={() => {
                    setShowMobileChat(false);
                    setSearchParams({});
                  }}
                  className="md:hidden p-1.5 -ml-1 rounded-xl text-[#6B625A] hover:bg-[#FFF3D6] transition-colors cursor-pointer flex items-center gap-0.5 text-xs font-bold"
                  aria-label="Back to chat list"
                >
                  <ChevronLeft className="w-5 h-5 text-[#1F1A17]" />
                  <span>Chats</span>
                </button>

                {/* Listing Snapshot */}
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                  <Link
                    to={`/listing/${selectedConv.listingId}`}
                    className="shrink-0 relative group"
                    title="View item details"
                  >
                    <img
                      src={selectedConv.listingImage}
                      alt={selectedConv.listingTitle}
                      className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl object-cover border-2 border-[#EFE6D8] group-hover:border-[#FF7A1A] transition-colors"
                    />
                  </Link>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <Link
                        to={`/listing/${selectedConv.listingId}`}
                        className="font-black text-xs sm:text-sm text-[#1F1A17] truncate hover:text-[#FF7A1A] transition-colors flex items-center gap-1"
                      >
                        <span className="truncate">{selectedConv.listingTitle}</span>
                        <ExternalLink className="w-3 h-3 text-[#A4998E] shrink-0" />
                      </Link>
                      <StatusBadge status={selectedConv.listingStatus} size="sm" />
                    </div>

                    <div className="flex items-center gap-2 text-xs text-[#6B625A] mt-0.5">
                      <span className="font-black text-[#1F1A17]">
                        ₹{selectedConv.listingPrice.toLocaleString('en-IN')}
                      </span>
                      <span>·</span>
                      <span className="truncate">
                        Chatting with <strong>{selectedConv.otherUser.name}</strong> ({selectedConv.otherUser.college})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Direct Action Links */}
                <div className="shrink-0 flex items-center gap-1.5 sm:gap-2">
                  <Link to="/orders">
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<KeyRound className="w-3.5 h-3.5 text-[#FF7A1A]" />}
                    >
                      <span className="hidden lg:inline">View Trade & PIN</span>
                      <span className="lg:hidden">Trade</span>
                    </Button>
                  </Link>
                </div>
              </div>

              {/* 2. SAFETY BANNER (Fixed height, shrink-0) */}
              <div className="shrink-0 bg-gradient-to-r from-[#FFF8EC] via-[#FFF3C4] to-[#FFE6B3] px-3.5 py-1.5 border-b border-[#FFD966] flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-[#8C6500] truncate">
                  <Lock className="w-3.5 h-3.5 text-[#FF7A1A] shrink-0" />
                  <span className="font-extrabold text-[#1F1A17] truncate">
                    Safety Protocol: Never share your PIN in chat.
                  </span>
                  <span className="hidden xl:inline text-[#6B625A]">
                    Only release your 4-digit code in-person after inspecting the item.
                  </span>
                </div>
                <span className="hidden sm:inline text-[11px] font-bold text-[#FF7A1A] shrink-0 ml-2">
                  PIN Handover
                </span>
              </div>

              {/* 3. MESSAGE LIST (THE ONLY SCROLLING AREA) */}
              <div
                ref={chatScrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 min-h-0 overflow-y-auto p-3.5 sm:p-5 space-y-3 bg-gradient-to-b from-[#FFFDF9] via-white to-[#FFFDF9] relative"
              >
                {loadingMessages ? (
                  <div className="space-y-4">
                    <Skeleton variant="rectangular" className="h-12 w-2/3 rounded-2xl" />
                    <Skeleton variant="rectangular" className="h-12 w-1/2 ml-auto rounded-2xl" />
                    <Skeleton variant="rectangular" className="h-14 w-3/4 rounded-2xl" />
                  </div>
                ) : messages.length > 0 ? (
                  messages.map((msg) => {
                    // System card representation (distinct in the thread)
                    if (msg.isSystemCard) {
                      return (
                        <div key={msg.id} className="py-2 flex justify-center">
                          <div className="w-full max-w-md bg-[#FFF8EC] rounded-2xl p-4 border-2 border-[#FFD966] text-center shadow-xs space-y-2">
                            <div className="flex items-center justify-center gap-1.5 text-xs font-black uppercase tracking-wider">
                              {msg.systemCardType === 'trade_completed' ? (
                                <>
                                  <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
                                  <span className="text-[#03543F]">Campus Trade Completed</span>
                                </>
                              ) : msg.systemCardType === 'trade_cancelled' ? (
                                <>
                                  <Ban className="w-4 h-4 text-[#E5383B]" />
                                  <span className="text-[#9B1C1C]">Campus Trade Cancelled</span>
                                </>
                              ) : (
                                <>
                                  <KeyRound className="w-4 h-4 text-[#FF7A1A]" />
                                  <span className="text-[#8C6500]">In-Person Trade Scheduled</span>
                                </>
                              )}
                            </div>

                            <p className="text-xs sm:text-sm font-bold text-[#1F1A17] break-words [word-break:break-word]">
                              {msg.text}
                            </p>

                            {msg.tradeAmount && (
                              <p className="text-xs text-[#6B625A]">
                                Verified Handover Amount:{' '}
                                <strong className="text-[#1F1A17]">
                                  ₹{msg.tradeAmount.toLocaleString('en-IN')}
                                </strong>
                              </p>
                            )}

                            <div className="pt-1 flex items-center justify-center gap-3">
                              <span className="text-[10px] text-[#A4998E]">
                                {msg.timestamp}
                              </span>
                              <Link to="/orders">
                                <Button
                                  variant="primary"
                                  size="sm"
                                  className="text-xs px-3 py-1"
                                  icon={<KeyRound className="w-3 h-3" />}
                                >
                                  View trade
                                </Button>
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // Standard chat bubble with strict 70% max-width and break-words
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${msg.isMine ? 'items-end' : 'items-start'} max-w-full`}
                      >
                        {/* Bubble: max-w-[70%], break-words, never pushed wide */}
                        <div
                          className={`max-w-[70%] rounded-2xl px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm leading-relaxed shadow-xs transition-all break-words [word-break:break-word] overflow-hidden ${
                            msg.isMine
                              ? 'bg-[#FFC72C] text-[#1F1A17] font-medium rounded-tr-none border border-[#FFB703]'
                              : 'bg-white text-[#1F1A17] font-medium rounded-tl-none border-2 border-[#EFE6D8]'
                          } ${msg.status === 'failed' ? 'border-[#E5383B] bg-[#FDE8E8]' : ''}`}
                        >
                          <p className="whitespace-pre-wrap break-words [word-break:break-word]">{msg.text}</p>
                        </div>

                        {/* Status Line: Timestamp, sending, sent, read, or failed + retry */}
                        <div className="flex items-center gap-1.5 mt-1 px-1 text-[10px]">
                          <span className="text-[#A4998E] font-medium">{msg.timestamp}</span>

                          {msg.isMine && (
                            <>
                              {msg.status === 'sending' && (
                                <span className="flex items-center gap-1 text-[#8C6500] font-semibold">
                                  <Clock className="w-3 h-3 animate-spin" />
                                  <span>Sending...</span>
                                </span>
                              )}

                              {msg.status === 'sent' && (
                                <span title="Sent" className="text-[#8C827A]">
                                  <Check className="w-3.5 h-3.5" />
                                </span>
                              )}

                              {msg.status === 'read' && (
                                <span title="Read" className="text-[#10B981] flex items-center">
                                  <CheckCheck className="w-3.5 h-3.5" />
                                </span>
                              )}

                              {msg.status === 'failed' && (
                                <div className="flex items-center gap-1.5 text-[#E5383B] font-bold">
                                  <AlertCircle className="w-3.5 h-3.5" />
                                  <span>Failed</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRetryMessage(msg.id)}
                                    className="ml-1 px-2 py-0.5 bg-[#E5383B] text-white rounded-full hover:bg-[#C81E1E] flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <RotateCw className="w-2.5 h-2.5" />
                                    <span>Retry</span>
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  /* Empty State: New Conversation without messages */
                  <div className="h-full flex flex-col items-center justify-center p-6 sm:p-8 text-center space-y-5 max-w-lg mx-auto animate-in fade-in duration-200">
                    <div className="relative">
                      <img
                        src={selectedConv.otherUser.avatar}
                        alt={selectedConv.otherUser.name}
                        className="w-16 h-16 rounded-3xl bg-[#FFF3C4] border-4 border-white shadow-md mx-auto object-cover"
                      />
                      <div className="w-5 h-5 rounded-full bg-[#10B981] border-2 border-white flex items-center justify-center text-white text-[10px] absolute -bottom-1 -right-1 shadow-xs font-bold">
                        ✓
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFF8EC] border border-[#EFE6D8] text-[11px] font-bold text-[#8C6500]">
                        <ShieldCheck className="w-3.5 h-3.5 text-[#10B981]" />
                        <span>Verified Student · {selectedConv.otherUser.college}</span>
                      </div>
                      <h2 className="text-lg sm:text-xl font-black text-[#1F1A17] tracking-tight">
                        Say hello to {selectedConv.otherUser.name.split(' ')[0]} and ask about this {selectedConv.listingTitle.length > 32 ? selectedConv.listingTitle.slice(0, 28) + '...' : selectedConv.listingTitle}
                      </h2>
                      <p className="text-xs text-[#6B625A] max-w-sm mx-auto leading-relaxed">
                        Asking price: <strong>₹{selectedConv.listingPrice.toLocaleString('en-IN')}</strong>. Messages are private and safe trades happen in person with a 4-digit PIN.
                      </p>
                    </div>

                    {/* Quick-Start Chips (Tapping only fills input box, does not send) */}
                    <div className="space-y-2 pt-2 w-full">
                      <p className="text-[11px] font-bold text-[#8C827A] uppercase tracking-wider">
                        Tap a chip to fill message:
                      </p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {[
                          'Is this still available?',
                          `Can you do ₹${Math.max(50, Math.round((selectedConv.listingPrice * 0.9) / 50) * 50).toLocaleString('en-IN')}?`,
                          'Where can we meet on campus?',
                          'Can I inspect the condition today?'
                        ].map((promptText) => (
                          <button
                            key={promptText}
                            type="button"
                            onClick={() => {
                              setInputText(promptText);
                              textareaRef.current?.focus();
                            }}
                            className="text-xs bg-[#FFF8EC] hover:bg-[#FFEECB] hover:border-[#FF7A1A]/40 border-2 border-[#EFE6D8] text-[#1F1A17] font-bold px-3.5 py-2 rounded-2xl cursor-pointer transition-all active:scale-95 shadow-2xs"
                          >
                            "{promptText}"
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Typing Indicator */}
                {otherIsTyping && (
                  <div className="flex items-center gap-2 p-2 rounded-2xl bg-[#FFF8EC] border border-[#EFE6D8] w-fit text-xs text-[#6B625A]">
                    <img
                      src={selectedConv.otherUser.avatar}
                      alt={selectedConv.otherUser.name}
                      className="w-5 h-5 rounded-full bg-[#FFF3C4]"
                    />
                    <span className="font-semibold">{selectedConv.otherUser.name} is typing</span>
                    <span className="flex gap-1 ml-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FF7A1A] animate-bounce" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FF7A1A] animate-bounce [animation-delay:0.2s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FF7A1A] animate-bounce [animation-delay:0.4s]" />
                    </span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* FLOATING "NEW MESSAGES" BUTTON (Visible when user scrolled up and message arrives) */}
              {hasNewMessagesBelow && (
                <div className="relative shrink-0 flex justify-center -mt-12 mb-3 pointer-events-none z-20">
                  <button
                    type="button"
                    onClick={() => scrollToBottom('smooth')}
                    className="pointer-events-auto bg-[#FF7A1A] text-white text-xs font-black px-4 py-1.5 rounded-full shadow-lg shadow-[#FF7A1A]/30 flex items-center gap-1.5 hover:bg-[#E86707] transition-all cursor-pointer animate-bounce"
                  >
                    <span>New messages</span>
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* 4. MESSAGE INPUT BOX (Does not shrink, always visible at bottom, never scrolled out of view) */}
              <div className="shrink-0 p-2.5 sm:p-3.5 border-t border-[#EFE6D8] bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-end gap-2 sm:gap-2.5 bg-[#FFFBF2] border border-[#E8DFD3] focus-within:border-[#FF7A1A] focus-within:ring-4 focus-within:ring-[#FF7A1A]/[0.18] focus-within:bg-white rounded-3xl p-1.5 sm:p-2 transition-all duration-200"
                >
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={inputText}
                    onChange={handleTextareaChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message (Enter to send, Shift+Enter for new line)..."
                    className="flex-1 max-h-28 sm:max-h-32 bg-transparent border-0 shadow-none text-xs sm:text-sm text-[#1F1A17] placeholder-[#A4998E] outline-none focus:outline-none focus:ring-0 focus-visible:outline-none chat-inner-textarea px-2.5 sm:px-3 py-1.5 resize-none leading-relaxed"
                  />

                  <div className="flex items-center gap-1 shrink-0 pb-0.5">
                    {/* Send Button: shrink-0, always visible */}
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      disabled={!inputText.trim()}
                      className="rounded-full w-9 h-9 p-0 flex items-center justify-center shadow-xs shrink-0"
                      aria-label="Send message"
                    >
                      <Send className="w-4 h-4 text-white" />
                    </Button>
                  </div>
                </form>

                <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-[#8C827A] px-2 pt-1.5">
                  <span>Enter to send · Shift+Enter adds new line</span>
                  <span className="hidden sm:inline">Mock WebSocket Real-Time Active</span>
                </div>
              </div>
            </>
          ) : (
            /* Empty state when no conversation is selected */
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-[#FFF3C4] text-[#FF7A1A] flex items-center justify-center">
                <MessageSquare className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-bold text-[#1F1A17]">No conversation selected</h2>
              <p className="text-xs text-[#6B625A] max-w-xs">
                Pick a student chat from the left sidebar to coordinate campus pickups and check item condition.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
