import { useCallback, useEffect, useState } from 'react';
import http from '../http';

const POLL_INTERVAL_MS = 60_000;

/**
 * Loads dashboard metrics and keeps them fresh.
 * - Polls every 60s, but skips the fetch while the tab is hidden (saves battery/requests).
 * - Distinguishes permission errors from generic failures.
 * - Exposes `reload` for manual refresh / retry.
 */
export function useDashboardMetrics(windowDays) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    try {
      // windowDays governs the history/trend series only; omitted callers keep the
      // server default, so the shared StatBand needs no change.
      const { data } = await http.get('/api/dashboard/metrics', {
        params: windowDays ? { windowDays } : undefined,
      });
      setMetrics(data);
      setUpdatedAt(new Date());
      setError(null);
    } catch (e) {
      const status = e.response?.status;
      setError(
        status === 401 || status === 403
          ? 'You do not have permission to view these metrics.'
          : e.response?.data?.error || 'Failed to load dashboard metrics.'
      );
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useEffect(() => {
    // Fetching on mount is the sanctioned use of an effect; state updates happen
    // after the await, not synchronously, so the rule's warning is a false positive here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  return { metrics, loading, error, updatedAt, reload: load };
}
