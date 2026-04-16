import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Plus, Trash2, ChevronLeft, ChevronRight,
  Circle, CheckCircle2, X, Repeat, LogOut, Loader2,
} from "lucide-react";
import { api } from "./api.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const pad       = (n)    => String(n).padStart(2, "0");
const toKey     = (d)    => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today     = ()     => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const addDays   = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const toMin     = (t)    => { const [h,m] = t.split(":").map(Number); return h*60+m; };
const uid       = ()     => Math.random().toString(36).slice(2,10) + Date.now().toString(36);

const minToLabel = (m) => {
  const h = Math.floor(m/60); const mm = m%60;
  const sfx = h >= 12 ? "pm" : "am"; const h12 = ((h+11)%12)+1;
  return mm === 0 ? `${h12}${sfx}` : `${h12}:${pad(mm)}${sfx}`;
};

const repeatApplies = (repeat, date) => {
  const dow = date.getDay();
  if (repeat === "daily")    return true;
  if (repeat === "weekdays") return dow >= 1 && dow <= 5;
  if (repeat === "weekends") return dow === 0 || dow === 6;
  return false;
};

// ── Style tokens ─────────────────────────────────────────────────────────────

const PAPER = {
  background: "radial-gradient(1200px 600px at 10% 0%,#f4ecdd 0%,transparent 55%), radial-gradient(900px 500px at 95% 100%,#e8dcc4 0%,transparent 50%),#faf5e9",
};
const mono = (color) => ({ fontFamily:"'JetBrains Mono',monospace", ...(color ? {color} : {}) });

function Fonts() {
  return <link rel="stylesheet"
    href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600;9..144,700;9..144,900&family=JetBrains+Mono:wght@400;500;600&display=swap" />;
}

// ── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [booting, setBooting] = useState(true);
  const [authed,  setAuthed]  = useState(false);

  useEffect(() => {
    api.me()
      .then(r => setAuthed(!!r.authed))
      .catch(()  => setAuthed(false))
      .finally(() => setBooting(false));
  }, []);

  if (booting) return <Splash />;
  if (!authed) return <Login onAuthed={() => setAuthed(true)} />;
  return <Planner onLogout={() => setAuthed(false)} />;
}

// ── Splash ────────────────────────────────────────────────────────────────────

function Splash() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={PAPER}>
      <Fonts />
      <Loader2 className="animate-spin" size={24} style={{color:"#1a1410"}} />
    </div>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────

function Login({ onAuthed }) {
  const [pw,      setPw]      = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const submit = async (e) => {
    e?.preventDefault();
    setLoading(true); setError("");
    try   { await api.login(pw); onAuthed(); }
    catch (err) { setError(err.status === 401 ? "Wrong password." : "Something went wrong."); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={PAPER}>
      <Fonts />
      <form onSubmit={submit} className="w-full max-w-sm" style={{fontFamily:"'Fraunces',Georgia,serif"}}>
        <div className="text-xs uppercase tracking-[0.3em] mb-2" style={mono("#6b5a45")}>Private · Members only</div>
        <h1 className="text-5xl font-black tracking-tight leading-none mb-2" style={{fontVariationSettings:"'opsz' 144"}}>
          The Daily
        </h1>
        <p className="italic mb-8" style={{color:"#6b5a45"}}>Enter your passphrase to continue.</p>

        <label className="text-[10px] uppercase tracking-[0.25em] block mb-1.5" style={mono("#6b5a45")}>Password</label>
        <input type="password" value={pw} onChange={e=>setPw(e.target.value)} autoFocus
          className="w-full text-lg bg-transparent border-b pb-1 outline-none focus:border-black transition"
          style={{borderColor:"#1a141040"}} />
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

        <button type="submit" disabled={loading || !pw}
          className="mt-6 text-xs uppercase tracking-[0.25em] px-4 py-2.5 text-white hover:opacity-80 transition inline-flex items-center gap-2 disabled:opacity-40"
          style={{background:"#1a1410",...mono()}}>
          {loading && <Loader2 className="animate-spin" size={14}/>} Enter
        </button>
      </form>
    </div>
  );
}

// ── Planner ───────────────────────────────────────────────────────────────────

function Planner({ onLogout }) {
  const [loaded,     setLoaded]     = useState(false);
  const [cursor,     setCursor]     = useState(today());
  const [routine,    setRoutine]    = useState([]);
  const [overrides,  setOverrides]  = useState({});
  const [done,       setDone]       = useState({});
  const [categories, setCategories] = useState([]);
  const [showAdd,    setShowAdd]    = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [now,        setNow]        = useState(new Date());
  const [view,       setView]       = useState("timeline");
  const [syncErr,    setSyncErr]    = useState("");

  useEffect(() => {
    const t = setInterval(()=>setNow(new Date()), 30_000);
    return ()=>clearInterval(t);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await api.getState();
      setRoutine(s.routine || []);
      setOverrides(s.overrides || {});
      setDone(s.done || {});
      setCategories(s.categories || []);
      setLoaded(true);
      setSyncErr("");
    } catch(err) {
      if (err.status === 401) { onLogout(); return; }
      setSyncErr("Couldn't reach the server.");
    }
  }, [onLogout]);

  useEffect(()=>{ refresh(); }, [refresh]);

  const dateKey   = toKey(cursor);
  const isToday   = dateKey === toKey(today());
  const catMap    = useMemo(()=>Object.fromEntries(categories.map(c=>[c.id,c])), [categories]);

  const dayTasks = useMemo(()=>{
    const r = routine.filter(t=>repeatApplies(t.repeat, cursor)).map(t=>({...t,source:"routine"}));
    const o = (overrides[dateKey]||[]).map(t=>({...t,source:"override"}));
    return [...r,...o].sort((a,b)=>toMin(a.start)-toMin(b.start));
  }, [routine, overrides, dateKey, cursor]);

  const doneMap       = done[dateKey] || {};
  const completedCount = dayTasks.filter(t=>doneMap[t.id]).length;
  const progress      = dayTasks.length ? completedCount/dayTasks.length : 0;

  // Optimistic helper: run optimistic state update, call API, refresh on failure
  const mutate = (optimistic, call) => {
    optimistic();
    call().catch(err => {
      if (err.status === 401) { onLogout(); return; }
      setSyncErr("Sync failed — refreshing."); refresh();
    });
  };

  const toggleDone = (taskId) => {
    const was = !!doneMap[taskId];
    mutate(
      () => setDone(prev => {
        const day = {...(prev[dateKey]||{})};
        was ? delete day[taskId] : (day[taskId]=true);
        return {...prev, [dateKey]: day};
      }),
      () => was ? api.unmarkDone(dateKey,taskId) : api.markDone(dateKey,taskId)
    );
  };

  const addTask = async (task, scope) => {
    const payload = {...task, id:uid()};
    try {
      if (scope === "routine") {
        await api.createRoutine(payload);
        setRoutine(prev=>[...prev, payload]);
      } else {
        await api.createOverride(dateKey, payload);
        setOverrides(prev=>({...prev,[dateKey]:[...(prev[dateKey]||[]),payload]}));
      }
    } catch(err) { if(err.status===401) onLogout(); else { setSyncErr("Couldn't save."); refresh(); } }
  };

  const updateTask = async (task, scope) => {
    try {
      if (scope === "routine") {
        await api.updateRoutine(task.id, task);
        setRoutine(prev=>prev.map(t=>t.id===task.id?task:t));
      } else {
        await api.updateOverride(dateKey, task.id, task);
        setOverrides(prev=>({...prev,[dateKey]:(prev[dateKey]||[]).map(t=>t.id===task.id?task:t)}));
      }
    } catch(err) { if(err.status===401) onLogout(); else { setSyncErr("Couldn't save."); refresh(); } }
  };

  const deleteTask = async (task) => {
    try {
      if (task.source==="routine") {
        await api.deleteRoutine(task.id);
        setRoutine(prev=>prev.filter(t=>t.id!==task.id));
      } else {
        await api.deleteOverride(dateKey, task.id);
        setOverrides(prev=>({...prev,[dateKey]:(prev[dateKey]||[]).filter(t=>t.id!==task.id)}));
      }
      setEditing(null); setShowAdd(false);
    } catch(err) { if(err.status===401) onLogout(); else { setSyncErr("Couldn't delete."); refresh(); } }
  };

  const openAdd  = ()  => { setEditing(null); setShowAdd(true); };
  const openEdit = (t) => { setEditing(t);    setShowAdd(true); };
  const closeModal = () => { setShowAdd(false); setEditing(null); };

  const greeting = useMemo(()=>{
    const h = now.getHours();
    return h<5?"Still up":h<12?"Good morning":h<17?"Good afternoon":h<21?"Good evening":"Good night";
  },[now]);

  const dayOfYear = Math.ceil(((cursor - new Date(cursor.getFullYear(),0,1))/86400000)+1);
  const nowMin    = now.getHours()*60+now.getMinutes();

  if (!loaded) return <Splash />;

  return (
    <div className="min-h-screen w-full" style={{...PAPER,color:"#1a1410",fontFamily:"'Fraunces','Iowan Old Style',Georgia,serif"}}>
      <Fonts />
      <div className="max-w-5xl mx-auto px-6 md:px-10 py-8 md:py-12">

        {/* Masthead */}
        <header className="flex items-start justify-between pb-6 border-b" style={{borderColor:"#1a141020"}}>
          <div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-none" style={{fontVariationSettings:"'opsz' 144"}}>
                The Daily
              </h1>
              <span className="text-xs uppercase tracking-[0.25em]" style={mono("#6b5a45")}>
                Vol. {cursor.getFullYear()} · No. {dayOfYear}
              </span>
            </div>
            <p className="mt-2 text-sm italic" style={{color:"#6b5a45"}}>{greeting}. Here is the shape of your day.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={()=>setView(v=>v==="timeline"?"list":"timeline")}
              className="text-xs uppercase tracking-[0.2em] px-3 py-2 border hover:bg-black hover:text-white transition hidden sm:block"
              style={{borderColor:"#1a1410",...mono()}}>
              {view==="timeline"?"List":"Timeline"}
            </button>
            <button onClick={openAdd}
              className="text-xs uppercase tracking-[0.2em] px-3 py-2 text-white hover:opacity-80 transition flex items-center gap-1.5"
              style={{background:"#1a1410",...mono()}}>
              <Plus size={14}/> New
            </button>
            <button onClick={async()=>{ await api.logout(); onLogout(); }} title="Log out"
              className="p-2 border hover:bg-black hover:text-white transition"
              style={{borderColor:"#1a141040"}}>
              <LogOut size={14}/>
            </button>
          </div>
        </header>

        {syncErr && (
          <div className="mt-4 text-xs px-3 py-2" style={{background:"#c2410c15",color:"#c2410c",...mono()}}>
            {syncErr}
          </div>
        )}

        {/* Date navigation */}
        <div className="flex items-center justify-between mt-6 mb-8">
          <div className="flex items-center gap-3">
            <button onClick={()=>setCursor(c=>addDays(c,-1))} className="p-1.5 hover:bg-black/5 rounded-full transition">
              <ChevronLeft size={18}/>
            </button>
            <div>
              <div className="text-xs uppercase tracking-[0.3em]" style={mono("#6b5a45")}>
                {cursor.toLocaleDateString(undefined,{weekday:"long"})}
              </div>
              <div className="text-2xl font-semibold tracking-tight" style={{fontVariationSettings:"'opsz' 72"}}>
                {cursor.toLocaleDateString(undefined,{month:"long",day:"numeric",year:"numeric"})}
              </div>
            </div>
            <button onClick={()=>setCursor(c=>addDays(c,1))} className="p-1.5 hover:bg-black/5 rounded-full transition">
              <ChevronRight size={18}/>
            </button>
            {!isToday && (
              <button onClick={()=>setCursor(today())}
                className="text-[11px] uppercase tracking-[0.2em] px-2.5 py-1 border rounded-full hover:bg-black hover:text-white transition"
                style={{borderColor:"#1a141040",...mono()}}>Today</button>
            )}
          </div>
          <div className="hidden md:flex items-center gap-3">
            <span className="text-[11px] uppercase tracking-[0.25em]" style={mono("#6b5a45")}>
              {completedCount} / {dayTasks.length} done
            </span>
            <div className="w-32 h-[3px] bg-black/10 overflow-hidden">
              <div className="h-full transition-all duration-500" style={{width:`${progress*100}%`,background:"#1a1410"}}/>
            </div>
          </div>
        </div>

        {/* Week strip */}
        <WeekStrip cursor={cursor} setCursor={setCursor} done={done} routine={routine} overrides={overrides}/>

        {/* Main view */}
        {dayTasks.length === 0
          ? <EmptyState onAdd={openAdd}/>
          : view === "timeline"
            ? <Timeline tasks={dayTasks} catMap={catMap} doneMap={doneMap}
                onToggle={toggleDone} onEdit={openEdit}
                isToday={isToday} nowMin={nowMin}/>
            : <ListView tasks={dayTasks} catMap={catMap} doneMap={doneMap}
                onToggle={toggleDone} onEdit={openEdit}/>
        }

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t flex flex-wrap items-center gap-x-6 gap-y-2" style={{borderColor:"#1a141020"}}>
          <span className="text-[11px] uppercase tracking-[0.3em]" style={mono("#6b5a45")}>Categories</span>
          {categories.map(c=>(
            <span key={c.id} className="flex items-center gap-2 text-sm">
              <span className="w-2.5 h-2.5 rounded-full" style={{background:c.color}}/>
              {c.name}
            </span>
          ))}
          <span className="ml-auto text-[10px] italic" style={{color:"#6b5a4580"}}>Synced · SQLite on your VPS</span>
        </footer>
      </div>

      {showAdd && (
        <TaskModal
          task={editing}
          categories={categories}
          onClose={closeModal}
          onSave={(task,scope)=>{ editing ? updateTask(task,scope) : addTask(task,scope); closeModal(); }}
          onDelete={editing ? ()=>deleteTask(editing) : null}
          defaultScope={editing ? (editing.source==="routine"?"routine":"today") : "routine"}
        />
      )}
    </div>
  );
}

// ── Week strip ────────────────────────────────────────────────────────────────

function WeekStrip({ cursor, setCursor, done, routine, overrides }) {
  const monday = useMemo(()=>{
    const d = new Date(cursor);
    d.setDate(d.getDate() - (d.getDay()+6)%7);
    d.setHours(0,0,0,0); return d;
  },[cursor]);
  const days = Array.from({length:7},(_,i)=>addDays(monday,i));

  return (
    <div className="grid grid-cols-7 gap-1 mb-10">
      {days.map(d=>{
        const k       = toKey(d);
        const isSel   = k === toKey(cursor);
        const isTod   = k === toKey(today());
        const total   = routine.filter(t=>repeatApplies(t.repeat,d)).length + (overrides[k]||[]).length;
        const doneN   = Object.keys(done[k]||{}).length;
        const pct     = total ? doneN/total : 0;
        return (
          <button key={k} onClick={()=>setCursor(d)} className="text-left p-2 transition"
            style={{
              background: isSel?"#1a1410":"transparent",
              color:      isSel?"#faf5e9":"#1a1410",
              border:     `1px solid ${isSel?"#1a1410":"#1a141015"}`,
            }}>
            <div className="text-[9px] uppercase tracking-[0.2em] opacity-70" style={mono()}>
              {d.toLocaleDateString(undefined,{weekday:"short"})}
            </div>
            <div className="flex items-baseline justify-between mt-0.5">
              <span className="text-xl font-semibold" style={{fontVariationSettings:"'opsz' 72"}}>{d.getDate()}</span>
              {isTod && <span className="text-[8px] uppercase tracking-widest" style={mono()}>now</span>}
            </div>
            <div className="h-[2px] mt-2" style={{background:isSel?"#faf5e930":"#1a141015"}}>
              <div className="h-full transition-all" style={{width:`${pct*100}%`,background:isSel?"#faf5e9":"#1a1410"}}/>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────

function Timeline({ tasks, catMap, doneMap, onToggle, onEdit, isToday, nowMin }) {
  const starts  = tasks.map(t => toMin(t.start));
  const ends    = tasks.map(t => toMin(t.start) + t.duration);
  const startH  = Math.max(0, Math.floor(Math.min(...starts, 300) / 60));
  const endH    = Math.min(24, Math.ceil(Math.max(...ends, 22 * 60) / 60));
  const hours   = Array.from({ length: endH - startH }, (_, i) => startH + i);

  // Single source of truth: 64px per hour, all tops computed through px()
  const PX_PER_HOUR = 64;
  const px = (minSinceStart) => Math.round((minSinceStart / 60) * PX_PER_HOUR);
  const totalHeight = px((endH - startH) * 60);

  // Column layout constants
  const LABEL_W  = 52; // px — time label column
  const GUTTER   = 8;  // px — gap between label and blocks
  const BLOCK_L  = LABEL_W + GUTTER; // 60px from left

  return (
    <div className="relative w-full" style={{ height: totalHeight + 32 }}>

      {/* ── Hour rules and labels ── flat, no nested absolutes */}
      {hours.map(h => {
        const y = px((h - startH) * 60);
        return (
          <React.Fragment key={h}>
            {/* Full-width horizontal rule */}
            <div className="absolute left-0 right-0 border-t"
              style={{ top: y, borderColor: "#1a141015" }} />
            {/* Time label, positioned 3px below the rule */}
            <div className="absolute text-[10px] uppercase tracking-[0.15em]"
              style={{ top: y + 4, left: 0, width: LABEL_W, ...mono("#9a8a74") }}>
              {minToLabel(h * 60)}
            </div>
          </React.Fragment>
        );
      })}

      {/* ── Now line ── */}
      {isToday && nowMin >= startH * 60 && nowMin < endH * 60 && (() => {
        const y = px(nowMin - startH * 60);
        return (
          <React.Fragment>
            <div className="absolute left-0 right-0 h-[1.5px] z-10 pointer-events-none"
              style={{ top: y, background: "#c2410c" }} />
            <div className="absolute z-10 pointer-events-none text-[9px] uppercase tracking-widest px-1.5 py-0.5 text-white"
              style={{ top: y - 9, right: 0, background: "#c2410c", ...mono() }}>
              {minToLabel(nowMin)}
            </div>
          </React.Fragment>
        );
      })()}

      {/* ── Task blocks ── all direct children of the relative container */}
      {tasks.map(t => {
        const cat    = catMap[t.category] || { color: "#475569", name: "—" };
        const topPx  = px(toMin(t.start) - startH * 60);
        const blockH = Math.max(28, px(t.duration) - 3); // -3 = visual gap between touching blocks
        const isDone = !!doneMap[t.id];

        return (
          <div key={t.id}
            onClick={() => onEdit(t)}
            className="absolute cursor-pointer transition-transform hover:translate-x-0.5"
            style={{
              top:    topPx,
              left:   BLOCK_L,
              right:  0,
              height: blockH,
              background:  isDone ? "#1a14100a" : "#ffffff80",
              borderLeft:  `3px solid ${cat.color}`,
              boxShadow:   isDone ? "none" : "0 1px 0 #1a141010, 0 4px 12px -6px #1a141020",
              overflow: "hidden",
            }}>
            <div className="flex items-start justify-between gap-2 px-3 py-1.5 h-full">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={e => { e.stopPropagation(); onToggle(t.id); }}
                    className="flex-shrink-0 hover:scale-110 transition">
                    {isDone
                      ? <CheckCircle2 size={16} style={{ color: cat.color }} />
                      : <Circle       size={16} style={{ color: "#1a141030" }} />}
                  </button>
                  <h3 className={`font-semibold text-[14px] leading-tight truncate ${isDone ? "line-through opacity-50" : ""}`}
                    style={{ fontVariationSettings: "'opsz' 36" }}>
                    {t.title}
                  </h3>
                </div>
                {blockH > 52 && (
                  <div className="mt-0.5 ml-6 flex items-center gap-3 text-[10px]" style={mono("#6b5a45")}>
                    <span>{minToLabel(toMin(t.start))} – {minToLabel(toMin(t.start) + t.duration)}</span>
                    <span className="uppercase tracking-widest">{cat.name}</span>
                    {t.repeat !== "none" && t.source === "routine" &&
                      <span className="flex items-center gap-1"><Repeat size={9} />{t.repeat}</span>}
                  </div>
                )}
              </div>
              {blockH <= 52 && (
                <span className="text-[10px] flex-shrink-0 leading-none pt-0.5" style={mono("#6b5a45")}>
                  {t.duration}m
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────

function ListView({ tasks, catMap, doneMap, onToggle, onEdit }) {
  return (
    <div className="divide-y" style={{borderColor:"#1a141015"}}>
      {tasks.map(t=>{
        const cat    = catMap[t.category]||{color:"#475569",name:"—"};
        const isDone = !!doneMap[t.id];
        return (
          <div key={t.id} onClick={()=>onEdit(t)}
            className="group flex items-center gap-4 py-4 cursor-pointer hover:bg-black/[0.02] transition px-2 -mx-2">
            <button onClick={e=>{e.stopPropagation();onToggle(t.id);}} className="flex-shrink-0 hover:scale-110 transition">
              {isDone
                ? <CheckCircle2 size={20} style={{color:cat.color}}/>
                : <Circle       size={20} style={{color:"#1a141030"}}/>}
            </button>
            <div className="w-20 text-right text-sm tabular-nums" style={mono("#6b5a45")}>
              {minToLabel(toMin(t.start))}
            </div>
            <div className="w-[3px] self-stretch rounded-full" style={{background:cat.color}}/>
            <div className="flex-1 min-w-0">
              <div className={`font-semibold text-base ${isDone?"line-through opacity-50":""}`}
                style={{fontVariationSettings:"'opsz' 36"}}>{t.title}</div>
              <div className="text-[11px] uppercase tracking-[0.2em] mt-0.5" style={mono("#6b5a45")}>
                {cat.name} · {t.duration} min
                {t.repeat!=="none"&&t.source==="routine"?` · ${t.repeat}`:""}
              </div>
            </div>
            <span className="text-[10px] uppercase tracking-widest opacity-0 group-hover:opacity-100 transition" style={mono("#6b5a45")}>
              edit →
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onAdd }) {
  return (
    <div className="py-24 text-center">
      <div className="text-[11px] uppercase tracking-[0.3em] mb-3" style={mono("#6b5a45")}>A blank page</div>
      <h2 className="text-3xl md:text-4xl font-black mb-3" style={{fontVariationSettings:"'opsz' 144"}}>
        Nothing scheduled today.
      </h2>
      <p className="text-sm italic max-w-md mx-auto mb-6" style={{color:"#6b5a45"}}>
        Begin with one small thing. A walk, a page, a glass of water. The rest follows.
      </p>
      <button onClick={onAdd}
        className="text-xs uppercase tracking-[0.25em] px-4 py-2.5 text-white hover:opacity-80 transition inline-flex items-center gap-2"
        style={{background:"#1a1410",...mono()}}>
        <Plus size={14}/> Add a block
      </button>
    </div>
  );
}

// ── Task modal ────────────────────────────────────────────────────────────────

function TaskModal({ task, categories, onClose, onSave, onDelete, defaultScope }) {
  const [title,    setTitle]    = useState(task?.title    || "");
  const [start,    setStart]    = useState(task?.start    || "09:00");
  const [duration, setDuration] = useState(task?.duration || 30);
  const [category, setCategory] = useState(task?.category || categories[0]?.id || "");
  const [repeat,   setRepeat]   = useState(task?.repeat   || "daily");
  const [scope,    setScope]    = useState(defaultScope);
  const inputRef = useRef(null);

  useEffect(()=>{ inputRef.current?.focus(); },[]);
  useEffect(()=>{
    const fn = e=>{ if(e.key==="Escape") onClose(); };
    window.addEventListener("keydown",fn);
    return ()=>window.removeEventListener("keydown",fn);
  },[onClose]);

  const submit = () => {
    if (!title.trim()) return;
    onSave({
      ...(task||{}),
      title:title.trim(), start, duration:Number(duration)||30, category,
      repeat: scope==="today"?"none":repeat,
    }, scope);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{background:"#1a141080",backdropFilter:"blur(4px)"}} onClick={onClose}>
      <div className="w-full max-w-md" onClick={e=>e.stopPropagation()}
        style={{background:"#faf5e9",fontFamily:"'Fraunces',Georgia,serif",
          boxShadow:"0 40px 80px -20px #1a141060",border:"1px solid #1a141020"}}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{borderColor:"#1a141020"}}>
          <h2 className="text-xl font-bold" style={{fontVariationSettings:"'opsz' 72"}}>
            {task?"Edit block":"New block"}
          </h2>
          <button onClick={onClose} className="hover:opacity-60 transition"><X size={18}/></button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Title */}
          <div>
            <label className="text-[10px] uppercase tracking-[0.25em] block mb-1.5" style={mono("#6b5a45")}>Title</label>
            <input ref={inputRef} type="text" value={title} onChange={e=>setTitle(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter") submit(); }}
              placeholder="What will you do?"
              className="w-full text-xl font-semibold bg-transparent border-b pb-1 outline-none focus:border-black transition"
              style={{borderColor:"#1a141030",fontVariationSettings:"'opsz' 72"}}/>
          </div>

          {/* Start + Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-[0.25em] block mb-1.5" style={mono("#6b5a45")}>Start</label>
              <input type="time" value={start} onChange={e=>setStart(e.target.value)}
                className="w-full bg-transparent border px-3 py-2 outline-none focus:border-black transition"
                style={{borderColor:"#1a141030",...mono()}}/>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.25em] block mb-1.5" style={mono("#6b5a45")}>Duration (min)</label>
              <input type="number" min="5" step="5" value={duration} onChange={e=>setDuration(e.target.value)}
                className="w-full bg-transparent border px-3 py-2 outline-none focus:border-black transition"
                style={{borderColor:"#1a141030",...mono()}}/>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="text-[10px] uppercase tracking-[0.25em] block mb-1.5" style={mono("#6b5a45")}>Category</label>
            <div className="flex flex-wrap gap-1.5">
              {categories.map(c=>(
                <button key={c.id} onClick={()=>setCategory(c.id)}
                  className="text-xs px-2.5 py-1.5 transition flex items-center gap-1.5"
                  style={{
                    border:`1px solid ${category===c.id?c.color:"#1a141020"}`,
                    background: category===c.id?`${c.color}15`:"transparent",
                    color: category===c.id?c.color:"#1a1410",
                  }}>
                  <span className="w-2 h-2 rounded-full" style={{background:c.color}}/>
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {/* Scope */}
          <div>
            <label className="text-[10px] uppercase tracking-[0.25em] block mb-1.5" style={mono("#6b5a45")}>Applies to</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[["routine","Routine","repeats across days"],["today","This day only","one-off block"]].map(([s,label,sub])=>(
                <button key={s} onClick={()=>setScope(s)} className="text-xs px-3 py-2 transition text-left"
                  style={{
                    border:`1px solid ${scope===s?"#1a1410":"#1a141020"}`,
                    background:scope===s?"#1a1410":"transparent",
                    color:scope===s?"#faf5e9":"#1a1410",
                  }}>
                  <div className="font-semibold text-sm" style={{fontFamily:"'Fraunces',serif"}}>{label}</div>
                  <div className="text-[10px] opacity-70 mt-0.5" style={mono()}>{sub}</div>
                </button>
              ))}
            </div>
            {scope==="routine" && (
              <div className="flex gap-1.5">
                {["daily","weekdays","weekends"].map(r=>(
                  <button key={r} onClick={()=>setRepeat(r)}
                    className="flex-1 text-[11px] uppercase tracking-widest px-2 py-1.5 transition"
                    style={{
                      border:`1px solid ${repeat===r?"#1a1410":"#1a141020"}`,
                      background:repeat===r?"#1a141008":"transparent",
                      ...mono(),
                    }}>{r}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t" style={{borderColor:"#1a141020"}}>
          {onDelete
            ? <button onClick={onDelete} className="text-xs uppercase tracking-[0.2em] text-red-700 hover:text-red-900 transition flex items-center gap-1.5" style={mono()}>
                <Trash2 size={12}/> Delete
              </button>
            : <span/>}
          <div className="flex gap-2">
            <button onClick={onClose} className="text-xs uppercase tracking-[0.2em] px-3 py-2 hover:bg-black/5 transition" style={mono()}>
              Cancel
            </button>
            <button onClick={submit} className="text-xs uppercase tracking-[0.2em] px-4 py-2 text-white hover:opacity-80 transition" style={{background:"#1a1410",...mono()}}>
              {task?"Save":"Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
