import { useState, useEffect, useRef, useMemo } from "react";
import { auth, dashboard, agents, transcripts, compliance, reports, live, authExtra, simulation } from "./api";

// ── RESPONSIVE HOOK ──────────────────────────────────────────────
function useMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return isMobile;
}

// ── THEME ────────────────────────────────────────────────────────
const t = {
  bg: "#0A0E1A", surface: "#111827", surface2: "#162032",
  border: "#1E2D45", amber: "#F59E0B", blue: "#3B82F6",
  green: "#10B981", red: "#EF4444", purple: "#8B5CF6",
  text: "#F1F5F9", muted: "#64748B",
};

const S = {
  page:  { background: t.bg, minHeight: "100vh", color: t.text, fontFamily: "system-ui, sans-serif" },
  card:  { background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: 20 },
  input: { width: "100%", padding: "10px 14px", background: t.surface2, border: `1px solid ${t.border}`, borderRadius: 8, color: t.text, fontSize: 14, outline: "none", boxSizing: "border-box" },
  btn:   { padding: "10px 20px", background: t.amber, color: "#000", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 14 },
  ghost: { padding: "9px 18px", background: "transparent", border: `1px solid ${t.border}`, borderRadius: 8, color: t.muted, cursor: "pointer", fontSize: 13 },
  label: { color: t.muted, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, display: "block", marginBottom: 6 },
  sec:   { color: t.muted, fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 },
};

// ── HELPERS ──────────────────────────────────────────────────────
function Badge({ score }) {
  const c = score >= 85 ? t.green : score >= 70 ? t.amber : t.red;
  return <span style={{ background: c + "22", color: c, border: `1px solid ${c}44`, borderRadius: 6, padding: "2px 10px", fontSize: 13, fontWeight: 700 }}>{score}</span>;
}
function Tag({ label, color = t.muted }) {
  return <span style={{ background: color + "20", color, border: `1px solid ${color}33`, borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>{label}</span>;
}
function Bar({ value, max = 10, color }) {
  return (
    <div style={{ background: t.border, borderRadius: 4, height: 6, margin: "4px 0 10px" }}>
      <div style={{ width: `${(value / max) * 100}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.8s ease" }} />
    </div>
  );
}

function StudioAudioPlayer({ filename }) {
  console.log(`[StudioAudioPlayer] Rendered with filename:`, filename);
  
  // ✓ All hooks MUST be called unconditionally at top, NO early returns
  const audioRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const audioContextRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waveData, setWaveData] = useState(new Array(26).fill(20));
  const [bufferProgress, setBufferProgress] = useState(0);

  const mime = filename?.endsWith(".ogg") ? "audio/ogg" : "audio/webm";
  const src = useMemo(
    () => filename ? `${process.env.REACT_APP_API_URL || "http://localhost:8000"}/uploads/${filename}` : "",
    [filename]
  );

  const fmt = (secs) => {
    if (!Number.isFinite(secs) || secs < 0) return "00:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Initialize Web Audio API for real waveform analysis
  const initAudioContext = () => {
    if (audioContextRef.current) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioCtx.createMediaElementAudioSource(audioRef.current);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    } catch (e) {
      console.warn("Web Audio API not available:", e);
    }
  };

  // Update waveform bars from analyser frequency data
  const updateWaveform = () => {
    if (!analyserRef.current || !dataArrayRef.current) return;
    analyserRef.current.getByteFrequencyData(dataArrayRef.current);
    const data = dataArrayRef.current;
    const newWave = Array.from({ length: 26 }).map((_, i) => {
      const binStart = Math.floor((i / 26) * data.length);
      const binEnd = Math.floor(((i + 1) / 26) * data.length);
      const avgEnergy = data.slice(binStart, binEnd).reduce((a, b) => a + b, 0) / (binEnd - binStart);
      return 18 + (avgEnergy / 255) * 82;
    });
    setWaveData(newWave);
  };

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    console.log(`[Audio Load] Starting for filename: ${filename}`);
    console.log(`[Audio Load] URL: ${src}`);

    setReady(false);
    setError("");
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    const onLoaded = () => {
      console.log(`[Audio Event] loadedmetadata/canplay/durationchange fired`);
      if (Number.isFinite(a.duration) && a.duration > 0) {
        console.log(`[Audio Load] Duration detected: ${a.duration}s`);
        setDuration(a.duration);
        setReady(true);
      }
    };
    const onTime = () => setCurrentTime(Number.isFinite(a.currentTime) ? a.currentTime : 0);
    const onEnded = () => {
      setIsPlaying(false);
      setWaveData(new Array(26).fill(20));
    };
    const onErr = () => {
      console.error(`[Audio Error] Error loading audio:`, a.error);
      setError("Audio stream is unavailable right now.");
      setReady(false);
      setIsPlaying(false);
    };
    const onProgress = () => {
      if (Number.isFinite(a.duration) && a.duration > 0) {
        setDuration(a.duration);
        if (a.buffered.length > 0) {
          const bufferedEnd = a.buffered.end(a.buffered.length - 1);
          const pct = (bufferedEnd / a.duration) * 100;
          console.log(`[Audio Buffer] ${pct.toFixed(1)}% buffered`);
          setBufferProgress(Math.min(pct, 100));
          if (pct >= 90) {
            console.log(`[Audio Ready] Buffer threshold reached`);
            setReady(true);
          }
        }
      }
    };

    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("canplay", onLoaded);
    a.addEventListener("durationchange", onLoaded);
    a.addEventListener("progress", onProgress);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", onEnded);
    a.addEventListener("error", onErr);
    
    // Let React handle src via JSX <source> element, just trigger load
    // Avoid setting a.src directly when using <source> elements
    console.log(`[Audio Load] Calling load() to start buffering`);
    a.load();

    // Fallback: Poll for duration every 200ms for up to 5 seconds
    const durationPoll = setInterval(() => {
      if (Number.isFinite(a.duration) && a.duration > 0) {
        console.log(`[Audio Poll] Duration detected via polling: ${a.duration}s`);
        setDuration(a.duration);
        setReady(true);
        clearInterval(durationPoll);
      }
    }, 200);

    return () => {
      console.log(`[Audio Unmount] Cleaning up for filename: ${filename}`);
      clearInterval(durationPoll);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("canplay", onLoaded);
      a.removeEventListener("durationchange", onLoaded);
      a.removeEventListener("progress", onProgress);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("error", onErr);
    };
  }, [src, filename]);

  useEffect(() => {
    if (!isPlaying || !analyserRef.current) return;
    let rafId;
    const animate = () => {
      updateWaveform();
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying]);

  const togglePlay = async () => {
    const a = audioRef.current;
    if (!a || (duration === 0 && !ready)) return;
    setError("");
    if (isPlaying) {
      a.pause();
      setIsPlaying(false);
      return;
    }
    try {
      initAudioContext();
      await a.play();
      setIsPlaying(true);
    } catch (err) {
      setError("Playback error. Check if file is loading. Try again.");
      setIsPlaying(false);
    }
  };

  const onSeek = (e) => {
    const a = audioRef.current;
    if (!a) return;
    const next = Number(e.target.value);
    a.currentTime = next;
    setCurrentTime(next);
  };

  const progressMax = duration > 0 ? duration : 1;
  const progressNow = currentTime > 0 ? currentTime : 0;

  return !filename ? (
    <div style={{ color: "#EF4444", fontSize: 13, padding: 12 }}>❌ No audio file associated with this call</div>
  ) : (
    <div style={{
      border: `1px solid ${t.border}`,
      borderRadius: 12,
      padding: 12,
      background: "linear-gradient(130deg,#111827 0%,#132138 48%,#1A2740 100%)",
      boxShadow: "inset 0 0 0 1px rgba(245,158,11,0.08)",
    }}>
      <audio key={filename} ref={audioRef} preload="auto" crossOrigin="anonymous">
        <source src={src} type={mime} />
      </audio>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: 99,
            background: "radial-gradient(circle at 35% 35%,#FCD34D 0%,#F59E0B 45%,#B45309 100%)",
            boxShadow: "0 0 0 2px rgba(245,158,11,0.2)",
          }} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.1, color: t.amber }}>AUDIO STUDIO</div>
            <div style={{ fontSize: 10, color: t.muted }}>Supervisor review playback</div>
          </div>
        </div>
        <Tag label={ready ? "LIVE STREAM" : `BUFFERING ${Math.round(bufferProgress)}%`} color={ready ? t.green : t.amber} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <button
          onClick={togglePlay}
          disabled={!ready && duration === 0}
          style={{
            width: 38,
            height: 38,
            borderRadius: 99,
            border: "none",
            cursor: (ready || duration > 0) ? "pointer" : "not-allowed",
            background: (ready || duration > 0) ? "linear-gradient(145deg,#F59E0B,#D97706)" : t.border,
            color: "#111827",
            fontWeight: 900,
            fontSize: 14,
            boxShadow: (ready || duration > 0) ? "0 8px 20px rgba(245,158,11,0.28)" : "none",
          }}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "II" : ">"}
        </button>

        <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 3, height: 30 }}>
          {Array.from({ length: 26 }).map((_, i) => {
            const pct = isPlaying ? waveData[i] : 20 + ((i % 5) * 7);
            return (
              <div
                key={i}
                style={{
                  width: 4,
                  height: `${pct}%`,
                  borderRadius: 4,
                  background: i % 2 === 0 ? t.amber : t.blue,
                  opacity: ready ? 0.95 : 0.45,
                  transition: "height 100ms linear",
                }}
              />
            );
          })}
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={progressMax}
        step={0.1}
        value={Math.min(progressNow, progressMax)}
        onChange={onSeek}
        disabled={!ready}
        style={{ width: "100%", accentColor: t.amber, margin: "4px 0" }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 3 }}>
        <span style={{ color: t.text, fontSize: 11, fontFamily: "monospace" }}>{fmt(currentTime)}</span>
        <span style={{ color: t.muted, fontSize: 10 }}>{error || (ready ? "Click waveform slider to scrub" : "Preparing audio stream...")}</span>
        <span style={{ color: t.text, fontSize: 11, fontFamily: "monospace" }}>{fmt(duration)}</span>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  LOGIN
// ════════════════════════════════════════════════════════════════
function Login({ onLogin }) {
  const isMobile = useMobile();
  const [email, setEmail] = useState("");
  const [pass,  setPass]  = useState("");
  const [role,  setRole]  = useState("supervisor");
  const [err,   setErr]   = useState("");
  const [busy,  setBusy]  = useState(false);

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const params = new URLSearchParams();
      params.append("username", email);
      params.append("password", pass);
      const res = await auth.login(params);
      // Enforce role selection: if selected role does not match returned role, show error
      if (res.data.role !== role) {
        setErr(
          `You selected '${role}' but these credentials are for a '${res.data.role}'. Please select the correct role or use the correct credentials.`
        );
        setBusy(false);
        return;
      }
      localStorage.setItem("token", res.data.access_token);
      localStorage.setItem("role",  res.data.role);
      localStorage.setItem("name",  res.data.name);
      onLogin(res.data);
    } catch (e) {
      setErr(e.response?.data?.detail || "Login failed. Check credentials.");
    } finally { setBusy(false); }
  };

  return (
    <div style={{ ...S.page, display: "flex", flexDirection: isMobile ? "column" : "row" }}>
      {/* Left panel – hidden on mobile */}
      {!isMobile && <div style={{ width: "42%", background: "linear-gradient(135deg,#0A0E1A,#0F1E35)", padding: 60, display: "flex", flexDirection: "column", justifyContent: "center", borderRight: `1px solid ${t.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 48 }}>
          <div style={{ width: 44, height: 44, background: t.amber, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🎧</div>
          <span style={{ fontSize: 24, fontWeight: 800 }}>AIPCSQA</span>
        </div>
        <h2 style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.3, marginBottom: 16 }}>
          Every conversation.<br /><span style={{ color: t.amber }}>Scored. Improved.<br />Secured.</span>
        </h2>
        <p style={{ color: t.muted, fontSize: 14, lineHeight: 1.8, marginBottom: 48 }}>
          AI-powered quality auditing for enterprise customer support teams.
        </p>
        {[["2.4M","Calls Audited"],["98.3%","Compliance Rate"],["47%","QA Time Saved"]].map(([n, l]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
            <span style={{ color: t.amber, fontWeight: 800, fontSize: 22, fontFamily: "monospace", minWidth: 70 }}>{n}</span>
            <span style={{ color: t.muted, fontSize: 13 }}>{l}</span>
          </div>
        ))}
      </div>}
      {/* Right panel */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "40px 24px" : 60 }}>
        <div style={{ width: "100%", maxWidth: 400 }}>
          <h3 style={{ fontSize: 26, fontWeight: 800, marginBottom: 6 }}>Welcome back</h3>
          <p style={{ color: t.muted, fontSize: 14, marginBottom: 32 }}>Sign in to your dashboard</p>
          {/* Role toggle */}
          <div style={{ display: "flex", background: t.surface2, borderRadius: 8, padding: 4, marginBottom: 28, border: `1px solid ${t.border}` }}>
            {["supervisor","agent"].map(r => (
              <button key={r} onClick={() => setRole(r)} style={{ flex: 1, padding: "9px 0", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: role === r ? t.amber : "transparent", color: role === r ? "#000" : t.muted, textTransform: "capitalize", transition: "all 0.2s" }}>{r}</button>
            ))}
          </div>
          <label style={S.label}>EMAIL</label>
          <input style={{ ...S.input, marginBottom: 16 }} value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" onKeyDown={e => e.key === "Enter" && submit()} />
          <label style={S.label}>PASSWORD</label>
          <input style={{ ...S.input, marginBottom: 24 }} type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === "Enter" && submit()} />
          {err && <div style={{ color: t.red, fontSize: 13, marginBottom: 14, padding: "8px 12px", background: t.red + "15", borderRadius: 6 }}>{err}</div>}
          <button style={{ ...S.btn, width: "100%", padding: "14px 0", fontSize: 15 }} onClick={submit} disabled={busy}>
            {busy ? "Signing in..." : `Sign In as ${role.charAt(0).toUpperCase() + role.slice(1)} →`}
          </button>
          <p style={{ color: t.muted, fontSize: 12, textAlign: "center", marginTop: 20 }}>
            New agent? Ask your supervisor to register your account.
          </p>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  SUPERVISOR LAYOUT + SCREENS
// ════════════════════════════════════════════════════════════════
function SupervisorNav({ screen, setScreen, name, onLogout }) {
  const isMobile = useMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = [["📊","Dashboard"],["👥","Agents"],["🔍","Audit"],["🛡️","Compliance"],["📋","Reports"],["📡","Live Monitor"],["👤","Profile"]];
  if (isMobile) {
    return (
      <nav style={{ position: "sticky", top: 0, zIndex: 100, background: t.surface + "f0", backdropFilter: "blur(12px)", borderBottom: `1px solid ${t.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 30, height: 30, background: t.amber, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>🎧</div>
            <span style={{ fontWeight: 800, fontSize: 16 }}>AIPCSQA</span>
          </div>
          <button onClick={() => setMenuOpen(o => !o)} style={{ background: "transparent", border: `1px solid ${t.border}`, borderRadius: 6, color: t.text, fontSize: 18, cursor: "pointer", padding: "4px 10px", lineHeight: 1 }}>{menuOpen ? "✕" : "☰"}</button>
        </div>
        {menuOpen && (
          <div style={{ background: t.surface, borderTop: `1px solid ${t.border}` }}>
            {items.map(([icon, label]) => (
              <button key={label} onClick={() => { setScreen(label); setMenuOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "14px 20px", background: screen === label ? t.amber + "18" : "transparent", border: "none", borderLeft: screen === label ? `3px solid ${t.amber}` : "3px solid transparent", color: screen === label ? t.amber : t.text, fontWeight: screen === label ? 700 : 400, fontSize: 14, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                {icon} {label}
              </button>
            ))}
            <div style={{ padding: "12px 20px", borderTop: `1px solid ${t.border}`, display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
              <button onClick={onLogout} style={{ ...S.ghost, fontSize: 12 }}>Logout</button>
            </div>
          </div>
        )}
      </nav>
    );
  }
  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 100, background: t.surface + "f0", backdropFilter: "blur(12px)", borderBottom: `1px solid ${t.border}`, padding: "0 24px", display: "flex", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 32, paddingRight: 32, borderRight: `1px solid ${t.border}` }}>
        <div style={{ width: 30, height: 30, background: t.amber, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>🎧</div>
        <span style={{ fontWeight: 800, fontSize: 16 }}>AIPCSQA</span>
        <Tag label="SUPERVISOR" color={t.purple} />
      </div>
      {items.map(([icon, label]) => (
        <button key={label} onClick={() => setScreen(label)} style={{ padding: "18px 14px", background: "transparent", border: "none", cursor: "pointer", color: screen === label ? t.amber : t.muted, fontWeight: screen === label ? 700 : 400, fontSize: 13, borderBottom: screen === label ? `2px solid ${t.amber}` : "2px solid transparent", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
          {icon} {label}
        </button>
      ))}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onLogout} style={{ ...S.ghost, fontSize: 12 }}>Logout</button>
      </div>
    </nav>
  );
}


// ── Supervisor Dashboard ─────────────────────────────────────────
function SupervisorDashboard() {
  const isMobile = useMobile();
  const [kpis,    setKpis]    = useState(null);
  const [leaders, setLeaders] = useState([]);
  const [feed,    setFeed]    = useState([]);
  const [dist,    setDist]    = useState(null);

  useEffect(() => {
    dashboard.kpis().then(r => setKpis(r.data)).catch(() => {});
    dashboard.leaderboard().then(r => setLeaders(r.data)).catch(() => {});
    dashboard.activityFeed().then(r => setFeed(r.data)).catch(() => {});
    dashboard.distribution().then(r => setDist(r.data)).catch(() => {});
  }, []);

  const cards = kpis ? [
    { label: "Interactions Audited", value: kpis.interactions_audited, color: t.blue, icon: "📞" },
    { label: "Avg Quality Score",    value: kpis.avg_quality_score,    color: t.amber, icon: "⭐" },
    { label: "Compliance Violations",value: kpis.compliance_violations, color: t.red,  icon: "⚑" },
    { label: "Resolution Rate",      value: kpis.resolution_rate + "%", color: t.green, icon: "✅" },
  ] : [];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Supervisor Dashboard</h1>
        <p style={{ color: t.muted, fontSize: 13 }}>Real-time overview of your team's quality metrics</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
        {cards.map(k => (
          <div key={k.label} style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ color: t.muted, fontSize: 11, fontWeight: 700, letterSpacing: 1.5 }}>{k.label.toUpperCase()}</div>
              <span style={{ fontSize: 18 }}>{k.icon}</span>
            </div>
            <div style={{ color: k.color, fontSize: 32, fontWeight: 800, fontFamily: "monospace" }}>{k.value ?? "—"}</div>
          </div>
        ))}
        {!kpis && [1,2,3,4].map(i => <div key={i} style={{ ...S.card, height: 100 }}><div style={{ color: t.muted, fontSize: 13 }}>Loading...</div></div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        <div style={S.card}>
          <div style={S.sec}>Agent Leaderboard</div>
          {leaders.length === 0 && <div style={{ color: t.muted, fontSize: 13 }}>No agents yet — register agents via API</div>}
          {leaders.map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < leaders.length - 1 ? `1px solid ${t.border}` : "none" }}>
              <span style={{ color: t.muted, fontSize: 13, minWidth: 24 }}>#{a.rank}</span>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: t.amber + "22", display: "flex", alignItems: "center", justifyContent: "center", color: t.amber, fontWeight: 800, fontSize: 12 }}>{a.name?.[0]}</div>
              <span style={{ flex: 1, fontSize: 14 }}>{a.name}</span>
              <span style={{ color: t.muted, fontSize: 12 }}>{a.calls} calls</span>
              <Badge score={Math.round(a.score || 0)} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {dist && (
            <div style={S.card}>
              <div style={S.sec}>Score Distribution (30 days)</div>
              {[["Excellent (85+)", dist.excellent, t.green],["Good (70–84)", dist.good, t.amber],["Needs Work (<70)", dist.needs_work, t.red]].map(([l, d, c]) => (
                <div key={l}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: t.muted, fontSize: 12 }}>{l}</span>
                    <span style={{ color: c, fontWeight: 700, fontSize: 12 }}>{d?.pct || 0}%</span>
                  </div>
                  <Bar value={d?.pct || 0} max={100} color={c} />
                </div>
              ))}
            </div>
          )}
          <div style={S.card}>
            <div style={S.sec}>Activity Feed</div>
            {feed.length === 0 && <div style={{ color: t.muted, fontSize: 13 }}>No recent activity</div>}
            {feed.slice(0, 6).map((f, i) => (
              <div key={i} style={{ padding: "8px 0", borderBottom: i < 5 ? `1px solid ${t.border}` : "none" }}>
                <div style={{ fontSize: 12, color: t.text }}>{f.msg}</div>
                <div style={{ fontSize: 11, color: t.muted, marginTop: 2 }}>{new Date(f.ts).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Supervisor Agents ────────────────────────────────────────────
function SupervisorAgents() {
  const isMobile = useMobile();
  const [agentsTab, setAgentsTab] = useState("agents"); // "agents" | "messages"
  const [unreadCount, setUnreadCount] = useState(0);
  const [list,    setList]    = useState([]);
  const [search,  setSearch]  = useState("");
  const [loading, setLoading] = useState(true);
  // Agent registration form state
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", team: "" });
  const [msg, setMsg] = useState("");
  // State for password reset dialog
  const [resetId, setResetId] = useState(null);
  const [resetPwd, setResetPwd] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  // State for delete agent dialog
  const [deleteId, setDeleteId] = useState(null);
  const [deleteMsg, setDeleteMsg] = useState("");

  // Handler for password reset
  const handleResetPassword = async () => {
    if (!resetPwd) {
      setResetMsg("Please enter a new password.");
      return;
    }
    try {
      await agents.resetPassword(resetId, resetPwd);
      setResetMsg("✅ Password reset successfully.");
      setResetPwd("");
      agents.list({ search, limit: 20 }).then(r => setList(r.data)).catch(() => {});
      setTimeout(() => {
        setResetId(null);
        setResetMsg("");
      }, 1500);
    } catch (e) {
      setResetMsg(e.response?.data?.detail || "Password reset failed.");
    }
  };

  // Handler for agent deletion
  const handleDeleteAgent = async () => {
    try {
      await agents.delete(deleteId);
      setDeleteMsg("✅ Agent deleted successfully.");
      agents.list({ search, limit: 20 }).then(r => setList(r.data)).catch(() => {});
      setTimeout(() => {
        setDeleteId(null);
        setDeleteMsg("");
      }, 1500);
    } catch (e) {
      setDeleteMsg(e.response?.data?.detail || "Agent deletion failed.");
    }
  };

  useEffect(() => {
    agents.list({ search, limit: 20 }).then(r => setList(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    agents.supervisorMessages()
      .then(r => setUnreadCount(r.data.filter(m => m.status === "unread").length))
      .catch(() => {});
  }, [agentsTab]);

  const registerAgent = async () => {
    setMsg("");
    if (!form.name || !form.email || !form.password) {
      setMsg("Please fill all required fields.");
      return;
    }
    try {
      await auth.register(form); // Send as JSON, not FormData
      setMsg("✅ Agent registered successfully.");
      setForm({ name: "", email: "", password: "", team: "" });
      agents.list({ search, limit: 20 }).then(r => setList(r.data)).catch(() => {});
      setTimeout(() => {
        setShowForm(false);
        setMsg("");
      }, 1500);
    } catch (e) {
      setMsg(e.response?.data?.detail || "Registration failed.");
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Agents</h1>
        <div style={{ display: "flex", gap: 4, background: t.surface2, borderRadius: 10, padding: 4, border: `1px solid ${t.border}` }}>
          {[["agents", "👥 Agents"], ["messages", "✉️ Messages"]].map(([key, label]) => (
            <button key={key} onClick={() => setAgentsTab(key)}
              style={{ padding: "6px 16px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: agentsTab === key ? 700 : 400, background: agentsTab === key ? t.amber : "transparent", color: agentsTab === key ? "#000" : t.muted, fontFamily: "inherit", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6 }}>
              {label}
              {key === "messages" && unreadCount > 0 && <span style={{ background: t.red, color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>{unreadCount}</span>}
            </button>
          ))}
        </div>
      </div>
      {agentsTab === "messages" ? <SupervisorMessages /> : <>
      <button style={{ ...S.btn, marginBottom: 18 }} onClick={() => setShowForm(f => !f)}>
        {showForm ? "Cancel" : "Register New Agent"}
      </button>
      {showForm && (
        <div style={{ ...S.card, marginBottom: 24, maxWidth: 400 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Register Agent</h3>
          <label style={S.label}>NAME</label>
          <input style={S.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Agent Name" />
          <label style={S.label}>EMAIL</label>
          <input style={S.input} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Agent Email" />
          <label style={S.label}>PASSWORD</label>
          <input style={S.input} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Set Password" />
          <label style={S.label}>TEAM</label>
          <input style={S.input} value={form.team} onChange={e => setForm(f => ({ ...f, team: e.target.value }))} placeholder="Team (optional)" />
          {msg && <div style={{ color: msg.startsWith("✅") ? t.green : t.red, fontSize: 13, marginTop: 10 }}>{msg}</div>}
          <button style={{ ...S.btn, marginTop: 14 }} onClick={registerAgent}>Register Agent</button>
        </div>
      )}
      <input style={{ ...S.input, maxWidth: 340, marginBottom: 24 }} placeholder="🔍 Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} />
      {loading && <div style={{ color: t.muted }}>Loading...</div>}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 16 }}>
        {list.map(a => (
          <div key={a.id} style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: t.amber + "22", border: `2px solid ${t.amber}44`, display: "flex", alignItems: "center", justifyContent: "center", color: t.amber, fontWeight: 800 }}>{a.name?.[0]}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{a.name}</div>
                  <div style={{ color: t.muted, fontSize: 12 }}>{a.email || "No email"}</div>
                  <div style={{ color: t.muted, fontSize: 12 }}>{a.team || "No team"}</div>
                  <div style={{ color: t.amber, fontSize: 12, fontWeight: 700, marginTop: 2 }}>Agent ID: {a.agent_id || <span style={{ color: t.red }}>Not set</span>}</div>
                  <div style={{ color: t.muted, fontSize: 11, marginTop: 2 }}>UUID: {a.id}</div>
                </div>
              </div>
              <Badge score={Math.round(a.avg_score || 0)} />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Tag label={`${a.total_calls} Calls`} color={t.blue} />
              <Tag label={`${a.violations} Violations`} color={a.violations > 5 ? t.red : t.muted} />
              <Tag label={`${Math.floor((a.avg_handle_time || 0) / 60)}m avg`} color={t.muted} />
            </div>
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
              <button style={{ ...S.ghost, fontSize: 12 }} onClick={() => setResetId(a.id)}>Reset Password</button>
              <button style={{ ...S.ghost, fontSize: 12, color: t.red, borderColor: t.red }} onClick={() => setDeleteId(a.id)}>Delete</button>
            </div>
          </div>
        ))}
        {!loading && list.length === 0 && <div style={{ color: t.muted, gridColumn: "1/-1", padding: 20 }}>No agents found.</div>}
      </div>
      {/* Reset Password Dialog */}
      {resetId && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "#0008", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <div style={{ ...S.card, minWidth: 320 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>Reset Agent Password</h3>
            <input style={S.input} type="password" value={resetPwd} onChange={e => setResetPwd(e.target.value)} placeholder="New password" />
            {resetMsg && <div style={{ color: resetMsg.startsWith("✅") ? t.green : t.red, fontSize: 13, marginTop: 10 }}>{resetMsg}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button style={{ ...S.btn }} onClick={handleResetPassword}>Reset</button>
              <button style={{ ...S.ghost }} onClick={() => { setResetId(null); setResetPwd(""); setResetMsg(""); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Agent Dialog */}
      {deleteId && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "#0008", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <div style={{ ...S.card, minWidth: 320 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 10, color: t.red }}>Delete Agent</h3>
            <div style={{ color: t.muted, fontSize: 13, marginBottom: 14 }}>Are you sure you want to delete this agent? This action cannot be undone.</div>
            {deleteMsg && <div style={{ color: deleteMsg.startsWith("✅") ? t.green : t.red, fontSize: 13, marginBottom: 10 }}>{deleteMsg}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...S.btn, background: t.red, color: "#fff" }} onClick={handleDeleteAgent}>Delete</button>
              <button style={{ ...S.ghost }} onClick={() => { setDeleteId(null); setDeleteMsg(""); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      </>
      }
    </div>
  );
}

// ── Supervisor Audit ─────────────────────────────────────────────
function SupervisorAudit() {
  const isMobile = useMobile();
  const [agentList,  setAgentList]  = useState([]);
  const [selAgent,   setSelAgent]   = useState(null);
  const [list,       setList]       = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [detail,     setDetail]     = useState(null);
  const [loadAgents, setLoadAgents] = useState(true);
  const [loading,    setLoading]    = useState(false);
  const [auditTab,   setAuditTab]   = useState("calls");

  useEffect(() => {
    agents.list({ limit: 100 }).then(r => setAgentList(r.data)).catch(() => {}).finally(() => setLoadAgents(false));
  }, []);

  useEffect(() => {
    if (!selAgent) { setList([]); return; }
    setLoading(true);
    transcripts.list({ agent_id: selAgent.id, limit: 50 })
      .then(r => setList(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, [selAgent]);

  const selectCall = async (call) => {
    setSelected(call.call_id);
    if (isMobile) setAuditTab("transcript");
    try { const r = await transcripts.get(call.call_id); setDetail(r.data); } catch {}
  };

  const resolve = async (vid) => {
    await transcripts.resolveViolation(vid);
    if (selected) { const r = await transcripts.get(selected); setDetail(r.data); }
  };

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>🔍 Audit Review</h1>
      <p style={{ color: t.muted, fontSize: 13, marginBottom: 16 }}>Select an agent to review their call transcripts and AI audit results</p>

      {/* ── Agent Selector ── */}
      <div style={{ ...S.card, marginBottom: 20, display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", flexWrap: "wrap" }}>
        <span style={{ color: t.muted, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, whiteSpace: "nowrap" }}>SELECT AGENT</span>
        <select style={{ ...S.input, maxWidth: 340 }} value={selAgent?.id || ""}
          onChange={e => {
            const a = agentList.find(x => x.id === e.target.value);
            setSelAgent(a || null); setSelected(null); setDetail(null);
          }}>
          <option value="">— Choose an agent to review —</option>
          {agentList.map(a => (
            <option key={a.id} value={a.id}>{a.name} ({a.agent_id || "No ID"}) · Avg {Math.round(a.avg_score || 0)}</option>
          ))}
        </select>
        {loadAgents && <span style={{ color: t.muted, fontSize: 12 }}>Loading agents...</span>}
        {selAgent && (
          <div style={{ display: "flex", gap: 8 }}>
            <Tag label={`${selAgent.total_calls} Calls`} color={t.blue} />
            <Tag label={`Avg ${Math.round(selAgent.avg_score || 0)}`} color={selAgent.avg_score >= 85 ? t.green : selAgent.avg_score >= 70 ? t.amber : t.red} />
            <Tag label={`${selAgent.violations} Violations`} color={selAgent.violations > 5 ? t.red : t.muted} />
          </div>
        )}
      </div>

      {!selAgent ? (
        <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>👆</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: t.muted }}>Select an agent above to begin audit review</div>
        </div>
      ) : (
        <>
          {isMobile && (
            <div style={{ display: "flex", gap: 4, marginBottom: 12, background: t.surface2, borderRadius: 10, padding: 4, border: `1px solid ${t.border}`, overflowX: "auto" }}>
              {[["calls","📋 Calls"],["transcript","💬 Transcript"],["expressions","😊 Expressions"],["audit","🔍 AI Audit"]].map(([key,label]) => (
                <button key={key} onClick={() => setAuditTab(key)} style={{ flex: 1, padding: "8px 4px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 12, fontWeight: auditTab === key ? 700 : 400, background: auditTab === key ? t.amber : "transparent", color: auditTab === key ? "#000" : t.muted, fontFamily: "inherit", transition: "all 0.15s", whiteSpace: "nowrap" }}>{label}</button>
              ))}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "260px 1fr 280px 280px", gap: 16, height: isMobile ? "auto" : 560 }}>
          {/* Call list */}
          <div style={{ ...S.card, padding: 0, overflow: "hidden", display: (isMobile && auditTab !== "calls") ? "none" : "flex", flexDirection: "column", height: isMobile ? 380 : "100%" }}>
            <div style={{ padding: 14, borderBottom: `1px solid ${t.border}`, fontWeight: 700, fontSize: 14 }}>Calls — {selAgent.name}</div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {loading && <div style={{ padding: 14, color: t.muted }}>Loading...</div>}
              {list.map((c, i) => (
                <div key={i} onClick={() => selectCall(c)} style={{ padding: "12px 14px", borderBottom: `1px solid ${t.border}`, cursor: "pointer", background: selected === c.call_id ? t.amber + "18" : "transparent", borderLeft: selected === c.call_id ? `3px solid ${t.amber}` : "3px solid transparent" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{c.call_ref}</span>
                    {c.score != null && <Badge score={Math.round(c.score)} />}
                  </div>
                  <div style={{ color: t.muted, fontSize: 11 }}>{c.status} · {c.channel}</div>
                  <div style={{ color: t.muted, fontSize: 10, marginTop: 2 }}>{new Date(c.created_at).toLocaleDateString()}</div>
                </div>
              ))}
              {!loading && list.length === 0 && <div style={{ padding: 14, color: t.muted, fontSize: 13 }}>No calls for this agent yet</div>}
            </div>
          </div>

          {/* Transcript viewer */}
          <div style={{ ...S.card, padding: 0, display: (isMobile && auditTab !== "transcript") ? "none" : "flex", flexDirection: "column", overflow: "hidden", height: isMobile ? 420 : "100%" }}>
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${t.border}`, fontWeight: 700 }}>{detail ? detail.call.ref : "Select a call"}</div>
            {detail?.call?.audio_filename && (
              <div style={{ padding: "10px 16px", borderBottom: `1px solid ${t.border}`, background: t.surface2 }}>
                <div style={{ fontSize: 11, color: t.muted, marginBottom: 6, fontWeight: 600 }}>AUDIO RECORDING</div>
                <StudioAudioPlayer filename={detail.call.audio_filename} />
              </div>
            )}
            <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {detail?.transcript?.turns?.map((turn, i) => {
                const viol = detail.violations?.find(v => v.turn_index === i);
                return (
                  <div key={i} style={{ display: "flex", justifyContent: turn.role === "agent" ? "flex-end" : "flex-start" }}>
                    <div style={{ maxWidth: "78%" }}>
                      <div style={{ padding: "10px 14px", borderRadius: 10, background: viol ? t.red + "20" : turn.role === "agent" ? t.amber + "22" : t.surface2, border: `1px solid ${viol ? t.red + "44" : t.border}`, fontSize: 13, lineHeight: 1.5 }}>
                        <div style={{ color: t.muted, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>{turn.role.toUpperCase()}</div>
                        {turn.text}
                      </div>
                      {viol && <div style={{ color: t.red, fontSize: 11, marginTop: 4 }}>⚑ {viol.description}</div>}
                    </div>
                  </div>
                );
              })}
              {!detail && <div style={{ color: t.muted, textAlign: "center", marginTop: 60, fontSize: 14 }}>← Select a call to review</div>}
            </div>
          </div>

          {/* Agent Expressions Timeline */}
          <div style={{ ...S.card, padding: 0, display: (isMobile && auditTab !== "expressions") ? "none" : "flex", flexDirection: "column", overflow: "hidden", height: isMobile ? 420 : "100%" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${t.border}`, fontWeight: 700, fontSize: 14 }}>😊 Agent Expressions</div>
            <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
              {detail?.transcript?.turns ? (
                <>
                  {detail.transcript.turns.filter(t => t.role === "agent").map((turn, idx) => {
                    const expr = turn.expression || {};
                    const timeStr = turn.ts_start !== undefined && turn.ts_end !== undefined 
                      ? `${Math.floor(turn.ts_start)}s - ${Math.floor(turn.ts_end)}s`
                      : "Unknown";
                    const toneColor = expr.tone === "positive" ? t.green : expr.tone === "negative" ? t.red : t.muted;
                    const profColor = expr.professionalism === "high" ? t.green : expr.professionalism === "low" ? t.red : t.amber;
                    const engageColor = expr.engagement === "high" ? t.green : expr.engagement === "low" ? t.red : t.amber;
                    // Emoji mapping - expressions only (no tone duplicates)
                    const expressionEmoji = {
                      "helpful": "🤝", "empathetic": "💙", "patient": "⏳", "frustrated": "😤",
                      "confused": "🤔", "professional": "💼", "enthusiastic": "🚀", "passive": "😐"
                    };
                    const toneEmoji = { "positive": "😊", "negative": "😞", "neutral": "😐" };
                    const profEmoji = { "high": "⭐", "medium": "✓", "low": "⚠️" };
                    const engageEmoji = { "high": "🔥", "medium": "▬", "low": "❄️" };
                    const currentExpr = expr.expression || "neutral";
                    const currentTone = expr.tone || "neutral";
                    const currentProf = expr.professionalism || "medium";
                    const currentEngage = expr.engagement || "medium";
                    // Determine if tone should be shown separately (avoid duplication with expression)
                    const showTone = !["helpful", "empathetic", "patient", "frustrated", "confused", "professional", "enthusiastic", "passive"].includes(currentExpr);
                    return (
                      <div key={idx} style={{ marginBottom: 10, padding: 10, background: t.surface2, borderRadius: 8, border: `1px solid ${t.border}`, fontSize: 11 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 20 }}>{expressionEmoji[currentExpr] || toneEmoji[currentTone] || "😐"}</span>
                            <span style={{ color: t.amber, fontWeight: 700, fontSize: 12 }}>Turn #{idx + 1}</span>
                          </div>
                          <span style={{ color: t.muted, fontSize: 10 }}>{timeStr}</span>
                        </div>
                        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                          {currentExpr && currentExpr !== "neutral" && <Tag label={`${expressionEmoji[currentExpr]} ${currentExpr}`} color={expr.tone === "positive" ? t.green : expr.tone === "negative" ? t.red : t.blue} />}
                          {showTone && <Tag label={`${toneEmoji[currentTone]} ${currentTone}`} color={toneColor} />}
                          <Tag label={`${profEmoji[currentProf]} Professionalism: ${currentProf}`} color={profColor} />
                          <Tag label={`${engageEmoji[currentEngage]} Engagement: ${currentEngage}`} color={engageColor} />
                        </div>
                        <div style={{ color: t.text, fontSize: 10, lineHeight: 1.4, maxHeight: 44, overflow: "hidden", background: t.surface, padding: 6, borderRadius: 4 }}>
                          {turn.text}
                        </div>
                      </div>
                    );
                  })}
                  {detail.transcript.turns.filter(t => t.role === "agent").length === 0 && (
                    <div style={{ color: t.muted, fontSize: 12, textAlign: "center", marginTop: 40 }}>No agent responses found</div>
                  )}
                </>
              ) : <div style={{ color: t.muted, fontSize: 13, textAlign: "center", marginTop: 60 }}>← Select a call to view expressions</div>}
            </div>
          </div>

          {/* AI Audit panel */}
          <div style={{ ...S.card, padding: 0, display: (isMobile && auditTab !== "audit") ? "none" : "flex", flexDirection: "column", overflow: "hidden", height: isMobile ? 420 : "100%" }}>
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${t.border}`, fontWeight: 700, fontSize: 14 }}>AI Audit</div>
            <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
              {detail?.audit ? (
                <>
                  <div style={S.sec}>Score Breakdown</div>
                  {Object.entries(detail.audit.dimensions).map(([k, v]) => (
                    <div key={k}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: t.muted, fontSize: 12, textTransform: "capitalize" }}>{k}</span>
                        <span style={{ color: v >= 7 ? t.green : v >= 5 ? t.amber : t.red, fontWeight: 700, fontSize: 12 }}>{v}/10</span>
                      </div>
                      <Bar value={v} max={10} color={v >= 7 ? t.green : v >= 5 ? t.amber : t.red} />
                    </div>
                  ))}
                  <div style={{ margin: "14px 0", height: 1, background: t.border }} />
                  <div style={S.sec}>Violations ({detail.violations.length})</div>
                  {detail.violations.map((v, i) => (
                    <div key={i} style={{ marginBottom: 8, padding: 10, background: t.red + "10", borderRadius: 8, border: `1px solid ${t.red}30` }}>
                      <div style={{ color: t.red, fontWeight: 700, fontSize: 12 }}>{v.type}</div>
                      <div style={{ color: t.muted, fontSize: 11, marginTop: 2 }}>{v.severity} · {v.status}</div>
                      {v.status === "open" && <button onClick={() => resolve(v.id)} style={{ marginTop: 6, padding: "3px 10px", background: "transparent", border: `1px solid ${t.green}`, borderRadius: 5, color: t.green, fontSize: 11, cursor: "pointer" }}>✓ Resolve</button>}
                    </div>
                  ))}
                  <div style={{ margin: "14px 0", height: 1, background: t.border }} />
                  <div style={S.sec}>AI Suggestions</div>
                  {detail.audit.suggestions?.map((s, i) => (
                    <div key={i} style={{ marginBottom: 8, padding: 10, background: t.green + "10", borderRadius: 8, border: `1px solid ${t.green}30`, fontSize: 11, color: t.text, lineHeight: 1.6 }}>
                      <span style={{ color: t.green, fontWeight: 700 }}>{i + 1}. </span>{s.suggestion}
                    </div>
                  ))}
                </>
              ) : <div style={{ color: t.muted, fontSize: 13 }}>Select a call to view AI audit</div>}
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  );
}

// ── Supervisor Compliance ────────────────────────────────────────
function SupervisorCompliance() {
  const isMobile = useMobile();
  const [overview,   setOverview]   = useState(null);
  const [breakdown,  setBreakdown]  = useState([]);
  const [alertsList, setAlertsList] = useState([]);

  useEffect(() => {
    compliance.overview().then(r => setOverview(r.data)).catch(() => {});
    compliance.breakdown().then(r => setBreakdown(r.data)).catch(() => {});
    compliance.alerts().then(r => setAlertsList(r.data)).catch(() => {});
  }, []);

  const resolve = async (id) => {
    await transcripts.resolveViolation(id);
    compliance.alerts().then(r => setAlertsList(r.data)).catch(() => {});
  };

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 20 }}>Compliance</h1>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "200px 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ ...S.card, textAlign: "center" }}>
          <div style={S.sec}>Score</div>
          <div style={{ color: (overview?.compliance_score || 0) >= 95 ? t.green : t.amber, fontSize: 40, fontWeight: 800, fontFamily: "monospace" }}>{overview?.compliance_score ?? "—"}%</div>
          <div style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>Target: 95%</div>
          <div style={{ color: t.red, fontSize: 13, marginTop: 8 }}>🚨 {overview?.critical_today ?? 0} critical today</div>
        </div>
        <div style={S.card}>
          <div style={S.sec}>Violation Breakdown</div>
          {breakdown.map((v, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <span style={{ color: t.muted, fontSize: 12, minWidth: 220 }}>{v.type}</span>
              <div style={{ flex: 1, background: t.border, borderRadius: 4, height: 8 }}>
                <div style={{ width: `${v.pct}%`, height: "100%", background: v.pct > 25 ? t.red : t.amber, borderRadius: 4 }} />
              </div>
              <span style={{ color: t.amber, fontWeight: 700, fontSize: 13, minWidth: 28 }}>{v.count}</span>
            </div>
          ))}
          {breakdown.length === 0 && <div style={{ color: t.muted, fontSize: 13 }}>No violations recorded yet</div>}
        </div>
      </div>
      <div style={S.card}>
        <div style={S.sec}>Critical Alerts</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>{["Time","Agent","Call","Violation","Severity","Status",""].map(h => <th key={h} style={{ color: t.muted, fontSize: 11, textAlign: "left", paddingBottom: 10 }}>{h}</th>)}</tr></thead>
          <tbody>
            {alertsList.map((a, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${t.border}` }}>
                <td style={{ padding: "10px 0", color: t.muted }}>{new Date(a.detected_at).toLocaleTimeString()}</td>
                <td style={{ color: t.text }}>{a.agent}</td>
                <td style={{ color: t.text }}>{a.call_ref}</td>
                <td style={{ color: t.text }}>{a.type}</td>
                <td style={{ color: a.severity === "Critical" ? t.red : t.amber, fontWeight: 700 }}>{a.severity}</td>
                <td style={{ color: a.status === "open" ? t.red : t.green, fontWeight: 700 }}>{a.status}</td>
                <td>{a.status === "open" && <button onClick={() => resolve(a.id)} style={{ ...S.ghost, fontSize: 11, padding: "4px 10px" }}>Resolve</button>}</td>
              </tr>
            ))}
            {alertsList.length === 0 && <tr><td colSpan={7} style={{ padding: "20px 0", color: t.muted }}>No critical alerts 🎉</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Supervisor Reports ───────────────────────────────────────────
function SupervisorReports() {
  const isMobile = useMobile();
  const [agentList, setAgentList] = useState([]);
  const [form, setForm] = useState({
    title: "", report_type: "agent_performance", agent_id: "",
    supervisor_comment: "", date_from: "", date_to: "", format: "json", metrics: [],
  });
  const [list, setList] = useState([]);
  const [msg,  setMsg]  = useState("");

  useEffect(() => {
    reports.list().then(r => setList(r.data)).catch(() => {});
    agents.list({ limit: 100 }).then(r => setAgentList(r.data)).catch(() => {});
  }, []);

  const generate = async () => {
    if (!form.title)    { setMsg("Please enter a report title"); return; }
    if (!form.agent_id) { setMsg("Please select an agent"); return; }
    if (!form.date_from || !form.date_to) { setMsg("Please select both From and To dates"); return; }
    if (form.date_from > form.date_to)    { setMsg("'From' date must be before 'To' date"); return; }
    try {
      await reports.generate(form);
      setMsg("✅ Agent report queued!");
      setTimeout(() => reports.list().then(r => setList(r.data)).catch(() => {}), 2500);
    } catch { setMsg("❌ Failed to generate report"); }
  };

  const viewReport = async (id, title) => {
    try {
      const r = await reports.download(id);
      const text = await r.data.text();
      const data = JSON.parse(text);
      // Open in a new tab as formatted JSON
      const win = window.open("", "_blank");
      win.document.write(`<pre style="background:#0A0E1A;color:#F1F5F9;padding:24px;font-size:13px;font-family:monospace;white-space:pre-wrap">${JSON.stringify(data, null, 2)}</pre>`);
      win.document.title = title || "Report";
    } catch { alert("Could not load report data"); }
  };

  const viewReportPdf = async (id) => {
    try {
      const r = await reports.viewPdf(id);
      const url = URL.createObjectURL(r.data);
      window.open(url, "_blank");
    } catch { alert("Could not generate PDF report"); }
  };

  const deleteReport = async (id) => {
    if (!window.confirm("Delete this report? This cannot be undone.")) return;
    try {
      await reports.remove(id);
      setList(prev => prev.filter(r => r.id !== id));
    } catch { alert("Failed to delete report"); }
  };

  const reportTypeInfo = {
    agent_performance: { label: "Agent Performance",  color: t.blue,   desc: "Overall scores, dimension breakdown, trends & improvement tips" },
    compliance:        { label: "Compliance Report",   color: t.red,    desc: "Violations log, severity breakdown & compliance rate" },
    scorecard:         { label: "Scorecard",           color: t.amber,  desc: "Letter-grade scorecard for each quality dimension" },
    custom:            { label: "Full Audit Report",   color: t.purple, desc: "Comprehensive report covering all dimensions, violations & history" },
  };

  const selAgent = agentList.find(a => a.id === form.agent_id);
  const selType  = reportTypeInfo[form.report_type] || {};

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 20 }}>Reports</h1>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "400px 1fr", gap: 16 }}>
        {/* ── Builder ── */}
        <div style={S.card}>
          <div style={S.sec}>Agent Report Builder</div>

          <label style={S.label}>SELECT AGENT</label>
          <select style={{ ...S.input, marginBottom: selAgent ? 10 : 14 }} value={form.agent_id}
            onChange={e => setForm(f => ({ ...f, agent_id: e.target.value }))}>
            <option value="">— Choose an agent —</option>
            {agentList.map(a => (
              <option key={a.id} value={a.id}>{a.name} ({a.agent_id || "No ID"})</option>
            ))}
          </select>
          {selAgent && (
            <div style={{ marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Tag label={`Avg ${Math.round(selAgent.avg_score || 0)}`} color={selAgent.avg_score >= 85 ? t.green : selAgent.avg_score >= 70 ? t.amber : t.red} />
              <Tag label={`${selAgent.total_calls} Calls`} color={t.blue} />
              <Tag label={`${selAgent.violations} Violations`} color={selAgent.violations > 5 ? t.red : t.muted} />
            </div>
          )}

          <label style={S.label}>REPORT TITLE</label>
          <input style={{ ...S.input, marginBottom: 14 }} placeholder="Q1 Agent Performance Review"
            value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />

          <label style={S.label}>REPORT TYPE</label>
          <select style={{ ...S.input, marginBottom: selType.desc ? 6 : 14 }} value={form.report_type}
            onChange={e => setForm(f => ({ ...f, report_type: e.target.value }))}>
            {Object.entries(reportTypeInfo).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          {selType.desc && (
            <div style={{ fontSize: 11, color: t.muted, marginBottom: 14, padding: "6px 10px", background: t.surface2, borderRadius: 6, border: `1px solid ${(selType.color || t.border)}33` }}>
              {selType.desc}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={S.label}>FROM DATE</label>
              <input type="date" style={S.input} value={form.date_from}
                onChange={e => setForm(f => ({ ...f, date_from: e.target.value }))} />
            </div>
            <div>
              <label style={S.label}>TO DATE</label>
              <input type="date" style={S.input} value={form.date_to}
                max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split("T")[0]}
                onChange={e => setForm(f => ({ ...f, date_to: e.target.value }))} />
            </div>
          </div>

          <label style={S.label}>SUPERVISOR COMMENT</label>
          <textarea
            style={{ ...S.input, marginBottom: 16, minHeight: 100, resize: "vertical", lineHeight: 1.7 }}
            placeholder="Add personal feedback, commendations, areas of improvement, or any notes for this agent that will appear in their report..."
            value={form.supervisor_comment}
            onChange={e => setForm(f => ({ ...f, supervisor_comment: e.target.value }))}
          />

          {msg && <div style={{ color: msg.startsWith("✅") ? t.green : t.red, fontSize: 12, marginBottom: 10 }}>{msg}</div>}
          <button style={{ ...S.btn, width: "100%" }} onClick={generate}>Generate Agent Report →</button>
        </div>

        {/* ── Reports list ── */}
        <div style={S.card}>
          <div style={S.sec}>Generated Reports</div>
          {isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {list.map((r, i) => (
                <div key={i} style={{ padding: "12px 0", borderBottom: `1px solid ${t.border}` }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{r.title}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 4 }}>
                    <Tag label={(reportTypeInfo[r.type]?.label || (r.type || "").replace(/_/g, " "))} color={reportTypeInfo[r.type]?.color || t.blue} />
                    <Tag label={r.ready ? "Ready" : "Processing"} color={r.ready ? t.green : t.amber} />
                  </div>
                  <div style={{ color: t.muted, fontSize: 11, marginBottom: 6 }}>{r.agent_name || "—"} · {new Date(r.created_at).toLocaleDateString()}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {r.ready && (
                      <>
                        <button onClick={() => viewReportPdf(r.id)} style={{ ...S.ghost, fontSize: 11, padding: "4px 10px", color: t.blue, borderColor: t.blue }}>📄 PDF</button>
                        <button onClick={() => viewReport(r.id, r.title)} style={{ ...S.ghost, fontSize: 11, padding: "4px 10px" }}>⬇ View</button>
                      </>
                    )}
                    <button onClick={() => deleteReport(r.id)} style={{ ...S.ghost, fontSize: 11, padding: "4px 10px", color: t.red, borderColor: t.red }}>🗑 Delete</button>
                  </div>
                </div>
              ))}
              {list.length === 0 && <div style={{ color: t.muted, fontSize: 13 }}>No reports yet — generate one for an agent above</div>}
            </div>
          ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>{["Title", "Agent", "Type", "Date", "Size", "Status", ""].map(h => (
                <th key={h} style={{ color: t.muted, fontSize: 11, textAlign: "left", paddingBottom: 10 }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${t.border}` }}>
                  <td style={{ padding: "10px 0", color: t.text, fontWeight: 600 }}>{r.title}</td>
                  <td style={{ color: t.muted, fontSize: 12, paddingRight: 8 }}>{r.agent_name || "—"}</td>
                  <td><Tag label={(reportTypeInfo[r.type]?.label || (r.type || "").replace(/_/g, " "))} color={reportTypeInfo[r.type]?.color || t.blue} /></td>
                  <td style={{ color: t.muted }}>{new Date(r.created_at).toLocaleDateString()}</td>
                  <td style={{ color: t.muted }}>{r.size || "—"}</td>
                  <td style={{ color: r.ready ? t.green : t.amber }}>{r.ready ? "Ready" : "Processing"}</td>
                  <td style={{ display: "flex", gap: 6, alignItems: "center", padding: "10px 0" }}>
                    {r.ready && (
                      <>
                        <button onClick={() => viewReportPdf(r.id)} style={{ ...S.ghost, fontSize: 11, padding: "4px 10px", color: t.blue, borderColor: t.blue }}>📄 PDF</button>
                        <button onClick={() => viewReport(r.id, r.title)} style={{ ...S.ghost, fontSize: 11, padding: "4px 10px" }}>⬇ View</button>
                      </>
                    )}
                    <button onClick={() => deleteReport(r.id)} style={{ ...S.ghost, fontSize: 11, padding: "4px 10px", color: t.red, borderColor: t.red }}>🗑 Delete</button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={7} style={{ padding: "20px 0", color: t.muted }}>No reports yet — generate one for an agent above</td></tr>
              )}
            </tbody>
          </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Supervisor Live Monitor ──────────────────────────────────────
function SupervisorLiveMonitor() {
  const isMobile = useMobile();
  const [calls,  setCalls]  = useState([]);
  const [events, setEvents] = useState([]);
  const wsRef = useRef(null);

  useEffect(() => {
    live.activeCalls().then(r => setCalls(r.data)).catch(() => {});
    wsRef.current = new WebSocket("ws://localhost:8000/live/ws/all");
    wsRef.current.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        setEvents(prev => [data, ...prev].slice(0, 20));
        if (data.event === "audit_complete") live.activeCalls().then(r => setCalls(r.data)).catch(() => {});
      } catch {}
    };
    return () => wsRef.current?.close();
  }, []);

  const sendWhisper = async (call) => {
    try {
      const r = await live.whisper({ call_id: call.call_id, recent_turns: [], current_turn: { role: "agent", text: "..." } });
      alert("✅ Whisper sent: " + r.data.suggestion);
    } catch { alert("Whisper failed — call may not be active"); }
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: t.green, boxShadow: `0 0 8px ${t.green}`, animation: "pulse 2s infinite" }} />
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Live Monitor</h1>
        <span style={{ color: t.muted, fontSize: 13 }}>· {calls.length} active calls</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 300px", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
          {calls.map((c, i) => (
            <div key={i} style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{c.call_ref}</div>
                  <div style={{ color: t.muted, fontSize: 12 }}>⏱ {c.duration_sec}s · {c.channel}</div>
                </div>
                {c.score && <Badge score={Math.round(c.score)} />}
              </div>
              <div style={{ color: c.sentiment === "positive" ? t.green : c.sentiment === "negative" ? t.red : t.muted, fontSize: 12, marginBottom: 12 }}>
                {c.sentiment === "positive" ? "😊" : c.sentiment === "negative" ? "😠" : "😐"} {c.sentiment || "analyzing..."}
              </div>
              <button onClick={() => sendWhisper(c)} style={{ width: "100%", padding: "8px 0", background: "transparent", border: `1px solid ${t.amber}`, borderRadius: 7, color: t.amber, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                🎧 Send Whisper Coaching
              </button>
            </div>
          ))}
          {calls.length === 0 && <div style={{ ...S.card, color: t.muted, gridColumn: "1/-1" }}>No active calls right now</div>}
        </div>
        <div style={S.card}>
          <div style={S.sec}>Real-time Events</div>
          {events.length === 0 && <div style={{ color: t.muted, fontSize: 13 }}>Waiting for events...</div>}
          {events.map((e, i) => (
            <div key={i} style={{ padding: "8px 0", borderBottom: `1px solid ${t.border}`, fontSize: 12 }}>
              <div style={{ color: e.event === "audit_complete" ? t.green : t.amber, fontWeight: 700 }}>{e.event}</div>
              <div style={{ color: t.muted, fontSize: 11 }}>{e.call_ref}{e.score ? ` · Score: ${e.score}` : ""}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SupervisorMessages() {
  const isMobile = useMobile();
  const [msgs, setMsgs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    agents.supervisorMessages()
      .then(r => setMsgs(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const markRead = async (msg) => {
    if (msg.status === "unread") {
      await agents.markMessageRead(msg.id).catch(() => {});
      setMsgs(prev => prev.map(m => m.id === msg.id ? { ...m, status: "read" } : m));
    }
    setSelected(msg);
  };

  const unread = msgs.filter(m => m.status === "unread").length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        {unread > 0 && <span style={{ background: t.red, color: "#fff", borderRadius: 12, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>{unread} unread</span>}
        {unread === 0 && msgs.length > 0 && <span style={{ color: t.muted, fontSize: 13 }}>All messages read</span>}
      </div>
      {loading ? <div style={{ color: t.muted }}>Loading...</div> : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "320px 1fr", gap: 16, minHeight: 400 }}>
          <div style={{ ...S.card, padding: 0, overflowY: "auto", maxHeight: 600 }}>
            {msgs.length === 0 && <div style={{ padding: 24, color: t.muted }}>No messages yet.</div>}
            {msgs.map(m => (
              <div key={m.id} onClick={() => markRead(m)}
                style={{ padding: "14px 16px", borderBottom: `1px solid ${t.border}`, cursor: "pointer",
                  background: selected?.id === m.id ? t.border : m.status === "unread" ? t.bg : "transparent" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: m.status === "unread" ? 700 : 400, fontSize: 14 }}>{m.agent_ref}</span>
                  {m.status === "unread" && <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.green, display: "inline-block" }} />}
                </div>
                <div style={{ fontSize: 13, color: t.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.subject}</div>
                <div style={{ fontSize: 11, color: t.muted, marginTop: 4 }}>{new Date(m.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
          <div style={S.card}>
            {!selected ? (
              <div style={{ color: t.muted, display: "flex", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 200 }}>Select a message to read</div>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{selected.subject}</div>
                  <div style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>From: {selected.agent_name} ({selected.agent_ref}) · {new Date(selected.created_at).toLocaleString()}</div>
                </div>
                <div style={{ background: t.bg, borderRadius: 8, padding: 16, lineHeight: 1.7, fontSize: 14, whiteSpace: "pre-wrap" }}>{selected.body}</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Supervisor Profile ──────────────────────────────────────────
function SupervisorProfile({ user }) {
  const isMobile = useMobile();
  const [oldPwd, setOldPwd]   = useState("");
  const [newPwd, setNewPwd]   = useState("");
  const [newPwd2, setNewPwd2] = useState("");
  const [pwdMsg, setPwdMsg]   = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);

  const changePassword = async () => {
    setPwdMsg("");
    if (!oldPwd || !newPwd || !newPwd2) { setPwdMsg("Please fill all fields."); return; }
    if (newPwd !== newPwd2) { setPwdMsg("New passwords do not match."); return; }
    if (newPwd.length < 6)  { setPwdMsg("Password must be at least 6 characters."); return; }
    setPwdBusy(true);
    try {
      await authExtra.changePassword(oldPwd, newPwd);
      setPwdMsg("✅ Password changed successfully.");
      setOldPwd(""); setNewPwd(""); setNewPwd2("");
    } catch (e) {
      setPwdMsg(e.response?.data?.detail || "Password change failed.");
    } finally { setPwdBusy(false); }
  };

  const fields = user ? [
    { label: "Full Name",     value: user.name,                                              icon: "👤" },
    { label: "Email Address", value: user.email,                                             icon: "📧" },
    { label: "Role",          value: user.role,                                              icon: "🛡️", highlight: true },
    { label: "Team",          value: user.team || "—",                                       icon: "👥" },
  ] : [];

  return (
    <div style={{ padding: 24, maxWidth: 680 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>👤 My Profile</h1>
      <p style={{ color: t.muted, fontSize: 13, marginBottom: 24 }}>Your account details and security settings</p>

      {/* Avatar + name card */}
      <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 20, marginBottom: 20, background: t.purple + "12", border: `1px solid ${t.purple}33` }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: t.purple + "33", border: `2px solid ${t.purple}66`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, color: t.purple }}>{user?.name?.[0]?.toUpperCase()}</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 20 }}>{user?.name}</div>
          <div style={{ color: t.muted, fontSize: 13 }}>{user?.email}</div>
          <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
            <Tag label="SUPERVISOR" color={t.purple} />
            {user?.team && <Tag label={user.team} color={t.amber} />}
          </div>
        </div>
      </div>

      {/* Detail fields */}
      <div style={{ ...S.card, marginBottom: 20 }}>
        <div style={S.sec}>Account Details</div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 0 }}>
          {fields.map((f) => (
            <div key={f.label} style={{ padding: "14px 0", borderBottom: `1px solid ${t.border}`, paddingRight: 16 }}>
              <div style={{ color: t.muted, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, marginBottom: 4 }}>{f.icon} {f.label.toUpperCase()}</div>
              <div style={{ fontSize: 14, fontWeight: f.highlight ? 800 : 500, color: f.highlight ? t.purple : t.text }}>{f.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Change Password */}
      <div style={S.card}>
        <div style={S.sec}>🔒 Change Password</div>
        <label style={S.label}>CURRENT PASSWORD</label>
        <input style={{ ...S.input, marginBottom: 12 }} type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} placeholder="Current password" />
        <label style={S.label}>NEW PASSWORD</label>
        <input style={{ ...S.input, marginBottom: 12 }} type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="New password (min 6 chars)" />
        <label style={S.label}>CONFIRM NEW PASSWORD</label>
        <input style={{ ...S.input, marginBottom: 16 }} type="password" value={newPwd2} onChange={e => setNewPwd2(e.target.value)} placeholder="Repeat new password" />
        {pwdMsg && <div style={{ fontSize: 13, marginBottom: 12, color: pwdMsg.startsWith("✅") ? t.green : t.red }}>{pwdMsg}</div>}
        <button style={{ ...S.btn }} onClick={changePassword} disabled={pwdBusy}>
          {pwdBusy ? "Updating..." : "Update Password"}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  AGENT LAYOUT + SCREENS
// ════════════════════════════════════════════════════════════════
// ── Agent Profile ────────────────────────────────────────────────
function AgentProfile({ user }) {
  const isMobile = useMobile();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  // Password change
  const [oldPwd, setOldPwd]   = useState("");
  const [newPwd, setNewPwd]   = useState("");
  const [newPwd2, setNewPwd2] = useState("");
  const [pwdMsg, setPwdMsg]   = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);

  useEffect(() => {
    agents.me()
      .then(r => setProfile(r.data))
      .catch(() => setErr("Could not load profile. Your account may not have an agent record."))
      .finally(() => setLoading(false));
  }, []);

  const changePassword = async () => {
    setPwdMsg("");
    if (!oldPwd || !newPwd || !newPwd2) { setPwdMsg("Please fill all fields."); return; }
    if (newPwd !== newPwd2) { setPwdMsg("New passwords do not match."); return; }
    if (newPwd.length < 6)  { setPwdMsg("Password must be at least 6 characters."); return; }
    setPwdBusy(true);
    try {
      await authExtra.changePassword(oldPwd, newPwd);
      setPwdMsg("✅ Password changed successfully.");
      setOldPwd(""); setNewPwd(""); setNewPwd2("");
    } catch (e) {
      setPwdMsg(e.response?.data?.detail || "Password change failed.");
    } finally { setPwdBusy(false); }
  };

  const fields = profile ? [
    { label: "Full Name",       value: profile.name,         icon: "👤" },
    { label: "Email Address",   value: profile.email,        icon: "📧" },
    { label: "Agent ID",        value: profile.agent_id || "Not assigned", icon: "🪪", highlight: true },
    { label: "System UUID",     value: profile.id,           icon: "🔑", mono: true },
    { label: "Team",            value: profile.team || "No team", icon: "👥" },
    { label: "Role",            value: profile.role,         icon: "🛡️" },
    { label: "Total Calls",     value: profile.total_calls,  icon: "📞" },
    { label: "Avg Score",       value: profile.avg_score != null ? profile.avg_score.toFixed(1) : "—", icon: "⭐" },
    { label: "Violations",      value: profile.violations,   icon: "⚑" },
    { label: "Account Status",  value: profile.is_active ? "Active" : "Inactive", icon: "✅", color: profile.is_active ? t.green : t.red },
  ] : [];

  return (
    <div style={{ padding: 24, maxWidth: 680 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>👤 My Profile</h1>
      <p style={{ color: t.muted, fontSize: 13, marginBottom: 24 }}>Your account details and agent information</p>
      {loading && <div style={{ color: t.muted }}>Loading profile...</div>}
      {err && <div style={{ color: t.red, padding: "12px 16px", background: t.red + "15", borderRadius: 8 }}>{err}</div>}
      {profile && (
        <>
          {/* Avatar + name card */}
          <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 20, marginBottom: 20, background: t.green + "12", border: `1px solid ${t.green}33` }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: t.green + "33", border: `2px solid ${t.green}66`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, color: t.green }}>{profile.name?.[0]?.toUpperCase()}</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 20 }}>{profile.name}</div>
              <div style={{ color: t.muted, fontSize: 13 }}>{profile.email}</div>
              <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                <Tag label={profile.role.toUpperCase()} color={t.green} />
                <Tag label={profile.agent_id || "No ID"} color={t.amber} />
              </div>
            </div>
          </div>
          {/* Detail fields */}
          <div style={{ ...S.card, marginBottom: 20 }}>
            <div style={S.sec}>Account Details</div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 0 }}>
              {fields.map((f) => (
                <div key={f.label} style={{ padding: "14px 0", borderBottom: `1px solid ${t.border}`, paddingRight: 16 }}>
                  <div style={{ color: t.muted, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, marginBottom: 4 }}>{f.icon} {f.label.toUpperCase()}</div>
                  <div style={{ fontSize: 14, fontWeight: f.highlight ? 800 : 500, color: f.color || (f.highlight ? t.amber : t.text), fontFamily: f.mono ? "monospace" : "inherit", wordBreak: "break-all" }}>{f.value}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Change Password */}
          <div style={S.card}>
            <div style={S.sec}>🔒 Change Password</div>
            <label style={S.label}>CURRENT PASSWORD</label>
            <input style={{ ...S.input, marginBottom: 12 }} type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} placeholder="Current password" />
            <label style={S.label}>NEW PASSWORD</label>
            <input style={{ ...S.input, marginBottom: 12 }} type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="New password (min 6 chars)" />
            <label style={S.label}>CONFIRM NEW PASSWORD</label>
            <input style={{ ...S.input, marginBottom: 16 }} type="password" value={newPwd2} onChange={e => setNewPwd2(e.target.value)} placeholder="Repeat new password" />
            {pwdMsg && <div style={{ fontSize: 13, marginBottom: 12, color: pwdMsg.startsWith("✅") ? t.green : t.red }}>{pwdMsg}</div>}
            <button style={{ ...S.btn }} onClick={changePassword} disabled={pwdBusy}>
              {pwdBusy ? "Updating..." : "Update Password"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Agent Contact Supervisor ──────────────────────────────────────
function AgentContactSupervisor() {
  const [subject, setSubject] = useState("");
  const [body,    setBody]    = useState("");
  const [msg,     setMsg]     = useState("");
  const [busy,    setBusy]    = useState(false);

  const send = async () => {
    setMsg("");
    if (!subject.trim() || !body.trim()) { setMsg("Please fill in both subject and message."); return; }
    setBusy(true);
    try {
      await agents.contactSupervisor(subject, body);
      setMsg("✅ Message sent to supervisor successfully!");
      setSubject(""); setBody("");
    } catch (e) {
      setMsg(e.response?.data?.detail || "Failed to send message.");
    } finally { setBusy(false); }
  };

  const templates = [
    { label: "Schedule Change",    subject: "Request: Schedule Change",        body: "Hi, I would like to request a change to my schedule. Please let me know the process." },
    { label: "Technical Issue",    subject: "Issue: Technical Problem",         body: "I am experiencing a technical issue that is affecting my work. Please assist." },
    { label: "Feedback / Question",subject: "Feedback / General Question",      body: "I have a question or feedback I would like to share with you." },
    { label: "Leave Request",      subject: "Request: Leave / Time Off",        body: "I would like to formally request a leave of absence. Details below." },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 640 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>📩 Contact Supervisor</h1>
      <p style={{ color: t.muted, fontSize: 13, marginBottom: 24 }}>Send a message, request, or query directly to your supervisor</p>
      {/* Quick templates */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ color: t.muted, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, marginBottom: 10 }}>QUICK TEMPLATES</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {templates.map(tp => (
            <button key={tp.label} onClick={() => { setSubject(tp.subject); setBody(tp.body); setMsg(""); }}
              style={{ ...S.ghost, fontSize: 12, padding: "7px 14px" }}>{tp.label}</button>
          ))}
        </div>
      </div>
      <div style={S.card}>
        <label style={S.label}>SUBJECT</label>
        <input
          style={{ ...S.input, marginBottom: 16 }}
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="e.g. Request for schedule change"
        />
        <label style={S.label}>MESSAGE</label>
        <textarea
          style={{ ...S.input, marginBottom: 20, resize: "vertical", minHeight: 140, lineHeight: 1.7 }}
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Describe your query or request in detail..."
        />
        {msg && <div style={{ fontSize: 13, marginBottom: 14, color: msg.startsWith("✅") ? t.green : t.red, padding: "8px 12px", background: msg.startsWith("✅") ? t.green + "15" : t.red + "15", borderRadius: 6 }}>{msg}</div>}
        <button style={{ ...S.btn, width: "100%", padding: "13px 0" }} onClick={send} disabled={busy}>
          {busy ? "Sending..." : "📨 Send Message"}
        </button>
      </div>
    </div>
  );
}

function AgentNav({ screen, setScreen, name, onLogout }) {
  const isMobile = useMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = [["🏠","My Dashboard"],["💬","Live Chat"],["🎙️","Voice Call"],["📤","Upload Recording"],["📊","My Performance"],["📩","Contact Supervisor"],["👤","Profile"]];
  if (isMobile) {
    return (
      <nav style={{ position: "sticky", top: 0, zIndex: 100, background: t.surface + "f0", backdropFilter: "blur(12px)", borderBottom: `1px solid ${t.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 30, height: 30, background: t.green, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>🎧</div>
            <span style={{ fontWeight: 800, fontSize: 16 }}>AIPCSQA</span>
          </div>
          <button onClick={() => setMenuOpen(o => !o)} style={{ background: "transparent", border: `1px solid ${t.border}`, borderRadius: 6, color: t.text, fontSize: 18, cursor: "pointer", padding: "4px 10px", lineHeight: 1 }}>{menuOpen ? "✕" : "☰"}</button>
        </div>
        {menuOpen && (
          <div style={{ background: t.surface, borderTop: `1px solid ${t.border}` }}>
            {items.map(([icon, label]) => (
              <button key={label} onClick={() => { setScreen(label); setMenuOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "14px 20px", background: screen === label ? t.green + "18" : "transparent", border: "none", borderLeft: screen === label ? `3px solid ${t.green}` : "3px solid transparent", color: screen === label ? t.green : t.text, fontWeight: screen === label ? 700 : 400, fontSize: 14, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                {icon} {label}
              </button>
            ))}
            <div style={{ padding: "12px 20px", borderTop: `1px solid ${t.border}`, display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
              <button onClick={onLogout} style={{ ...S.ghost, fontSize: 12 }}>Logout</button>
            </div>
          </div>
        )}
      </nav>
    );
  }
  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 100, background: t.surface + "f0", backdropFilter: "blur(12px)", borderBottom: `1px solid ${t.border}`, padding: "0 24px", display: "flex", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 32, paddingRight: 32, borderRight: `1px solid ${t.border}` }}>
        <div style={{ width: 30, height: 30, background: t.green, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>🎧</div>
        <span style={{ fontWeight: 800, fontSize: 16 }}>AIPCSQA</span>
        <Tag label="AGENT" color={t.green} />
      </div>
      {items.map(([icon, label]) => (
        <button key={label} onClick={() => setScreen(label)} style={{ padding: "18px 14px", background: "transparent", border: "none", cursor: "pointer", color: screen === label ? t.green : t.muted, fontWeight: screen === label ? 700 : 400, fontSize: 13, borderBottom: screen === label ? `2px solid ${t.green}` : "2px solid transparent", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
          {icon} {label}
        </button>
      ))}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onLogout} style={{ ...S.ghost, fontSize: 12 }}>Logout</button>
      </div>
    </nav>
  );
}

// ── Agent Dashboard ──────────────────────────────────────────────
function AgentDashboard({ name, setScreen: setScreenProp }) {
  const isMobile = useMobile();
  const [agentId, setAgentId] = useState("Loading...");
  const quickOptions = [
    { icon: "💬", title: "Live Chat", desc: "Start or join a live text chat session with a customer. Your conversation will be AI-audited in real-time.", color: t.blue, screen: "Live Chat" },
    { icon: "🎙️", title: "Voice Call", desc: "Initiate a voice conversation. Speak naturally — transcription and audit happen automatically.", color: t.purple, screen: "Voice Call" },
    { icon: "📤", title: "Upload Recording", desc: "Upload a recorded call (MP3, WAV, MP4) for quality audit by our AI.", color: t.amber, screen: "Upload Recording" },
    { icon: "📊", title: "My Performance", desc: "View your personal quality scores, violation history, and AI improvement suggestions.", color: t.green, screen: "My Performance" },
  ];

  useEffect(() => {
    agents.me()
      .then(r => setAgentId(r.data.agent_id || "Not assigned"))
      .catch(() => setAgentId("Not available"));
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Welcome back, {name?.split(" ")[0]} 👋</h1>
        <p style={{ color: t.muted, fontSize: 13 }}>Here's what you can do today</p>
        <div style={{ marginTop: 10, color: t.green, fontSize: 13, fontWeight: 700 }}>Your Agent ID: <span style={{ background: t.surface2, padding: "2px 8px", borderRadius: 6 }}>{agentId}</span></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2,1fr)", gap: 20, maxWidth: 800 }}>
        {quickOptions.map(card => (
          <div key={card.title} style={{ ...S.card, cursor: "pointer", transition: "all 0.2s", border: `1px solid ${card.color}33` }}
            onClick={() => setScreenProp && setScreenProp(card.screen)}
            onMouseEnter={e => e.currentTarget.style.border = `1px solid ${card.color}88`}
            onMouseLeave={e => e.currentTarget.style.border = `1px solid ${card.color}33`}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>{card.icon}</div>
            <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8, color: card.color }}>{card.title}</div>
            <div style={{ color: t.muted, fontSize: 13, lineHeight: 1.6, marginBottom: 18 }}>{card.desc}</div>
            <Tag label={`Open ${card.title} →`} color={card.color} />
          </div>
        ))}
      </div>
      <div style={{ ...S.card, marginTop: 20, maxWidth: 800, background: t.green + "10", border: `1px solid ${t.green}33` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 24 }}>💡</span>
          <div>
            <div style={{ fontWeight: 700, color: t.green, marginBottom: 4 }}>Tip of the day</div>
            <div style={{ color: t.muted, fontSize: 13 }}>Always acknowledge the customer's frustration before jumping to a solution. Empathy scores account for 20% of your quality rating.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Agent Live Chat ──────────────────────────────────────────────
function AgentLiveChat() {
  const isMobile = useMobile();
  const [session,     setSession]     = useState(null);
  const [messages,    setMessages]    = useState([]);
  const [input,       setInput]       = useState("");
  const [status,      setStatus]      = useState("idle");   // idle | starting | active | ending | ended
  const [botTyping,   setBotTyping]   = useState(false);
  const [coaching,    setCoaching]    = useState(null);
  const [auditResult, setAuditResult] = useState("");
  const [agentInfo,   setAgentInfo]   = useState(null);
  const [startErr,    setStartErr]    = useState("");
  const bottomRef  = useRef(null);
  const historyRef = useRef([]);

  useEffect(() => { agents.me().then(r => setAgentInfo(r.data)).catch(() => {}); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const startChat = async () => {
    setStatus("starting"); setStartErr("");
    try {
      const r = await simulation.start("chat");
      setSession(r.data);
      historyRef.current = [{ role: "customer", text: r.data.opening_message }];
      setMessages([{ role: "customer", text: r.data.opening_message, time: now() }]);
      setStatus("active");
    } catch (e) {
      setStatus("idle");
      setStartErr(e.response?.data?.detail || e.message || "Could not start chat.");
    }
  };

  const send = async () => {
    if (!input.trim() || status !== "active") return;
    const text = input.trim();
    setInput("");
    historyRef.current = [...historyRef.current, { role: "agent", text }];
    setMessages(prev => [...prev, { role: "agent", text, time: now() }]);
    const tips = [
      "✅ Good empathy — acknowledge the customer's feelings.",
      "💡 Offer a specific resolution timeline to set expectations.",
      "⚠️ Verify customer identity before sharing account details.",
      "💡 Summarise next steps clearly before closing.",
      "✅ Professional tone — keep it up!",
    ];
    setCoaching(tips[Math.floor(Math.random() * tips.length)]);
    setTimeout(() => setCoaching(null), 5000);
    setBotTyping(true);
    try {
      const r = await simulation.turn({ scenario_id: session.scenario.id, agent_text: text, history: historyRef.current });
      const customerText = r.data.customer_text;
      historyRef.current = [...historyRef.current, { role: "customer", text: customerText }];
      setMessages(prev => [...prev, { role: "customer", text: customerText, time: now() }]);
    } catch {
      setMessages(prev => [...prev, { role: "customer", text: "(No reply — check connection)", time: now() }]);
    } finally { setBotTyping(false); }
  };

  const endChat = async () => {
    setStatus("ending");
    try {
      const turns = historyRef.current.map((t, i) => ({ role: t.role, text: t.text, ts_start: i * 10, ts_end: i * 10 + 8 }));
      await transcripts.ingest({ call_ref: session.call_ref, agent_id: agentInfo?.id || "", channel: "chat", duration_sec: turns.length * 8, turns });
      setAuditResult("✅ Chat submitted for AI quality audit. Check My Performance for the score.");
    } catch (e) {
      setAuditResult("⚠️ Could not submit: " + (e.response?.data?.detail || e.message));
    }
    setStatus("ended");
  };

  if (status === "idle" || status === "starting") {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>💬 Live Chat Simulation</h1>
        <p style={{ color: t.muted, fontSize: 13, marginBottom: 24 }}>An AI plays a real customer. You respond as the support agent. Session is auto-audited on end.</p>
        <div style={{ maxWidth: 480 }}>
          <div style={{ ...S.card, textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🤖</div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>AI Customer Chat</div>
            <div style={{ color: t.muted, fontSize: 13, marginBottom: 24 }}>A random support scenario is assigned. Handle it professionally — every message is evaluated.</div>
            {startErr && (
              <div style={{ marginBottom: 16, padding: "10px 14px", background: t.red + "18", borderRadius: 8, border: `1px solid ${t.red}44`, color: t.red, fontSize: 12, textAlign: "left" }}>
                ❌ {startErr}
              </div>
            )}
            <button style={{ ...S.btn, background: t.green, width: "100%" }} onClick={startChat} disabled={status === "starting"}>
              {status === "starting" ? "⏳ Connecting..." : "💬 Start Chat Session"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>💬 Live Chat</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: status === "active" ? t.green : t.muted }} />
            <span style={{ color: t.muted, fontSize: 13 }}>{status === "active" ? "Session active" : status === "ending" ? "Submitting..." : "Session ended"} · {session?.call_ref}</span>
          </div>
          {session && <div style={{ color: t.amber, fontSize: 12, marginTop: 4 }}>📋 Scenario: {session.scenario.title}</div>}
        </div>
        {status === "active" && <button onClick={endChat} style={{ ...S.ghost, color: t.red, borderColor: t.red }}>End Chat</button>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 280px", gap: 16, height: isMobile ? "auto" : 560 }}>
        <div style={{ ...S.card, padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: t.blue + "22", display: "flex", alignItems: "center", justifyContent: "center" }}>🤖</div>
            <div><div style={{ fontWeight: 700, fontSize: 14 }}>AI Customer</div><div style={{ color: t.green, fontSize: 11 }}>● {session?.scenario?.title}</div></div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "agent" ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "72%" }}>
                  <div style={{ padding: "10px 14px", borderRadius: m.role === "agent" ? "12px 12px 2px 12px" : "12px 12px 12px 2px", background: m.role === "agent" ? t.green + "22" : t.surface2, border: `1px solid ${m.role === "agent" ? t.green + "44" : t.border}`, fontSize: 13, lineHeight: 1.5 }}>
                    <div style={{ color: t.muted, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>{m.role.toUpperCase()}</div>
                    {m.text}
                  </div>
                  <div style={{ color: t.muted, fontSize: 10, marginTop: 3, textAlign: m.role === "agent" ? "right" : "left" }}>{m.time}</div>
                </div>
              </div>
            ))}
            {botTyping && (
              <div style={{ display: "flex", gap: 4, padding: "10px 14px", background: t.surface2, borderRadius: "12px 12px 12px 2px", border: `1px solid ${t.border}`, width: 60 }}>
                {[0, 0.2, 0.4].map((d, i) => <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: t.muted, display: "inline-block", animation: `pulse 1s infinite ${d}s` }} />)}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          {coaching && <div style={{ padding: "10px 16px", background: t.amber + "18", borderTop: `1px solid ${t.amber}33`, color: t.amber, fontSize: 12, fontWeight: 600 }}>🎧 AI Coach: {coaching}</div>}
          {status === "active" && (
            <div style={{ padding: 12, borderTop: `1px solid ${t.border}`, display: "flex", gap: 10 }}>
              <input style={{ ...S.input, flex: 1 }} value={input} onChange={e => setInput(e.target.value)} placeholder="Type your response..." onKeyDown={e => e.key === "Enter" && send()} />
              <button style={{ ...S.btn, background: t.green, whiteSpace: "nowrap" }} onClick={send}>Send ↑</button>
            </div>
          )}
          {(status === "ended" || status === "ending") && (
            <div style={{ padding: 14, textAlign: "center", color: auditResult.startsWith("✅") ? t.green : t.muted, fontSize: 13, borderTop: `1px solid ${t.border}` }}>
              {auditResult || "⏳ Submitting for audit..."}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={S.card}>
            <div style={S.sec}>Quick Responses</div>
            {["Thank you for reaching out. Let me check that right away.", "I completely understand your frustration. I'm here to help.", "Could you provide your account number so I can look into this?", "I've escalated this — you'll hear back within 24 hours.", "Is there anything else I can help you with today?"].map((qr, i) => (
              <div key={i} onClick={() => status === "active" && setInput(qr)} style={{ padding: "8px 10px", marginBottom: 6, background: t.surface2, borderRadius: 6, border: `1px solid ${t.border}`, cursor: status === "active" ? "pointer" : "default", fontSize: 12, lineHeight: 1.5 }}>{qr}</div>
            ))}
          </div>
          <div style={S.card}>
            <div style={S.sec}>Session Info</div>
            <div style={{ fontSize: 12, color: t.muted, lineHeight: 2 }}>
              <div>📞 Ref: {session?.call_ref || "-"}</div>
              <div>💬 Messages: {messages.length}</div>
              <div style={{ color: t.green }}>🤖 AI Audit: Active</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Agent Voice Call ─────────────────────────────────────────────
function AgentVoiceCall() {
  const isMobile = useMobile();
  const [callState,    setCallState]    = useState("idle"); // idle|starting|speaking|listening|ending|ended
  const [duration,     setDuration]     = useState(0);
  const [muted,        setMuted]        = useState(false);
  const [transcript,   setTranscript]   = useState([]);
  const [liveSpeaking, setLiveSpeaking] = useState(null); // { partial, full } while customer TTS plays
  const [statusMsg,    setStatusMsg]    = useState("Ready to connect");
  const [sessionData,  setSessionData]  = useState(null);
  const [auditResult,  setAuditResult]  = useState("");
  const [agentInfo,    setAgentInfo]    = useState(null);
  const [speechOK,     setSpeechOK]     = useState(true);
  const [startErr,     setStartErr]     = useState("");

  const timerRef       = useRef(null);
  const recognitionRef = useRef(null);
  const historyRef     = useRef([]);
  const sessionRef     = useRef(null);
  const isActiveRef    = useRef(false);
  const isMutedRef     = useRef(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef   = useRef([]);
  const micStreamRef     = useRef(null);
  const audioCtxRef      = useRef(null);   // Web Audio context for mixing
  const mixDestRef       = useRef(null);   // MediaStreamDestination (mic + TTS mixed)
  const currentSrcRef    = useRef(null);   // Current AudioBufferSource — stopped when call ends
  const speakIntervalRef    = useRef(null);   // Word-reveal interval for live transcript
  const liveSpeakingRef    = useRef(null);   // Mirrors liveSpeaking — lets endCall commit partially-heard text
  const customerGenderRef  = useRef("female"); // Fixed gender for the entire call — set once in startCall

  useEffect(() => {
    agents.me().then(r => setAgentInfo(r.data)).catch(() => {});
    if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) setSpeechOK(false);
  }, []);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    clearInterval(speakIntervalRef.current);
    try { recognitionRef.current?.abort(); } catch {}
    window.speechSynthesis?.cancel();
    try { currentSrcRef.current?.stop(); } catch {}
    currentSrcRef.current = null;
    try { if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop(); } catch {}
    micStreamRef.current?.getTracks().forEach(tr => tr.stop());
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    mixDestRef.current  = null;
  }, []);

  const fmt = s => `${Math.floor(s/60).toString().padStart(2,"0")}:${(s%60).toString().padStart(2,"0")}`;
  const now  = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // startWordReveal: animates text word-by-word into liveSpeaking over audioDurationMs.
  // When the actual audio ends (onDone fires), the interval is already done or gets
  // cleared, and the caller commits the full text to the permanent transcript.
  const startWordReveal = (text, audioDurationMs) => {
    clearInterval(speakIntervalRef.current);
    const words = text.split(" ");
    // Reserve ~10% extra time at the start before first word appears (natural delay)
    const delayMs   = Math.min(800, audioDurationMs * 0.20);
    const msPerWord = Math.max(200, (audioDurationMs * 0.95) / words.length);
    let revealed = 0;
    liveSpeakingRef.current = { partial: "", full: text };
    setLiveSpeaking({ partial: "", full: text });
    const tick = () => {
      revealed++;
      const ls = { partial: words.slice(0, revealed).join(" "), full: text };
      liveSpeakingRef.current = ls;
      setLiveSpeaking(ls);
      if (revealed >= words.length) clearInterval(speakIntervalRef.current);
    };
    speakIntervalRef.current = setTimeout(() => {
      speakIntervalRef.current = setInterval(tick, msPerWord);
    }, delayMs);
  };

  // Speak customer text through the Web Audio mix so the MediaRecorder captures
  // both the agent mic AND the customer TTS in one recording file.
  // Falls back to window.speechSynthesis if the backend TTS endpoint is unavailable.
  // gender is chosen once per speak() call so each customer turn can vary.
  const speak = (text, onDone) => {
    const ctx    = audioCtxRef.current;
    const dest   = mixDestRef.current;
    const apiUrl = process.env.REACT_APP_API_URL || "http://localhost:8000";
    const token  = localStorage.getItem("token") || "";
    // Randomly assign male or female for this customer turn
    const gender = customerGenderRef.current; // constant for the whole call — set in startCall

    if (ctx && dest) {
      // ── Web Audio path: fetch MP3 from backend, decode, route through mixer ──
      fetch(`${apiUrl}/simulation/tts?text=${encodeURIComponent(text)}&gender=${gender}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.arrayBuffer())
        .then(buf => ctx.decodeAudioData(buf))
        .then(decoded => {
          const src = ctx.createBufferSource();
          src.buffer = decoded;
          src.connect(ctx.destination); // speakers — agent hears the customer
          src.connect(dest);            // recording mix — captured in the audio file
          currentSrcRef.current = src;
          // Start live word-by-word transcript reveal synced to actual audio length
          startWordReveal(text, decoded.duration * 1000);
          src.onended = () => {
            currentSrcRef.current = null;
            clearInterval(speakIntervalRef.current);
            liveSpeakingRef.current = null;
            setLiveSpeaking(null);
            onDone?.();
          };
          src.start();
        })
        .catch(() => {
          // Backend TTS failed — fall back to speechSynthesis.
          // Estimate duration from word count (~150 wpm) for the word-reveal.
          const estMs = (text.split(" ").length / 150) * 60000;
          startWordReveal(text, estMs);
          const synth = window.speechSynthesis;
          synth.cancel();
          const utt = new SpeechSynthesisUtterance(text);
          utt.rate = 0.90; utt.pitch = gender === "male" ? 0.85 : 1.0;
          const voices = synth.getVoices();
          const inIN = voices.filter(v => /en.?IN/i.test(v.lang));
          const pick = (gender === "male"
            ? inIN.find(v => /Prabhat|Ravi|Hemant/i.test(v.name)) || voices.find(v => /Ravi|Hemant|David|Mark|James/i.test(v.name))
            : inIN.find(v => /Neerja|Heera|Kalpana|Lekha/i.test(v.name)) || voices.find(v => /Heera|Kalpana|Neerja|Zira|Susan|Karen|Samantha/i.test(v.name))
          ) || inIN[0];
          if (pick) utt.voice = pick;
          utt.onend  = () => { clearInterval(speakIntervalRef.current); liveSpeakingRef.current = null; setLiveSpeaking(null); onDone?.(); };
          utt.onerror = () => { clearInterval(speakIntervalRef.current); liveSpeakingRef.current = null; setLiveSpeaking(null); onDone?.(); };
          synth.speak(utt);
        });
    } else {
      // ── Fallback path (AudioContext not ready) ──
      const estMs = (text.split(" ").length / 150) * 60000;
      startWordReveal(text, estMs);
      const synth = window.speechSynthesis;
      synth.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 0.90; utt.pitch = gender === "male" ? 0.85 : 1.0;
      const voices = synth.getVoices();
      const inIN = voices.filter(v => /en.?IN/i.test(v.lang));
      const pick = (gender === "male"
        ? inIN.find(v => /Prabhat|Ravi|Hemant/i.test(v.name)) || voices.find(v => /Ravi|Hemant|David|Mark|James/i.test(v.name))
        : inIN.find(v => /Neerja|Heera|Kalpana|Lekha/i.test(v.name)) || voices.find(v => /Heera|Kalpana|Neerja|Zira|Susan|Karen|Samantha/i.test(v.name))
      ) || inIN[0];
      if (pick) utt.voice = pick;
      utt.onend  = () => { clearInterval(speakIntervalRef.current); liveSpeakingRef.current = null; setLiveSpeaking(null); onDone?.(); };
      utt.onerror = () => { clearInterval(speakIntervalRef.current); liveSpeakingRef.current = null; setLiveSpeaking(null); onDone?.(); };
      synth.speak(utt);
    }
  };

  const startListening = () => {
    if (!isActiveRef.current) return;
    if (isMutedRef.current) {
      // Customer has finished speaking but mic is muted. Advance to "listening"
      // state visually so that when the agent unmutes, toggleMute sees
      // callState === "listening" and immediately starts recognition.
      setCallState("listening");
      setStatusMsg("🔇 Muted — unmute your mic to speak");
      return;
    }
    setCallState("listening");
    setStatusMsg("🎤 Your turn — speak now...");
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-US"; rec.continuous = false; rec.interimResults = false;
    recognitionRef.current = rec;

    rec.onresult = async e => {
      const text = e.results[0]?.[0]?.transcript?.trim();
      if (!text || !isActiveRef.current) return;
      historyRef.current = [...historyRef.current, { role: "agent", text }];
      setTranscript(prev => [...prev, { role: "agent", text, time: now() }]);
      setCallState("speaking");
      setStatusMsg("🤖 Customer is responding...");
      try {
        const r = await simulation.turn({ scenario_id: sessionRef.current.scenario.id, agent_text: text, history: historyRef.current });
        const reply = r.data.customer_text;
        // Do NOT add customer turn to history/transcript yet — wait until
        // speak() finishes so the transcript only shows what was actually heard.
        setStatusMsg("🔊 Customer speaking...");
        speak(reply, () => {
          // Guard: call may have been ended while customer was speaking.
          if (!isActiveRef.current) return;
          historyRef.current = [...historyRef.current, { role: "customer", text: reply }];
          setTranscript(prev => [...prev, { role: "customer", text: reply, time: now() }]);
          startListening();
        });
      } catch { if (isActiveRef.current) startListening(); }
    };

    rec.onerror = e => {
      if (e.error === "no-speech" && isActiveRef.current) setTimeout(() => { if (isActiveRef.current) startListening(); }, 500);
    };
    rec.start();
  };

  const startCall = async () => {
    setCallState("starting"); setStatusMsg("⏳ Connecting to AI customer..."); setStartErr("");
    try {
      const r = await simulation.start("phone");
      setSessionData(r.data); sessionRef.current = r.data;
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
      isActiveRef.current = true;
      customerGenderRef.current = Math.random() < 0.5 ? "female" : "male"; // fixed for this call

      // ── Start mixed recording (agent mic + customer TTS) ──
      // We create a Web Audio context with a MediaStreamDestination as the
      // recording target.  The agent mic is always routed into it.  The
      // speak() function also routes each TTS audio buffer into the same
      // destination, so the recorded file contains both voices.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;

        // Build the Web Audio mix pipeline
        const ctx  = new (window.AudioContext || window.webkitAudioContext)();
        const dest = ctx.createMediaStreamDestination();
        audioCtxRef.current = ctx;
        mixDestRef.current  = dest;

        // Agent mic → mix destination (NOT to ctx.destination to avoid echo)
        ctx.createMediaStreamSource(stream).connect(dest);

        // Record the mixed stream
        audioChunksRef.current = [];
        const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : (MediaRecorder.isTypeSupported("audio/ogg") ? "audio/ogg" : "");
        const mr = mimeType ? new MediaRecorder(dest.stream, { mimeType }) : new MediaRecorder(dest.stream);
        mr.ondataavailable = e => { if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data); };
        mr.start(1000);
        mediaRecorderRef.current = mr;
      } catch { /* mic unavailable — continue without recording */ }

      const opening = r.data.opening_message;
      // Start with empty history/transcript — the opening turn is only committed
      // once speech finishes, so early end-call doesn't capture unheard text.
      historyRef.current = [];
      setTranscript([]);
      setCallState("speaking"); setStatusMsg("🔊 Customer speaking — listen carefully...");
      const doSpeak = () => speak(opening, () => {
        if (!isActiveRef.current) return;
        historyRef.current = [{ role: "customer", text: opening }];
        setTranscript([{ role: "customer", text: opening, time: now() }]);
        startListening();
      });
      if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.addEventListener("voiceschanged", doSpeak, { once: true });
      } else { doSpeak(); }
    } catch (e) {
      setCallState("idle");
      const msg = e.response?.data?.detail || e.message || "Connection failed.";
      setStatusMsg("Ready to connect");
      setStartErr(msg);
    }
  };

  const endCall = async () => {
    isActiveRef.current = false;
    try { recognitionRef.current?.abort(); } catch {}
    // Stop any in-flight customer TTS (Web Audio path)
    try { currentSrcRef.current?.stop(); } catch {}
    currentSrcRef.current = null;
    // Cancel word-reveal — commit whatever was partially heard to the transcript
    // so the supervisor audit record reflects what the customer actually said.
    clearInterval(speakIntervalRef.current);
    const partialSpoken = liveSpeakingRef.current?.partial?.trim();
    if (partialSpoken) {
      historyRef.current = [...historyRef.current, { role: "customer", text: partialSpoken }];
      setTranscript(prev => [...prev, { role: "customer", text: partialSpoken, time: now() }]);
    }
    liveSpeakingRef.current = null;
    setLiveSpeaking(null);
    window.speechSynthesis.cancel();
    clearInterval(timerRef.current);
    setCallState("ending"); setStatusMsg("⏳ Submitting for audit...");

    // Stop mic recording and collect blob before uploading
    let recordingBlob = null;
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      recordingBlob = await new Promise(resolve => {
        mr.onstop = () => {
          const chunks = audioChunksRef.current;
          // Use mr.mimeType (e.g. "audio/webm;codecs=opus") — individual chunk
          // objects often have an empty .type, so always prefer the recorder's
          // declared mimeType which is set at construction time.
          const mime = mr.mimeType || "audio/webm";
          resolve(chunks.length > 0 ? new Blob(chunks, { type: mime }) : null);
        };
        mr.stop();
      });
    }
    micStreamRef.current?.getTracks().forEach(tr => tr.stop());

    try {
      const turns = historyRef.current.map((t, i) => ({ role: t.role, text: t.text, ts_start: i * 15, ts_end: i * 15 + 12 }));
      const res = await transcripts.ingest({ call_ref: sessionRef.current?.call_ref || `SIM-P${Date.now()}`, agent_id: agentInfo?.id || "", channel: "phone", duration_sec: duration, turns });
      // Upload audio recording if available
      if (recordingBlob && res?.data?.call_id) {
        try { await transcripts.attachAudio(res.data.call_id, recordingBlob); } catch {}
      }
      setAuditResult("✅ Call submitted for AI quality audit. Check My Performance for your score.");
    } catch (e) {
      setAuditResult("⚠️ Could not submit: " + (e.response?.data?.detail || e.message));
    }
    setCallState("ended"); setStatusMsg("📴 Call ended");
  };

  const toggleMute = () => {
    const m = !muted; setMuted(m); isMutedRef.current = m;
    if (m) { try { recognitionRef.current?.abort(); } catch {} setStatusMsg("🔇 Muted"); }
    else if (callState === "listening") startListening();
  };

  // ── Idle / starting screen ────────────────────────────────────
  if (callState === "idle" || callState === "starting") {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>🎙️ Voice Call Simulation</h1>
        <p style={{ color: t.muted, fontSize: 13, marginBottom: 24 }}>An AI customer calls you. Respond via your microphone. The call is auto-audited on end.</p>
        {!speechOK && (
          <div style={{ padding: "12px 16px", background: t.red + "18", borderRadius: 8, border: `1px solid ${t.red}44`, color: t.red, fontSize: 13, marginBottom: 16 }}>
            ⚠️ Speech recognition is only supported in <strong>Chrome</strong> or <strong>Edge</strong>. Please switch browsers.
          </div>
        )}
        <div style={{ maxWidth: 480 }}>
          <div style={{ ...S.card, textAlign: "center", padding: 40 }}>
            <div style={{ width: 90, height: 90, borderRadius: "50%", background: t.green + "22", border: `3px solid ${t.green}`, margin: "0 auto 20px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 42 }}>📞</div>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>AI Customer Voice Call</div>
            <div style={{ color: t.muted, fontSize: 13, marginBottom: 8 }}>A random customer scenario is assigned. The AI speaks first — respond with your microphone.</div>
            <div style={{ color: t.amber, fontSize: 12, marginBottom: 24 }}>🌐 Browser microphone + speaker required. Allow mic access when prompted.</div>
            {startErr && (
              <div style={{ marginBottom: 16, padding: "10px 14px", background: t.red + "18", borderRadius: 8, border: `1px solid ${t.red}44`, color: t.red, fontSize: 12, textAlign: "left" }}>
                ❌ {startErr}
              </div>
            )}
            <button style={{ ...S.btn, background: speechOK ? t.green : t.muted, width: "100%", cursor: speechOK ? "pointer" : "not-allowed" }}
              onClick={speechOK ? startCall : undefined} disabled={callState === "starting" || !speechOK}>
              {callState === "starting" ? "⏳ Connecting..." : "📞 Start Voice Call"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Active call screen ────────────────────────────────────────
  const isLive = callState === "speaking" || callState === "listening";
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 20 }}>🎙️ Voice Call</h1>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "300px 1fr", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ ...S.card, textAlign: "center" }}>
            <div style={{ width: 80, height: 80, borderRadius: "50%", margin: "0 auto 12px",
              background: callState === "listening" ? t.green + "22" : callState === "speaking" ? t.blue + "22" : t.surface2,
              border: `3px solid ${callState === "listening" ? t.green : callState === "speaking" ? t.blue : t.muted}`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34,
              boxShadow: callState === "listening" ? `0 0 20px ${t.green}55` : callState === "speaking" ? `0 0 20px ${t.blue}55` : "none",
              transition: "all 0.3s" }}>
              {callState === "listening" ? "🎤" : callState === "speaking" ? "🔊" : "📴"}
            </div>
            <div style={{ fontFamily: "monospace", fontSize: 36, fontWeight: 800, color: callState === "ended" ? t.muted : t.green, marginBottom: 8 }}>{fmt(duration)}</div>
            <div style={{ color: t.muted, fontSize: 12, marginBottom: 12 }}>{statusMsg}</div>
            {sessionData && <div style={{ color: t.amber, fontSize: 11, marginBottom: 14 }}>📋 {sessionData.scenario.title}</div>}
            {isLive && (
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={toggleMute} style={{ flex: 1, padding: "10px 0", background: muted ? t.red + "22" : t.surface2, border: `1px solid ${muted ? t.red : t.border}`, borderRadius: 8, color: muted ? t.red : t.muted, cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
                  {muted ? "🔇 Muted" : "🎤 Mute"}
                </button>
                <button onClick={endCall} style={{ flex: 1, padding: "10px 0", background: t.red + "22", border: `1px solid ${t.red}`, borderRadius: 8, color: t.red, cursor: "pointer", fontWeight: 700, fontSize: 12 }}>📴 End</button>
              </div>
            )}
            {callState === "ending" && <div style={{ color: t.muted, fontSize: 12 }}>⏳ Submitting...</div>}
          </div>
          <div style={S.card}>
            <div style={S.sec}>Call Checklist</div>
            {[["Greet customer professionally", transcript.length >= 1], ["Acknowledge the issue", transcript.length >= 3],
              ["Verify identity / account",   transcript.length >= 5], ["Offer clear resolution",    transcript.length >= 7],
              ["Confirm satisfaction",         callState === "ended"]].map(([item, done]) => (
              <div key={item} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", fontSize: 12 }}>
                <span style={{ color: done ? t.green : t.border, fontSize: 16 }}>{done ? "✅" : "⬜"}</span>
                <span style={{ color: done ? t.text : t.muted }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ ...S.card, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={S.sec}>Live Transcript</div>
            {isLive && <Tag label="● LIVE" color={t.red} />}
          </div>
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
            {transcript.length === 0 && !liveSpeaking && <div style={{ color: t.muted, textAlign: "center", marginTop: 60 }}>Transcript appears here as the call progresses</div>}
            {transcript.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "agent" ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "75%", padding: "10px 14px", borderRadius: 10, background: m.role === "agent" ? t.green + "22" : t.surface2, border: `1px solid ${m.role === "agent" ? t.green + "44" : t.border}`, fontSize: 13, lineHeight: 1.5 }}>
                  <div style={{ color: t.muted, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>{m.role === "agent" ? "YOU (AGENT)" : "🤖 CUSTOMER"}</div>
                  {m.text}
                </div>
              </div>
            ))}
            {/* Live word-by-word customer turn — only visible while TTS is playing */}
            {liveSpeaking && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ maxWidth: "75%", padding: "10px 14px", borderRadius: 10, background: t.surface2, border: `1px solid ${t.border}`, fontSize: 13, lineHeight: 1.5 }}>
                  <div style={{ color: t.muted, fontSize: 10, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                    🤖 CUSTOMER
                    <span style={{ color: t.red, fontSize: 9, animation: "pulse 1s infinite" }}>● LIVE</span>
                  </div>
                  {liveSpeaking.partial}
                  <span style={{ display: "inline-block", width: 7, height: 13, background: t.text, borderRadius: 1, marginLeft: 2, verticalAlign: "middle", animation: "blink 0.8s step-end infinite" }} />
                </div>
              </div>
            )}
          </div>
          {(callState === "ended" || callState === "ending") && (
            <div style={{ marginTop: 14, padding: 14, background: t.green + "10", borderRadius: 8, border: `1px solid ${t.green}33`, color: t.green, fontSize: 13, textAlign: "center" }}>
              {auditResult || "⏳ Submitting call for AI quality audit..."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Agent Upload Recording ───────────────────────────────────────
function AgentUploadRecording() {
  const [file,         setFile]         = useState(null);
  const [callRef,      setCallRef]      = useState(`#${Math.floor(1000 + Math.random() * 9000)}`);
  const [firstSpeaker, setFirstSpeaker] = useState("agent");  // "agent" | "customer"
  const [status,       setStatus]       = useState("idle");   // idle | uploading | success | error
  const [msg,          setMsg]          = useState("");
  const [agentInfo,    setAgentInfo]    = useState(null);
  const [uploadedId,   setUploadedId]   = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    agents.me().then(r => setAgentInfo(r.data)).catch(() => {});
  }, []);

  const submitFile = async () => {
    if (!file)   { setMsg("Please select a file to upload"); return; }
    if (!callRef.trim()) { setMsg("Please enter a call reference"); return; }
    setStatus("uploading"); setMsg("");
    try {
      const fd = new FormData();
      fd.append("file",          file);
      fd.append("call_ref",      callRef.trim());
      fd.append("first_speaker", firstSpeaker);
      const r = await transcripts.upload(fd);
      setStatus("success");
      setUploadedId(r.data.call_id);
      const transcribed = r.data.transcribed;
      const turns = r.data.turns || 0;
      setMsg(transcribed
        ? `✅ Recording uploaded and transcribed into ${turns} speaker turn${turns !== 1 ? "s" : ""}! AI audit has been queued — it will appear in the supervisor's Audit Review panel shortly.`
        : "⚠️ File uploaded but automatic transcription failed. The supervisor can still review the recording."
      );
    } catch (e) {
      setStatus("error");
      setMsg("❌ Upload failed: " + (e.response?.data?.detail || e.message));
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 860 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>📤 Upload Recording</h1>
      <p style={{ color: t.muted, fontSize: 13, marginBottom: 24 }}>Submit a recorded call for automatic transcription and AI audit</p>
      <div style={S.card}>
        {/* Agent info (read-only) */}
        {agentInfo && (
          <div style={{ display: "flex", gap: 8, marginBottom: 18, padding: "10px 14px", background: t.surface2, borderRadius: 8, border: `1px solid ${t.border}`, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: t.muted, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>SUBMITTING AS</span>
            <Tag label={agentInfo.name || agentInfo.agent_id} color={t.blue} />
            {agentInfo.team && <Tag label={agentInfo.team} color={t.muted} />}
          </div>
        )}
        <div style={{ marginBottom: 18 }}>
          <label style={S.label}>CALL REFERENCE</label>
          <input style={{ ...S.input, maxWidth: 260 }} value={callRef} onChange={e => setCallRef(e.target.value)} placeholder="#4821" />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={S.label}>WHO SPEAKS FIRST IN THIS RECORDING?</label>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {["agent", "customer"].map(role => (
              <button key={role} onClick={() => setFirstSpeaker(role)}
                style={{ padding: "7px 20px", borderRadius: 8, border: `2px solid ${firstSpeaker === role ? t.amber : t.border}`, background: firstSpeaker === role ? t.amber + "22" : t.surface2, color: firstSpeaker === role ? t.amber : t.muted, fontWeight: 700, fontSize: 12, cursor: "pointer", textTransform: "capitalize", transition: "all 0.15s" }}>
                {role === "agent" ? "🎧 Agent" : "👤 Customer"}
              </button>
            ))}
          </div>
          <p style={{ color: t.muted, fontSize: 11, marginTop: 5 }}>This helps the AI correctly label each speaker's turns in the transcript.</p>
        </div>
        <label style={S.label}>AUDIO / VIDEO FILE</label>
        <div onClick={() => fileRef.current?.click()} style={{ border: `2px dashed ${file ? t.green : t.border}`, borderRadius: 10, padding: 40, textAlign: "center", cursor: "pointer", background: t.surface2, transition: "all 0.2s" }}
          onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = t.amber; }}
          onDragLeave={e => { e.currentTarget.style.borderColor = file ? t.green : t.border; }}
          onDrop={e => { e.preventDefault(); setFile(e.dataTransfer.files[0]); e.currentTarget.style.borderColor = t.green; }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>{file ? "🎵" : "📂"}</div>
          <div style={{ color: t.text, fontWeight: 700, marginBottom: 6 }}>{file ? file.name : "Drag & drop your file here"}</div>
          <div style={{ color: t.muted, fontSize: 12 }}>Supports MP3, WAV, MP4, M4A · Max 50 MB</div>
          {file && <div style={{ color: t.green, fontSize: 12, marginTop: 8 }}>✅ {(file.size / 1024 / 1024).toFixed(1)} MB selected</div>}
        </div>
        <input ref={fileRef} type="file" accept=".mp3,.wav,.mp4,.m4a" style={{ display: "none" }} onChange={e => { setFile(e.target.files[0]); setStatus("idle"); setMsg(""); }} />
        {msg && (
          <div style={{ marginTop: 14, padding: "12px 16px", background: status === "success" ? t.green + "15" : status === "error" ? t.red + "15" : t.amber + "15", borderRadius: 8, color: status === "success" ? t.green : status === "error" ? t.red : t.amber, fontSize: 13, lineHeight: 1.6 }}>
            {msg}
            {uploadedId && <div style={{ color: t.muted, fontSize: 11, marginTop: 6 }}>Call ID: {uploadedId}</div>}
          </div>
        )}
        {status !== "success" && (
          <button style={{ ...S.btn, marginTop: 16, background: status === "uploading" ? t.muted : t.amber, cursor: status === "uploading" ? "not-allowed" : "pointer" }} onClick={submitFile} disabled={status === "uploading"}>
            {status === "uploading" ? "⏳ Uploading & Transcribing..." : "🚀 Upload for Supervisor Audit"}
          </button>
        )}
        {status === "success" && (
          <button style={{ ...S.ghost, marginTop: 14 }} onClick={() => { setFile(null); setStatus("idle"); setMsg(""); setCallRef(`#${Math.floor(1000 + Math.random() * 9000)}`); setUploadedId(null); }}>
            + Upload Another Recording
          </button>
        )}
      </div>
    </div>
  );
}

// ── Agent My Performance ─────────────────────────────────────────
function AgentPerformance() {
  const isMobile = useMobile();
  const [tab,            setTab]            = useState("overview");
  const [myTranscripts,  setMyTranscripts]  = useState([]);
  const [myReports,      setMyReports]      = useState([]);
  const [agentInfo,      setAgentInfo]      = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [dateFrom,       setDateFrom]       = useState("");
  const [dateTo,         setDateTo]         = useState("");

  useEffect(() => {
    agents.me().then(r => setAgentInfo(r.data)).catch(() => {});
    transcripts.list({ limit: 100 }).then(r => setMyTranscripts(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== "reports") return;
    setReportsLoading(true);
    const params = {};
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo)   params.date_to   = dateTo;
    reports.myReports(params).then(r => setMyReports(r.data)).catch(() => setMyReports([])).finally(() => setReportsLoading(false));
  }, [tab, dateFrom, dateTo]);

  const audited  = myTranscripts.filter(c => c.status === "audited");
  const avgScore = audited.length > 0 ? Math.round(audited.reduce((a, c) => a + (c.score || 0), 0) / audited.length) : null;
  const channelIcon  = ch => ch === "chat" ? "💬" : ch === "phone" ? "📞" : "📤";
  const channelLabel = ch => ch === "chat" ? "Live Chat" : ch === "phone" ? "Voice Call" : "Upload";

  const tabs = [["overview", "📊 Overview"], ["history", "📋 Audit History"], ["reports", "📄 My Reports"]];

  const downloadReportAsPDF = (r) => {
    const d = r.data || {};
    const fmtDate = (value, withTime = false) => {
      if (!value) return "";
      const dt = new Date(value);
      if (Number.isNaN(dt.getTime())) {
        const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${m[3]}-${m[2]}-${m[1]}`;
        return String(value);
      }
      const dd = String(dt.getDate()).padStart(2, "0");
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const yyyy = dt.getFullYear();
      if (!withTime) return `${dd}-${mm}-${yyyy}`;
      const hh = String(dt.getHours()).padStart(2, "0");
      const min = String(dt.getMinutes()).padStart(2, "0");
      return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
    };
    const typeLabel = (r.type || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const scoreColor = (s) => s >= 85 ? "#10B981" : s >= 70 ? "#F59E0B" : "#EF4444";
    const sevColor   = (s) => s === "Critical" || s === "High" ? "#EF4444" : s === "Medium" ? "#F59E0B" : "#6B7280";
    const gradeColor = (g) =>
      g === "A+" || g === "A"  ? "#10B981" :   // green  — excellent
      g === "B+"               ? "#3B82F6" :   // blue   — pass (minimum)
      g === "B"                ? "#F59E0B" :   // amber  — below pass
      g === "C"  || g === "D" ? "#F97316" :   // orange — poor
      "#EF4444";                               // red    — F

    const perf = d.performance || d.audit_summary;
    const dims = perf?.dimensions || {};

    let sections = "";

    // ── Agent info ──────────────────────────────────────────────────────
    if (d.agent) {
      sections += `
        <div class="info-bar">
          <span><strong>Agent:</strong> ${d.agent.name || ""}</span>
          <span><strong>ID:</strong> ${d.agent.agent_id || "—"}</span>
          <span><strong>Team:</strong> ${d.agent.team || "—"}</span>
          <span><strong>Period:</strong> ${fmtDate(d.date_from)} → ${fmtDate(d.date_to) || "—"}</span>
        </div>`;
    }

    // ── Performance ─────────────────────────────────────────────────────
    if (perf) {
      const score = perf.overall_score ?? 0;
      const callCount = perf.calls_analyzed || 0;
      const perfComment =
        score >= 90 ? "Exceptional" :
        score >= 80 ? "Excellent" :
        score >= 70 ? "Satisfactory" :
        score >= 60 ? "Needs Improvement" :
        "Critical — Immediate Action Required";
      const perfCommentColor =
        score >= 90 ? "#10B981" :
        score >= 80 ? "#10B981" :
        score >= 70 ? "#3B82F6" :
        score >= 60 ? "#F59E0B" :
        "#EF4444";
      const dimRows = Object.entries(dims).map(([k, v]) => {
        const pct = typeof v === "number" && v <= 10 ? Math.round(v * 10) : Math.round(v);
        const col = scoreColor(typeof v === "number" && v <= 10 ? v * 10 : v);
        return `<tr><td style="text-transform:capitalize">${k}</td>
                    <td><div class="bar-bg"><div class="bar-fill" style="width:${pct}%;background:${col}"></div></div></td>
                    <td style="font-weight:700;color:${col}">${v}</td></tr>`;
      }).join("");
      sections += `
        <div class="section">
          <div class="section-title">Performance Summary</div>
          <div class="score-row">
            <div class="score-box" style="border-color:${scoreColor(score)}">
              <div class="score-label">AUDIT SCORE</div>
              <div class="score-big" style="color:${scoreColor(score)}">${score}</div>
              <div class="score-sub">${callCount} calls analyzed</div>
            </div>
            <div style="flex:1">
              <div style="display:inline-block;padding:5px 14px;border-radius:6px;font-size:12px;font-weight:800;letter-spacing:0.5px;background:${perfCommentColor}20;color:${perfCommentColor};border:1px solid ${perfCommentColor}40">${perfComment.toUpperCase()}</div>
              ${dimRows ? `<table class="dim-table" style="margin-top:10px">${dimRows}</table>` : ""}
            </div>
          </div>
        </div>`;
    }

    // ── Improvement areas ────────────────────────────────────────────────
    if ((d.improvement_areas || []).length > 0) {
      const items = d.improvement_areas.map((s, i) => `<div class="tip"><span class="tip-num">${i+1}</span>${s}</div>`).join("");
      sections += `<div class="section"><div class="section-title">AI Improvement Recommendations</div>${items}</div>`;
    }

    // ── Scorecard ────────────────────────────────────────────────────────
    if (d.scorecard) {
      const sc = d.scorecard;
      const dimAvg = sc.dim_overall_score ?? (sc.overall_score / 10);
      const overallPassed = sc.overall_passed !== undefined ? sc.overall_passed : dimAvg >= 7.0;
      const sdRows = Object.entries(sc.dimensions || {}).map(([k, info]) =>
        `<tr><td style="text-transform:capitalize">${k}</td>
             <td style="font-family:monospace;font-weight:700;text-align:center">${info.score ?? "—"} / 10</td>
             <td style="font-weight:900;color:${gradeColor(info.grade)};text-align:center">${info.grade}</td>
             <td style="color:${info.passed ? "#10B981" : "#EF4444"};font-weight:700;text-align:center">${info.passed ? "✓ Pass" : "✗ Fail"}</td></tr>`
      ).join("");
      const legend = [
        ["A+","9.0 – 10","#10B981"],["A","8.0 – 8.9","#10B981"],
        ["B+","7.0 – 7.9","#3B82F6"],["B","6.0 – 6.9","#F59E0B"],
        ["C","5.0 – 5.9","#F97316"],["D","4.0 – 4.9","#F97316"],["F","0 – 3.9","#EF4444"],
      ].map(([g, r, c]) =>
        `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:11px">
           <span style="font-weight:900;color:${c}">${g}</span>
           <span style="color:#94A3B8">${r}</span>
         </span>`
      ).join("");
      sections += `
        <div class="section">
          <div class="section-title">Quality Scorecard</div>
          <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:14px;flex-wrap:wrap">

            <div class="score-box" style="border-color:${gradeColor(sc.overall_grade)}">
              <div class="score-label">DIM. AVG GRADE</div>
              <div class="score-big" style="color:${gradeColor(sc.overall_grade)}">${sc.overall_grade || "—"}</div>
              <div style="font-family:monospace;font-size:15px;font-weight:800;color:#1E293B;margin-top:4px">${dimAvg.toFixed(2)} / 10</div>
              <div class="score-sub">avg of all dimensions</div>
            </div>

            <div class="score-box" style="border-color:${sc.overall_score >= 85 ? "#10B981" : sc.overall_score >= 70 ? "#F59E0B" : "#EF4444"}">
              <div class="score-label">AUDIT SCORE</div>
              <div class="score-big" style="color:${sc.overall_score >= 85 ? "#10B981" : sc.overall_score >= 70 ? "#F59E0B" : "#EF4444"}">${sc.overall_score ?? "—"}</div>
              <div class="score-sub">out of 100</div>
              <div class="score-sub">${sc.calls_analyzed} calls</div>
            </div>

            <div style="display:flex;flex-direction:column;justify-content:center;gap:8px">
              <div style="padding:10px 20px;border-radius:10px;text-align:center;
                background:${overallPassed ? "#10B98115" : "#EF444415"};
                border:2px solid ${overallPassed ? "#10B981" : "#EF4444"}">
                <div style="font-size:10px;font-weight:800;letter-spacing:.06em;color:#64748B;margin-bottom:4px">OVERALL RESULT</div>
                <div style="font-size:22px;font-weight:900;color:${overallPassed ? "#10B981" : "#EF4444"}">${overallPassed ? "✓ PASS" : "✗ FAIL"}</div>
              </div>
              <div style="font-size:12px;color:#1E293B;text-align:center">
                <strong>${sc.dimensions_passed}</strong> of <strong>${sc.dimensions_total}</strong> dims passed
              </div>
              <div style="text-align:center">
                <span style="background:#3B82F620;color:#3B82F6;border:1px solid #3B82F640;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:700">Min. B+ ≥ 7.0 to Pass</span>
              </div>
            </div>

          </div>
          <div style="margin-bottom:10px">${legend}</div>
          <table class="data-table">
            <thead><tr><th>Dimension</th><th style="text-align:center">Score / 10</th><th style="text-align:center">Grade</th><th style="text-align:center">Result</th></tr></thead>
            <tbody>${sdRows}</tbody>
          </table>
        </div>`;
    }

    // ── Compliance ───────────────────────────────────────────────────────
    if (d.compliance) {
      const cp = d.compliance;
      const rateCol = cp.compliance_rate >= 90 ? "#10B981" : cp.compliance_rate >= 70 ? "#F59E0B" : "#EF4444";
      const byTypeRows = Object.entries(cp.by_type || {}).map(([k, v]) =>
        `<tr><td>${k}</td><td style="font-weight:700">${v}</td></tr>`).join("");
      const bySevRows  = Object.entries(cp.by_severity || {}).map(([k, v]) =>
        `<tr><td style="color:${sevColor(k)};font-weight:700">${k}</td><td style="font-weight:700">${v}</td></tr>`).join("");
      sections += `
        <div class="section">
          <div class="section-title">Compliance Summary</div>
          <div class="two-col">
            <div class="score-box" style="border-color:${rateCol}">
              <div class="score-label">COMPLIANCE RATE</div>
              <div class="score-big" style="color:${rateCol}">${cp.compliance_rate}%</div>
              <div class="score-sub">${cp.total_violations} violation(s) · ${cp.calls_analyzed} calls</div>
            </div>
            ${byTypeRows ? `<div><div style="font-size:11px;font-weight:700;color:#64748B;margin-bottom:6px">BY TYPE</div><table class="data-table"><tbody>${byTypeRows}</tbody></table></div>` : ""}
            ${bySevRows  ? `<div><div style="font-size:11px;font-weight:700;color:#64748B;margin-bottom:6px">BY SEVERITY</div><table class="data-table"><tbody>${bySevRows}</tbody></table></div>` : ""}
          </div>
        </div>`;
      if ((d.violations_log || []).length > 0) {
        const vrows = d.violations_log.map(v =>
          `<tr><td>${v.type || "—"}</td>
               <td style="color:${sevColor(v.severity)};font-weight:700">${v.severity || "—"}</td>
               <td>${v.description || "—"}</td>
               <td style="color:#94A3B8">${fmtDate(v.date)}</td></tr>`
        ).join("");
        sections += `<div class="section"><div class="section-title">Violations Log</div>
          <table class="data-table">
            <thead><tr><th>Type</th><th>Severity</th><th>Description</th><th>Date</th></tr></thead>
            <tbody>${vrows}</tbody>
          </table></div>`;
      }
    }

    // ── Call history ─────────────────────────────────────────────────────
    if ((d.call_history || []).length > 0) {
      const chRows = d.call_history.map(c =>
        `<tr><td style="font-family:monospace">${c.call_ref || ""}</td>
             <td style="text-transform:capitalize">${c.channel || ""}</td>
             <td style="font-weight:700;color:${scoreColor(c.score)}">${c.score != null ? Math.round(c.score) : "—"}</td>
             <td style="color:${c.passed ? "#10B981" : "#EF4444"}">${c.passed !== undefined ? (c.passed ? "✓ Pass" : "✗ Fail") : ""}</td>
             <td style="color:#94A3B8">${fmtDate(c.date)}</td></tr>`
      ).join("");
      sections += `<div class="section"><div class="section-title">Call History in Report</div>
        <table class="data-table">
          <thead><tr><th>Call Ref</th><th>Channel</th><th>Score</th><th>Result</th><th>Date</th></tr></thead>
          <tbody>${chRows}</tbody>
        </table></div>`;
    }

    // ── Supervisor comment ───────────────────────────────────────────────
    if (d.supervisor_comment) {
      sections += `
        <div class="section">
          <div class="section-title">Supervisor Comment</div>
          <div class="comment-box">${d.supervisor_comment.replace(/\n/g, "<br>")}</div>
        </div>`;
    }

    const html = `<!DOCTYPE html><html><head><title>${r.title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #1E293B; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { max-width: 860px; margin: 0 auto; padding: 36px 40px; }
  .header { border-bottom: 3px solid #3B82F6; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { font-size: 22px; font-weight: 800; color: #0F172A; }
  .header .meta { color: #64748B; font-size: 12px; margin-top: 6px; display:flex; gap:20px; flex-wrap:wrap }
  .type-badge { display:inline-block; padding: 3px 12px; border-radius: 99px; font-size: 11px; font-weight: 700; background: #3B82F620; color: #3B82F6; border: 1px solid #3B82F640; margin-bottom:8px }
  .info-bar { display:flex; flex-wrap:wrap; gap:20px; padding:10px 16px; background:#F8FAFC; border-radius:8px; border:1px solid #E2E8F0; font-size:13px; margin-bottom:20px; }
  .section { margin-bottom: 28px; }
  .section-title { font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #64748B; margin-bottom: 12px; border-bottom: 1px solid #E2E8F0; padding-bottom: 6px; }
  .score-row { display:flex; gap:24px; align-items:flex-start; }
  .two-col { display:flex; gap:24px; align-items:flex-start; flex-wrap:wrap; }
  .score-box { text-align:center; padding:14px 22px; border:2px solid #3B82F6; border-radius:12px; min-width:120px; background:#F8FAFC; flex-shrink:0; }
  .score-label { font-size:10px; font-weight:800; letter-spacing:.06em; color:#64748B; margin-bottom:4px; }
  .score-big { font-size:42px; font-weight:900; font-family:monospace; line-height:1; }
  .score-sub { font-size:11px; color:#94A3B8; margin-top:4px; }
  .status-badge { display:inline-block; padding:4px 14px; border-radius:99px; font-size:12px; font-weight:700; }
  .dim-table { width:100%; border-collapse:collapse; font-size:13px; }
  .dim-table td { padding: 4px 8px; }
  .bar-bg { background:#E2E8F0; border-radius:4px; height:7px; width:140px; overflow:hidden; display:inline-block; }
  .bar-fill { height:100%; border-radius:4px; }
  .data-table { width:100%; border-collapse:collapse; font-size:13px; }
  .data-table th { text-align:left; padding:7px 10px; background:#F1F5F9; font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:#64748B; border-bottom:1px solid #E2E8F0; }
  .data-table td { padding:7px 10px; border-bottom:1px solid #F1F5F9; color:#1E293B; }
  .tip { display:flex; gap:10px; padding:8px 12px; background:#FEF9C3; border-radius:7px; border-left:3px solid #F59E0B; font-size:13px; line-height:1.6; margin-bottom:7px; }
  .tip-num { font-weight:900; color:#D97706; min-width:18px; }
  .comment-box { background:#F5F3FF; border-left:4px solid #8B5CF6; padding:14px 18px; border-radius:8px; font-size:13px; line-height:1.8; white-space:pre-wrap; }
  .footer { margin-top:32px; padding-top:12px; border-top:1px solid #E2E8F0; color:#94A3B8; font-size:11px; display:flex; justify-content:space-between; }
  @media print { .page { padding:20px 24px; } }
</style></head>
<body><div class="page">
  <div class="header">
    <span class="type-badge">${typeLabel}</span>
    <h1>${r.title}</h1>
    <div class="meta">
      <span>Generated: ${fmtDate(r.created_at, true)}</span>
      ${d.date_from ? `<span>Period: ${fmtDate(d.date_from)} → ${fmtDate(d.date_to) || "—"}</span>` : ""}
      <span>Report ID: ${d.report_id || r.id}</span>
    </div>
  </div>
  ${sections}
  <div class="footer">
    <span>AIPCSQA · AI-Powered Customer Support Quality Auditor</span>
    <span>Printed ${fmtDate(new Date())}</span>
  </div>
</div>
<script>window.onload = () => { window.print(); }</script>
</body></html>`;

    const win = window.open("", "_blank", "width=900,height=700");
    win.document.write(html);
    win.document.close();
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>📊 My Performance</h1>
        {agentInfo && <Tag label={`Agent ID: ${agentInfo.agent_id || "N/A"}`} color={t.amber} />}
      </div>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 2, marginBottom: 24, borderBottom: `1px solid ${t.border}` }}>
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{ padding: "10px 20px", background: "transparent", border: "none", cursor: "pointer", color: tab === key ? t.green : t.muted, fontWeight: tab === key ? 700 : 400, fontSize: 13, borderBottom: tab === key ? `2px solid ${t.green}` : "2px solid transparent", fontFamily: "inherit" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ─────────────────────────────────── */}
      {tab === "overview" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
            {[
              { label: "Total Calls",   value: myTranscripts.length, color: t.blue },
              { label: "Audited",       value: audited.length,       color: t.purple },
              { label: "Avg Score",     value: avgScore ?? "—",      color: avgScore >= 85 ? t.green : avgScore >= 70 ? t.amber : t.red },
              { label: "Pending Audit", value: myTranscripts.filter(c => c.status === "processing").length, color: t.amber },
            ].map(k => (
              <div key={k.label} style={S.card}>
                <div style={{ color: t.muted, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, marginBottom: 10 }}>{k.label.toUpperCase()}</div>
                <div style={{ color: k.color, fontSize: 32, fontWeight: 800, fontFamily: "monospace" }}>{k.value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
            <div style={S.card}>
              <div style={S.sec}>AI Improvement Tips</div>
              {[
                { tip: "Use empathy phrases like 'I understand how frustrating that must be' at the start.", area: "Empathy", icon: "💙" },
                { tip: "Always provide a specific resolution timeline rather than vague estimates.", area: "Resolution", icon: "✅" },
                { tip: "Read the mandatory disclaimer at the end of every billing-related call.", area: "Compliance", icon: "🛡️" },
                { tip: "Summarize next steps clearly before ending the conversation.", area: "Communication", icon: "💬" },
              ].map((tip, i) => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: i < 3 ? `1px solid ${t.border}` : "none" }}>
                  <span style={{ fontSize: 20 }}>{tip.icon}</span>
                  <div>
                    <Tag label={tip.area} color={t.amber} />
                    <div style={{ color: t.text, fontSize: 12, lineHeight: 1.6, marginTop: 6 }}>{tip.tip}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={S.card}>
              <div style={S.sec}>Recent Scores</div>
              {loading && <div style={{ color: t.muted, fontSize: 13 }}>Loading...</div>}
              {myTranscripts.slice(0, 8).map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < 7 ? `1px solid ${t.border}` : "none" }}>
                  <span style={{ fontSize: 14 }}>{channelIcon(c.channel)}</span>
                  <span style={{ color: t.muted, fontSize: 12, fontFamily: "monospace", minWidth: 70 }}>{c.call_ref}</span>
                  <span style={{ flex: 1, color: t.muted, fontSize: 11 }}>{c.status}</span>
                  {c.score != null ? <Badge score={Math.round(c.score)} /> : <Tag label={c.status} color={t.muted} />}
                </div>
              ))}
              {!loading && myTranscripts.length === 0 && <div style={{ color: t.muted, fontSize: 13 }}>No calls yet — start a Live Chat or Voice Call!</div>}
            </div>
          </div>
        </>
      )}

      {/* ── AUDIT HISTORY ─────────────────────────────── */}
      {tab === "history" && (
        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={S.sec}>Audit History — {myTranscripts.length} records</div>
          </div>
          {loading && <div style={{ color: t.muted, fontSize: 13, padding: "10px 0" }}>Loading...</div>}
          {isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {myTranscripts.map((c, i) => (
                <div key={i} style={{ padding: "12px 0", borderBottom: `1px solid ${t.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, color: t.amber, fontSize: 13 }}>{c.call_ref}</span>
                    <Tag label={c.status} color={c.status === "audited" ? t.green : c.status === "processing" ? t.amber : c.status === "failed" ? t.red : t.muted} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span>{channelIcon(c.channel)}</span>
                    <span style={{ color: t.text, fontSize: 12 }}>{channelLabel(c.channel)}</span>
                    <span style={{ color: t.muted, fontSize: 11 }}>{new Date(c.created_at).toLocaleDateString()}</span>
                    {c.score != null ? <Badge score={Math.round(c.score)} /> : <span style={{ color: t.muted, fontSize: 11 }}>Pending</span>}
                  </div>
                </div>
              ))}
              {!loading && myTranscripts.length === 0 && (
                <div style={{ padding: "30px 0", color: t.muted, textAlign: "center", fontSize: 13 }}>No calls yet — start a Live Chat or Voice Call to build your history!</div>
              )}
            </div>
          ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {["SIM ID / Call Ref", "Channel", "Type", "Submitted At", "Audit Status", "Overall Score"].map(h => (
                  <th key={h} style={{ color: t.muted, fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textAlign: "left", paddingBottom: 12, borderBottom: `1px solid ${t.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {myTranscripts.map((c, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${t.border}` }}>
                  <td style={{ padding: "12px 0", fontWeight: 700, fontFamily: "monospace", color: t.amber, paddingRight: 16 }}>{c.call_ref}</td>
                  <td style={{ padding: "12px 0", paddingRight: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span>{channelIcon(c.channel)}</span>
                      <span style={{ color: t.text }}>{channelLabel(c.channel)}</span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 0", paddingRight: 16 }}>
                    <Tag label={c.channel} color={c.channel === "chat" ? t.blue : c.channel === "phone" ? t.green : t.amber} />
                  </td>
                  <td style={{ padding: "12px 0", color: t.muted, fontSize: 12, paddingRight: 16 }}>{new Date(c.created_at).toLocaleString()}</td>
                  <td style={{ padding: "12px 0", paddingRight: 16 }}>
                    <Tag label={c.status} color={c.status === "audited" ? t.green : c.status === "processing" ? t.amber : c.status === "failed" ? t.red : t.muted} />
                  </td>
                  <td style={{ padding: "12px 0" }}>
                    {c.score != null ? <Badge score={Math.round(c.score)} /> : <span style={{ color: t.muted, fontSize: 12 }}>Pending</span>}
                  </td>
                </tr>
              ))}
              {!loading && myTranscripts.length === 0 && (
                <tr><td colSpan={6} style={{ padding: "30px 0", color: t.muted, textAlign: "center" }}>No calls yet — start a Live Chat or Voice Call to build your history!</td></tr>
              )}
            </tbody>
          </table>
          )}
        </div>
      )}

      {/* ── MY REPORTS ────────────────────────────────── */}
      {tab === "reports" && (
        <div>
          {/* Date filters */}
          <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label style={S.label}>FROM DATE</label>
              <input type="date" style={{ ...S.input, maxWidth: 180 }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label style={S.label}>TO DATE</label>
              <input type="date" style={{ ...S.input, maxWidth: 180 }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            {(dateFrom || dateTo) && (
              <button style={S.ghost} onClick={() => { setDateFrom(""); setDateTo(""); }}>✕ Clear</button>
            )}
          </div>

          {reportsLoading && (
            <div style={{ ...S.card, textAlign: "center", padding: 40, color: t.muted }}>Loading reports...</div>
          )}
          {!reportsLoading && myReports.length === 0 && (
            <div style={{ ...S.card, textAlign: "center", padding: 50 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
              <div style={{ color: t.muted, fontSize: 14 }}>No supervisor reports found for your account yet.</div>
              <div style={{ color: t.muted, fontSize: 12, marginTop: 6 }}>Your supervisor will generate performance reports that will appear here.</div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {myReports.map((r, i) => (
              <div key={i} style={S.card}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17 }}>{r.title}</div>
                    <div style={{ color: t.muted, fontSize: 12, marginTop: 4 }}>
                      Generated: {new Date(r.created_at).toLocaleString()} · Type: {(r.type || "").replace(/_/g, " ")}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Tag label={r.ready ? "✓ Ready" : "⏳ Processing"} color={r.ready ? t.green : t.amber} />
                    {r.ready && r.data && (
                      <button
                        onClick={() => downloadReportAsPDF(r)}
                        title="Download as PDF"
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 14px",
                          background: "transparent", border: `1px solid ${t.blue}`, borderRadius: 8,
                          color: t.blue, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        ⬇ Download PDF
                      </button>
                    )}
                  </div>
                </div>

                {r.ready && r.data && (() => {
                  const d = r.data;
                  return (
                    <>
                      {/* Audit score summary */}
                      {d.audit_summary && (
                        <>
                          <div style={S.sec}>Audit Score Summary</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
                            <div style={{ textAlign: "center", padding: "12px 24px", background: t.surface2, borderRadius: 10, border: `1px solid ${t.border}` }}>
                              <div style={{ color: t.muted, fontSize: 11, fontWeight: 700, marginBottom: 4 }}>OVERALL SCORE</div>
                              <div style={{ fontSize: 40, fontWeight: 800, fontFamily: "monospace", color: d.audit_summary.overall_score >= 85 ? t.green : d.audit_summary.overall_score >= 70 ? t.amber : t.red }}>
                                {d.audit_summary.overall_score ?? "—"}
                              </div>
                              <div style={{ color: t.muted, fontSize: 11, marginTop: 4 }}>{d.audit_summary.calls_analyzed || 0} calls analyzed</div>
                            </div>
                            <div style={{ flex: 1, minWidth: 280 }}>
                              {Object.entries(d.audit_summary.dimensions || {}).map(([k, v]) => (
                                <div key={k} style={{ marginBottom: 6 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                    <span style={{ color: t.muted, fontSize: 12, textTransform: "capitalize" }}>{k}</span>
                                    <span style={{ color: v >= 7 ? t.green : v >= 5 ? t.amber : t.red, fontWeight: 700, fontSize: 12 }}>{v}/10</span>
                                  </div>
                                  <Bar value={v} max={10} color={v >= 7 ? t.green : v >= 5 ? t.amber : t.red} />
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      )}

                      {/* Improvement areas */}
                      {d.improvement_areas?.length > 0 && (
                        <>
                          <div style={S.sec}>AI Improvement Recommendations</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                            {d.improvement_areas.map((s, j) => (
                              <div key={j} style={{ padding: "10px 14px", background: t.amber + "10", borderRadius: 8, border: `1px solid ${t.amber}30`, fontSize: 13, lineHeight: 1.6 }}>
                                <span style={{ color: t.amber, fontWeight: 700, marginRight: 8 }}>💡 {j + 1}.</span>{s}
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {/* Recent call history in report */}
                      {d.call_history?.length > 0 && (
                        <>
                          <div style={S.sec}>Call History (in this report)</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                            {d.call_history.map((c, j) => (
                              <div key={j} style={{ padding: "6px 12px", background: t.surface2, borderRadius: 8, border: `1px solid ${t.border}`, fontSize: 12 }}>
                                <span style={{ color: t.amber, fontWeight: 700, marginRight: 6 }}>{c.call_ref}</span>
                                <span style={{ color: t.muted }}>{c.channel}</span>
                                {c.score != null && <span style={{ marginLeft: 8, color: c.score >= 85 ? t.green : c.score >= 70 ? t.amber : t.red, fontWeight: 700 }}>{Math.round(c.score)}</span>}
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {/* Supervisor comment */}
                      {d.supervisor_comment && (
                        <>
                          <div style={S.sec}>Supervisor Comment</div>
                          <div style={{ padding: "14px 18px", background: t.purple + "12", borderRadius: 10, border: `1px solid ${t.purple}33`, fontSize: 13, lineHeight: 1.8, color: t.text, whiteSpace: "pre-wrap" }}>
                            <span style={{ color: t.purple, fontWeight: 700 }}>👤 Supervisor:  </span>{d.supervisor_comment}
                          </div>
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  APP ROOT — Role-based routing
// ════════════════════════════════════════════════════════════════
export default function App() {
  const [user,     setUser]     = useState(null);
  const [screen,   setScreen]   = useState("");
  const [checking, setChecking] = useState(true);

  // Keep Render backend awake: ping /health every 10 minutes
  useEffect(() => {
    const apiBase = (process.env.REACT_APP_API_URL || "http://localhost:8000").replace(/\/$/, "");
    const ping = () => fetch(`${apiBase}/health`).catch(() => {});
    ping(); // immediate ping on load
    const id = setInterval(ping, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      auth.me().then(r => {
        setUser(r.data);
        setScreen(r.data.role === "agent" ? "My Dashboard" : "Dashboard");
        setChecking(false);
      }).catch(() => { localStorage.removeItem("token"); setChecking(false); });
    } else { setChecking(false); }
  }, []);

  const handleLogin = (data) => {
    // Fetch full profile (includes email, team) after login
    auth.me().then(r => setUser(r.data)).catch(() => setUser(data));
    setScreen(data.role === "agent" ? "My Dashboard" : "Dashboard");
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("name");
    setUser(null);
    setScreen("");
  };

  if (checking) return (
    <div style={{ ...S.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🎧</div>
        <div style={{ color: t.amber, fontSize: 16, fontWeight: 700 }}>Loading AIPCSQA...</div>
      </div>
    </div>
  );

  if (!user) return <Login onLogin={handleLogin} />;

  // ── SUPERVISOR ───────────────────────────────────────────────
  if (user.role === "supervisor" || user.role === "admin") {
    const supervisorScreens = {
      "Dashboard":    <SupervisorDashboard />,
      "Agents":       <SupervisorAgents />,
      "Audit":        <SupervisorAudit />,
      "Compliance":   <SupervisorCompliance />,
      "Reports":      <SupervisorReports />,
      "Live Monitor": <SupervisorLiveMonitor />,
      "Profile":      <SupervisorProfile user={user} />,
    };
    return (
      <div style={S.page}>
        <SupervisorNav screen={screen} setScreen={setScreen} name={user.name} onLogout={logout} />
        {supervisorScreens[screen] || <SupervisorDashboard />}
      </div>
    );
  }

  // ── AGENT ────────────────────────────────────────────────────
  const agentScreens = {
    "My Dashboard":         <AgentDashboard name={user.name} setScreen={setScreen} />,
    "Live Chat":            <AgentLiveChat />,
    "Voice Call":           <AgentVoiceCall />,
    "Upload Recording":     <AgentUploadRecording />,
    "My Performance":       <AgentPerformance />,
    "Contact Supervisor":   <AgentContactSupervisor />,
    "Profile":              <AgentProfile user={user} />,
  };
  return (
    <div style={S.page}>
      <AgentNav screen={screen} setScreen={setScreen} name={user.name} onLogout={logout} />
      {agentScreens[screen] || <AgentDashboard name={user.name} />}
    </div>
  );
}