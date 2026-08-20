"use client";
import { useEffect, useMemo, useState } from "react";

const racers = [
  { name: "Maya", color: "#ff6b55", score: 86 },
  { name: "Leo", color: "#f4b83f", score: 73 },
  { name: "Nina", color: "#8e78df", score: 61 },
];

function Plant({ growth }: { growth: number }) {
  const stage = growth > 84 ? "🌻" : growth > 60 ? "🌿" : growth > 32 ? "🌱" : "🌰";
  return <div className="plant-wrap" aria-label={`Plant is ${growth}% grown`}><div className="sun">☀</div><div className="plant" style={{ transform: `scale(${0.7 + growth / 260})` }}>{stage}</div><div className="soil"><span /></div></div>;
}

export default function Home() {
  const [mode, setMode] = useState<"lobby" | "play">("lobby");
  const [score, setScore] = useState(38);
  const [taps, setTaps] = useState(0);
  const [seconds, setSeconds] = useState(15);
  const [name, setName] = useState("You");
  const growth = Math.min(100, score);
  const rank = score >= racers[0].score ? 1 : score >= racers[1].score ? 2 : score >= racers[2].score ? 3 : 4;
  useEffect(() => { if (mode !== "play" || seconds <= 0 || growth >= 100) return; const timer = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000); return () => clearInterval(timer); }, [mode, seconds, growth]);
  const allRacers = useMemo(() => [...racers, { name, color: "#49a96e", score }].sort((a,b) => b.score-a.score), [score, name]);
  const water = () => { if (seconds <= 0 || growth >= 100) return; setScore((s) => Math.min(100, s + 3)); setTaps((t) => t + 1); };
  return <main className="shell">
    <nav><a className="brand" href="#"><span>✿</span> BLOOM RUSH</a><div className="live"><i /> LIVE GAME</div></nav>
    {mode === "lobby" ? <section className="lobby">
      <div className="intro"><div className="eyebrow">THE FASTEST GARDEN WINS</div><h1>Tap. Water.<br/><em>Grow!</em></h1><p>Race your friends from seed to full bloom. Scan the code, join on your phone, and tap as fast as you can.</p><div className="steps"><span><b>1</b> Scan to join</span><span><b>2</b> Tap to water</span><span><b>3</b> Grow & win</span></div></div>
      <div className="join-card"><div className="card-top"><span>GAME ROOM</span><strong>#SPROUT</strong></div><div className="qr" aria-label="Demo QR code"><div className="qr-grid">{Array.from({length:81},(_,i)=><i key={i} className={(i*7+i%4+i%9)%5<2?"on":""}/>)}</div><b>✿</b></div><h2>Scan to join the garden</h2><p>or play the phone experience here</p><label>Your nickname<input value={name} onChange={(e)=>setName(e.target.value.slice(0,12))} aria-label="Your nickname" /></label><button onClick={()=>setMode("play")}>JOIN THE RACE <span>→</span></button><small><i /> 4 gardeners ready</small></div>
    </section> : <section className="game">
      <header className="game-head"><div><button className="back" onClick={()=>setMode("lobby")}>←</button><span>ROOM #SPROUT</span></div><div className="timer"><small>TIME LEFT</small><b>00:{String(seconds).padStart(2,"0")}</b></div><div className="rank"><small>YOUR RANK</small><b>#{rank}</b></div></header>
      <div className="race-grid"><div className="garden-panel"><div className="water-drops">💧　💧</div><Plant growth={growth}/><div className="growth-copy"><span>YOUR PLANT</span><b>{growth}% GROWN</b></div><div className="meter"><i style={{width:`${growth}%`}} /></div></div><div className="leaderboard"><div className="eyebrow">LIVE LEADERBOARD</div><h2>Garden race</h2>{allRacers.map((r,i)=><div className={`racer ${r.name===name?"you":""}`} key={r.name}><strong>{i+1}</strong><i style={{background:r.color}}>{r.name[0]?.toUpperCase()}</i><span>{r.name}<small>{r.score>=85?"Blooming!":r.score>=60?"Growing strong":"Keep tapping"}</small></span><b>{r.score}%</b></div>)}</div></div>
      <div className="tap-zone"><div><span>{growth>=100?"🏆":seconds<=0?"⏱":"💧"}</span><h2>{growth>=100?"You bloomed!":seconds<=0?"Time’s up!":"Water your plant!"}</h2><p>{growth>=100?"What a glorious garden.":seconds<=0?`You made ${taps} watering taps.`:"Tap the button as fast as you can"}</p></div><button className="water-btn" onPointerDown={water} disabled={seconds<=0||growth>=100}><span>💧</span>TAP TO WATER<small>{taps} TAPS</small></button></div>
    </section>}
    <footer><span>GROW TOGETHER. BLOOM FASTER.</span><span>Made for joyful teams 🌱</span></footer>
  </main>;
}
