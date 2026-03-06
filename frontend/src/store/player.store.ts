import { create } from 'zustand';
import { Track } from '../types';
import { useQueueStore } from './queue.store';

interface PlayerState {
  isPlaying: boolean;
  volume: number; // 0-1
  muted: boolean;
  currentTime: number; // seconds
  duration: number; // seconds
  buffered: number; // seconds
  error: string | null;
  audioEl: HTMLAudioElement | null;
  audioCtx: AudioContext | null;
  analyser: AnalyserNode | null;

  // Actions
  setAudioEl: (el: HTMLAudioElement) => void;
  play: (track?: Track) => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  setCurrentTime: (t: number) => void;
  setDuration: (d: number) => void;
  setBuffered: (b: number) => void;
  setError: (err: string | null) => void;
  initAudioContext: () => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  isPlaying: false,
  volume: 0.8,
  muted: false,
  currentTime: 0,
  duration: 0,
  buffered: 0,
  error: null,
  audioEl: null,
  audioCtx: null,
  analyser: null,

  setAudioEl: (el) => set({ audioEl: el }),

  play: (track) => {
    const { audioEl } = get();
    if (!audioEl) return;

    if (track) {
      // Pause first to abort any pending play() promise and avoid AbortError
      audioEl.pause();
      const streamUrl = `/api/stream/${track.provider}/${track.providerId}`;
      audioEl.src = streamUrl;
      audioEl.load();
    }

    audioEl.play().catch((err) => {
      // AbortError is expected when switching tracks rapidly — not a real error
      if ((err as DOMException).name === 'AbortError') return;
      set({ error: String(err), isPlaying: false });
    });
    set({ isPlaying: true, error: null });
  },

  pause: () => {
    const { audioEl } = get();
    audioEl?.pause();
    set({ isPlaying: false });
  },

  togglePlay: () => {
    const { isPlaying, audioEl } = get();
    if (!audioEl?.src) {
      // Play current track from queue
      const track = useQueueStore.getState().currentTrack();
      if (track) get().play(track);
      return;
    }
    if (isPlaying) get().pause();
    else get().play();
  },

  seek: (time) => {
    const { audioEl } = get();
    if (audioEl) {
      audioEl.currentTime = time;
      set({ currentTime: time });
    }
  },

  setVolume: (vol) => {
    const { audioEl } = get();
    if (audioEl) audioEl.volume = vol;
    set({ volume: vol, muted: vol === 0 });
  },

  toggleMute: () => {
    const { audioEl, muted, volume } = get();
    if (!audioEl) return;
    const newMuted = !muted;
    audioEl.muted = newMuted;
    set({ muted: newMuted });
    if (!newMuted && volume === 0) {
      get().setVolume(0.5);
    }
  },

  setCurrentTime: (t) => set({ currentTime: t }),
  setDuration: (d) => set({ duration: d }),
  setBuffered: (b) => set({ buffered: b }),
  setError: (err) => set({ error: err }),

  initAudioContext: () => {
    const { audioEl, audioCtx } = get();
    if (audioCtx || !audioEl) return;

    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(audioEl);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;

    source.connect(analyser);
    analyser.connect(ctx.destination);

    set({ audioCtx: ctx, analyser });
  },
}));
