import { Conversation, ChatMessage } from '../types';

/**
 * Empty by default.
 * Conversations only begin and appear in the left sidebar
 * when the user sends their first message.
 */
export const mockConversations: Conversation[] = [];
export const mockMessages: Record<string, ChatMessage[]> = {};
