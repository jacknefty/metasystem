/**
 * SSE client — Subscribe to real-time chain events
 */

export type ChainEventHandler = (event: any) => void;

let eventSource: EventSource | null = null;
const handlers: Set<ChainEventHandler> = new Set();

export function subscribe(handler: ChainEventHandler): () => void {
  handlers.add(handler);

  if (!eventSource) {
    eventSource = new EventSource('/api/events');

    eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        handlers.forEach((h) => h(event));
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    };

    eventSource.onerror = () => {
      console.warn('SSE connection error, reconnecting...');
    };
  }

  return () => {
    handlers.delete(handler);

    if (handlers.size === 0 && eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}
