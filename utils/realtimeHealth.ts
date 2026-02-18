import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db, doc, getDoc, setDoc } from '../services/firebase';

type HealthSnapshot = {
  chatHealthy: boolean;
  callsHealthy: boolean;
  offline: boolean;
  lastError?: string;
};

const PING_DOC = doc(db, '__health', 'ping');
const PING_TIMEOUT_MS = 4000;
const PING_INTERVAL_MS = 15000;

const runWithTimeout = <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('health ping timeout')), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

export const useRealtimeHealth = (enabled: boolean) => {
  const [health, setHealth] = useState<HealthSnapshot>({
    chatHealthy: enabled,
    callsHealthy: enabled,
    offline: false,
  });
  const tickingRef = useRef<NodeJS.Timeout | null>(null);

  const markCallsDegraded = useCallback(
    (error?: string) =>
      setHealth((prev) => ({
        ...prev,
        callsHealthy: false,
        lastError: error || prev.lastError,
      })),
    []
  );
  const markChatDegraded = useCallback(
    (error?: string) =>
      setHealth((prev) => ({
        ...prev,
        chatHealthy: false,
        lastError: error || prev.lastError,
      })),
    []
  );

  const ping = useMemo(
    () => async () => {
      if (!enabled) return;
      try {
        await runWithTimeout(setDoc(PING_DOC, { ts: Date.now() }, { merge: true }), PING_TIMEOUT_MS);
        await runWithTimeout(getDoc(PING_DOC), PING_TIMEOUT_MS);
        setHealth({ chatHealthy: true, callsHealthy: true, offline: false, lastError: undefined });
      } catch (err: any) {
        const message = String(err?.message || 'health ping failed');
        const offline = /offline|unavailable|Failed to get document/i.test(message);
        setHealth({
          chatHealthy: false,
          callsHealthy: false,
          offline,
          lastError: message,
        });
      }
    },
    [enabled]
  );

  useEffect(() => {
    if (!enabled) {
      setHealth((prev) => ({ ...prev, chatHealthy: false, callsHealthy: false }));
      return;
    }
    ping();
    tickingRef.current = setInterval(ping, PING_INTERVAL_MS);
    return () => {
      if (tickingRef.current) clearInterval(tickingRef.current);
      tickingRef.current = null;
    };
  }, [enabled, ping]);

  return {
    ...health,
    markCallsDegraded,
    markChatDegraded,
  };
};
