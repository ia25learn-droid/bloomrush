"use client";
import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState } from "react";

const racers = [
  { name: "Maya", color: "#ff6b55", score: 86 },
  { name: "Leo", color: "#f4b83f", score: 73 },
  { name: "Nina", color: "#8e78df", score: 61 },
];

function Plant({ growth }: { growth: number }) {
  const stage = growth > 84 ? "🌻" : growth > 60 ? "🌿" : growth > 32 ? "🌱" : "🌰";
  return <div className="plant-wrap" aria-label={`Plant is ${growth}% grown`}><div className="sun">☀</div><div className={`plant ${growth >= 100 ? "finished-flower" : ""}`} style={{ transform: `scale(${0.7 + growth / 260})` }}>{stage}</div><div className="soil" /></div>;
}

export default function Home() {
  const [role, setRole] = useState<"host" | "player">("host");
  const [screen, setScreen] = useState<"lobby" | "waiting" | "play">("lobby");
  const [qr, setQr] = useState("");
  const [joinUrl, setJoinUrl] = useState("");
  const [name, setName] = useState("You");
  const [ready, setReady] = useState(false);
  const [taps, setTaps] = useState(0);
  const [seconds, setSeconds] = useState(25);
  const channel = useRef<BroadcastChannel | null>(null);
  const growth = Math.round((taps / 99) * 100);
  const finished = taps >= 99;
  const score = growth;
  const rank = score >= 86 ? 1 : score >= 73 ? 2 : score >= 61 ? 3 : 4;

  useEffect(() => {
    const isPlayer = new URLSearchParams(window.location.search).has("join");
    setRole(isPlayer ? "player" : "host");
    setScreen(isPlayer ? "waiting" : "lobby");
    const url = `${window.location.origin}${window.location.pathname}?join=SPROUT`;
    setJoinUrl(url);
    QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: "#173e2d", light: "#ffffff" }, errorCorrectionLevel: "H" }).then(setQr);
    const room = new BroadcastChannel("bloom-rush-sprout");
    channel.current = room;
    room.onmessage = (event) => {
      if (event.data?.type === "start") { setTaps(0); setSeconds(25); setScreen("play"); }
      if (event.data?.type === "reset" && isPlayer) setScreen("waiting");
    };
    return () => room.close();
  }, []);

  useEffect(() => {
    if (screen !== "play" || finished) return;
    const timer = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [screen, finished]);

  const allRacers = useMemo(() => [...racers, { name, color: "#49a96e", score }].sort((a,b) => b.score-a.score), [score, name]);
  const startGame = () => { setTaps(0); setSeconds(25); setScreen("play"); channel.current?.postMessage({ type: "start" }); };
  const leaveGame = () => { if (role === "host") { setScreen("lobby"); channel.current?.postMessage({ type: "reset" }); } else setScreen("waiting"); };
  const water = () => { if (seconds <= 0 || taps >= 99) return; setTaps((t) => Math.min(99, t + 1)); };

  return <main className="shell">
    <nav><a className="brand" href="#"><span>✿</span> BLOOM RUSH</a><div className="live"><i /> ROOM #SPROUT</div></nav>

    {screen === "lobby" && <section className="lobby">
      <div className="intro"><div className="eyebrow">HOST CONTROL</div><h1>Scan. Join.<br/><em>Grow!</em></h1><p>Ask every gardener to scan the code with their phone. They’ll wait safely in the lobby until you start the race.</p><div className="steps"><span><b>1</b> Scan QR</span><span><b>2</b> Wait in lobby</span><span><b>3</b> Host starts</span></div></div>
      <div className="join-card host-card"><div className="card-top"><span>SCAN TO JOIN</span><strong>#SPROUT</strong></div>{qr ? <img className="real-qr" src={qr} alt={`QR code to join ${joinUrl}`} /> : <div className="qr-loading">Growing QR…</div>}<h2>Join the watering race</h2><p>Participants scan this code and wait for you.</p><div className="ready-list"><span><i>M</i>Maya <b>READY</b></span><span><i>L</i>Leo <b>READY</b></span><span><i>N</i>Nina <b>READY</b></span></div><button onClick={startGame}>START GAME <span>→</span></button><small><i /> 3 gardeners waiting</small></div>
    </section>}

    {screen === "waiting" && <section className="waiting-page"><div className="waiting-card"><div className="seed-pulse">🌱</div><div className="eyebrow">ROOM #SPROUT</div><h1>You’re in!</h1><p>{ready ? "You’re ready to grow. The game will begin when the host presses Start Game." : "Choose your gardener name, then get ready."}</p>{!ready ? <><label>Your nickname<input value={name} onChange={(e)=>setName(e.target.value.slice(0,12))} aria-label="Your nickname" /></label><button onClick={()=>setReady(true)}>I’M READY <span>→</span></button></> : <div className="waiting-status"><i /><b>WAITING FOR HOST</b><span>Keep this page open</span></div>}<div className="waiting-dots"><i/><i/><i/></div></div></section>}

    {screen === "play" && <section className="game">
      <header className="game-head"><div><button className="back" onClick={leaveGame}>←</button><span>{role === "host" ? "HOST VIEW" : "ROOM #SPROUT"}</span></div><div className="timer"><small>TIME LEFT</small><b>00:{String(seconds).padStart(2,"0")}</b></div><div className="rank"><small>YOUR RANK</small><b>#{rank}</b></div></header>
      <div className="race-grid"><div className="garden-panel"><div className="water-drops">💧　💧</div><Plant growth={growth}/><div className="growth-copy"><span>YOUR PLANT</span><b>FULL BLOOM GOAL</b></div><div className="meter"><i style={{width:`${growth}%`}} /></div></div><div className="leaderboard"><div className="eyebrow">LIVE LEADERBOARD</div><h2>Garden race</h2>{allRacers.map((r,i)=><div className={`racer ${r.name===name?"you":""}`} key={r.name}><strong>{i+1}</strong><i style={{background:r.color}}>{r.name[0]?.toUpperCase()}</i><span>{r.name}<small>{r.score>=85?"Blooming!":r.score>=60?"Growing strong":"Keep tapping"}</small></span><b>{r.score}%</b></div>)}</div></div>
      <div className="tap-zone"><div><span>{taps>=99?"🏆":seconds<=0?"⏱":"💧"}</span><h2>{taps>=99?"You bloomed!":seconds<=0?"Time’s up!":"Water your plant!"}</h2><p>{taps>=99?"Your flower reached a glorious full bloom!":seconds<=0?"The garden needs a little more water.":"Keep tapping to grow a full bloom"}</p></div><button className="water-btn" onPointerDown={water} disabled={seconds<=0||taps>=99}><span>💧</span>TAP TO WATER<small>{taps>=99?"FULL BLOOM!":"KEEP WATERING"}</small></button></div>
    </section>}
    <footer><span>GROW TOGETHER. BLOOM FASTER.</span><span>Made for joyful teams 🌱</span></footer>
  </main>;
}
