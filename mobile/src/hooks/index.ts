import { useEffect, useState } from 'react';

/** Seconds remaining from `from` down to 0; restart by changing `key`. */
export function useCountdown(from: number, key: unknown = 0) {
  const [left, setLeft] = useState(from);
  useEffect(() => {
    setLeft(from);
    const t = setInterval(() => setLeft((s) => (s <= 1 ? (clearInterval(t), 0) : s - 1)), 1000);
    return () => clearInterval(t);
  }, [from, key]);
  return left;
}

/** Seconds elapsed since `startIso` (ticks every second). */
export function useElapsed(startIso?: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return startIso ? Math.max(0, Math.floor((now - new Date(startIso).getTime()) / 1000)) : 0;
}

export const formatDuration = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h > 0 ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
