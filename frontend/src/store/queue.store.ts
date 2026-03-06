import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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

export const useQueueStore = create<QueueState>()(
  persist(
    (set, get) => ({
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
          const fallback = queue.map((_, i) => i);
          const activeOrder =
            shuffledIndices.length === queue.length ? shuffledIndices : shuffleArray(fallback);
          const pos = activeOrder.indexOf(currentIndex);
          const nextPos = activeOrder.length > 0 ? (pos + 1) % activeOrder.length : 0;
          if (nextPos === 0 && repeat === 'none') return; // end
          set({ currentIndex: activeOrder[nextPos], shuffledIndices: activeOrder });
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
          const fallback = queue.map((_, i) => i);
          const activeOrder =
            shuffledIndices.length === queue.length ? shuffledIndices : shuffleArray(fallback);
          const pos = activeOrder.indexOf(currentIndex);
          const prevPos =
            activeOrder.length > 0 ? (pos - 1 + activeOrder.length) % activeOrder.length : 0;
          set({ currentIndex: activeOrder[prevPos], shuffledIndices: activeOrder });
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
    }),
    {
      name: 'player-queue-storage',
      partialize: (state) => ({
        queue: state.queue,
        currentIndex: state.currentIndex,
        shuffle: state.shuffle,
        repeat: state.repeat,
        shuffledIndices: state.shuffledIndices,
      }),
      merge: (persistedState, currentState) => {
        const incoming = persistedState as Partial<QueueState> | undefined;
        if (!incoming) return currentState;

        const queue = Array.isArray(incoming.queue) ? incoming.queue : currentState.queue;
        const maxIndex = queue.length - 1;
        const currentIndex =
          typeof incoming.currentIndex === 'number'
            ? Math.min(Math.max(incoming.currentIndex, queue.length ? 0 : -1), maxIndex)
            : currentState.currentIndex;

        const rawOrder = Array.isArray(incoming.shuffledIndices) ? incoming.shuffledIndices : [];
        const validOrder =
          rawOrder.length === queue.length &&
          new Set(rawOrder).size === queue.length &&
          rawOrder.every((idx) => idx >= 0 && idx < queue.length);
        const repeat: RepeatMode =
          incoming.repeat === 'one' || incoming.repeat === 'all' || incoming.repeat === 'none'
            ? incoming.repeat
            : currentState.repeat;

        return {
          ...currentState,
          ...incoming,
          queue,
          currentIndex,
          shuffle: Boolean(incoming.shuffle),
          repeat,
          shuffledIndices: validOrder ? rawOrder : shuffleArray(queue.map((_, i) => i)),
        };
      }
    },
  ),
);
