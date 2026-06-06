/**
 * useChainEvents — SSE subscription to chain events
 */

import { useEffect, useRef } from 'react';
import { subscribeToEvents, type ChainEvent, type ChainEventType } from '../api/client';

type EventHandler = (event: ChainEvent) => void;

export function useChainEvents(
  onEvent: EventHandler,
  filter?: ChainEventType[]
): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const unsubscribe = subscribeToEvents((event) => {
      if (!filter || filter.includes(event.type)) {
        handlerRef.current(event);
      }
    });

    return unsubscribe;
  }, [filter?.join(',')]);
}

export function useVarietyEvents(onUpdate: () => void): void {
  const varietyEvents: ChainEventType[] = [
    'variety:work:in', 'variety:work:out',
    'variety:env:in', 'variety:env:out',
    'variety:coord:in', 'variety:coord:out',
    'variety:identity:in', 'variety:identity:out',
  ];

  useChainEvents(() => onUpdate(), varietyEvents);
}

export function useCreditEvents(onCredit: (event: ChainEvent) => void): void {
  useChainEvents(onCredit, ['credit:earned']);
}

export function useAlgedonicEvents(onSignal: (event: ChainEvent) => void): void {
  useChainEvents(onSignal, ['algedonic:pain', 'algedonic:pleasure']);
}
