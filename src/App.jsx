import { useState, useEffect, useCallback, useContext, createContext } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, PieChart, Pie, Cell, Legend } from "recharts";

// ============================================================
// НАЛАШТУВАННЯ
// ============================================================
const SHEET_ID = "1G40uOzR0pMyFw8BoEDChmbTEJhkyVTlrwWVKCokevgg";
const API_KEY  = "AIzaSyD8sV0oOmWSvttjF0fzgxnUASDbSm7oyIk";

const url = (sheet) =>
  `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheet)}?key=${API_KEY}`;

const KPI_URL    = url("Realbase_KPI");
const REGION_URL = url("По регіонах");
const HIGH_URL   = url("Не оновлені High");

const FEEDS_KPI_URL          = url("Feeds_KPI");
const FEEDS_DAILY_URL        = url("Feeds_Daily");
const FEEDS_REGION_URL       = url("Feeds_By_Region");
const FEEDS_MONTH_URL        = url("Feeds_By_Month");
const FEEDS_REGION_STATS_URL = url("Feeds_Region_Stats");
const FEEDS_COMPANY_URL      = url("Feeds_By_Company");

const RINGO_KPI_URL    = url("Ringo_KPI_Monthly");
const RINGO_REGION_URL = url("Ringo_By_Region");
const RINGO_KM_URL     = url("Ringo_KM");
const RINGO_MISSED_STATUS_URL   = url("Ringo_Missed_By_Status_Monthly");
const RINGO_MISSED_BUILDING_URL = url("Ringo_Missed_By_Building_Monthly");

const LAYOUTS_MONTHLY_URL   = url("Layouts_Monthly");
const LAYOUTS_COVERAGE_URL  = url("Layouts_Coverage");
const LAYOUTS_KM_URL        = url("Layouts_KM");
const LAYOUTS_KM_MONTHLY_URL = url("Layouts_KM_Monthly");
const LAYOUTS_BUILDINGS_URL = url("Layouts_Buildings_Missing");

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
// АВТОРИЗАЦІЯ (для команди)
// ============================================================
// TODO: замінити на реальні логіни/паролі команди
const TEAM_USERS = [
  { login: "content-ops", password: "tNHBlqQRwAJT9D" },
];
const AUTH_KEY = "sm_auth_ok";

// ============================================================
// КОЛЬОРИ (теми)
// ============================================================
// Брендова палітра: Апероль-шприц, Мандариновий фреш, Київська цегла,
// Київська панелька, Київська ніч, Ніч на Кирилівському, Седан-баклажан
const DARK = {
  bg: "#0d0d0d", surface: "#211823", border: "#3d2f45",
  accent: "#d162c4", green: "#3fb950", red: "#ff5233",
  yellow: "#d29922", muted: "#a89fb0", text: "#f2f0e6",
  orange: "#ff7518",
};
const LIGHT = {
  bg: "#f3f1e8", surface: "#ffffff", border: "#e2ddcc",
  accent: "#8f3480", green: "#1a9850", red: "#e0391f",
  yellow: "#b45309", muted: "#756e60", text: "#121212",
  orange: "#f2600a",
};
const ThemeContext = createContext(DARK);

// ============================================================
// ХЕЛПЕРИ
// ============================================================
const UA_MONTHS = ["Січ","Лют","Бер","Квіт","Трав","Черв","Лип","Серп","Вер","Жовт","Лист","Груд"];
function formatMonth(ym) {
  if (!ym) return ym;
  const [y, m] = ym.split("-");
  return `${UA_MONTHS[(parseInt(m) || 1) - 1]} ${y}`;
}
function shortRegion(name) {
  return (name || "").replace(/ська$|зька$|цька$|ська область$/, "");
}
// Числовий ключ "YYYY-M"/"YYYY-MM" для коректного хронологічного сортування
// (не залежить від наявності провідного нуля в місяці)
function monthKey(ym) {
  const [y, m] = (ym || "").split("-");
  return (parseInt(y) || 0) * 12 + (parseInt(m) || 0);
}

// ============================================================
// UI
// ============================================================
const Card = ({ children, style = {} }) => {
  const C = useContext(ThemeContext);
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 24px", ...style }}>
      {children}
    </div>
  );
};

const Label = ({ children }) => {
  const C = useContext(ThemeContext);
  return (
    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, marginBottom: 8, fontFamily: "'Lun Mono', monospace" }}>
      {children}
    </div>
  );
};

function PctRing({ value, color, size = 84 }) {
  const C = useContext(ThemeContext);
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

function ProgressBar({ value, color }) {
  const C = useContext(ThemeContext);
  const barColor = color || C.accent;
  return (
    <div style={{ height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, value || 0)}%`, height: "100%", background: barColor, borderRadius: 2, transition: "width 0.8s ease" }} />
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  const C = useContext(ThemeContext);
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 12, fontFamily: "'Lun Mono', monospace" }}>
      <div style={{ color: C.muted, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => <div key={i} style={{ color: p.fill || p.color }}>{p.name}: <strong>{p.value}</strong></div>)}
    </div>
  );
};

// ============================================================
// ВКЛАДКА FLATS
// ============================================================
function FlatsTab({ kpi, regions, highList }) {
  const C = useContext(ThemeContext);
  const [highOpen, setHighOpen] = useState(false);
  const n = v => parseInt(kpi[v]) || 0;
  const regionChart = regions.data.slice(0, 8).map(r => ({
    name: (r[0] || "").replace(/ська$/, "").replace(/зька$/, ""),
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
          <div style={{ fontSize: 56, fontWeight: 700, fontFamily: "'Lun', sans-serif", color: C.text, lineHeight: 1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
            {n("active_total")}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: C.muted, fontFamily: "'Lun Mono', monospace" }}>{kpi.period || ""}</div>
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
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Lun', sans-serif", color: item.color, fontVariantNumeric: "tabular-nums" }}>
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
              <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 11, fontFamily: "'Lun Mono', monospace" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.muted, fontSize: 11, fontFamily: "'Lun Mono', monospace" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Всього"   fill="#2d333b" radius={[3,3,0,0]} />
              <Bar dataKey="Оновлено" fill={C.green}  radius={[3,3,0,0]} />
              <Bar dataKey="High"     fill={C.red}    radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 10 }}>
          {[["#2d333b","Всього активних"], [C.green,"Оновлено"], [C.red,"High пріоритет"]].map(([color, label]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.muted, fontFamily: "'Lun Mono', monospace" }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />{label}
            </div>
          ))}
        </div>
      </Card>

      {/* ROW 3 — Таблиця регіонів */}
      <Card>
        <Label>Деталі по регіонах</Label>
        <div style={{ marginTop: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", maxWidth: 820, margin: "0 auto", tableLayout: "fixed", borderCollapse: "collapse", fontSize: 13 }}>
            <colgroup>
              <col style={{ width: "22%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "13%" }} />
            </colgroup>
            <thead>
              <tr>
                {regions.headers.map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: C.muted, fontFamily: "'Lun Mono', monospace", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>{h}</th>
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
                            <span style={{ fontFamily: "'Lun Mono', monospace", fontSize: 12 }}>{cell}</span>
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
        <div
          onClick={() => setHighOpen(o => !o)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: highOpen ? 12 : 0, cursor: "pointer", userSelect: "none" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: C.muted, fontSize: 11, transition: "transform 0.2s", display: "inline-block", transform: highOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▸</span>
            <Label style={{ marginBottom: 0 }}>High — не оновлені цього місяця</Label>
          </div>
          <div style={{ fontSize: 12, fontFamily: "'Lun Mono', monospace", color: C.red, background: C === DARK ? "#2e150f" : "#fbe0da", padding: "3px 10px", borderRadius: 6 }}>
            {highList.data.length} ЖК
          </div>
        </div>
        {highOpen && (
          highList.data.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: C.green, fontFamily: "'Lun Mono', monospace", fontSize: 13 }}>
              ✓ Всі high ЖК оновлені цього місяця
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", maxWidth: 900, margin: "0 auto", tableLayout: "fixed", borderCollapse: "collapse", fontSize: 13 }}>
                <colgroup>
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "28%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "18%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "16%" }} />
                </colgroup>
                <thead>
                  <tr>
                    {highList.headers.map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: C.muted, fontFamily: "'Lun Mono', monospace", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>{h}</th>
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
                          <td key={j} style={{ padding: "10px", fontWeight: j === 1 ? 600 : 400, color: j === row.length - 1 ? urgColor : C.text, fontFamily: j === row.length - 1 ? "'Lun Mono', monospace" : "inherit" }}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </Card>
    </div>
  );
}

// ============================================================
// ВКЛАДКА ФІДИ
// ============================================================
// Кнопки фільтра
function FilterPills({ options, value, onChange }) {
  const C = useContext(ThemeContext);
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {options.map(o => (
        <button key={o.value} onClick={() => onChange(o.value)} style={{
          background: value === o.value ? C.accent : C.border,
          color: value === o.value ? "#fff" : C.muted,
          border: "none", borderRadius: 6, padding: "4px 12px",
          fontSize: 11, fontFamily: "'Lun Mono', monospace",
          cursor: "pointer", fontWeight: value === o.value ? 600 : 400,
          transition: "all 0.15s",
        }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FeedsTab({ feedsKpi, feedsDaily, feedsByRegion, feedsByMonth, feedsRegionStats, feedsByCompany, loading }) {
  const C = useContext(ThemeContext);
  const [dailyDays,   setDailyDays]   = useState(30);
  const [monthsCount, setMonthsCount] = useState(6);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400, color: C.muted, fontFamily: "'Lun Mono', monospace", fontSize: 13 }}>
        завантаження…
      </div>
    );
  }

  const dailyData = feedsDaily.data.slice(-dailyDays).map(r => ({
    date: (r[0] || "").slice(5),
    count: parseInt(r[1]) || 0,
  }));
  const dailyMin = dailyData.length
    ? Math.floor(Math.min(...dailyData.map(d => d.count)) / 500) * 500
    : 0;

  const regionPctData = [...feedsByRegion.data]
    .map(r => ({
      region: (r[0] || "").replace(" область", ""),
      hasFeed: parseInt(r[1]) || 0,
      total: parseInt(r[3]) || 0,
      pct: parseInt(r[3]) > 0 ? Math.round(parseInt(r[1]) / parseInt(r[3]) * 100) : 0,
    }))
    .sort((a, b) => b.pct - a.pct);

  const regionCountDataH = [...feedsByRegion.data]
    .map(r => ({ region: (r[0] || "").replace(" область", ""), count: parseInt(r[1]) || 0 }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
  const maxCount = regionCountDataH[0]?.count || 1;

  const monthData = feedsByMonth.data.slice(-monthsCount).map(r => ({
    month: formatMonth(r[0]),
    "від забудовника": parseInt(r[1]) || 0,
    "вручну": parseInt(r[2]) || 0,
  }));

  const pctColor = pct => pct >= 25 ? C.orange : pct >= 10 ? C.yellow : C.muted;

  // Aggregate stats
  const totalBuildings      = feedsByRegion.data.reduce((s, r) => s + (parseInt(r[3]) || 0), 0);
  const pctBuildsWithFeeds  = totalBuildings > 0 ? Math.round((parseInt(feedsKpi.feeds_total) || 0) / totalBuildings * 100) : 0;
  const totalAvailInFeeds   = feedsRegionStats.data.reduce((s, r) => s + (parseInt(r[1]) || 0), 0);
  const totalFlatsWithFeeds = feedsRegionStats.data.reduce((s, r) => s + (parseInt(r[2]) || 0), 0);
  const totalFlatsForSale   = feedsRegionStats.data.reduce((s, r) => s + (parseInt(r[3]) || 0), 0);
  const pctFlatsInFeeds     = totalFlatsForSale   > 0 ? Math.round(totalFlatsWithFeeds / totalFlatsForSale   * 100) : 0;
  const pctAvailInFeeds     = totalFlatsWithFeeds > 0 ? Math.round(totalAvailInFeeds   / totalFlatsWithFeeds * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* ROW 1 — 3 великих KPI + 3 метрики з кільцями в одному рядку */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {[
          { key: "feeds_total",       label: "ЖК з фідами",          sub: "увімкнений фід" },
          { key: "feeds_with_prices", label: "ЖК з фідами та цінами", sub: "ціни з фіду" },
          { key: "feeds_with_3d",     label: "ЖК з 3D турами",        sub: "has_vr = 1" },
        ].map(({ key, label, sub }) => (
          <Card key={key} style={{ padding: "22px 26px" }}>
            <Label>{label}</Label>
            <div style={{ fontSize: 62, fontWeight: 700, fontFamily: "'Lun', sans-serif", color: C.orange, lineHeight: 1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
              {feedsKpi[key] || 0}
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: C.muted, fontFamily: "'Lun Mono', monospace" }}>{sub}</div>
          </Card>
        ))}
      </div>

      {/* ROW 1.5 — Метрики: % + абсолютне число разом */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        {[
          {
            label: "% ЖК з фідами",
            pct: pctBuildsWithFeeds, color: C.orange,
            num: feedsKpi.feeds_total || 0, total: totalBuildings,
            numLabel: "ЖК з фідами",
            sub: `із ${totalBuildings.toLocaleString("uk-UA")} ЖК у продажу та бронь`,
          },
          {
            label: "% квартир в ЖК з фідами",
            pct: pctFlatsInFeeds, color: C.accent,
            num: totalFlatsWithFeeds, total: totalFlatsForSale,
            numLabel: "квартир в ЖК з фідами",
            sub: "продані + у продажі + бронь",
          },
          {
            label: "% available у фідах",
            pct: pctAvailInFeeds, color: C.green,
            num: totalAvailInFeeds, total: totalFlatsWithFeeds,
            numLabel: "available у фідах",
            sub: "квартири у продажі / всього в ЖК з фідами",
          },
        ].map(({ label, pct, color, num, total, sub }) => (
          <Card key={label} style={{ padding: "22px 26px" }}>
            <Label>{label}</Label>
            <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 6 }}>
              <PctRing value={pct} color={color} size={88} />
              <div>
                <div style={{ fontSize: 38, fontWeight: 700, fontFamily: "'Lun', sans-serif", color, lineHeight: 1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                  {num.toLocaleString("uk-UA")}
                </div>
                <div style={{ fontSize: 12, color: C.muted, fontFamily: "'Lun Mono', monospace", marginTop: 5 }}>
                  із {total.toLocaleString("uk-UA")}
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 3, maxWidth: 160, lineHeight: 1.4 }}>{sub}</div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* ROW 2 — Щоденний графік */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <Label style={{ marginBottom: 0 }}>Квартири з фідів по датах</Label>
          <FilterPills
            value={dailyDays}
            onChange={setDailyDays}
            options={[
              { label: "7д",  value: 7  },
              { label: "14д", value: 14 },
              { label: "30д", value: 30 },
              { label: "90д", value: 90 },
            ]}
          />
        </div>
        <div style={{ height: 250 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyData} barCategoryGap="22%" margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fill: C.muted, fontSize: 11, fontFamily: "'Lun Mono', monospace" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => v.toLocaleString("uk-UA")} domain={[dailyMin, "auto"]} width={65} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" fill={C.orange} radius={[4,4,0,0]} name="Квартири">
                {dailyDays <= 14 && (
                  <LabelList dataKey="count" position="top"
                    style={{ fill: C.text, fontSize: 10, fontFamily: "'Lun Mono', monospace" }}
                    formatter={v => v.toLocaleString("uk-UA")} />
                )}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: C.muted, fontFamily: "'Lun Mono', monospace" }}>
          {dailyDays > 14 ? "Значення — при наведенні на стовпчик" : ""}
        </div>
      </Card>

      {/* ROW 3 — Регіони: дві колонки з прогрес-барами */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

        <Card>
          <Label>% ЖК з фідами по регіонах</Label>
          <div style={{ marginTop: 12, maxHeight: 500, overflowY: "auto" }}>
            {regionPctData.map(r => (
              <div key={r.region} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ width: 126, fontSize: 12, color: C.text, flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.region}
                </div>
                <div style={{ flex: 1, height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${r.pct}%`, height: "100%", background: pctColor(r.pct), borderRadius: 3, transition: "width 0.8s ease" }} />
                </div>
                <div style={{ width: 38, fontSize: 11, fontFamily: "'Lun Mono', monospace", color: pctColor(r.pct), textAlign: "right", flexShrink: 0, fontWeight: 700 }}>
                  {r.pct}%
                </div>
                <div style={{ width: 58, fontSize: 10, fontFamily: "'Lun Mono', monospace", color: C.muted, textAlign: "right", flexShrink: 0 }}>
                  {r.hasFeed}/{r.total}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
            {[[C.orange,"≥25%"], [C.yellow,"10–25%"], [C.muted,"<10%"]].map(([color, label]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: C.muted, fontFamily: "'Lun Mono', monospace" }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: color }} />{label}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <Label>Кількість ЖК з фідами по регіонах</Label>
          <div style={{ marginTop: 12 }}>
            {regionCountDataH.map(r => (
              <div key={r.region} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ width: 126, fontSize: 12, color: C.text, flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.region}
                </div>
                <div style={{ flex: 1, height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${Math.round(r.count / maxCount * 100)}%`, height: "100%", background: C.orange, borderRadius: 3, transition: "width 0.8s ease" }} />
                </div>
                <div style={{ width: 38, fontSize: 11, fontFamily: "'Lun Mono', monospace", color: C.orange, textAlign: "right", flexShrink: 0, fontWeight: 700 }}>
                  {r.count}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ROW 4 — Таблиця статистики квартир по регіонах */}
      {feedsRegionStats.data.length > 0 && (
        <Card>
          <Label>Статистика квартир по регіонах</Label>
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", maxWidth: 880, margin: "0 auto", tableLayout: "fixed", borderCollapse: "collapse", fontSize: 13 }}>
              <colgroup>
                <col style={{ width: "16%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "17%" }} />
              </colgroup>
              <thead>
                <tr>
                  {["Регіон", "Available у фідах", "Всього в ЖК з фідами", "Всього в продажу", "% в ЖК з фідами", "% available у фідах"].map(h => (
                    <th key={h} style={{ textAlign: h === "Регіон" ? "left" : "right", padding: "6px 12px", color: C.muted, fontFamily: "'Lun Mono', monospace", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {feedsRegionStats.data.map((row, i) => {
                  const available  = parseInt(row[1]) || 0;
                  const withFeeds  = parseInt(row[2]) || 0;
                  const forSale    = parseInt(row[3]) || 0;
                  const pctInFeeds = forSale   > 0 ? (withFeeds / forSale   * 100).toFixed(1) : "0.0";
                  const pctAvail   = withFeeds > 0 ? (available / withFeeds * 100).toFixed(1) : "0.0";
                  const pctInFeedsColor = parseFloat(pctInFeeds) >= 50 ? C.green : parseFloat(pctInFeeds) >= 25 ? C.yellow : parseFloat(pctInFeeds) > 0 ? C.orange : C.muted;
                  const pctAvailColor   = parseFloat(pctAvail)   >= 50 ? C.green : parseFloat(pctAvail)   >= 25 ? C.yellow : parseFloat(pctAvail)   > 0 ? C.orange : C.muted;
                  const pctCell = (val, color) => (
                    <td style={{ padding: "9px 12px", textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                        <div style={{ width: 50, height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(100, parseFloat(val))}%`, height: "100%", background: color, borderRadius: 2 }} />
                        </div>
                        <span style={{ fontFamily: "'Lun Mono', monospace", fontSize: 12, color, fontWeight: 600, minWidth: 38, textAlign: "right" }}>{val}%</span>
                      </div>
                    </td>
                  );
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "9px 12px", fontWeight: 600, color: C.text }}>{row[0]}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "'Lun Mono', monospace", color: C.orange }}>{available.toLocaleString("uk-UA")}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "'Lun Mono', monospace", color: C.text }}>{withFeeds.toLocaleString("uk-UA")}</td>
                      <td style={{ padding: "9px 12px", textAlign: "right", fontFamily: "'Lun Mono', monospace", color: C.text }}>{forSale.toLocaleString("uk-UA")}</td>
                      {pctCell(pctInFeeds, pctInFeedsColor)}
                      {pctCell(pctAvail,   pctAvailColor)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ROW 5 — По місяцях */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, fontFamily: "'Lun Mono', monospace" }}>
          Фіди по типу додавання
        </div>
        <FilterPills
          value={monthsCount}
          onChange={setMonthsCount}
          options={[
            { label: "3 міс",  value: 3  },
            { label: "6 міс",  value: 6  },
            { label: "12 міс", value: 12 },
          ]}
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Card>
          <Label>Додано фідів від забудовників</Label>
          <div style={{ marginTop: 14, height: 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthData} barCategoryGap="25%" margin={{ top: 24 }}>
                <XAxis dataKey="month" tick={{ fill: C.muted, fontSize: 10, fontFamily: "'Lun Mono', monospace" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="від забудовника" fill={C.orange} radius={[4,4,0,0]}>
                  <LabelList dataKey="від забудовника" position="top" style={{ fill: C.text, fontSize: 12, fontFamily: "'Lun Mono', monospace", fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <Label>Додано фідів вручну (таблички)</Label>
          <div style={{ marginTop: 14, height: 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthData} barCategoryGap="25%" margin={{ top: 24 }}>
                <XAxis dataKey="month" tick={{ fill: C.muted, fontSize: 10, fontFamily: "'Lun Mono', monospace" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="вручну" fill={C.orange} radius={[4,4,0,0]}>
                  <LabelList dataKey="вручну" position="top" style={{ fill: C.text, fontSize: 12, fontFamily: "'Lun Mono', monospace", fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* ROW 6 — Компанії-розробники фідів */}
      {feedsByCompany.data.length > 0 && (() => {
        const companyData = feedsByCompany.data.map(r => ({
          company: r[0] || "—",
          count: parseInt(r[1]) || 0,
        }));
        const maxVal = companyData[0]?.count || 1;
        const totalCompany = companyData.reduce((s, r) => s + r.count, 0);
        const COMPANY_COLORS = ["#58a6ff","#f97316","#3fb950","#d29922","#bc8cff","#ff7b72","#39d353","#79c0ff"];
        return (
          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <Label style={{ marginBottom: 0 }}>Компанії-розробники фідів</Label>
              <div style={{ fontSize: 11, fontFamily: "'Lun Mono', monospace", color: C.muted }}>
                всього фідів: <span style={{ color: C.text, fontWeight: 700 }}>{totalCompany}</span> · увімкнені
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 32px" }}>
              {companyData.map((r, i) => {
                const color = COMPANY_COLORS[i % COMPANY_COLORS.length];
                const pct = Math.round(r.count / maxVal * 100);
                const pctOfTotal = Math.round(r.count / totalCompany * 100);
                return (
                  <div key={r.company} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    <div style={{ width: 90, fontSize: 13, fontWeight: 600, color: C.text, flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.company}
                    </div>
                    <div style={{ flex: 1, height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.8s ease" }} />
                    </div>
                    <div style={{ width: 32, fontSize: 12, fontFamily: "'Lun Mono', monospace", color, fontWeight: 700, textAlign: "right", flexShrink: 0 }}>
                      {r.count}
                    </div>
                    <div style={{ width: 34, fontSize: 10, fontFamily: "'Lun Mono', monospace", color: C.muted, textAlign: "right", flexShrink: 0 }}>
                      {pctOfTotal}%
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })()}
    </div>
  );
}

// ============================================================
// ВКЛАДКА RINGOSTAT
// ============================================================
const RINGO_PREMIUM = "9b4a8f";
const RINGO_BASIC   = "fb8b54";

function MonthSelect({ months, value, onChange }) {
  const C = useContext(ThemeContext);
  const UA_MONTHS_FULL = ["Січень","Лютий","Березень","Квітень","Травень","Червень","Липень","Серпень","Вересень","Жовтень","Листопад","Грудень"];
  function labelFor(ym) {
    if (!ym) return ym;
    const [y, m] = ym.split("-");
    return `${UA_MONTHS_FULL[(parseInt(m) || 1) - 1]} ${y}`;
  }
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        background: C.surface, color: C.text, border: `1px solid ${C.border}`,
        borderRadius: 8, padding: "7px 14px", fontSize: 13,
        fontFamily: "'Lun Mono', monospace", cursor: "pointer", outline: "none",
      }}
    >
      {months.map(m => <option key={m} value={m}>{labelFor(m)}</option>)}
    </select>
  );
}

function RingostatTab({ ringoKpiAll, ringoByRegionAll, ringoKmAll, ringoMissedStatus, ringoMissedBuilding, loading }) {
  const C = useContext(ThemeContext);
  const months = [...new Set((ringoKpiAll.data || []).map(r => r[0]))].filter(Boolean).sort((a, b) => monthKey(b) - monthKey(a));
  const [selectedMonth, setSelectedMonth] = useState(() => months[0] || "");
  const [pieRange, setPieRange] = useState(1);
  const [shameRange, setShameRange] = useState(1);

  // Sync selectedMonth if data arrives after initial render
  useEffect(() => {
    if (!selectedMonth && months.length > 0) setSelectedMonth(months[0]);
  }, [months, selectedMonth]);

  if (loading) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:400, color:C.muted, fontFamily:"'Lun Mono', monospace", fontSize:13 }}>
        завантаження…
      </div>
    );
  }

  // ── фільтр по місяцю ──────────────────────────────────
  const kpiRow = (ringoKpiAll.data || []).find(r => r[0] === selectedMonth) || [];
  const total   = parseInt(kpiRow[1]) || 0;
  const missed  = parseInt(kpiRow[2]) || 0;
  const basic   = parseInt(kpiRow[3]) || 0;
  const premium = parseInt(kpiRow[4]) || 0;
  const km      = parseInt(kpiRow[5]) || 0;
  const answered     = total - missed;
  const missedPct    = total > 0 ? Math.round(missed  / total * 100) : 0;
  const answeredPct  = total > 0 ? Math.round(answered / total * 100) : 0;

  const regionData = (ringoByRegionAll.data || [])
    .filter(r => r[0] === selectedMonth)
    .map(r => ({
      region:  (r[1] || "").replace(" область",""),
      basic:   parseInt(r[2]) || 0,
      premium: parseInt(r[3]) || 0,
      total:   parseInt(r[4]) || 0,
    }))
    .sort((a, b) => b.total - a.total);

  // Дані по всіх місяцях для графіків трендів (не фільтруємо по місяцю)
  const allMonthsData = [...(ringoKpiAll.data || [])]
    .sort((a, b) => monthKey(a[0]) - monthKey(b[0]))
    .map(r => ({
      month:      formatMonth(r[0]),
      km:         parseInt(r[5]) || 0,
      missed:     parseInt(r[2]) || 0,
      total:      parseInt(r[1]) || 0,
      missedPct:  parseInt(r[1]) > 0 ? Math.round(parseInt(r[2]) / parseInt(r[1]) * 100) : 0,
    }));

  // ── розподіл Basic/Premium за обраний період (незалежно від місяця вгорі) ──
  const sortedKpiDesc = [...(ringoKpiAll.data || [])].sort((a, b) => monthKey(b[0]) - monthKey(a[0]));
  const pieSlice   = pieRange >= 999 ? sortedKpiDesc : sortedKpiDesc.slice(0, pieRange);
  const pieTotal   = pieSlice.reduce((s, r) => s + (parseInt(r[1]) || 0), 0);
  const pieMissed  = pieSlice.reduce((s, r) => s + (parseInt(r[2]) || 0), 0);
  const pieBasic   = pieSlice.reduce((s, r) => s + (parseInt(r[3]) || 0), 0);
  const piePremium = pieSlice.reduce((s, r) => s + (parseInt(r[4]) || 0), 0);
  const pieMissedPct = pieTotal > 0 ? Math.round((pieMissed / pieTotal) * 100) : 0;
  const pieRangeLabel = pieRange === 1
    ? formatMonth(sortedKpiDesc[0]?.[0])
    : pieRange >= 999
      ? "за весь час"
      : `останні ${pieRange} міс.`;

  const pieData = [
    { name: "Premium", value: piePremium, color: "#" + RINGO_PREMIUM },
    { name: "Basic",   value: pieBasic,   color: "#" + RINGO_BASIC   },
  ];

  // ── Пропущені дзвінки по статусах (з таблиці "Пропущені рінго") ──
  const missedStatusMonths = [...new Set((ringoMissedStatus.data || []).map(r => r[0]))].sort((a, b) => monthKey(a) - monthKey(b));
  const missedStatusNames = [...new Set((ringoMissedStatus.data || []).map(r => r[1]))];
  const missedStatusChartData = missedStatusMonths.map(m => {
    const row = { month: formatMonth(m) };
    missedStatusNames.forEach(name => {
      const found = (ringoMissedStatus.data || []).find(r => r[0] === m && r[1] === name);
      row[name] = found ? (parseInt(found[2]) || 0) : 0;
    });
    return row;
  });
  const MISSED_STATUS_COLORS = [C.red, C.orange, C.muted, C.yellow];

  // ── Дошка позора: пропущені дзвінки по ЖК за обраний період ──
  const shameMonthsAll = [...new Set((ringoMissedBuilding.data || []).map(r => r[2]))].sort((a, b) => monthKey(b) - monthKey(a));
  const shameMonthsWindow = shameRange >= 999 ? shameMonthsAll : shameMonthsAll.slice(0, shameRange);
  const shameMonthsSet = new Set(shameMonthsWindow);
  const shameMap = new Map();
  (ringoMissedBuilding.data || []).forEach(r => {
    const [name, region, month, cnt] = r;
    if (!shameMonthsSet.has(month)) return;
    const key = name + "||" + region;
    const prev = shameMap.get(key) || { name, region, missed: 0 };
    prev.missed += parseInt(cnt) || 0;
    shameMap.set(key, prev);
  });
  const shameRows = [...shameMap.values()].filter(r => r.missed > 0).sort((a, b) => b.missed - a.missed);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:18 }}>

      {/* Заголовок з вибором місяця */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ fontSize:11, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", color:C.muted, fontFamily:"'Lun Mono', monospace" }}>
          Дзвінки Ringostat
        </div>
        {months.length > 0 && (
          <MonthSelect months={months} value={selectedMonth} onChange={setSelectedMonth} />
        )}
      </div>

      {/* ROW 1 — 4 KPI картки */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:14 }}>

        {/* Загальна кількість */}
        <Card>
          <Label>Всього дзвінків</Label>
          <div style={{ fontSize:56, fontWeight:700, fontFamily:"'Lun', sans-serif", color:C.text, lineHeight:1, letterSpacing:"-0.02em", fontVariantNumeric:"tabular-nums" }}>
            {total.toLocaleString("uk-UA")}
          </div>
          <div style={{ marginTop:10, fontSize:11, color:C.muted, fontFamily:"'Lun Mono', monospace" }}>
            усі дзвінки за місяць
          </div>
        </Card>

        {/* Пропущені */}
        <Card>
          <Label>Пропущені дзвінки</Label>
          <div style={{ display:"flex", alignItems:"center", gap:14, marginTop:4 }}>
            <PctRing value={missedPct} color={C.red} />
            <div>
              <div style={{ fontSize:26, fontWeight:700, fontFamily:"'Lun', sans-serif", color:C.red, fontVariantNumeric:"tabular-nums" }}>
                {missed.toLocaleString("uk-UA")}
              </div>
              <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>
                зі {total.toLocaleString("uk-UA")} дзвінків
              </div>
              <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>статус NO ANSWER</div>
            </div>
          </div>
        </Card>

        {/* Premium */}
        <Card>
          <Label>Premium дзвінки</Label>
          <div style={{ display:"flex", alignItems:"center", gap:14, marginTop:4 }}>
            <PctRing value={total > 0 ? Math.round(premium/total*100) : 0} color={"#" + RINGO_PREMIUM} />
            <div>
              <div style={{ fontSize:26, fontWeight:700, fontFamily:"'Lun', sans-serif", color:"#" + RINGO_PREMIUM, fontVariantNumeric:"tabular-nums" }}>
                {premium.toLocaleString("uk-UA")}
              </div>
              <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>popularity = premium</div>
            </div>
          </div>
        </Card>

        {/* Basic */}
        <Card>
          <Label>Basic дзвінки</Label>
          <div style={{ display:"flex", alignItems:"center", gap:14, marginTop:4 }}>
            <PctRing value={total > 0 ? Math.round(basic/total*100) : 0} color={"#" + RINGO_BASIC} />
            <div>
              <div style={{ fontSize:26, fontWeight:700, fontFamily:"'Lun', sans-serif", color:"#" + RINGO_BASIC, fontVariantNumeric:"tabular-nums" }}>
                {basic.toLocaleString("uk-UA")}
              </div>
              <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>popularity = basic</div>
            </div>
          </div>
        </Card>
      </div>

      {/* ROW 1.5 — Загальна кількість дзвінків по місяцях */}
      <Card>
        <Label>Кількість дзвінків по місяцях</Label>
        <div style={{ marginTop:14, height:220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={allMonthsData} barCategoryGap="30%" margin={{ top:20, right:8, left:0, bottom:0 }}>
              <XAxis dataKey="month" tick={{ fill:C.muted, fontSize:10, fontFamily:"'Lun Mono', monospace" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:C.muted, fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v => v.toLocaleString("uk-UA")} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" name="Дзвінків" fill={C.accent} radius={[4,4,0,0]}>
                <LabelList dataKey="total" position="top"
                  style={{ fill:C.text, fontSize:11, fontFamily:"'Lun Mono', monospace", fontWeight:600 }}
                  formatter={v => v.toLocaleString("uk-UA")} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* ROW 2 — Pie Basic/Premium (обраний період) */}
      <Card>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: 4 }}>
          <Label style={{ marginBottom: 0 }}>Розподіл Basic / Premium — {pieRangeLabel}</Label>
          <FilterPills
            value={pieRange}
            onChange={setPieRange}
            options={[
              { label: "1 міс",  value: 1   },
              { label: "3 міс",  value: 3   },
              { label: "6 міс",  value: 6   },
              { label: "12 міс", value: 12  },
              { label: "весь час", value: 999 },
            ]}
          />
        </div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:48, marginTop:8 }}>
          <div style={{ width:180, height:180, flexShrink:0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={80} dataKey="value" paddingAngle={3}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v) => v.toLocaleString("uk-UA")} contentStyle={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, fontFamily:"'Lun Mono', monospace", fontSize:12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display:"flex", gap:40 }}>
            {[
              { label:"Premium", value:piePremium, pct: pieTotal>0?Math.round(piePremium/pieTotal*100):0, color:"#"+RINGO_PREMIUM },
              { label:"Basic",   value:pieBasic,   pct: pieTotal>0?Math.round(pieBasic/pieTotal*100):0,   color:"#"+RINGO_BASIC   },
              { label:"Пропущені", value:pieMissed, pct: pieMissedPct, color:C.red },
            ].map(item => (
              <div key={item.label}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                  <div style={{ width:10, height:10, borderRadius:"50%", background:item.color }} />
                  <span style={{ fontSize:11, color:C.muted, fontFamily:"'Lun Mono', monospace" }}>{item.label}</span>
                </div>
                <div style={{ fontSize:32, fontWeight:700, fontFamily:"'Lun', sans-serif", color:item.color, lineHeight:1, fontVariantNumeric:"tabular-nums" }}>
                  {item.value.toLocaleString("uk-UA")}
                </div>
                <div style={{ fontSize:11, color:C.muted, fontFamily:"'Lun Mono', monospace", marginTop:4 }}>{item.pct}%</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* ROW 3 — КМ по місяцях + Пропущені по місяцях */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        <Card>
          <Label>Дзвінки в КМ по місяцях (Premium cottage)</Label>
          <div style={{ marginTop:14, height:220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={allMonthsData} barCategoryGap="30%" margin={{ top:20, right:8, left:0, bottom:0 }}>
                <XAxis dataKey="month" tick={{ fill:C.muted, fontSize:10, fontFamily:"'Lun Mono', monospace" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:C.muted, fontSize:10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="km" name="КМ дзвінки" fill={C.green} radius={[4,4,0,0]}>
                  <LabelList dataKey="km" position="top" style={{ fill:C.text, fontSize:11, fontFamily:"'Lun Mono', monospace", fontWeight:600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <Label>% пропущених дзвінків по місяцях</Label>
          <div style={{ marginTop:14, height:220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={allMonthsData} barCategoryGap="30%" margin={{ top:20, right:8, left:0, bottom:0 }}>
                <XAxis dataKey="month" tick={{ fill:C.muted, fontSize:10, fontFamily:"'Lun Mono', monospace" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:C.muted, fontSize:10 }} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={v => v + "%"} domain={[0, 100]} />
                <Tooltip formatter={(v) => v + "%"} contentStyle={{ background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, fontFamily:"'Lun Mono', monospace", fontSize:12 }} />
                <Bar dataKey="missedPct" name="Пропущені %" fill={C.red} radius={[4,4,0,0]}>
                  <LabelList dataKey="missedPct" position="top" style={{ fill:C.text, fontSize:11, fontFamily:"'Lun Mono', monospace", fontWeight:600 }} formatter={v => v + "%"} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* ROW 4 — Stacked bar chart по регіонах */}
      {regionData.length > 0 && (
        <Card>
          <Label>Розподіл дзвінків по регіонах (Basic / Premium)</Label>
          <div style={{ marginTop:14, height:260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={regionData} barCategoryGap="28%" margin={{ top:8, right:8, left:0, bottom:0 }}>
                <XAxis dataKey="region" tick={{ fill:C.muted, fontSize:10, fontFamily:"'Lun Mono', monospace" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:C.muted, fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v => v.toLocaleString("uk-UA")} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="basic"   name="Basic"   fill={"#"+RINGO_BASIC}   radius={[0,0,0,0]} stackId="a" />
                <Bar dataKey="premium" name="Premium" fill={"#"+RINGO_PREMIUM} radius={[3,3,0,0]} stackId="a">
                  <LabelList dataKey="total" position="top"
                    style={{ fill:C.muted, fontSize:9, fontFamily:"'Lun Mono', monospace" }}
                    formatter={v => v > 0 ? v.toLocaleString("uk-UA") : ""} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display:"flex", gap:20, marginTop:8 }}>
            {[["#"+RINGO_BASIC,"Basic"], ["#"+RINGO_PREMIUM,"Premium"]].map(([color, label]) => (
              <div key={label} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:C.muted, fontFamily:"'Lun Mono', monospace" }}>
                <div style={{ width:10, height:10, borderRadius:2, background:color }} />{label}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ROW 5 — Пропущені дзвінки по статусах (з таблиці "Пропущені рінго") */}
      {missedStatusChartData.length > 0 && (
        <Card>
          <Label>Пропущені дзвінки по статусах</Label>
          <div style={{ marginTop: 14, height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={missedStatusChartData} barCategoryGap="25%" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="month" tick={{ fill: C.muted, fontSize: 10, fontFamily: "'Lun Mono', monospace" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v.toLocaleString("uk-UA")} />
                <Tooltip content={<CustomTooltip />} />
                {missedStatusNames.map((name, i) => (
                  <Bar key={name} dataKey={name} name={name} stackId="a"
                    fill={MISSED_STATUS_COLORS[i % MISSED_STATUS_COLORS.length]}
                    radius={i === missedStatusNames.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
            {missedStatusNames.map((name, i) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.muted, fontFamily: "'Lun Mono', monospace" }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: MISSED_STATUS_COLORS[i % MISSED_STATUS_COLORS.length] }} />{name}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ROW 6 — Дошка позора: ЖК, що не беруть слухавку */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontFamily: "'Lun Display', sans-serif", fontSize: 18, fontWeight: 700, color: C.text }}>Дошка позора — ЖК, що не беруть слухавку</div>
          <FilterPills
            value={shameRange}
            onChange={setShameRange}
            options={[
              { label: "1 міс",  value: 1  },
              { label: "3 міс",  value: 3  },
              { label: "6 міс",  value: 6  },
            ]}
          />
        </div>
        {shameRows.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: C.green, fontFamily: "'Lun Mono', monospace", fontSize: 13 }}>
            ✓ Немає пропущених дзвінків за цей період
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", maxWidth: 700, margin: "0 auto", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 10px", color: C.muted, fontFamily: "'Lun Mono', monospace", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>ЖК</th>
                  <th style={{ textAlign: "left", padding: "6px 10px", color: C.muted, fontFamily: "'Lun Mono', monospace", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>Регіон</th>
                  <th style={{ textAlign: "right", padding: "6px 10px", color: C.muted, fontFamily: "'Lun Mono', monospace", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>Пропущено</th>
                </tr>
              </thead>
              <tbody>
                {shameRows.map((r, i) => (
                  <tr key={r.name + i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "10px", fontWeight: 600, color: C.text }}>{r.name}</td>
                    <td style={{ padding: "10px", color: C.muted }}>{r.region}</td>
                    <td style={{ padding: "10px", textAlign: "right", color: C.red, fontFamily: "'Lun Mono', monospace", fontWeight: 700 }}>{r.missed.toLocaleString("uk-UA")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ROW 7 — Таблиця KМ по ЖК (прихована — замінена графіком) */}
      {false && kmData.length > 0 && (
        <Card>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            <Label>КМ — дзвінки по ЖК (Premium cottage)</Label>
            <div style={{ fontSize:12, fontFamily:"'Lun Mono', monospace", color:C.green, background:"#1a2d1a", padding:"3px 10px", borderRadius:6 }}>
              {kmData.length} КМ
            </div>
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr>
                  {["#", "Назва КМ", "Регіон", "Дзвінків"].map(h => (
                    <th key={h} style={{ textAlign: h==="Дзвінків" ? "right" : "left", padding:"6px 10px", color:C.muted, fontFamily:"'Lun Mono', monospace", fontSize:10, letterSpacing:"0.06em", textTransform:"uppercase", borderBottom:`1px solid ${C.border}`, fontWeight:600 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {kmData.map((row, i) => {
                  const maxCalls = kmData[0]?.calls || 1;
                  const pct = Math.round(row.calls / maxCalls * 100);
                  return (
                    <tr key={i} style={{ borderBottom:`1px solid ${C.border}` }}>
                      <td style={{ padding:"9px 10px", color:C.muted, fontFamily:"'Lun Mono', monospace", fontSize:11, width:32 }}>{i+1}</td>
                      <td style={{ padding:"9px 10px", fontWeight:600, color:C.text }}>{row.name}</td>
                      <td style={{ padding:"9px 10px", color:C.muted, fontSize:12 }}>{row.region}</td>
                      <td style={{ padding:"9px 10px", textAlign:"right" }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", gap:10 }}>
                          <div style={{ width:80, height:4, background:C.border, borderRadius:2, overflow:"hidden" }}>
                            <div style={{ width:`${pct}%`, height:"100%", background:C.green, borderRadius:2 }} />
                          </div>
                          <span style={{ fontFamily:"'Lun Mono', monospace", fontWeight:700, color:C.green, minWidth:40, textAlign:"right" }}>
                            {row.calls.toLocaleString("uk-UA")}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

    </div>
  );
}

// ============================================================
// ВКЛАДКА LAYOUTS (планування)
// ============================================================
function CoverageCard({ label, without, total, sub }) {
  const C = useContext(ThemeContext);
  const pct = total > 0 ? Math.round((without / total) * 100) : 0;
  const color = pct >= 30 ? C.red : pct >= 15 ? C.yellow : C.green;
  const withCount = Math.max(total - without, 0);
  return (
    <Card>
      <Label>{label}</Label>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4 }}>
        <PctRing value={pct} color={color} />
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Lun', sans-serif", color, fontVariantNumeric: "tabular-nums" }}>
            {without.toLocaleString("uk-UA")}<span style={{ fontSize: 13, color: C.muted, fontWeight: 400 }}>/{total.toLocaleString("uk-UA")}</span>
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>без планувань · {sub}</div>
          <div style={{ fontSize: 10, color: C.green, marginTop: 2 }}>з плануванням: {withCount.toLocaleString("uk-UA")}</div>
        </div>
      </div>
    </Card>
  );
}

function BuildingsMissingTable({ title, rows, defaultOpen = true }) {
  const C = useContext(ThemeContext);
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: open ? 12 : 0, cursor: "pointer", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: C.muted, fontSize: 11, transition: "transform 0.2s", display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▸</span>
          <Label style={{ marginBottom: 0 }}>{title}</Label>
        </div>
        <div style={{ fontSize: 12, fontFamily: "'Lun Mono', monospace", color: C.orange, background: "rgba(249,115,22,0.12)", padding: "3px 10px", borderRadius: 6 }}>
          {rows.length} ЖК
        </div>
      </div>
      {open && (
        rows.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: C.green, fontFamily: "'Lun Mono', monospace", fontSize: 13 }}>
            ✓ Усі будинки мають планування
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", maxWidth: 820, margin: "0 auto", tableLayout: "fixed", borderCollapse: "collapse", fontSize: 13 }}>
              <colgroup>
                <col style={{ width: "34%" }} />
                <col style={{ width: "16%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "12%" }} />
              </colgroup>
              <thead>
                <tr>
                  {["ЖК", "Регіон", "Будинків без планувань", "Всього будинків", "%"].map(h => (
                    <th key={h} style={{ textAlign: (h === "ЖК" || h === "Регіон") ? "left" : "right", padding: "6px 10px", color: C.muted, fontFamily: "'Lun Mono', monospace", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const pct = r.total > 0 ? Math.round((r.without / r.total) * 100) : 0;
                  const pctColor = pct >= 75 ? C.red : pct >= 40 ? C.yellow : C.muted;
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: "10px", fontWeight: 600, color: C.text }}>{r.name}</td>
                      <td style={{ padding: "10px", color: C.muted }}>{r.region}</td>
                      <td style={{ padding: "10px", textAlign: "right", color: C.text, fontFamily: "'Lun Mono', monospace" }}>{r.without}</td>
                      <td style={{ padding: "10px", textAlign: "right", color: C.muted, fontFamily: "'Lun Mono', monospace" }}>{r.total}</td>
                      <td style={{ padding: "10px", textAlign: "right", color: pctColor, fontFamily: "'Lun Mono', monospace", fontWeight: 700 }}>{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </Card>
  );
}

function LayoutsTab({ layoutsMonthly, layoutsCoverage, layoutsKM, layoutsBuildings, kmMonthly, loading }) {
  const C = useContext(ThemeContext);
  const [monthsCount, setMonthsCount] = useState(6);
  const [kmMonthsCount, setKmMonthsCount] = useState(6);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400, color: C.muted, fontFamily: "'Lun Mono', monospace", fontSize: 13 }}>
        завантаження…
      </div>
    );
  }

  const n = v => parseInt(layoutsCoverage[v]) || 0;
  const km = v => parseInt(layoutsKM[v]) || 0;

  const monthData = layoutsMonthly.data.slice(-monthsCount).map(r => ({
    month: formatMonth(r[0]),
    count: parseInt(r[1]) || 0,
  }));

  const kmTotal = km("km_total");
  const kmMissing = km("km_missing");
  const kmNoPrice = km("km_no_price");
  const kmAdded = Math.max(kmTotal - kmMissing, 0);
  const kmPct = kmTotal > 0 ? Math.round((kmAdded / kmTotal) * 100) : 0;
  const kmColor = kmPct >= 75 ? C.green : kmPct >= 50 ? C.yellow : C.red;

  const kmMonthData = kmMonthly.data.slice(-kmMonthsCount).map(r => ({
    month: formatMonth(r[0]),
    count: parseInt(r[1]) || 0,
  }));

  const buildingsRows = layoutsBuildings.data.map(r => ({
    name: r[0] || "",
    region: r[1] || "",
    status: (r[2] || "").toLowerCase(),
    without: parseInt(r[3]) || 0,
    total: parseInt(r[4]) || 0,
  }));
  const premiumRows = buildingsRows.filter(r => r.status === "premium");
  const basicRows = buildingsRows.filter(r => r.status !== "premium");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* ROW 1 — покриття плануваннями */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <CoverageCard label="ЖК без планувань" without={n("buildings_without")} total={n("buildings_total")} sub="активні ЖК" />
        <CoverageCard label="Черги без планувань" without={n("queues_without")} total={n("queues_total")} sub="активні черги" />
        <CoverageCard label="Будинки без планувань" without={n("sections_without")} total={n("sections_total")} sub="активні будинки" />
      </div>

      {/* ROW 2 — Планувань додано по місяцях */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <Label style={{ marginBottom: 0 }}>Кількість планувань квартир додано</Label>
          <FilterPills
            value={monthsCount}
            onChange={setMonthsCount}
            options={[
              { label: "6 міс",  value: 6  },
              { label: "12 міс", value: 12 },
              { label: "24 міс", value: 24 },
              { label: "всі",    value: 999 },
            ]}
          />
        </div>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthData} barCategoryGap="25%" margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fill: C.muted, fontSize: 10, fontFamily: "'Lun Mono', monospace" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v.toLocaleString("uk-UA")} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Кількість планувань" fill={C.orange} radius={[4,4,0,0]}>
                {monthData.length <= 14 && (
                  <LabelList dataKey="count" position="top"
                    style={{ fill: C.text, fontSize: 11, fontFamily: "'Lun Mono', monospace", fontWeight: 600 }}
                    formatter={v => v.toLocaleString("uk-UA")} />
                )}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {monthData.length > 14 && (
          <div style={{ marginTop: 8, fontSize: 11, color: C.muted, fontFamily: "'Lun Mono', monospace" }}>
            Значення — при наведенні на стовпчик
          </div>
        )}
      </Card>

      {/* ROW 3 — ЖК з будинками без планувань */}
      <BuildingsMissingTable title="Premium ЖК — є будинки без планувань" rows={premiumRows} defaultOpen={true} />
      <BuildingsMissingTable title="Basic ЖК — є будинки без планувань" rows={basicRows} defaultOpen={false} />

      {/* ROW 4 — КМ типові проєкти */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <Label style={{ marginBottom: 0 }}>Типові проєкти КМ (планування додано)</Label>
          <div style={{ fontSize: 12, fontFamily: "'Lun Mono', monospace", color: C.red, background: C === DARK ? "#2e150f" : "#fbe0da", padding: "3px 10px", borderRadius: 6 }}>
            без цін: {kmNoPrice.toLocaleString("uk-UA")}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 6 }}>
          <PctRing value={kmPct} color={kmColor} size={88} />
          <div>
            <div style={{ fontSize: 38, fontWeight: 700, fontFamily: "'Lun', sans-serif", color: kmColor, lineHeight: 1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
              {kmAdded.toLocaleString("uk-UA")}
            </div>
            <div style={{ fontSize: 12, color: C.muted, fontFamily: "'Lun Mono', monospace", marginTop: 5 }}>
              із {kmTotal.toLocaleString("uk-UA")} типових проєктів
            </div>
            <div style={{ fontSize: 10, color: C.red, marginTop: 3 }}>
              без фото і без планування: {kmMissing.toLocaleString("uk-UA")}
            </div>
          </div>
        </div>
      </Card>

      {/* ROW 5 — Нових ТП по місяцях */}
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <Label style={{ marginBottom: 0 }}>Нових типових проєктів КМ по місяцях</Label>
          <FilterPills
            value={kmMonthsCount}
            onChange={setKmMonthsCount}
            options={[
              { label: "6 міс",  value: 6  },
              { label: "12 міс", value: 12 },
              { label: "24 міс", value: 24 },
              { label: "всі",    value: 999 },
            ]}
          />
        </div>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={kmMonthData} barCategoryGap="25%" margin={{ top: 28, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fill: C.muted, fontSize: 10, fontFamily: "'Lun Mono', monospace" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v.toLocaleString("uk-UA")} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Нових ТП" fill={C.accent} radius={[4,4,0,0]}>
                {kmMonthData.length <= 14 && (
                  <LabelList dataKey="count" position="top"
                    style={{ fill: C.text, fontSize: 11, fontFamily: "'Lun Mono', monospace", fontWeight: 600 }}
                    formatter={v => v.toLocaleString("uk-UA")} />
                )}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {kmMonthData.length > 14 && (
          <div style={{ marginTop: 8, fontSize: 11, color: C.muted, fontFamily: "'Lun Mono', monospace" }}>
            Значення — при наведенні на стовпчик
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================
// ГОЛОВНИЙ КОМПОНЕНТ
// ============================================================
const TABS = ["Фіди", "Realbase", "Layouts", "Ringostat"];

function inputStyle(C) {
  return {
    width: "100%", background: C.bg, color: C.text, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: "10px 12px", fontSize: 14, fontFamily: "'Lun', sans-serif",
    outline: "none", boxSizing: "border-box",
  };
}

function LoginScreen({ onSuccess }) {
  const [dark] = useState(() => {
    try { return localStorage.getItem("sm_theme") !== "light"; } catch { return true; }
  });
  const C = dark ? DARK : LIGHT;
  const [login, setLogin]     = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr]         = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const ok = TEAM_USERS.some(u => u.login === login.trim() && u.password === password);
    if (ok) {
      try { localStorage.setItem(AUTH_KEY, "1"); } catch { /* noop */ }
      onSuccess();
    } else {
      setErr("Невірний логін або пароль");
    }
  };

  return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Lun', sans-serif" }}>
      <style>{`* { box-sizing: border-box; }`}</style>
      <form onSubmit={handleSubmit} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "36px 32px", width: 320 }}>
        <div style={{ fontFamily: "'Lun Display', sans-serif", fontSize: 20, fontWeight: 900, color: C.text, marginBottom: 4 }}>Sales Monitoring</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 24 }}>Доступ тільки для команди</div>

        <label style={{ display: "block", fontSize: 12, color: C.muted, marginBottom: 6 }}>Логін</label>
        <input value={login} onChange={e => setLogin(e.target.value)} autoFocus style={inputStyle(C)} />

        <label style={{ display: "block", fontSize: 12, color: C.muted, margin: "14px 0 6px" }}>Пароль</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle(C)} />

        {err && <div style={{ marginTop: 12, fontSize: 12, color: C.red }}>{err}</div>}

        <button type="submit" style={{ marginTop: 22, width: "100%", background: C.accent, color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          Увійти
        </button>
      </form>
    </div>
  );
}

function Dashboard({ onLogout }) {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("sm_theme") !== "light"; } catch { return true; }
  });
  const C = dark ? DARK : LIGHT;
  const toggleTheme = () => {
    setDark(d => {
      const next = !d;
      try { localStorage.setItem("sm_theme", next ? "dark" : "light"); } catch { /* noop */ }
      return next;
    });
  };

  const [activeTab, setActiveTab] = useState("Фіди");

  // Flats data
  const [kpi, setKpi]         = useState({});
  const [regions, setRegions] = useState({ headers: [], data: [] });
  const [highList, setHigh]   = useState({ headers: [], data: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [lastUpd, setLastUpd] = useState(null);

  // Feeds data
  const [feedsKpi, setFeedsKpi]                   = useState({});
  const [feedsDaily, setFeedsDaily]               = useState({ headers: [], data: [] });
  const [feedsByRegion, setFeedsByRegion]         = useState({ headers: [], data: [] });
  const [feedsByMonth, setFeedsByMonth]           = useState({ headers: [], data: [] });
  const [feedsRegionStats, setFeedsRegionStats]   = useState({ headers: [], data: [] });
  const [feedsByCompany, setFeedsByCompany]       = useState({ headers: [], data: [] });
  const [feedsLoaded, setFeedsLoaded]             = useState(false);
  const [feedsLoading, setFeedsLoading]           = useState(false);
  const [feedsError, setFeedsError]               = useState(null);

  // Ringostat data
  const [ringoKpiAll,      setRingoKpiAll]      = useState({ headers:[], data:[] });
  const [ringoByRegionAll, setRingoByRegionAll] = useState({ headers:[], data:[] });
  const [ringoKmAll,       setRingoKmAll]       = useState({ headers:[], data:[] });
  const [ringoMissedStatus,   setRingoMissedStatus]   = useState({ headers:[], data:[] });
  const [ringoMissedBuilding, setRingoMissedBuilding] = useState({ headers:[], data:[] });
  const [ringoLoaded,      setRingoLoaded]      = useState(false);
  const [ringoLoading,     setRingoLoading]     = useState(false);
  const [ringoError,       setRingoError]       = useState(null);

  // Layouts data
  const [layoutsMonthly,  setLayoutsMonthly]  = useState({ headers: [], data: [] });
  const [layoutsCoverage, setLayoutsCoverage] = useState({});
  const [layoutsKM,       setLayoutsKM]       = useState({});
  const [layoutsBuildings, setLayoutsBuildings] = useState({ headers: [], data: [] });
  const [kmMonthly, setKmMonthly] = useState({ headers: [], data: [] });
  const [layoutsLoaded,   setLayoutsLoaded]   = useState(false);
  const [layoutsLoading,  setLayoutsLoading]  = useState(false);
  const [layoutsError,    setLayoutsError]    = useState(null);

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
    } catch {
      setError("Не вдалося завантажити дані.");
    } finally {
      setLoading(false);
    }
  }, [isDemo]);

  const fetchFeedsData = useCallback(async () => {
    if (isDemo) return;
    setFeedsLoading(true);
    setFeedsError(null);
    try {
      const [r1, r2, r3, r4, r5, r6] = await Promise.all([
        fetch(FEEDS_KPI_URL), fetch(FEEDS_DAILY_URL),
        fetch(FEEDS_REGION_URL), fetch(FEEDS_MONTH_URL),
        fetch(FEEDS_REGION_STATS_URL), fetch(FEEDS_COMPANY_URL),
      ]);
      const [j1, j2, j3, j4, j5, j6] = await Promise.all([r1.json(), r2.json(), r3.json(), r4.json(), r5.json(), r6.json()]);
      setFeedsKpi(parseKPI(j1.values));
      setFeedsDaily(parseTable(j2.values));
      setFeedsByRegion(parseTable(j3.values));
      setFeedsByMonth(parseTable(j4.values));
      setFeedsRegionStats(parseTable(j5.values));
      setFeedsByCompany(parseTable(j6.values));
      setFeedsLoaded(true);
    } catch {
      setFeedsError("Не вдалося завантажити дані фідів.");
    } finally {
      setFeedsLoading(false);
    }
  }, [isDemo]);

  useEffect(() => {
    if (!isDemo) { fetchData(); return; }
    // Demo дані для Flats
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

  const fetchRingoData = useCallback(async () => {
    if (isDemo) return;
    setRingoLoading(true);
    setRingoError(null);
    try {
      const [r1, r2, r3, r4, r5] = await Promise.all([
        fetch(RINGO_KPI_URL), fetch(RINGO_REGION_URL), fetch(RINGO_KM_URL),
        fetch(RINGO_MISSED_STATUS_URL), fetch(RINGO_MISSED_BUILDING_URL),
      ]);
      const [j1, j2, j3, j4, j5] = await Promise.all([r1.json(), r2.json(), r3.json(), r4.json(), r5.json()]);
      setRingoKpiAll(parseTable(j1.values));
      setRingoByRegionAll(parseTable(j2.values));
      setRingoKmAll(parseTable(j3.values));
      setRingoMissedStatus(parseTable(j4.values));
      setRingoMissedBuilding(parseTable(j5.values));
      setRingoLoaded(true);
    } catch {
      setRingoError("Не вдалося завантажити дані Ringostat.");
    } finally {
      setRingoLoading(false);
    }
  }, [isDemo]);

  const fetchLayoutsData = useCallback(async () => {
    if (isDemo) return;
    setLayoutsLoading(true);
    setLayoutsError(null);
    try {
      const [r1, r2, r3, r4, r5] = await Promise.all([
        fetch(LAYOUTS_MONTHLY_URL), fetch(LAYOUTS_COVERAGE_URL), fetch(LAYOUTS_KM_URL), fetch(LAYOUTS_BUILDINGS_URL), fetch(LAYOUTS_KM_MONTHLY_URL),
      ]);
      const [j1, j2, j3, j4, j5] = await Promise.all([r1.json(), r2.json(), r3.json(), r4.json(), r5.json()]);
      setLayoutsMonthly(parseTable(j1.values));
      setLayoutsCoverage(parseKPI(j2.values));
      setLayoutsKM(parseKPI(j3.values));
      setLayoutsBuildings(parseTable(j4.values));
      setKmMonthly(parseTable(j5.values));
      setLayoutsLoaded(true);
    } catch {
      setLayoutsError("Не вдалося завантажити дані по плануваннях.");
    } finally {
      setLayoutsLoading(false);
    }
  }, [isDemo]);

  // Lazy load feeds when tab is first opened
  useEffect(() => {
    if (activeTab === "Фіди" && !feedsLoaded && !isDemo) {
      fetchFeedsData();
    }
  }, [activeTab, feedsLoaded, isDemo, fetchFeedsData]);

  // Lazy load ringostat when tab is first opened
  useEffect(() => {
    if (activeTab === "Ringostat" && !ringoLoaded && !isDemo) {
      fetchRingoData();
    }
  }, [activeTab, ringoLoaded, isDemo, fetchRingoData]);

  // Lazy load layouts when tab is first opened
  useEffect(() => {
    if (activeTab === "Layouts" && !layoutsLoaded && !isDemo) {
      fetchLayoutsData();
    }
  }, [activeTab, layoutsLoaded, isDemo, fetchLayoutsData]);

  return (
    <ThemeContext.Provider value={C}>
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "'Lun', sans-serif", paddingBottom: 48 }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .fade { animation: fadeUp 0.45s ease both; }
        @keyframes orbFloat1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(80px,60px) scale(1.08)} }
        @keyframes orbFloat2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-60px,-80px) scale(0.92)} }
        @keyframes orbFloat3 { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(50px,-40px) scale(1.04)} 66%{transform:translate(-30px,50px) scale(0.97)} }
      `}</style>
      {/* Animated background orbs */}
      <div style={{ position:"fixed", inset:0, overflow:"hidden", pointerEvents:"none", zIndex:0 }}>
        <div style={{ position:"absolute", width:700, height:700, borderRadius:"50%", background:"radial-gradient(circle, rgba(155,74,143,0.09) 0%, transparent 70%)", top:-200, left:-150, animation:"orbFloat1 16s ease-in-out infinite" }} />
        <div style={{ position:"absolute", width:550, height:550, borderRadius:"50%", background:"radial-gradient(circle, rgba(249,115,22,0.07) 0%, transparent 70%)", bottom:"-5%", right:"-5%", animation:"orbFloat2 20s ease-in-out infinite" }} />
        <div style={{ position:"absolute", width:400, height:400, borderRadius:"50%", background:"radial-gradient(circle, rgba(63,185,80,0.05) 0%, transparent 70%)", top:"40%", left:"40%", animation:"orbFloat3 13s ease-in-out infinite" }} />
      </div>

      {/* Шапка */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "0 100px", display: "flex", alignItems: "stretch", justifyContent: "space-between", position: "sticky", top: 0, background: C.bg, zIndex: 10 }}>

        <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
          <div style={{ display: "flex", alignItems: "center", paddingRight: 32, borderRight: `1px solid ${C.border}` }}>
            <div>
              <div style={{ fontFamily: "'Lun Display', sans-serif", fontSize: 18, fontWeight: 900, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>
                Sales Monitoring
              </div>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: "'Lun Mono', monospace" }}>
                {isDemo ? "demo" : kpi.period || ""}
                {lastUpd && ` · ${lastUpd.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}`}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", marginLeft: 20, gap: 4, background: dark ? "#0000002a" : "#0000000d", padding: 4, borderRadius: 10 }}>
            {TABS.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                background: activeTab === tab ? C.surface : "none",
                border: activeTab === tab ? `1px solid ${C.border}` : "1px solid transparent",
                borderRadius: 7,
                color: activeTab === tab ? C.text : C.muted, fontFamily: "'Lun', sans-serif",
                fontSize: 13, fontWeight: activeTab === tab ? 600 : 500,
                letterSpacing: "0.02em",
                padding: "9px 16px", cursor: "pointer", transition: "all 0.2s",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                {tab.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={toggleTheme} style={{
            background: "none", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8,
            padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: "'Lun', sans-serif",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            {dark ? "☀ Light mode" : "🌙 Dark mode"}
          </button>
          <button onClick={onLogout} style={{
            background: "none", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8,
            padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: "'Lun', sans-serif",
          }}>
            Вийти
          </button>
          {activeTab === "Фіди" && feedsLoaded && (
            <button onClick={fetchFeedsData} disabled={feedsLoading || isDemo} style={{
              background: "none", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8,
              padding: "8px 14px", fontSize: 13, cursor: feedsLoading || isDemo ? "not-allowed" : "pointer",
              opacity: feedsLoading || isDemo ? 0.5 : 1, fontFamily: "'Lun', sans-serif",
            }}>
              {feedsLoading ? "…" : "↻"}
            </button>
          )}
          {activeTab === "Ringostat" && ringoLoaded && (
            <button onClick={fetchRingoData} disabled={ringoLoading || isDemo} style={{
              background: "none", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8,
              padding: "8px 14px", fontSize: 13, cursor: ringoLoading || isDemo ? "not-allowed" : "pointer",
              opacity: ringoLoading || isDemo ? 0.5 : 1, fontFamily: "'Lun', sans-serif",
            }}>
              {ringoLoading ? "…" : "↻"}
            </button>
          )}
          {activeTab === "Layouts" && layoutsLoaded && (
            <button onClick={fetchLayoutsData} disabled={layoutsLoading || isDemo} style={{
              background: "none", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8,
              padding: "8px 14px", fontSize: 13, cursor: layoutsLoading || isDemo ? "not-allowed" : "pointer",
              opacity: layoutsLoading || isDemo ? 0.5 : 1, fontFamily: "'Lun', sans-serif",
            }}>
              {layoutsLoading ? "…" : "↻"}
            </button>
          )}
          <button onClick={fetchData} disabled={loading || isDemo} style={{
            background: C.accent, color: "#fff", border: "none", borderRadius: 8,
            padding: "8px 18px", fontSize: 13, fontWeight: 600,
            cursor: loading || isDemo ? "not-allowed" : "pointer",
            opacity: loading || isDemo ? 0.5 : 1, fontFamily: "'Lun', sans-serif",
          }}>
            {loading ? "…" : "↻ Оновити"}
          </button>
        </div>
      </div>

      {(error || feedsError || ringoError || layoutsError) && (
        <div style={{ margin: "20px 100px", padding: "12px 18px", background: dark ? "#2e150f" : "#fbe0da", border: `1px solid ${C.red}`, borderRadius: 10, color: C.red, fontSize: 13, fontFamily: "'Lun Mono', monospace" }}>
          ⚠ {error || feedsError || ringoError || layoutsError}
        </div>
      )}

      {/* Контент вкладок */}
      <div style={{ padding: "24px 100px", position: "relative", zIndex: 1 }}>
        {activeTab === "Realbase"  && <FlatsTab kpi={kpi} regions={regions} highList={highList} />}
        {activeTab === "Фіди"      && <FeedsTab feedsKpi={feedsKpi} feedsDaily={feedsDaily} feedsByRegion={feedsByRegion} feedsByMonth={feedsByMonth} feedsRegionStats={feedsRegionStats} feedsByCompany={feedsByCompany} loading={feedsLoading} />}
        {activeTab === "Layouts"   && <LayoutsTab layoutsMonthly={layoutsMonthly} layoutsCoverage={layoutsCoverage} layoutsKM={layoutsKM} layoutsBuildings={layoutsBuildings} kmMonthly={kmMonthly} loading={layoutsLoading} />}
        {activeTab === "Ringostat" && <RingostatTab ringoKpiAll={ringoKpiAll} ringoByRegionAll={ringoByRegionAll} ringoKmAll={ringoKmAll} ringoMissedStatus={ringoMissedStatus} ringoMissedBuilding={ringoMissedBuilding} loading={ringoLoading} />}
      </div>
    </div>
    </ThemeContext.Provider>
  );
}

// ============================================================
// КОРІНЬ: перевірка авторизації
// ============================================================
export default function App() {
  const [authed, setAuthed] = useState(() => {
    try { return localStorage.getItem(AUTH_KEY) === "1"; } catch { return false; }
  });

  if (!authed) return <LoginScreen onSuccess={() => setAuthed(true)} />;

  return (
    <Dashboard
      onLogout={() => {
        try { localStorage.removeItem(AUTH_KEY); } catch { /* noop */ }
        setAuthed(false);
      }}
    />
  );
}
