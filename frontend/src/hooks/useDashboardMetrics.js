import { useCallback, useEffect, useState } from 'react';
import http from '../http';

const POLL_INTERVAL_MS = 60_000;

// The window the dashboard opens on. Exported and used as the default argument so
// every consumer asks for the SAME series and therefore shares one store - see the
// note below. Previously an omitted argument fell through to the server's own
// default of 12 (routes/dashboard.js), which silently split the callers apart.
export const DEFAULT_WINDOW_DAYS = 7;

/**
 * Loads dashboard metrics and keeps them fresh.
 * - Polls every 60s, but skips the fetch while the tab is hidden (saves battery/requests).
 * - Distinguishes permission errors from generic failures.
 * - Exposes `reload` for manual refresh / retry.
 *
 * ONE REQUEST PER WINDOW, SHARED BETWEEN CONSUMERS.
 *
 * Each call used to own a fetch and a 60s interval. Two components consume this -
 * the Dashboard page and the StatBand in the app shell (App.jsx) - so a staff user
 * sitting on the dashboard issued two GETs on mount and then four requests a
 * minute to the same endpoint, for payloads that differ only in the length of the
 * history series. That is the "fast loading" cost of the duplication, and it also
 * meant the two views could disagree for up to a minute while their independent
 * pollers drifted apart.
 *
 * Now each distinct windowDays has one store: the first subscriber starts the
 * request and the timer, later subscribers attach to the same data and re-render
 * from it, and the timer is cleared when the last subscriber unmounts.
 */
const stores = new Map();

function getStore(key) {
  let store = stores.get(key);
  if (!store) {
    store = {
      key,
      metrics: null,
      loading: true,
      error: null,
      updatedAt: null,
      listeners: new Set(),
      timer: null,
      inflight: null,
    };
    stores.set(key, store);
  }
  return store;
}

function fetchInto(store) {
  // Share the in-flight promise: two components mounting in the same tick make one
  // request between them rather than one each.
  if (store.inflight) return store.inflight;

  store.inflight = (async () => {
    try {
      const { data } = await http.get('/api/dashboard/metrics', {
        params: { windowDays: store.key },
      });
      store.metrics = data;
      store.updatedAt = new Date();
      store.error = null;
    } catch (e) {
      const status = e.response?.status;
      store.error = status === 401 || status === 403
        ? 'You do not have permission to view these metrics.'
        : e.response?.data?.error || 'Failed to load dashboard metrics.';
    } finally {
      store.loading = false;
      store.inflight = null;
      store.listeners.forEach(notify => notify());
    }
  })();

  return store.inflight;
}

export function useDashboardMetrics(windowDays = DEFAULT_WINDOW_DAYS) {
  const store = getStore(windowDays);
  // A counter purely to re-render this subscriber when the shared store changes.
  const [, bump] = useState(0);

  useEffect(() => {
    const notify = () => bump(n => n + 1);
    store.listeners.add(notify);

    // Only the first subscriber triggers work. A later one attaches to whatever the
    // store already holds, so switching pages does not re-fetch what is in hand.
    if (store.metrics === null && !store.inflight) fetchInto(store);
    if (!store.timer) {
      store.timer = setInterval(() => {
        if (!document.hidden) fetchInto(store);
      }, POLL_INTERVAL_MS);
    }

    return () => {
      store.listeners.delete(notify);
      if (store.listeners.size === 0 && store.timer) {
        clearInterval(store.timer);
        store.timer = null;
      }
    };
  }, [store]);

  const reload = useCallback(() => fetchInto(store), [store]);

  return {
    metrics: store.metrics,
    loading: store.loading,
    error: store.error,
    updatedAt: store.updatedAt,
    reload,
  };
}
