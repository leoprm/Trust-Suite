import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'hermes_tooltips_seen';

interface TooltipState {
  create_need: boolean;
  join_tree: boolean;
  take_task: boolean;
}

function readSeen(): TooltipState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeSeen(partial: Partial<TooltipState>) {
  try {
    const current = readSeen();
    const next = { ...current, ...partial };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage may be unavailable
  }
}

/**
 * Tracks which onboarding tooltip highlights should be shown.
 * Highlights appear ONCE per user in localStorage — dismissing
 * them (5s timeout or click) marks them as seen forever.
 *
 * Usage:
 *   const { highlightCreateNeed, highlightJoinTree, highlightTakeTask, dismiss } = useOnboardingTooltips();
 *   <button className={highlightCreateNeed ? 'onboarding-highlight' : ''} onClick={() => { /* action * /; dismiss('create_need'); }}>
 */
export default function useOnboardingTooltips() {
  const [seen, setSeen] = useState<TooltipState>(readSeen);

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const keys: (keyof TooltipState)[] = ['create_need', 'join_tree', 'take_task'];

    for (const key of keys) {
      if (!seen[key]) {
        const timer = setTimeout(() => {
          dismiss(key);
        }, 5000);
        timers.push(timer);
      }
    }

    return () => timers.forEach(clearTimeout);
  }, [seen]);

  const dismiss = useCallback((key: keyof TooltipState) => {
    writeSeen({ [key]: true });
    setSeen(prev => ({ ...prev, [key]: true }));
  }, []);

  return {
    /** true → apply .onboarding-highlight class to Crear Necesidad button */
    highlightCreateNeed: !seen.create_need,
    /** true → apply .onboarding-highlight class to Unirse button on tree cards */
    highlightJoinTree: !seen.join_tree,
    /** true → apply .onboarding-highlight class to Tomar Tarea button */
    highlightTakeTask: !seen.take_task,
    /** Mark one key as seen (call on click or let the 5s timeout handle it) */
    dismiss,
  };
}
