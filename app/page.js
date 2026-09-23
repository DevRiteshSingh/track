"use client";

import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "recomp-tracker-v2";

const DEFAULT_TARGETS = {
  calories: 2450,
  protein: 160,
  carbs: 275,
  fats: 70,
  water: 3,
  steps: 8000,
  sleep: 8,
};

const START = {
  profile: {
    name: "My journey",
    height: 173,
    age: 21,
    startWeight: 87,
    goal: "Lean recomposition",
    // Calculator + manual-weight inputs
    sex: "male",
    neck: 38,
    waist: 85,
    hip: 95,
    activityLevel: "moderate",
    goalBodyFat: 15,
    weightMode: "auto", // "auto" (14-day average from logs) or "manual" (typed in directly)
    manualWeight: 87,
  },
  targets: DEFAULT_TARGETS,
  meals: [],
  lifts: [],
  logs: [],
};

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  veryActive: 1.9,
};

const TEXT_PROFILE_KEYS = new Set(["name", "goal", "sex", "activityLevel", "weightMode"]);

const exercises = {
  "Upper A": [
    "Bench Press",
    "Lat Pulldown",
    "Seated Cable Row",
    "Incline Dumbbell Press",
    "Lateral Raise",
    "Triceps Pushdown",
    "Dumbbell Curl",
  ],
  "Lower A": [
    "Squat / Leg Press",
    "Romanian Deadlift",
    "Leg Curl",
    "Leg Extension",
    "Calf Raise",
    "Abs",
  ],
  "Upper B": [
    "Overhead Press",
    "Pull-up / Lat Pulldown",
    "Chest-supported Row",
    "Chest Press",
    "Lateral Raise",
    "Triceps Extension",
    "Hammer Curl",
  ],
  "Lower B": [
    "Leg Press / Squat",
    "Romanian Deadlift",
    "Bulgarian Split Squat",
    "Leg Curl",
    "Calf Raise",
    "Abs",
  ],
};

const nav = [
  ["dashboard", "grid", "Overview"],
  ["today", "check", "Daily log"],
  ["workout", "dumbbell", "Training"],
  ["nutrition", "apple", "Nutrition"],
  ["calculators", "calc", "Calculators"],
  ["progress", "chart", "Progress"],
  ["settings", "settings", "Settings"],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function shiftDate(date, amount) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + amount);
  return localDate(next);
}

function formatDate(date, options = { day: "numeric", month: "short" }) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", options);
}

function number(value) {
  return Number(value) || 0;
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function recommendation(date) {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  return (
    {
      1: "Upper A",
      2: "Lower A",
      4: "Upper B",
      5: "Lower B",
    }[weekday] || "Recovery"
  );
}

// Mifflin-St Jeor: kcal/day at rest.
function calcBMR({ sex, weight, height, age }) {
  const base = 10 * number(weight) + 6.25 * number(height) - 5 * number(age);
  return sex === "female" ? base - 161 : base + 5;
}

function calcTDEE(bmr, activityLevel) {
  return bmr * (ACTIVITY_MULTIPLIERS[activityLevel] || ACTIVITY_MULTIPLIERS.moderate);
}

// US Navy tape-measure method — an estimate, not a clinical measurement.
function calcBodyFatNavy({ sex, height, waist, neck, hip }) {
  const h = number(height);
  if (sex === "female") {
    const term = number(waist) + number(hip) - number(neck);
    if (term <= 0 || h <= 0) return 0;
    return 495 / (1.29579 - 0.35004 * Math.log10(term) + 0.221 * Math.log10(h)) - 450;
  }
  const term = number(waist) - number(neck);
  if (term <= 0 || h <= 0) return 0;
  return 495 / (1.0324 - 0.19077 * Math.log10(term) + 0.15456 * Math.log10(h)) - 450;
}

function calcLeanMass(weight, bodyFatPct) {
  return number(weight) * (1 - clamp(bodyFatPct, 0, 70) / 100);
}

function calcWeightToGoal(weight, bodyFatPct, goalBodyFatPct) {
  const lbm = calcLeanMass(weight, bodyFatPct);
  const goal = clamp(goalBodyFatPct, 0, 70);
  if (goal >= 99) return { targetWeight: number(weight), toLose: 0 };
  const targetWeight = lbm / (1 - goal / 100);
  return { targetWeight, toLose: number(weight) - targetWeight };
}

function normalizeData(raw) {
  const targets = Object.fromEntries(
    Object.entries(DEFAULT_TARGETS).map(([key, fallback]) => {
      const candidate = raw?.targets?.[key] ?? raw?.[key] ?? fallback;
      const value = Number(candidate);
      return [key, Number.isFinite(value) ? value : fallback];
    })
  );

  return {
    ...START,
    ...raw,
    profile: {
      ...START.profile,
      ...(raw?.profile || {}),
      startWeight: raw?.profile?.startWeight ?? raw?.weight ?? START.profile.startWeight,
    },
    targets,
    meals: (raw?.meals || []).map((meal) => ({
      ...meal,
      carbs: number(meal.carbs),
      fats: number(meal.fats),
    })),
    lifts: raw?.lifts || [],
    logs: raw?.logs || [],
  };
}

// ---------------------------------------------------------------------------
// Icon
// ---------------------------------------------------------------------------

function Icon({ name, size = 18, stroke = 1.9 }) {
  const paths = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    check: <path d="m5 12 4.2 4L19 6.5" />,
    dumbbell: (
      <>
        <path d="M6 8v8M3.5 10v4M18 8v8M20.5 10v4M6 12h12" />
        <path d="M8 8v8M16 8v8" />
      </>
    ),
    apple: (
      <>
        <path d="M12 7.2c-1.6-2.1-.2-4.1.2-4.7 1.1 1.4 1 3.1-.2 4.7Z" />
        <path d="M12.8 6.5c2.2-2 5.5-1.1 6.8.2-1.5 1.2-1.5 3.2-.2 4.5-1.1 5.3-3.1 8.3-5.7 8.3-1 0-1.6-.6-2.7-.6s-1.8.6-2.7.6c-2.5 0-4.6-3.2-5.6-7.7-.7-3.3 1.1-5.9 3.6-6.3 1.3-.2 2.4.6 3 .6.7 0 2-1 3.5-.6Z" />
      </>
    ),
    chart: (
      <>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="m7 15 4-4 3 2 5-6" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.05 2.05-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56v.09h-2.9v-.09a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.05-2.05.06-.06A1.7 1.7 0 0 0 7.27 15a1.7 1.7 0 0 0-1.56-1.03h-.09v-2.9h.09a1.7 1.7 0 0 0 1.56-1.03 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.05-2.05.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.56V4.8h2.9v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.05 2.05-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.03h.09v2.9h-.09A1.7 1.7 0 0 0 19.4 15Z" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="m9 18 6-6-6-6" />,
    chevron: <path d="m15 18-6-6 6-6" />,
    water: <path d="M12 3.3s6.3 6.5 6.3 11a6.3 6.3 0 0 1-12.6 0c0-4.5 6.3-11 6.3-11Z" />,
    steps: (
      <>
        <path d="M7 4.5c0 1.4-.9 2.5-2.1 2.5S2.8 5.9 2.8 4.5 3.7 2 4.9 2 7 3.1 7 4.5Z" />
        <path d="M14.7 19.5c0 1.4-1.4 2.5-3.1 2.5s-3.1-1.1-3.1-2.5S9.9 17 11.6 17s3.1 1.1 3.1 2.5Z" />
        <path d="M13.5 10.5c0 1.3-1.1 2.3-2.5 2.3s-2.5-1-2.5-2.3S9.6 8.2 11 8.2s2.5 1 2.5 2.3Z" />
        <path d="M21.2 13.5c0 1.2-1.1 2.2-2.4 2.2s-2.4-1-2.4-2.2 1.1-2.2 2.4-2.2 2.4 1 2.4 2.2Z" />
      </>
    ),
    moon: <path d="M20.5 15.5A8.7 8.7 0 0 1 8.5 3.5a8.8 8.8 0 1 0 12 12Z" />,
    flame: (
      <path d="M12.1 2.7c1.4 3.1-.7 4.5.6 6.2.6.8 1.7 1 2.5.4.8-.6 1-1.7.6-2.6 2.3 1.8 3.5 4 3.5 6.4A7.3 7.3 0 0 1 12 20.5a7.3 7.3 0 0 1-7.3-7.4c0-3.2 1.7-5.8 4.7-8.2-.1 2.4 1 3.5 1.8 3.1.9-.5.4-2.7.9-5.3Z" />
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="1" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" />
        <path d="M10 11v5M14 11v5" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v11" />
        <path d="m8 10 4 4 4-4" />
        <path d="M4 20h16" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 10v5M12 7h.01" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    measure: <path d="M4 20 20 4M7 17l-3-3M10 14l-3-3M13 11l-3-3M16 8l-3-3M20 7l-3-3" />,
    scale: (
      <>
        <path d="M4 19.5h16l-1-11H5l-1 11Z" />
        <path d="M8.5 8.5a3.5 3.5 0 0 1 7 0M12 12l2-1" />
      </>
    ),
    calc: (
      <>
        <rect x="4.5" y="2.5" width="15" height="19" rx="2.5" />
        <path d="M7.5 6.5h9" />
        <path d="M7.7 11h.01M12 11h.01M16.3 11h.01M7.7 14.5h.01M12 14.5h.01M16.3 14.5h.01M7.7 18h.01M12 18h.01M16.3 18h.01" />
      </>
    ),
  };

  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.grid}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Home (root component)
// ---------------------------------------------------------------------------

export default function Home() {
  const [tab, setTab] = useState("dashboard");
  const [data, setData] = useState(START);
  const [date, setDate] = useState(localDate());
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState(null);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("recomp-tracker");
      if (saved) setData(normalizeData(JSON.parse(saved)));
    } catch {
      // A corrupt local backup should never prevent the tracker from opening.
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    // Wait for the load effect above to finish. Previously the empty default state
    // could overwrite a valid backup before React applied the restored data.
    if (storageReady) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data, storageReady]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const dayLog = data.logs.find((item) => item.date === date) || {};
  const mealsToday = data.meals.filter((item) => item.date === date);
  const liftsToday = data.lifts.filter((item) => item.date === date);

  const macros = useMemo(
    () =>
      mealsToday.reduce(
        (total, meal) => ({
          calories: total.calories + number(meal.kcal),
          protein: total.protein + number(meal.protein),
          carbs: total.carbs + number(meal.carbs),
          fats: total.fats + number(meal.fats),
        }),
        { calories: 0, protein: 0, carbs: 0, fats: 0 }
      ),
    [mealsToday]
  );

  const weightHistory = useMemo(
    () =>
      data.logs
        .filter((item) => number(item.weight))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-14),
    [data.logs]
  );

  const latestWeight = weightHistory.at(-1)?.weight || data.profile.startWeight;
  // "auto" derives weight from your logged check-ins; "manual" uses whatever you typed in Settings,
  // so you're never locked into a statistically-averaged number if you'd rather set it yourself.
  const currentWeight =
    data.profile.weightMode === "manual" && number(data.profile.manualWeight)
      ? number(data.profile.manualWeight)
      : number(latestWeight);
  const avgWeight = weightHistory.length
    ? (weightHistory.reduce((sum, item) => sum + number(item.weight), 0) / weightHistory.length).toFixed(1)
    : currentWeight;
  const plan = recommendation(date);

  if (!storageReady) {
    return (
      <div className="app-loading" role="status">
        <span>R</span>
        <p>Opening your tracker</p>
      </div>
    );
  }

  function updateDay(patch) {
    setData((current) => {
      const existing = current.logs.find((item) => item.date === date) || { date };
      const otherLogs = current.logs.filter((item) => item.date !== date);
      return {
        ...current,
        logs: [...otherLogs, { ...existing, ...patch, date }].sort((a, b) => a.date.localeCompare(b.date)),
      };
    });
  }

  function addMeal(meal) {
    setData((current) => ({ ...current, meals: [...current.meals, { ...meal, id: uid(), date }] }));
    setModal(null);
    setToast("Meal added to today");
  }

  function removeMeal(id) {
    setData((current) => ({ ...current, meals: current.meals.filter((meal) => meal.id !== id) }));
    setToast("Meal removed");
  }

  function addLift(lift) {
    setData((current) => ({ ...current, lifts: [...current.lifts, { ...lift, id: uid(), date }] }));
    setModal(null);
    setToast("Set logged — keep it up");
  }

  function toggleExercise(exercise) {
    const done = dayLog.completed || [];
    updateDay({
      completed: done.includes(exercise) ? done.filter((item) => item !== exercise) : [...done, exercise],
    });
  }

  function resetAll() {
    if (!window.confirm("This clears all meals, check-ins and workouts saved in this browser. Continue?")) return;
    setData(START);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("recomp-tracker");
    setToast("Tracker reset");
    setTab("dashboard");
  }

  function exportData() {
    const file = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `recomp-backup-${localDate()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setToast("Backup downloaded");
  }

  const title = {
    dashboard: "Your command center",
    today: "Daily check-in",
    workout: "Training log",
    nutrition: "Nutrition",
    calculators: "Know your numbers",
    progress: "Progress, not perfection",
    settings: "Make it yours",
  }[tab];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setTab("dashboard")} aria-label="Open overview">
          <span className="brand-mark">R</span>
          <span>
            <b>RECOMP</b>
            <small>PERSONAL TRACKER</small>
          </span>
        </button>

        <div className="profile-card">
          <div className="profile-initial">{data.profile.name.slice(0, 1).toUpperCase()}</div>
          <div>
            <b>{data.profile.name}</b>
            <span>
              {Number(currentWeight).toFixed(1)} kg · {data.profile.goal}
            </span>
          </div>
        </div>

        <nav className="nav" aria-label="Primary navigation">
          {nav.map(([id, icon, label]) => (
            <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              <Icon name={icon} />
              <span>{label}</span>
              {id === "today" && <i />}
            </button>
          ))}
        </nav>

        <div className="side-footer">
          <div className="streak">
            <span>
              <Icon name="flame" size={16} />
            </span>
            <div>
              <small>CONSISTENCY SCORE</small>
              <b>
                <Consistency data={data} />% this week
              </b>
            </div>
          </div>
          <button className="sidebar-help" onClick={() => setTab("settings")}>
            <Icon name="info" size={15} /> Your data stays on this device
          </button>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              {formatDate(date, { weekday: "long", day: "numeric", month: "long" }).toUpperCase()}
            </p>
            <h1>{title}</h1>
          </div>

          <div className="top-actions">
            <div className="date-switcher">
              <button onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day">
                <Icon name="chevron" size={17} />
              </button>
              <button className="today-button" onClick={() => setDate(localDate())}>
                {date === localDate() ? "Today" : formatDate(date)}
              </button>
              <button onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day">
                <Icon name="arrow" size={17} />
              </button>
            </div>
            <button className="icon-button desktop-only" onClick={() => setTab("settings")} aria-label="Open settings">
              <Icon name="settings" />
            </button>
          </div>
        </header>

        {tab === "dashboard" && (
          <Dashboard
            data={data}
            date={date}
            dayLog={dayLog}
            macros={macros}
            currentWeight={currentWeight}
            averageWeight={avgWeight}
            plan={plan}
            setTab={setTab}
            setModal={setModal}
          />
        )}

        {tab === "today" && (
          <Today
            log={dayLog}
            targets={data.targets}
            macros={macros}
            meals={mealsToday}
            updateDay={updateDay}
            removeMeal={removeMeal}
            setModal={setModal}
          />
        )}

        {tab === "workout" && (
          <Workout plan={plan} log={dayLog} lifts={liftsToday} toggleExercise={toggleExercise} setModal={setModal} />
        )}

        {tab === "nutrition" && (
          <Nutrition macros={macros} targets={data.targets} meals={mealsToday} removeMeal={removeMeal} setModal={setModal} />
        )}

        {tab === "calculators" && <Calculators data={data} setData={setData} currentWeight={currentWeight} />}

        {tab === "progress" && (
          <Progress data={data} history={weightHistory} averageWeight={avgWeight} currentWeight={currentWeight} />
        )}

        {tab === "settings" && (
          <Settings data={data} setData={setData} exportData={exportData} resetAll={resetAll} />
        )}
      </main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {nav.map(([id, icon, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            <Icon name={icon} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {modal?.type === "meal" && <MealModal onClose={() => setModal(null)} onSave={addMeal} />}
      {modal?.type === "lift" && (
        <LiftModal exercise={modal.exercise} onClose={() => setModal(null)} onSave={addLift} />
      )}

      {toast && (
        <div className="toast">
          <Icon name="check" size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

function Dashboard({ data, date, dayLog, macros, currentWeight, averageWeight, plan, setTab, setModal }) {
  const targets = data.targets;
  const proteinProgress = clamp((macros.protein / targets.protein) * 100);
  const score = dailyScore(dayLog, macros, targets);
  const weekday = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });

  return (
    <section className="dashboard page-enter">
      <div className="hero-card">
        <div className="hero-copy">
          <div className="hero-label">
            <span className="live-dot" /> {score >= 70 ? "A strong day in motion" : "Your next check-in is waiting"}
          </div>
          <h2>
            {weekday === "Mon" ? (
              <>
                Fresh week.
                <br />
                Same <em>focus.</em>
              </>
            ) : (
              <>
                Show up for
                <br />
                <em>future you.</em>
              </>
            )}
          </h2>
          <p>Small inputs compound. Log the essentials, then get back to living your day.</p>
          <div className="hero-actions">
            <button className="button button-primary" onClick={() => setTab("today")}>
              Open daily log <Icon name="arrow" size={16} />
            </button>
            <button className="button button-quiet" onClick={() => setModal({ type: "meal" })}>
              <Icon name="plus" size={15} /> Add meal
            </button>
          </div>
        </div>

        <div className="hero-progress">
          <div className="score-ring" style={{ "--progress": `${score * 3.6}deg` }}>
            <div>
              <b>{score}</b>
              <span>day score</span>
            </div>
          </div>
          <div className="score-note">
            <b>{score >= 80 ? "You’re building momentum" : "A few wins away"}</b>
            <span>{score >= 80 ? "Keep protecting the routine." : "Start with one simple action."}</span>
          </div>
        </div>

        <div className="hero-glow" />
      </div>

      <section className="metric-grid">
        <Metric
          icon="flame"
          tone="lime"
          label="Energy"
          value={macros.calories.toLocaleString()}
          unit={`/ ${targets.calories.toLocaleString()} kcal`}
          progress={(macros.calories / targets.calories) * 100}
          helper={`${Math.max(0, targets.calories - macros.calories).toLocaleString()} kcal remaining`}
        />
        <Metric
          icon="target"
          tone="blue"
          label="Protein"
          value={macros.protein}
          unit={`/ ${targets.protein} g`}
          progress={proteinProgress}
          helper={proteinProgress >= 100 ? "Target reached" : `${targets.protein - macros.protein} g to target`}
        />
        <Metric
          icon="water"
          tone="purple"
          label="Hydration"
          value={number(dayLog.water).toFixed(1)}
          unit={`/ ${targets.water} L`}
          progress={(number(dayLog.water) / targets.water) * 100}
          helper={number(dayLog.water) >= targets.water ? "Well hydrated" : "Add a glass of water"}
        />
        <Metric
          icon="steps"
          tone="orange"
          label="Movement"
          value={number(dayLog.steps).toLocaleString()}
          unit={`/ ${targets.steps.toLocaleString()}`}
          progress={(number(dayLog.steps) / targets.steps) * 100}
          helper={
            number(dayLog.steps) >= targets.steps
              ? "Daily goal met"
              : `${Math.max(0, targets.steps - number(dayLog.steps)).toLocaleString()} steps to go`
          }
        />
      </section>

      <section className="dashboard-grid">
        <div className="surface training-summary">
          <div className="surface-head">
            <div>
              <p className="eyebrow">TODAY'S TRAINING</p>
              <h3>{plan}</h3>
            </div>
            <button className="text-button" onClick={() => setTab("workout")}>
              View session <Icon name="arrow" size={14} />
            </button>
          </div>

          {plan === "Recovery" ? (
            <div className="recovery-message">
              <span>
                <Icon name="moon" size={18} />
              </span>
              <div>
                <b>Today is for recovery.</b>
                <p>Walk, mobilise, sleep well. The work still counts.</p>
              </div>
            </div>
          ) : (
            <div className="exercise-preview">
              {exercises[plan].slice(0, 4).map((exercise, index) => (
                <div key={exercise}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <b>{exercise}</b>
                  <small>{(dayLog.completed || []).includes(exercise) ? "Complete" : "2 sets · 8–10 reps"}</small>
                </div>
              ))}
              <button className="more-exercises" onClick={() => setTab("workout")}>
                + {Math.max(0, exercises[plan].length - 4)} more exercises
              </button>
            </div>
          )}
        </div>

        <div className="surface recovery-card">
          <div className="surface-head">
            <div>
              <p className="eyebrow">RECOVERY CHECK</p>
              <h3>Sleep & stress</h3>
            </div>
            <Icon name="moon" size={19} />
          </div>
          <div className="sleep-readout">
            <b>{number(dayLog.sleep).toFixed(1)}</b>
            <span>hours logged</span>
          </div>
          <div className="progress-track">
            <span style={{ width: `${clamp((number(dayLog.sleep) / targets.sleep) * 100)}%` }} />
          </div>
          <p className="quiet-copy">Aim for {targets.sleep} hours. Recovery makes the training stick.</p>
        </div>
      </section>

      <section className="surface weekly-card">
        <div className="surface-head">
          <div>
            <p className="eyebrow">THIS WEEK</p>
            <h3>Keep the chain alive</h3>
          </div>
          <span className="weekly-score">
            <Icon name="flame" size={15} />
            <Consistency data={data} />% consistency
          </span>
        </div>
        <WeekStrip data={data} date={date} targets={targets} macros={macros} />
      </section>

      <section className="insight-banner">
        <span className="insight-icon">
          <Icon name="chart" size={19} />
        </span>
        <div>
          <b>Weight trend: {averageWeight} kg average</b>
          <p>Focus on your 14-day trend, not a single weigh-in. Your latest is {Number(currentWeight).toFixed(1)} kg.</p>
        </div>
        <button onClick={() => setTab("progress")}>
          See progress <Icon name="arrow" size={14} />
        </button>
      </section>
    </section>
  );
}

function Metric({ icon, tone, label, value, unit, progress, helper }) {
  return (
    <div className={`metric-card ${tone}`}>
      <div className="metric-top">
        <span className="metric-icon">
          <Icon name={icon} size={17} />
        </span>
        <p>{label}</p>
      </div>
      <div className="metric-value">
        <b>{value}</b>
        <small>{unit}</small>
      </div>
      <div className="metric-bar">
        <span style={{ width: `${clamp(progress)}%` }} />
      </div>
      <span className="metric-helper">{helper}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------

function Today({ log, targets, macros, meals, updateDay, removeMeal, setModal }) {
  const fields = [
    ["weight", "Weight", "kg", "scale"],
    ["waist", "Waist", "cm", "measure"],
    ["water", "Water", "litres", "water"],
    ["steps", "Steps", "steps", "steps"],
    ["sleep", "Sleep", "hours", "moon"],
  ];

  const updateValue = (name, value) => updateDay({ [name]: value === "" ? 0 : number(value) });

  return (
    <section className="page-enter daily-page">
      <div className="surface checkin-card">
        <div className="checkin-copy">
          <p className="eyebrow">DAILY FOUNDATIONS</p>
          <h2>Log the things that matter.</h2>
          <p>There’s no need for perfect data — just an honest snapshot of your day.</p>
        </div>

        <div className="checkin-fields">
          {fields.map(([name, label, unit, icon]) => (
            <label key={name} className="input-card">
              <span className="input-label">
                <Icon name={icon} size={14} />
                {label}
              </span>
              <div>
                <input
                  inputMode="decimal"
                  type="number"
                  min="0"
                  value={log[name] || ""}
                  onChange={(event) => updateValue(name, event.target.value)}
                  placeholder="0"
                />
                <small>{unit}</small>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="quick-actions">
        <div>
          <span className="quick-icon">
            <Icon name="water" size={17} />
          </span>
          <span>
            <b>Hydration</b>
            <small>
              {number(log.water).toFixed(1)} / {targets.water} L today
            </small>
          </span>
        </div>
        <div className="quick-buttons">
          <button onClick={() => updateDay({ water: number(log.water) + 0.25 })}>+ 250 ml</button>
          <button onClick={() => updateDay({ water: number(log.water) + 0.5 })}>+ 500 ml</button>
        </div>
      </div>

      <section className="list-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">FOOD LOG</p>
            <h2>Today’s fuel</h2>
          </div>
          <div className="section-total">
            <b>{macros.calories.toLocaleString()}</b>
            <span>/ {targets.calories} kcal</span>
          </div>
          <button className="button button-primary compact" onClick={() => setModal({ type: "meal" })}>
            <Icon name="plus" size={15} /> Add meal
          </button>
        </div>
        <MacroOverview macros={macros} targets={targets} />
        <MealList meals={meals} onRemove={removeMeal} />
      </section>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Workout
// ---------------------------------------------------------------------------

function Workout({ plan, log, lifts, toggleExercise, setModal }) {
  const list = exercises[plan] || [];
  const completed = log.completed || [];
  const doneCount = completed.filter((exercise) => list.includes(exercise)).length;

  return (
    <section className="page-enter workout-page">
      <div className="workout-banner">
        <div>
          <p className="eyebrow">YOUR SPLIT FOR TODAY</p>
          <h2>{plan === "Recovery" ? "Recover with intention." : plan}</h2>
          <p>
            {plan === "Recovery"
              ? "A relaxed walk, mobility and an early night are a productive session today."
              : "Two quality working sets. Put form first and make a note of what you lifted."}
          </p>
        </div>
        <div className="workout-progress">
          <svg viewBox="0 0 42 42">
            <circle cx="21" cy="21" r="16" />
            <circle
              className="ring-value"
              cx="21"
              cy="21"
              r="16"
              strokeDasharray={`${list.length ? (doneCount / list.length) * 100 : 100} 100`}
            />
          </svg>
          <div>
            <b>{plan === "Recovery" ? "—" : `${doneCount}/${list.length}`}</b>
            <span>{plan === "Recovery" ? "rest day" : "complete"}</span>
          </div>
        </div>
      </div>

      {plan === "Recovery" ? (
        <div className="surface recovery-plan">
          <div className="recovery-message">
            <span>
              <Icon name="moon" size={20} />
            </span>
            <div>
              <b>Recovery is training support.</b>
              <p>Choose one: 30–45 minute walk, 10 minutes mobility, or simply rest.</p>
            </div>
          </div>
          <button className="button button-primary compact" onClick={() => toggleExercise("Recovery complete")}>
            {completed.includes("Recovery complete") ? "Recovery logged" : "Log recovery"}
          </button>
        </div>
      ) : (
        <div className="workout-list">
          {list.map((exercise, index) => {
            const isDone = completed.includes(exercise);
            const exerciseLifts = lifts.filter((lift) => lift.exercise === exercise);
            return (
              <article className={`exercise-row ${isDone ? "is-done" : ""}`} key={exercise}>
                <button className="complete-button" onClick={() => toggleExercise(exercise)} aria-label={`Mark ${exercise} complete`}>
                  {isDone && <Icon name="check" size={15} />}
                </button>
                <span className="exercise-number">{String(index + 1).padStart(2, "0")}</span>
                <div className="exercise-info">
                  <b>{exercise}</b>
                  <span>2 working sets · 8–10 reps</span>
                  {exerciseLifts.length > 0 && (
                    <small>{exerciseLifts.map((lift) => `${lift.weight} kg × ${lift.reps}`).join("  ·  ")}</small>
                  )}
                </div>
                <button className="log-set-button" onClick={() => setModal({ type: "lift", exercise })}>
                  <Icon name="plus" size={14} /> Log set
                </button>
              </article>
            );
          })}
        </div>
      )}

      <section className="surface history-card">
        <div className="surface-head">
          <div>
            <p className="eyebrow">SESSION NOTES</p>
            <h3>Sets logged today</h3>
          </div>
          <span className="set-count">
            {lifts.length} {lifts.length === 1 ? "set" : "sets"}
          </span>
        </div>
        {lifts.length ? (
          <div className="set-history">
            {lifts.map((lift) => (
              <div key={lift.id}>
                <b>{lift.exercise}</b>
                <span>
                  {lift.weight} kg <i>×</i> {lift.reps} reps
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">Your working sets will appear here once you log them.</div>
        )}
      </section>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

function Nutrition({ macros, targets, meals, removeMeal, setModal }) {
  const left = Math.max(0, targets.calories - macros.calories);

  return (
    <section className="page-enter nutrition-page">
      <div className="nutrition-hero">
        <div
          className="calorie-dial"
          style={{ "--progress": `${clamp((macros.calories / targets.calories) * 100) * 3.6}deg` }}
        >
          <div>
            <b>{left.toLocaleString()}</b>
            <span>kcal left</span>
          </div>
        </div>
        <div>
          <p className="eyebrow">DAILY FUEL</p>
          <h2>Eat to support the work.</h2>
          <p>
            {macros.calories.toLocaleString()} of {targets.calories.toLocaleString()} kcal logged today. Hit protein
            first, then fill the rest with foods you enjoy.
          </p>
        </div>
        <button className="button button-primary" onClick={() => setModal({ type: "meal" })}>
          <Icon name="plus" size={15} /> Add meal
        </button>
      </div>

      <MacroOverview macros={macros} targets={targets} detailed />

      <section className="list-section">
        <div className="section-header">
          <div>
            <p className="eyebrow">TODAY'S MEALS</p>
            <h2>Your food log</h2>
          </div>
          <span className="meal-count">
            {meals.length} {meals.length === 1 ? "item" : "items"}
          </span>
        </div>
        <MealList meals={meals} onRemove={removeMeal} />
      </section>

      <div className="nutrition-tip">
        <span>
          <Icon name="info" size={17} />
        </span>
        <p>
          <b>Keep this simple.</b> A calorie estimate and protein count is enough to create useful trends. Precision
          is a tool, not a test.
        </p>
      </div>
    </section>
  );
}

function MacroOverview({ macros, targets, detailed = false }) {
  const items = detailed
    ? [
        ["Protein", macros.protein, targets.protein, "g", "lime"],
        ["Carbohydrates", macros.carbs, targets.carbs, "g", "orange"],
        ["Fats", macros.fats, targets.fats, "g", "purple"],
      ]
    : [
        ["Protein", macros.protein, targets.protein, "g", "lime"],
        ["Calories", macros.calories, targets.calories, "kcal", "blue"],
      ];

  return (
    <div className={`macro-overview ${detailed ? "detailed" : ""}`}>
      {items.map(([label, amount, target, unit, tone]) => (
        <div className={`macro-card ${tone}`} key={label}>
          <div>
            <span>{label}</span>
            <b>
              {amount} <small>/ {target} {unit}</small>
            </b>
          </div>
          <div className="metric-bar">
            <span style={{ width: `${clamp((amount / target) * 100)}%` }} />
          </div>
          <small>{Math.round(clamp((amount / target) * 100))}% of daily goal</small>
        </div>
      ))}
    </div>
  );
}

function MealList({ meals, onRemove }) {
  if (!meals.length) {
    return (
      <div className="empty-state meals-empty">
        <span>
          <Icon name="apple" size={21} />
        </span>
        <b>Nothing logged yet</b>
        <p>Start with your next meal. Approximate is completely fine.</p>
      </div>
    );
  }

  return (
    <div className="meal-list">
      {meals.map((meal) => (
        <article className="meal-row" key={meal.id}>
          <span className="meal-icon">
            {meal.category === "Snack" ? "◦" : meal.category === "Drink" ? "≈" : meal.category === "Breakfast" ? "☀" : "✦"}
          </span>
          <div>
            <b>{meal.name}</b>
            <span>
              {meal.category || "Meal"} · {number(meal.protein)}g protein
            </span>
          </div>
          <div className="meal-macros">
            <b>
              {number(meal.kcal)}
              <small> kcal</small>
            </b>
            <span>
              {number(meal.carbs)}c · {number(meal.fats)}f
            </span>
          </div>
          <button className="remove-button" onClick={() => onRemove(meal.id)} aria-label={`Remove ${meal.name}`}>
            <Icon name="trash" size={15} />
          </button>
        </article>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calculators — calories, body fat, lean mass, weight to lose
// ---------------------------------------------------------------------------

function Calculators({ data, setData, currentWeight }) {
  const profile = data.profile;

  function updateProfile(key, value) {
    setData((current) => ({
      ...current,
      profile: { ...current.profile, [key]: TEXT_PROFILE_KEYS.has(key) ? value : number(value) },
    }));
  }

  const weight = number(currentWeight);
  const bmr = calcBMR({ sex: profile.sex, weight, height: profile.height, age: profile.age });
  const tdee = calcTDEE(bmr, profile.activityLevel);
  const bodyFat = clamp(
    calcBodyFatNavy({ sex: profile.sex, height: profile.height, waist: profile.waist, neck: profile.neck, hip: profile.hip }),
    3,
    60
  );
  const leanMass = calcLeanMass(weight, bodyFat);
  const fatMass = Math.max(0, weight - leanMass);
  const { targetWeight, toLose } = calcWeightToGoal(weight, bodyFat, profile.goalBodyFat);
  const cutCalories = Math.round(tdee - 500);
  const bulkCalories = Math.round(tdee + 300);

  return (
    <section className="page-enter calculators-page">
      <div className="surface calc-inputs">
        <div className="surface-head">
          <div>
            <p className="eyebrow">YOUR NUMBERS</p>
            <h3>Body composition inputs</h3>
          </div>
          <Icon name="calc" size={19} />
        </div>

        <div className="calc-weight-mode">
          <div>
            <b>Current weight</b>
            <span>{profile.weightMode === "manual" ? "Set by you, not averaged" : "14-day average from your logs"}</span>
          </div>
          <div className="mode-toggle">
            <button className={profile.weightMode === "auto" ? "active" : ""} onClick={() => updateProfile("weightMode", "auto")}>
              Auto
            </button>
            <button className={profile.weightMode === "manual" ? "active" : ""} onClick={() => updateProfile("weightMode", "manual")}>
              Manual
            </button>
          </div>
        </div>

        {profile.weightMode === "manual" && (
          <SettingsInput label="Your weight" value={profile.manualWeight} suffix="kg" onChange={(value) => updateProfile("manualWeight", value)} />
        )}

        <div className="settings-form calc-form">
          <label className="settings-input">
            <span>Sex</span>
            <div>
              <select value={profile.sex} onChange={(event) => updateProfile("sex", event.target.value)}>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
          </label>

          <SettingsInput label="Height" value={profile.height} suffix="cm" onChange={(value) => updateProfile("height", value)} />
          <SettingsInput label="Age" value={profile.age} suffix="years" onChange={(value) => updateProfile("age", value)} />

          <label className="settings-input">
            <span>Activity level</span>
            <div>
              <select value={profile.activityLevel} onChange={(event) => updateProfile("activityLevel", event.target.value)}>
                <option value="sedentary">Sedentary — little exercise</option>
                <option value="light">Light — 1–3 days/week</option>
                <option value="moderate">Moderate — 3–5 days/week</option>
                <option value="active">Active — 6–7 days/week</option>
                <option value="veryActive">Very active — athlete</option>
              </select>
            </div>
          </label>

          <SettingsInput label="Neck" value={profile.neck} suffix="cm" onChange={(value) => updateProfile("neck", value)} />
          <SettingsInput label="Waist" value={profile.waist} suffix="cm" onChange={(value) => updateProfile("waist", value)} />
          {profile.sex === "female" && (
            <SettingsInput label="Hip" value={profile.hip} suffix="cm" onChange={(value) => updateProfile("hip", value)} />
          )}
          <SettingsInput label="Goal body fat" value={profile.goalBodyFat} suffix="%" onChange={(value) => updateProfile("goalBodyFat", value)} />
        </div>

        <p className="quiet-copy calc-note">
          Body fat is estimated with the US Navy tape-measure method — a useful trend indicator, not a clinical measurement.
        </p>
      </div>

      <div className="calc-results">
        <div className="surface result-card">
          <p className="eyebrow">DAILY ENERGY</p>
          <h3>Calories</h3>
          <div className="result-row">
            <span>BMR — resting burn</span>
            <b>{Math.round(bmr).toLocaleString()} kcal</b>
          </div>
          <div className="result-row">
            <span>Maintenance (TDEE)</span>
            <b>{Math.round(tdee).toLocaleString()} kcal</b>
          </div>
          <div className="result-row highlight">
            <span>Fat-loss target</span>
            <b>{cutCalories.toLocaleString()} kcal</b>
          </div>
          <div className="result-row">
            <span>Lean-gain target</span>
            <b>{bulkCalories.toLocaleString()} kcal</b>
          </div>
        </div>

        <div className="surface result-card">
          <p className="eyebrow">BODY COMPOSITION</p>
          <h3>From your measurements</h3>
          <div className="result-row">
            <span>Body fat</span>
            <b>{bodyFat.toFixed(1)}%</b>
          </div>
          <div className="result-row">
            <span>Lean body mass</span>
            <b>{leanMass.toFixed(1)} kg</b>
          </div>
          <div className="result-row">
            <span>Fat mass</span>
            <b>{fatMass.toFixed(1)} kg</b>
          </div>
          <div className="result-row">
            <span>Weight used</span>
            <b>{weight.toFixed(1)} kg</b>
          </div>
        </div>

        <div className="surface result-card wide">
          <p className="eyebrow">GOAL</p>
          <h3>Reach {profile.goalBodyFat}% body fat</h3>
          {toLose > 0.2 ? (
            <>
              <div className="goal-headline">
                <b>{toLose.toFixed(1)} kg</b>
                <span>to lose, assuming you hold onto your lean mass</span>
              </div>
              <p className="quiet-copy">
                Target weight ≈ {targetWeight.toFixed(1)} kg, based on your current lean mass of {leanMass.toFixed(1)} kg.
              </p>
            </>
          ) : toLose < -0.2 ? (
            <>
              <div className="goal-headline">
                <b>{Math.abs(toLose).toFixed(1)} kg</b>
                <span>of lean mass you'd need to add to hit that leanness at a higher weight</span>
              </div>
              <p className="quiet-copy">At your current weight you're already at or below this body-fat target.</p>
            </>
          ) : (
            <p className="quiet-copy">You're already close to this goal — nice work staying consistent.</p>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

function Progress({ data, history, averageWeight, currentWeight }) {
  const firstWeight = history[0]?.weight || data.profile.startWeight;
  const delta = number(currentWeight) - number(firstWeight);
  const latestWaist = [...data.logs].reverse().find((item) => number(item.waist))?.waist;

  return (
    <section className="page-enter progress-page">
      <div className="progress-metrics">
        <ProgressMetric label="Current weight" value={`${number(currentWeight).toFixed(1)} kg`} detail="Latest check-in" icon="target" />
        <ProgressMetric
          label="Change so far"
          value={`${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg`}
          detail={`From ${number(firstWeight).toFixed(1)} kg`}
          icon="chart"
          tone={Math.abs(delta) < 0.1 ? "neutral" : delta < 0 ? "positive" : "warm"}
        />
        <ProgressMetric label="14-day average" value={`${averageWeight} kg`} detail="Trend over time" icon="grid" />
        <ProgressMetric
          label="Latest waist"
          value={latestWaist ? `${latestWaist} cm` : "—"}
          detail={latestWaist ? "Latest measurement" : "Add it in daily log"}
          icon="measure"
        />
      </div>

      <section className="surface chart-surface">
        <div className="surface-head">
          <div>
            <p className="eyebrow">WEIGHT TREND</p>
            <h3>Let the trend tell the story</h3>
          </div>
          <span className="chart-caption">LAST {history.length || 0} CHECK-INS</span>
        </div>
        <WeightChart history={history} />
      </section>

      <section className="progress-bottom">
        <div className="surface focus-card">
          <p className="eyebrow">THE RECOMP COMPASS</p>
          <h3>What to watch</h3>
          <div className="compass-list">
            <div>
              <span>01</span>
              <p>
                <b>Waist trending down</b>
                <small>A stronger signal of fat loss than daily scale noise.</small>
              </p>
            </div>
            <div>
              <span>02</span>
              <p>
                <b>Strength holding or climbing</b>
                <small>Your training log shows if muscle is being protected.</small>
              </p>
            </div>
            <div>
              <span>03</span>
              <p>
                <b>Weekly consistency</b>
                <small>The routine matters more than an unusually perfect day.</small>
              </p>
            </div>
          </div>
        </div>

        <div className="surface target-summary">
          <p className="eyebrow">YOUR CURRENT TARGETS</p>
          <h3>Built for consistency</h3>
          <div>
            <span>Energy target</span>
            <b>{data.targets.calories.toLocaleString()} kcal</b>
          </div>
          <div>
            <span>Protein target</span>
            <b>{data.targets.protein} g</b>
          </div>
          <div>
            <span>Daily steps</span>
            <b>{data.targets.steps.toLocaleString()}</b>
          </div>
        </div>
      </section>
    </section>
  );
}

function ProgressMetric({ label, value, detail, icon, tone = "" }) {
  return (
    <div className={`progress-metric ${tone}`}>
      <span>
        <Icon name={icon} size={17} />
      </span>
      <p>{label}</p>
      <b>{value}</b>
      <small>{detail}</small>
    </div>
  );
}

function WeightChart({ history }) {
  if (history.length < 2) {
    return (
      <div className="chart-empty">
        <span>
          <Icon name="chart" size={24} />
        </span>
        <b>Your trend will appear here.</b>
        <p>Log weight on a few different mornings to reveal the signal through the noise.</p>
      </div>
    );
  }

  const values = history.map((point) => number(point.weight));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 0.4);

  const coords = history.map((point, index) => ({
    x: (index / (history.length - 1)) * 100,
    y: 88 - ((number(point.weight) - min) / range) * 66,
  }));

  const line = coords.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `0,100 ${line} 100,100`;

  return (
    <div className="chart-wrap">
      <div className="chart-range">
        <span>{(max + 0.2).toFixed(1)}</span>
        <span>{((max + min) / 2).toFixed(1)}</span>
        <span>{(min - 0.2).toFixed(1)}</span>
      </div>
      <div className="weight-chart">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#c7ff5b" stopOpacity=".32" />
              <stop offset="1" stopColor="#c7ff5b" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polyline points={area} fill="url(#chart-fill)" stroke="none" />
          <polyline points={line} fill="none" stroke="#c7ff5b" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          {coords.map((point, index) => (
            <circle key={history[index].date} cx={point.x} cy={point.y} r="1.6" fill="#c7ff5b" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        <div className="chart-labels">
          {history.map((point) => (
            <span key={point.date}>{formatDate(point.date)}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function Settings({ data, setData, exportData, resetAll }) {
  const profile = data.profile;

  function updateProfile(key, value) {
    setData((current) => ({
      ...current,
      profile: { ...current.profile, [key]: TEXT_PROFILE_KEYS.has(key) ? value : number(value) },
    }));
  }

  function updateTarget(key, value) {
    setData((current) => ({ ...current, targets: { ...current.targets, [key]: number(value) } }));
  }

  const targetFields = [
    ["calories", "Calories", "kcal"],
    ["protein", "Protein", "g"],
    ["carbs", "Carbohydrates", "g"],
    ["fats", "Fats", "g"],
    ["water", "Water", "L"],
    ["steps", "Steps", "steps"],
    ["sleep", "Sleep", "hours"],
  ];

  return (
    <section className="page-enter settings-page">
      <div className="settings-intro">
        <p className="eyebrow">PRIVATE BY DEFAULT</p>
        <h2>Your plan, your numbers.</h2>
        <p>Everything is saved in this browser. Make the targets useful for your actual life, not someone else’s template.</p>
      </div>

      <section className="settings-grid">
        <div className="surface setting-panel">
          <div className="surface-head">
            <div>
              <p className="eyebrow">PROFILE</p>
              <h3>About you</h3>
            </div>
            <Icon name="settings" size={19} />
          </div>
          <div className="settings-form profile-form">
            <SettingsInput label="Name" value={data.profile.name} onChange={(value) => updateProfile("name", value)} text />
            <SettingsInput label="Goal" value={data.profile.goal} onChange={(value) => updateProfile("goal", value)} text />
            <SettingsInput label="Height" value={data.profile.height} suffix="cm" onChange={(value) => updateProfile("height", value)} />
            <SettingsInput label="Age" value={data.profile.age} suffix="years" onChange={(value) => updateProfile("age", value)} />
            <SettingsInput
              label="Starting weight"
              value={data.profile.startWeight}
              suffix="kg"
              onChange={(value) => updateProfile("startWeight", value)}
            />
          </div>

          <div className="calc-weight-mode settings-weight-mode">
            <div>
              <b>Current weight</b>
              <span>{profile.weightMode === "manual" ? "Set by you, not averaged" : "14-day average from your logs"}</span>
            </div>
            <div className="mode-toggle">
              <button className={profile.weightMode === "auto" ? "active" : ""} onClick={() => updateProfile("weightMode", "auto")}>
                Auto
              </button>
              <button className={profile.weightMode === "manual" ? "active" : ""} onClick={() => updateProfile("weightMode", "manual")}>
                Manual
              </button>
            </div>
          </div>
          {profile.weightMode === "manual" && (
            <SettingsInput label="Your weight" value={profile.manualWeight} suffix="kg" onChange={(value) => updateProfile("manualWeight", value)} />
          )}
        </div>

        <div className="surface setting-panel">
          <div className="surface-head">
            <div>
              <p className="eyebrow">DAILY TARGETS</p>
              <h3>Your baseline</h3>
            </div>
            <Icon name="target" size={19} />
          </div>
          <div className="settings-form targets-form">
            {targetFields.map(([key, label, suffix]) => (
              <SettingsInput key={key} label={label} value={data.targets[key]} suffix={suffix} onChange={(value) => updateTarget(key, value)} />
            ))}
          </div>
        </div>
      </section>

      <section className="data-controls">
        <div>
          <span>
            <Icon name="download" size={18} />
          </span>
          <div>
            <b>Keep a copy of your progress</b>
            <p>Download a private JSON backup of all logs and targets.</p>
          </div>
          <button className="button button-quiet" onClick={exportData}>
            Export data
          </button>
        </div>

        <div className="danger-zone">
          <span>
            <Icon name="trash" size={18} />
          </span>
          <div>
            <b>Reset this tracker</b>
            <p>Remove every locally saved check-in, meal, set and target.</p>
          </div>
          <button className="danger-button" onClick={resetAll}>
            Reset data
          </button>
        </div>
      </section>
    </section>
  );
}

function SettingsInput({ label, value, suffix, onChange, text = false }) {
  return (
    <label className={`settings-input ${text ? "text" : ""}`}>
      <span>{label}</span>
      <div>
        <input type={text ? "text" : "number"} min="0" value={value} onChange={(event) => onChange(event.target.value)} />
        {suffix && <small>{suffix}</small>}
      </div>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Shared bits: week strip, scoring, consistency
// ---------------------------------------------------------------------------

function WeekStrip({ data, date, targets, macros }) {
  const days = Array.from({ length: 7 }, (_, index) => shiftDate(date, index - 6));

  return (
    <div className="week-strip">
      {days.map((day) => {
        const log = data.logs.find((item) => item.date === day) || {};
        const mealStats =
          day === date
            ? macros
            : data.meals
                .filter((meal) => meal.date === day)
                .reduce((sum, meal) => ({ protein: sum.protein + number(meal.protein) }), { protein: 0 });
        const score = dailyScore(log, mealStats, targets);
        const isToday = day === date;

        return (
          <div className={isToday ? "current" : ""} key={day}>
            <span>{formatDate(day, { weekday: "narrow" })}</span>
            <i className={score >= 50 ? "complete" : score > 0 ? "partial" : ""}>
              {score >= 80 ? <Icon name="check" size={12} /> : ""}
            </i>
            <small>{formatDate(day, { day: "numeric" })}</small>
          </div>
        );
      })}
    </div>
  );
}

function dailyScore(log, macros, targets) {
  const parts = [
    number(macros.protein) / targets.protein,
    number(log.water) / targets.water,
    number(log.steps) / targets.steps,
    number(log.sleep) / targets.sleep,
  ];
  return Math.round((parts.reduce((total, value) => total + clamp(value, 0, 1), 0) / parts.length) * 100);
}

function Consistency({ data }) {
  const recent = Array.from({ length: 7 }, (_, index) => shiftDate(localDate(), index - 6));
  const total = recent.reduce((sum, day) => {
    const log = data.logs.find((item) => item.date === day) || {};
    const mealStats = data.meals
      .filter((meal) => meal.date === day)
      .reduce((stats, meal) => ({ protein: stats.protein + number(meal.protein) }), { protein: 0 });
    return sum + dailyScore(log, mealStats, data.targets);
  }, 0);
  return Math.round(total / recent.length);
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function Modal({ title, subtitle, children, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <Icon name="close" size={18} />
        </button>
        <p className="eyebrow">QUICK LOG</p>
        <h2 id="modal-title">{title}</h2>
        {subtitle && <p className="modal-subtitle">{subtitle}</p>}
        {children}
      </section>
    </div>
  );
}

function MealModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: "", category: "Meal", kcal: "", protein: "", carbs: "", fats: "" });
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  function handleSubmit(event) {
    event.preventDefault();
    if (!form.name.trim()) return;
    onSave({
      ...form,
      kcal: number(form.kcal),
      protein: number(form.protein),
      carbs: number(form.carbs),
      fats: number(form.fats),
    });
  }

  return (
    <Modal title="Add a meal" subtitle="A quick estimate is more than enough." onClose={onClose}>
      <form className="modal-form" onSubmit={handleSubmit}>
        <label className="modal-input wide">
          <span>What did you have?</span>
          <input autoFocus value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. Chicken rice bowl" required />
        </label>

        <label className="modal-input wide">
          <span>Meal type</span>
          <select value={form.category} onChange={(event) => update("category", event.target.value)}>
            <option>Breakfast</option>
            <option>Lunch</option>
            <option>Dinner</option>
            <option>Snack</option>
            <option>Drink</option>
            <option>Meal</option>
          </select>
        </label>

        <label className="modal-input">
          <span>Calories</span>
          <input type="number" min="0" value={form.kcal} onChange={(event) => update("kcal", event.target.value)} placeholder="0" />
        </label>

        <label className="modal-input">
          <span>Protein (g)</span>
          <input type="number" min="0" value={form.protein} onChange={(event) => update("protein", event.target.value)} placeholder="0" />
        </label>

        <label className="modal-input">
          <span>Carbs (g)</span>
          <input type="number" min="0" value={form.carbs} onChange={(event) => update("carbs", event.target.value)} placeholder="0" />
        </label>

        <label className="modal-input">
          <span>Fats (g)</span>
          <input type="number" min="0" value={form.fats} onChange={(event) => update("fats", event.target.value)} placeholder="0" />
        </label>

        <button className="button button-primary submit-button" type="submit">
          Add meal <Icon name="arrow" size={16} />
        </button>
      </form>
    </Modal>
  );
}

function LiftModal({ exercise, onClose, onSave }) {
  const [form, setForm] = useState({ exercise: exercise || "", weight: "", reps: "" });
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  function handleSubmit(event) {
    event.preventDefault();
    if (!form.exercise.trim()) return;
    onSave({ ...form, weight: number(form.weight), reps: number(form.reps) });
  }

  return (
    <Modal title="Log a working set" subtitle="Record the weight you moved and the reps you earned." onClose={onClose}>
      <form className="modal-form lift-form" onSubmit={handleSubmit}>
        <label className="modal-input wide">
          <span>Exercise</span>
          <input autoFocus value={form.exercise} onChange={(event) => update("exercise", event.target.value)} required />
        </label>

        <label className="modal-input">
          <span>Weight (kg)</span>
          <input type="number" min="0" step="0.5" value={form.weight} onChange={(event) => update("weight", event.target.value)} placeholder="0" required />
        </label>

        <label className="modal-input">
          <span>Reps</span>
          <input type="number" min="0" value={form.reps} onChange={(event) => update("reps", event.target.value)} placeholder="0" required />
        </label>

        <button className="button button-primary submit-button" type="submit">
          Save set <Icon name="check" size={16} />
        </button>
      </form>
    </Modal>
  );
}