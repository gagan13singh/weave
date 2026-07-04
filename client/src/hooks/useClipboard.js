/**
 * useClipboard Hook
 * 
 * Copies text to clipboard with auto-clear after a timeout.
 * Critical for a password manager — don't leave passwords
 * sitting in the clipboard indefinitely.
 */

import { useState, useCallback, useRef } from 'react';

const useClipboard = (clearAfterMs = 30000) => {
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef(null);
  const intervalRef = useRef(null);

  const copy = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setCountdown(Math.ceil(clearAfterMs / 1000));

      // Clear any existing timers
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);

      // Countdown timer
      intervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Auto-clear clipboard
      timerRef.current = setTimeout(async () => {
        try {
          await navigator.clipboard.writeText('');
        } catch {
          // Clipboard API may not be available for clearing
        }
        setCopied(false);
        setCountdown(0);
        clearInterval(intervalRef.current);
      }, clearAfterMs);

      return true;
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      return false;
    }
  }, [clearAfterMs]);

  const clearClipboard = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    try {
      await navigator.clipboard.writeText('');
    } catch {}
    setCopied(false);
    setCountdown(0);
  }, []);

  return { copy, copied, countdown, clearClipboard };
};

export default useClipboard;
