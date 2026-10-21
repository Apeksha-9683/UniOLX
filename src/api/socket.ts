/**
 * Real-time chat socket.
 *
 * Exposes the same `on(event, handler)` API the mock socket had, so the
 * message page keeps working unchanged. Events: `message`, `message:status`,
 * `typing`, `conversations_updated`.
 */
import { getToken } from './http';

type Listener<T = unknown> = (data: T) => void;

const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

function socketUrl(): string {
  if (API_BASE) {
    const base = API_BASE.replace(/^http/, 'ws');
    return `${base}/ws`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws`;
}

class ChatSocket {
  private listeners = new Map<string, Set<Listener>>();
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private manuallyClosed = false;

  on<T = unknown>(event: string, listener: Listener<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as Listener);

    return () => this.off(event, listener);
  }

  off<T = unknown>(event: string, listener: Listener<T>): void {
    this.listeners.get(event)?.delete(listener as Listener);
  }

  emit(event: string, data?: unknown): void {
    const token = getToken();
    if (!token) return;

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.connect();
      return;
    }

    const payload: Record<string, unknown> = { type: event, ...(data as object) };
    this.socket.send(JSON.stringify(payload));
  }

  connect(): void {
    const token = getToken();
    if (!token) return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.manuallyClosed = false;
    const url = `${socketUrl()}?token=${encodeURIComponent(token)}`;

    try {
      this.socket = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as { event: string; data: unknown };
        this.dispatch(parsed.event, parsed.data);
      } catch {
        // ignore malformed frames
      }
    };

    this.socket.onclose = () => {
      this.socket = null;
      if (!this.manuallyClosed) this.scheduleReconnect();
    };

    this.socket.onerror = () => {
      this.socket?.close();
    };
  }

  disconnect(): void {
    this.manuallyClosed = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }

  private dispatch(event: string, data: unknown): void {
    this.listeners.get(event)?.forEach((listener) => {
      try {
        listener(data);
      } catch (error) {
        console.error(`Error in socket listener for '${event}':`, error);
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 15000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

export const socket = new ChatSocket();
