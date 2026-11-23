"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { isProxiedMediaUrl, loadMediaBlob } from "@/lib/media/blob-cache";

/**
 * WhatsApp-style voice note: round play button, a waveform you can click
 * to seek (played part highlighted), elapsed / total time, and a 1× /
 * 1.5× / 2× speed toggle.
 *
 * The waveform is computed in the browser from the real audio (Web
 * Audio `decodeAudioData`, RMS per bar), lazily once the bubble scrolls
 * into view, and cached per URL. If decoding isn't possible (e.g. a
 * browser without Ogg/Opus decode, or a fetch error) it falls back to a
 * stable pseudo-waveform derived from the message id, so the bubble
 * still looks right and remains seekable.
 */

const BAR_COUNT = 40;
const SPEEDS = [1, 1.5, 2] as const;

const waveformCache = new Map<string, Promise<number[] | null>>();

async function computeWaveform(url: string): Promise<number[] | null> {
  try {
    const blob = isProxiedMediaUrl(url)
      ? await loadMediaBlob(url)
      : await (await fetch(url)).blob();
    const buffer = await blob.arrayBuffer();
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    try {
      const audio = await ctx.decodeAudioData(buffer);
      const data = audio.getChannelData(0);
      const size = Math.max(1, Math.floor(data.length / BAR_COUNT));
      const bars: number[] = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        let sum = 0;
        const start = i * size;
        for (let j = 0; j < size && start + j < data.length; j++) {
          const v = data[start + j];
          sum += v * v;
        }
        bars.push(Math.sqrt(sum / size));
      }
      const peak = Math.max(...bars, 0.0001);
      return bars.map((b) => Math.max(0.08, b / peak));
    } finally {
      void ctx.close();
    }
  } catch {
    return null;
  }
}

function loadWaveform(url: string): Promise<number[] | null> {
  let p = waveformCache.get(url);
  if (!p) {
    p = computeWaveform(url);
    waveformCache.set(url, p);
  }
  return p;
}

/** Deterministic "speech-like" bars for when decoding isn't available. */
function fallbackWaveform(seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const r = ((h >>> 0) % 1000) / 1000;
    // Envelope: quieter at the edges, like a spoken clip.
    const env = Math.sin((Math.PI * (i + 0.5)) / BAR_COUNT) * 0.6 + 0.4;
    bars.push(Math.max(0.12, r * env));
  }
  return bars;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

export function VoiceNote({
  src,
  seed,
  outgoing,
  labels,
}: {
  src: string;
  /** Stable id used for the fallback waveform. */
  seed: string;
  outgoing: boolean;
  labels: { play: string; pause: string; speed: string };
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [bars, setBars] = useState<number[]>(() => fallbackWaveform(seed));
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(0);

  // Decode the real waveform once the bubble is near the viewport.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        void loadWaveform(src).then((real) => {
          if (!cancelled && real) setBars(real);
        });
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [src]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      // Only one voice note plays at a time, like WhatsApp.
      document.querySelectorAll<HTMLAudioElement>("audio[data-voice-note]").forEach((a) => {
        if (a !== audio) a.pause();
      });
      void audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }, []);

  const seek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      audio.currentTime = ratio * duration;
      setCurrent(audio.currentTime);
    },
    [duration],
  );

  const cycleSpeed = useCallback(() => {
    setSpeedIndex((i) => {
      const next = (i + 1) % SPEEDS.length;
      if (audioRef.current) audioRef.current.playbackRate = SPEEDS[next];
      return next;
    });
  }, []);

  const progress = duration > 0 ? current / duration : 0;
  const speed = SPEEDS[speedIndex];

  return (
    <div ref={rootRef} className="flex w-[260px] max-w-full items-center gap-2.5 py-0.5 pr-1">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        data-voice-note=""
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        className="hidden"
      />

      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? labels.pause : labels.play}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-wa-icon transition-colors hover:bg-black/5"
      >
        {playing ? (
          <Pause className="h-6 w-6 fill-current" />
        ) : (
          <Play className="ml-0.5 h-6 w-6 fill-current" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div
          role="slider"
          tabIndex={0}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(current)}
          aria-label={labels.play}
          onClick={seek}
          onKeyDown={(e) => {
            const audio = audioRef.current;
            if (!audio || !duration) return;
            if (e.key === "ArrowRight") audio.currentTime = Math.min(duration, audio.currentTime + 5);
            if (e.key === "ArrowLeft") audio.currentTime = Math.max(0, audio.currentTime - 5);
          }}
          className="flex h-7 cursor-pointer items-center gap-[2px]"
        >
          {bars.map((h, i) => {
            const played = (i + 0.5) / bars.length <= progress;
            return (
              <span
                key={i}
                className={cn(
                  "w-[3px] flex-1 rounded-full transition-colors",
                  played
                    ? outgoing
                      ? "bg-wa-tick"
                      : "bg-wa-green"
                    : "bg-wa-text-2/40",
                )}
                style={{ height: `${Math.round(h * 100)}%` }}
              />
            );
          })}
        </div>
        <div className="mt-0.5 flex items-center justify-between text-[12px] text-wa-meta">
          <span>{formatTime(playing || current > 0 ? current : duration)}</span>
          {(playing || current > 0) && (
            <button
              type="button"
              onClick={cycleSpeed}
              aria-label={labels.speed}
              title={labels.speed}
              className="rounded-full bg-black/10 px-1.5 text-[10px] font-semibold text-wa-text"
            >
              {speed}×
            </button>
          )}
        </div>
      </div>

      <span className="relative shrink-0">
        <span
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full",
            outgoing ? "bg-wa-green/20" : "bg-wa-surface",
          )}
        >
          <Mic className={cn("h-5 w-5", outgoing ? "text-wa-green" : "text-wa-icon")} />
        </span>
      </span>
    </div>
  );
}
