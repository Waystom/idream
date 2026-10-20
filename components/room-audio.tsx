"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, LoaderCircle, Music2, Pause, Play, Timer, Volume1, Volume2 } from "lucide-react";

export const roomTracks = [
  { id: "drift", name: "浮光", title: "Living Voyage", src: "/audio/living-voyage.mp3" },
  { id: "dream", name: "入梦", title: "Dreams Become Real", src: "/audio/dreams-become-real.mp3" }
] as const;

export type RoomTrack = (typeof roomTracks)[number]["id"];
const preferencesKey = "idream.audio.v1";

export function useRoomAudio() {
  const [trackId, setTrackId] = useState<RoomTrack>("drift");
  const [volume, setVolumeState] = useState(0.22);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [sleepAt, setSleepAt] = useState(0);
  const [now, setNow] = useState(0);
  const element = useRef<HTMLAudioElement | null>(null);
  const selected = useRef<RoomTrack>("drift");
  const level = useRef(0.22);
  const desired = useRef(false);
  const generation = useRef(0);
  const frame = useRef(0);

  const fade = useCallback((target: number, duration: number, complete?: () => void) => {
    cancelAnimationFrame(frame.current);
    const audio = element.current;
    if (!audio) return;
    const start = audio.volume;
    const started = performance.now();
    function tick(time: number) {
      if (!audio) return;
      const fraction = Math.min(1, (time - started) / duration);
      audio.volume = Math.max(0, Math.min(1, start + (target - start) * fraction));
      if (fraction < 1) frame.current = requestAnimationFrame(tick);
      else complete?.();
    }
    frame.current = requestAnimationFrame(tick);
  }, []);

  const stop = useCallback(() => {
    generation.current += 1;
    desired.current = false;
    setPlaying(false);
    setLoading(false);
    setSleepAt(0);
    const audio = element.current;
    fade(0, 350, () => audio?.pause());
  }, [fade]);

  const play = useCallback((id: RoomTrack = selected.current) => {
    const track = roomTracks.find((item) => item.id === id)!;
    const version = ++generation.current;
    desired.current = true;
    selected.current = id;
    setTrackId(id);
    setError("");
    setLoading(true);
    cancelAnimationFrame(frame.current);
    let audio = element.current;
    if (!audio) {
      audio = new Audio();
      audio.loop = true;
      audio.preload = "none";
      audio.onplaying = () => { setPlaying(true); setLoading(false); };
      audio.onwaiting = () => { if (desired.current) setLoading(true); };
      audio.onpause = () => { if (element.current?.paused) { desired.current = false; setPlaying(false); setSleepAt(0); } };
      audio.onerror = () => { desired.current = false; setPlaying(false); setLoading(false); setSleepAt(0); setError("音乐暂时无法播放，请点击播放重试。"); };
      element.current = audio;
    }
    if (audio.getAttribute("src") !== track.src) {
      audio.pause();
      audio.src = track.src;
    }
    audio.volume = 0;
    // Call play in the click handler so mobile browsers retain the user gesture.
    void audio.play().then(() => {
      if (generation.current === version && desired.current) fade(level.current, 900);
    }).catch(() => {
      if (generation.current !== version) return;
      desired.current = false;
      setLoading(false);
      setPlaying(false);
      setSleepAt(0);
      setError("音乐暂时无法播放，请点击播放重试。");
    });
  }, [fade]);

  const toggle = useCallback(() => {
    if (desired.current) stop();
    else play();
  }, [play, stop]);

  const setVolume = useCallback((value: number) => {
    const next = Math.max(0, Math.min(1, value));
    level.current = next;
    setVolumeState(next);
    if (desired.current) fade(next, 150);
  }, [fade]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(preferencesKey) || "null");
      if (stored && roomTracks.some((track) => track.id === stored.trackId)) {
        selected.current = stored.trackId;
        setTrackId(stored.trackId);
      }
      if (stored && typeof stored.volume === "number" && Number.isFinite(stored.volume)) {
        level.current = Math.max(0, Math.min(1, stored.volume));
        setVolumeState(level.current);
      }
    } catch { /* Playback remains available when browser storage is restricted. */ }
    setReady(true);
    return () => {
      generation.current += 1;
      cancelAnimationFrame(frame.current);
      element.current?.pause();
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(preferencesKey, JSON.stringify({ trackId, volume })); } catch { /* Preferences are optional. */ }
  }, [ready, trackId, volume]);

  useEffect(() => {
    if (!sleepAt) return;
    const tick = () => {
      const time = Date.now();
      setNow(time);
      if (time >= sleepAt) stop();
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [sleepAt, stop]);

  return {
    track: roomTracks.find((track) => track.id === trackId)!,
    volume, playing, loading, error, toggle, play, stop, setVolume,
    sleepMinutes: sleepAt ? Math.max(1, Math.ceil((sleepAt - now) / 60000)) : 0,
    setSleep: (minutes: number) => { setNow(Date.now()); setSleepAt(minutes ? Date.now() + minutes * 60000 : 0); }
  };
}

export type RoomAudioState = ReturnType<typeof useRoomAudio>;

export function MusicControls({ audio }: { audio: RoomAudioState }) {
  const timerId = useId();
  return (
    <div className="music-controls">
      <div className="music-now-playing">
        <span className="music-artwork"><Music2 size={22} strokeWidth={1.25} /></span>
        <div className="min-w-0 flex-1"><p className="font-serif text-xl">{audio.track.name}</p><p className="mt-1 text-xs dream-muted">{audio.track.title}</p></div>
        <button type="button" onClick={audio.toggle} className="music-play" aria-label={audio.playing || audio.loading ? "暂停背景音乐" : "播放背景音乐"} title={audio.playing || audio.loading ? "暂停背景音乐" : "播放背景音乐"}>
          {audio.loading ? <LoaderCircle size={19} className="animate-spin" /> : audio.playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
        </button>
      </div>
      <div className="music-track-list" role="group" aria-label="选择背景音乐">
        {roomTracks.map((track, index) => <button key={track.id} type="button" aria-pressed={audio.track.id === track.id} onClick={() => audio.play(track.id)}>
          <span className="text-xs tabular-nums dream-muted">0{index + 1}</span><span className="flex-1 text-left">{track.name}</span><span className="music-track-title">{track.title}</span>{audio.track.id === track.id ? <Check size={14} /> : <span className="w-3.5" />}
        </button>)}
      </div>
      <label className="music-volume"><Volume1 size={16} /><input aria-label="背景音乐音量" type="range" min="0" max="1" step="0.01" value={audio.volume} onChange={(event) => audio.setVolume(Number(event.target.value))} /><Volume2 size={16} /><span className="w-8 text-right tabular-nums">{Math.round(audio.volume * 100)}%</span></label>
      <div className="music-timer"><label className="inline-flex items-center gap-2" htmlFor={timerId}><Timer size={15} />定时关闭</label><select id={timerId} aria-label="音乐定时关闭" disabled={!audio.playing} value={audio.sleepMinutes ? "active" : "0"} onChange={(event) => audio.setSleep(Number(event.target.value))}>{audio.sleepMinutes ? <option value="active">约 {audio.sleepMinutes} 分钟后</option> : null}<option value="0">不定时</option><option value="15">15 分钟</option><option value="30">30 分钟</option><option value="60">60 分钟</option></select></div>
      {audio.error ? <p role="alert" className="mt-3 text-xs leading-6 text-[color:var(--dream-danger)]">{audio.error}</p> : null}
      <p className="music-credit">Music by Kevin MacLeod · <a href="/audio/credits.txt" target="_blank" rel="noreferrer">来源与授权</a></p>
    </div>
  );
}

export function RoomAudioMenu({ audio }: { audio: RoomAudioState }) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function close(event: PointerEvent) {
      if (details.current && !details.current.contains(event.target as Node)) details.current.open = false;
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <details ref={details} className="room-audio-menu" onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); } }}>
      <summary title="背景音乐" aria-label="背景音乐"><Music2 size={16} /><span>{audio.playing ? audio.track.name : "背景音乐"}</span>{audio.playing ? <span className="music-playing-dot" /> : <ChevronDown size={12} />}</summary>
      <div className="music-popover"><MusicControls audio={audio} /></div>
    </details>
  );
}
