import { ChatMessage, Conversation, Listing, User } from '../types';
import { generateRuleBasedReply } from './chatEngine';

type SocketListener<T = unknown> = (data: T) => void;

interface HandleUserMessageSentParams {
  conversationId: string;
  userMsg: ChatMessage;
  conv?: Conversation;
  listing?: Listing | null;
  currentUser?: User | null;
}

class MockSocketService {
  private listeners: Map<string, Set<SocketListener>> = new Map();
  private replyTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private lastReplies: Map<string, string> = new Map();

  constructor() {
    this.cleanLegacyStorage();
  }

  private cleanLegacyStorage() {
    if (typeof window === 'undefined') return;
    try {
      // Clear legacy seeded mock conversations containing old demo data
      const storedConvs = localStorage.getItem('campusmart_conversations');
      if (storedConvs && (storedConvs.includes('Sleepwell') || storedConvs.includes('conv_01'))) {
        localStorage.removeItem('campusmart_conversations');
        localStorage.removeItem('campusmart_messages');
      }
    } catch {
      // ignore
    }
  }

  // Subscribe to socket events: 'message', 'message:status', 'typing', 'conversations_updated'
  public on<T = unknown>(event: string, listener: SocketListener<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as SocketListener);

    return () => this.off(event, listener as SocketListener);
  }

  public off(event: string, listener: SocketListener): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener);
    }
  }

  public emit(event: string, data?: unknown): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach((listener) => {
        try {
          listener(data);
        } catch (err) {
          console.error(`Error in mock socket listener for '${event}':`, err);
        }
      });
    }
  }

  /**
   * Called when the user presses Send on a message.
   * Steps:
   * 1. After ~350ms, update status to 'sent'
   * 2. After ~700ms, update status to 'read'
   * 3. Show other party's typing indicator for 1 to 2 seconds
   * 4. Reply with contextual rule-based response matching user's intent and listing data
   */
  public handleUserMessageSent(params: HandleUserMessageSentParams): void {
    const { conversationId, userMsg, conv, listing, currentUser } = params;

    // Clear any previous scheduled reply for this conversation
    if (this.replyTimeouts.has(conversationId)) {
      clearTimeout(this.replyTimeouts.get(conversationId)!);
      this.replyTimeouts.delete(conversationId);
    }

    // 1. Transition user's message from 'sending' to 'sent'
    setTimeout(() => {
      this.emit('message:status', {
        messageId: userMsg.id,
        conversationId,
        status: 'sent'
      });

      // 2. Transition from 'sent' to 'read'
      setTimeout(() => {
        this.emit('message:status', {
          messageId: userMsg.id,
          conversationId,
          status: 'read'
        });
      }, 400);
    }, 350);

    // 3. Start typing indicator after 700ms
    const otherPartyName = conv?.otherUser?.name || 'Seller';
    setTimeout(() => {
      this.emit('typing', {
        conversationId,
        isTyping: true,
        userName: otherPartyName
      });
    }, 700);

    // 4. Generate contextual reply and deliver after 1.8 seconds of typing
    const replyTimer = setTimeout(() => {
      this.emit('typing', {
        conversationId,
        isTyping: false,
        userName: otherPartyName
      });

      const lastReply = this.lastReplies.get(conversationId);
      const replyText = generateRuleBasedReply({
        conversationId,
        userText: userMsg.text,
        listing,
        currentUser,
        otherUser: conv?.otherUser,
        lastReply
      });

      this.lastReplies.set(conversationId, replyText);

      const replyMsg: ChatMessage = {
        id: `reply_${Date.now()}`,
        conversationId,
        senderId: conv?.otherUser?.id || 'usr_peer_reply',
        text: replyText,
        timestamp: 'Just now',
        isMine: false,
        status: 'read'
      };

      this.emit('message', replyMsg);
      this.replyTimeouts.delete(conversationId);
    }, 2200);

    this.replyTimeouts.set(conversationId, replyTimer);
  }
}

export const mockSocket = new MockSocketService();
