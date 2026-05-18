import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// ============================================================
// НАЛАШТУВАННЯ
// ============================================================
const SHEET_ID = "1G40uOzR0pMyFw8BoEDChmbTEJhkyVTlrwWVKCokevgg";
const API_KEY  = "AIzaSyD8sV0oOmWSvttjF0fzgxnUASDbSm7oyIk";

const KPI_URL    = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Realbase_KPI?key=${API_KEY}`;
const REGION_URL = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/%D0%9F%D0%BE%20%D1%80%D0%B5%D0%B3%D1%96%D0%BE%D0%BD%D0%B0%D1%85?key=${API_KEY}`;
const HIGH_URL   = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/%D0%9D%D0%B5%20%D0%BE%D0%BD%D0%BE%D0%B2%D0%BB%D0%B5%D0%BD%D1%96%20High?key=${API_KEY}`;

// ============================================================
// ПАРСИНГ
// ============================================================
function parseKPI(rows) {
  if (!rows || rows.length < 2) return {};
  const map = {};
  rows.slice(1).forEach(r => { if (r[0]) map[r[0]] = r[1]; });
  return map;
}
function parseTable(rows) {
  if (!rows || rows.length < 2) return { headers: [], data: [] };
  const [headers, ...data] = rows;
  return { headers, data };
}

// ============================================================
// КОЛЬОРИ
// ============================================================
const C = {
  bg: "#0d1117", surface: "#161b22", border: "#21262d",
  accent: "#58a6ff", green: "#3fb950", red: "#f85149",
  yellow: "#d29922", muted: "#8b949e", text: "#e6edf3",
};

// ============================================================
// UI
// ============================================================
const Card = ({ children, style = {} }) => (
  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 24px", ...style }}>
    {children}
  </div>
);

const Label = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, marginBottom: 8, fontFamily: "'DM Mono', monospace" }}>
    {children}
  </div>
);

function PctRing({ value, color, size = 84 }) {
  const r = 32, cx = 42, cy = 42, circ = 2 * Math.PI * r;
  const dash = (Math.min(100, value) / 100) * circ;
  return (
    <svg width={size} height={size} viewBox="0 0 84 84">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.border} strokeWidth={7} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 42 42)" style={{ transition: "stroke-dasharray 0.8s ease" }} />
      <text x={cx} y={cy + 5} textAnchor="middle" fill={color} fontSize={15} fontWeight={700} fontFamily="monospace">
        {value}%
      </text>
    </svg>
  );
}

function ProgressBar({ value, color = C.accent }) {
  return (
    <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, value || 0)}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.8s ease" }} />
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
      <div style={{ color: C.muted, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => <div key={i} style={{ color: p.fill }}>{p.name}: <strong>{p.value}</strong></div>)}
    </div>
  );
};

// ============================================================
// ВКЛАДКА FLATS
// ============================================================
function FlatsTab({ kpi, regions, highList, onRefresh, loading }) {
  const n = v => parseInt(kpi[v]) || 0;
  const regionChart = regions.data.slice(0, 8).map(r => ({
    name: (r[0] || "").replace(/ська$/, "").replace(/зька$/, "").replace(/ська$/, ""),
    Всього: parseInt(r[1]) || 0,
    Оновлено: parseInt(r[2]) || 0,
    High: parseInt(r[4]) || 0,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* ROW 1 — 4 картки */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
        <Card>
          <Label>Активних ЖК</Label>
          <div style={{ fontSize: 52, fontWeight: 800, fontFamily: "'Syne', sans-serif", color: C.text, lineHeight: 1 }}>
            {n("active_total")}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: C.muted, fontFamily: "'DM Mono', monospace" }}>{kpi.period || ""}</div>
          <div style={{ marginTop: 4, fontSize: 11, color: C.muted }}>розділ + ціни на сайті = Yes</div>
        </Card>

        {[
          { key: "pct_updated_all",        num: "updated_this_month",   total: "active_total",      color: C.accent, label: "% оновлено (всі)",      sub: "всі активні ЖК" },
          { key: "pct_updated_high",        num: "high_updated",         total: "high_total",        color: C.red,    label: "% оновлено high",        sub: "пріоритет high" },
          { key: "pct_updated_high_medium", num: "high_medium_updated",  total: "high_medium_total", color: C.yellow, label: "% оновлено high+medium", sub: "high + medium" },
        ].map((item, i) => (
          <Card key={i}>
            <Label>{item.label}</Label>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4 }}>
              <PctRing value={n(item.key)} color={item.color} />
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Syne', sans-serif", color: item.color }}>
                  {n(item.num)}<span style={{ fontSize: 13, color: C.muted, fontWeight: 400 }}>/{n(item.total)}</span>
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{item.sub}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* ROW 2 — Графік */}
      <Card>
        <Label>Оновлення по регіонах</Label>
        <div style={{ marginTop: 14, height: 210 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={regionChart} barGap={3} barCategoryGap="28%">
              <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 11, fontFamily: "'DM Mono', monospace" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.muted, fontSize: 11, fontFamily: "'DM Mono', monospace" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Всього"   fill="#2d333b" radius={[3,3,0,0]} />
              <Bar dataKey="Оновлено" fill={C.green}  radius={[3,3,0,0]} />
              <Bar dataKey="High"     fill={C.red}    radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 10 }}>
          {[["#2d333b","Всього активних"], [C.green,"Оновлено"], [C.red,"High пріоритет"]].map(([color, label]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.muted, fontFamily: "'DM Mono', monospace" }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />{label}
            </div>
          ))}
        </div>
      </Card>

      {/* ROW 3 — Таблиця регіонів */}
      <Card>
        <Label>Деталі по регіонах</Label>
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {regions.headers.map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: C.muted, fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {regions.data.map((row, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                  {row.map((cell, j) => {
                    const isPct = String(cell).includes("%");
                    const pctVal = isPct ? parseInt(cell) : 0;
                    const pctColor = pctVal >= 75 ? C.green : pctVal >= 50 ? C.yellow : C.red;
                    return (
                      <td key={j} style={{ padding: "10px", fontWeight: j === 0 ? 600 : 400, color: isPct ? pctColor : C.text }}>
                        {isPct ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 44 }}><ProgressBar value={pctVal} color={pctColor} /></div>
                            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{cell}</span>
                          </div>
                        ) : cell}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ROW 4 — Не оновлені High */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <Label>High — не оновлені цього місяця</Label>
          <div style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: C.red, background: "#2d1b1b", padding: "3px 10px", borderRadius: 6 }}>
            {highList.data.length} ЖК
          </div>
        </div>
        {highList.data.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: C.green, fontFamily: "'DM Mono', monospace", fontSize: 13 }}>
            ✓ Всі high ЖК оновлені цього місяця
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {highList.headers.map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: C.muted, fontFamily: "'DM Mono', monospace", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {highList.data.map((row, i) => {
                  const days = parseInt(row[row.length - 1]) || 0;
                  const urgColor = days > 60 ? C.red : days > 30 ? C.yellow : C.muted;
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      {row.map((cell, j) => (
                        <td key={j} style={{ padding: "10px", fontWeight: j === 1 ? 600 : 400, color: j === row.length - 1 ? urgColor : C.text, fontFamily: j === row.length - 1 ? "'DM Mono', monospace" : "inherit" }}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================
// ЗАГЛУШКА ДЛЯ LAYOUTS / RINGOSTAT
// ============================================================
function ComingSoon({ name }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, gap: 16 }}>
      <div style={{ fontSize: 48, opacity: 0.2 }}>⚙</div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, color: C.muted }}>
        {name}
      </div>
      <div style={{ fontSize: 14, color: C.muted, fontFamily: "'DM Mono', monospace", textAlign: "center", maxWidth: 320, lineHeight: 1.8 }}>
        Розділ у розробці.<br />
        Підключимо коли будуть дані з Google Sheets.
      </div>
      <div style={{ marginTop: 8, padding: "8px 20px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.muted, fontFamily: "'DM Mono', monospace" }}>
        coming soon
      </div>
    </div>
  );
}

// ============================================================
// ГОЛОВНИЙ КОМПОНЕНТ
// ============================================================
const TABS = ["Flats", "Layouts", "Ringostat"];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("Flats");
  const [kpi, setKpi]             = useState({});
  const [regions, setRegions]     = useState({ headers: [], data: [] });
  const [highList, setHigh]       = useState({ headers: [], data: [] });
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [lastUpd, setLastUpd]     = useState(null);

  const isDemo = API_KEY.includes("ВСТАВТЕ");

  const fetchData = useCallback(async () => {
    if (isDemo) return;
    setLoading(true);
    setError(null);
    try {
      const [r1, r2, r3] = await Promise.all([fetch(KPI_URL), fetch(REGION_URL), fetch(HIGH_URL)]);
      const [j1, j2, j3] = await Promise.all([r1.json(), r2.json(), r3.json()]);
      const parsed = parseKPI(j1.values);
      setKpi(parsed);
      setRegions(parseTable(j2.values));
      setHigh(parseTable(j3.values));
      if (parsed.last_updated) setLastUpd(new Date(parsed.last_updated));
    } catch (e) {
      setError("Не вдалося завантажити дані.");
    } finally {
      setLoading(false);
    }
  }, [isDemo]);

  useEffect(() => {
    if (!isDemo) { fetchData(); return; }
    setKpi({
      period: "травень 2026 р.", active_total: "163", updated_this_month: "89",
      pct_updated_all: "55", high_total: "34", high_updated: "28",
      pct_updated_high: "82", high_medium_total: "97", high_medium_updated: "71",
      pct_updated_high_medium: "73", last_updated: new Date().toISOString(),
    });
    setRegions({
      headers: ["Регіон", "Активних ЖК", "Оновлено", "% оновл.", "High ЖК", "High оновлено", "% high"],
      data: [
        ["Одеська","31","18","58%","8","7","88%"],
        ["Львівська","24","16","67%","6","5","83%"],
        ["Київська","21","12","57%","5","4","80%"],
        ["Чернівецька","18","8","44%","4","3","75%"],
        ["Закарпатська","14","7","50%","3","2","67%"],
        ["Харківська","12","9","75%","3","3","100%"],
        ["Миколаївська","11","6","55%","2","2","100%"],
        ["Вінницька","10","5","50%","2","1","50%"],
      ]
    });
    setHigh({
      headers: ["ID", "Назва ЖК", "Регіон", "Девелопер", "Дата оновлення", "Днів без оновлення"],
      data: [
        ["9455","ЖК AUROOM LOUNGE, Львів","Львівська","AUROOM","03.09.2024","254"],
        ["7007","Клубний будинок Graf","Одеська","Graf development","15.06.2023","335"],
        ["4231","ЖК Форрест, Фонтанка","Одеська","ГК Premium S.","15.08.2023","275"],
      ]
    });
    setLastUpd(new Date());
    setLoading(false);
  }, [isDemo, fetchData]);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'DM Sans', sans-serif", paddingBottom: 48 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .fade { animation: fadeUp 0.45s ease both; }
      `}</style>

      {/* Шапка */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "0 36px", display: "flex", alignItems: "stretch", justifyContent: "space-between", position: "sticky", top: 0, background: C.bg, zIndex: 10 }}>

        {/* Ліво — назва + вкладки */}
        <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
          <div style={{ display: "flex", alignItems: "center", paddingRight: 32, borderRight: `1px solid ${C.border}` }}>
            <div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>
                Sales Monitoring
              </div>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: "'DM Mono', monospace" }}>
                {isDemo ? "demo" : kpi.period || ""}
                {lastUpd && ` · ${lastUpd.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}`}
              </div>
            </div>
          </div>

          {/* Вкладки */}
          <div style={{ display: "flex", alignItems: "stretch", marginLeft: 8 }}>
            {TABS.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                background: "none", border: "none", borderBottom: activeTab === tab ? `2px solid ${C.accent}` : "2px solid transparent",
                color: activeTab === tab ? C.text : C.muted, fontFamily: "'DM Sans', sans-serif",
                fontSize: 14, fontWeight: activeTab === tab ? 600 : 400,
                padding: "18px 20px", cursor: "pointer", transition: "all 0.2s",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                {tab}
                {tab === "Layouts" || tab === "Ringostat" ? (
                  <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: C.border, color: C.muted, fontFamily: "'DM Mono', monospace", letterSpacing: "0.05em" }}>
                    soon
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        {/* Право — кнопка */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <button onClick={fetchData} disabled={loading || isDemo} style={{
            background: C.accent, color: "#fff", border: "none", borderRadius: 8,
            padding: "8px 18px", fontSize: 13, fontWeight: 600,
            cursor: loading || isDemo ? "not-allowed" : "pointer",
            opacity: loading || isDemo ? 0.5 : 1, fontFamily: "'DM Sans', sans-serif",
          }}>
            {loading ? "…" : "↻ Оновити"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ margin: "20px 36px", padding: "12px 18px", background: "#2d1b1b", border: `1px solid ${C.red}`, borderRadius: 10, color: C.red, fontSize: 13, fontFamily: "'DM Mono', monospace" }}>
          ⚠ {error}
        </div>
      )}

      {/* Контент вкладок */}
      <div style={{ padding: "24px 36px" }}>
        {activeTab === "Flats"     && <FlatsTab kpi={kpi} regions={regions} highList={highList} onRefresh={fetchData} loading={loading} />}
        {activeTab === "Layouts"   && <ComingSoon name="Layouts" />}
        {activeTab === "Ringostat" && <ComingSoon name="Ringostat" />}
      </div>
    </div>
  );
}
