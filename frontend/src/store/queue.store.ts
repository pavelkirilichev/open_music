import { create } from 'zustand';
import { Track, RepeatMode } from '../types';

interface QueueState {
  queue: Track[];
  currentIndex: number;
  shuffle: boolean;
  repeat: RepeatMode;
  shuffledIndices: number[];

  // Actions
  setQueue: (tracks: Track[], startIndex?: number) => void;
  addToQueue: (track: Track) => void;
  addNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  goToIndex: (index: number) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  toggleShuffle: () => void;
  setRepeat: (mode: RepeatMode) => void;
  clearQueue: () => void;

  // Derived
  currentTrack: () => Track | null;
  hasNext: () => boolean;
  hasPrev: () => boolean;
}

function shuffleArray(arr: number[]): number[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const useQueueStore = create<QueueState>((set, get) => ({
  queue: [],
  currentIndex: -1,
  shuffle: false,
  repeat: 'none',
  shuffledIndices: [],

  setQueue: (tracks, startIndex = 0) => {
    const indices = tracks.map((_, i) => i);
    set({
      queue: tracks,
      currentIndex: startIndex,
      shuffledIndices: shuffleArray(indices),
    });
  },

  addToQueue: (track) => {
    set((s) => ({
      queue: [...s.queue, track],
      shuffledIndices: shuffleArray([...s.queue, track].map((_, i) => i)),
    }));
  },

  addNext: (track) => {
    set((s) => {
      const next = [...s.queue];
      next.splice(s.currentIndex + 1, 0, track);
      return {
        queue: next,
        shuffledIndices: shuffleArray(next.map((_, i) => i)),
      };
    });
  },

  removeFromQueue: (index) => {
    set((s) => {
      const next = [...s.queue];
      next.splice(index, 1);
      const currentIndex = index < s.currentIndex ? s.currentIndex - 1 : s.currentIndex;
      return {
        queue: next,
        currentIndex: Math.min(currentIndex, next.length - 1),
        shuffledIndices: shuffleArray(next.map((_, i) => i)),
      };
    });
  },

  goToIndex: (index) => set({ currentIndex: index }),

  nextTrack: () => {
    const { queue, currentIndex, shuffle, repeat, shuffledIndices } = get();
    if (queue.length === 0) return;

    if (repeat === 'one') {
      // Stay on current
      set({ currentIndex });
      return;
    }

    if (shuffle) {
      const pos = shuffledIndices.indexOf(currentIndex);
      const nextPos = (pos + 1) % shuffledIndices.length;
      if (nextPos === 0 && repeat === 'none') return; // end
      set({ currentIndex: shuffledIndices[nextPos] });
    } else {
      const next = currentIndex + 1;
      if (next >= queue.length) {
        if (repeat === 'all') set({ currentIndex: 0 });
        // else: stop
      } else {
        set({ currentIndex: next });
      }
    }
  },

  prevTrack: () => {
    const { queue, currentIndex, shuffle, shuffledIndices } = get();
    if (queue.length === 0) return;

    if (shuffle) {
      const pos = shuffledIndices.indexOf(currentIndex);
      const prevPos = (pos - 1 + shuffledIndices.length) % shuffledIndices.length;
      set({ currentIndex: shuffledIndices[prevPos] });
    } else {
      set({ currentIndex: Math.max(0, currentIndex - 1) });
    }
  },

  toggleShuffle: () => {
    set((s) => ({
      shuffle: !s.shuffle,
      shuffledIndices: shuffleArray(s.queue.map((_, i) => i)),
    }));
  },

  setRepeat: (mode) => set({ repeat: mode }),

  clearQueue: () => set({ queue: [], currentIndex: -1, shuffledIndices: [] }),

  currentTrack: () => {
    const { queue, currentIndex } = get();
    return currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;
  },

  hasNext: () => {
    const { queue, currentIndex, repeat } = get();
    return repeat !== 'none' || currentIndex < queue.length - 1;
  },

  hasPrev: () => {
    const { currentIndex } = get();
    return currentIndex > 0;
  },
}));
