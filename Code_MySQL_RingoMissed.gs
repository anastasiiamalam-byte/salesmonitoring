// ============================================================
// Code_MySQL_RingoMissed.gs
// Аналітика пропущених дзвінків Ringostat:
// 1) копіює вручну підтримувану статистику з таблиці "Пропущені рінго"
//    (інша Google Таблиця, доступна лише твоєму акаунту — тому читаємо
//    її через SpreadsheetApp, а не через публічний API-ключ)
// 2) "дошка позора" по ЖК з пропущеними дзвінками, з MySQL напряму
// Додати цей файл в той самий Apps Script проєкт, що й Code_MySQL_Ringostat.gs
// (використовує його getConnection() / writeSheet() / SHEET_ID)
// Запускати по тригеру: щогодини / раз на день
// ============================================================

// Джерело: "Пропущені рінго" — окрема таблиця, gid береться з посилання
// https://docs.google.com/spreadsheets/d/10cRDvJjY7IKQqANqElPKoAUT-Q-yWK9mugOa6sjn9hs/edit?gid=1315996403
var MISSED_SOURCE_SHEET_ID = "10cRDvJjY7IKQqANqElPKoAUT-Q-yWK9mugOa6sjn9hs";
var MISSED_SOURCE_GID = 1315996403;

function syncRingoMissedAnalytics() {
  syncMissedCallsFromSourceSheet();

  var conn;
  try {
    conn = getConnection();
    writeMissedCallsWallOfShame(conn);
    Logger.log("Ringo missed-calls sync done: " + new Date());
  } catch (e) {
    Logger.log("Error: " + e);
    throw e;
  } finally {
    if (conn) conn.close();
  }
}

// ============================================================
// 1. Ringo_Missed_By_Status_Monthly
// Колонки: month | status | missed_calls
// Копія вручну підтримуваної статистики з "Пропущені рінго".
// Читаємо через SpreadsheetApp (авторизація по твоєму акаунту),
// а не через API-ключ, бо та таблиця не відкрита для нього.
// ⚠️ ПЕРЕВІРТЕ: якщо на вкладці "Пропущені рінго" зміниться розташування
// рядків/колонок, оновіть STATUS_ROWS і діапазон місяців нижче.
// ============================================================
function syncMissedCallsFromSourceSheet() {
  var sourceSs = SpreadsheetApp.openById(MISSED_SOURCE_SHEET_ID);
  var sheets = sourceSs.getSheets();
  var sourceSheet = null;
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === MISSED_SOURCE_GID) {
      sourceSheet = sheets[i];
      break;
    }
  }
  if (!sourceSheet) {
    throw new Error("Не знайдено вкладку з gid " + MISSED_SOURCE_GID + " у джерельній таблиці");
  }

  var lastCol = sourceSheet.getLastColumn();
  var monthsCount = lastCol - 2; // колонки B..передостанньої, без "Всього" в останній
  var headerRow = sourceSheet.getRange(1, 2, 1, monthsCount).getValues()[0];
  var months = headerRow.map(monthLabelToKey);

  // Рядки "втрачено дзвінків" по кожному статусу (за структурою таблиці на момент написання)
  var STATUS_ROWS = [
    { row: 3, label: "Блокування подвійної переадресації" },
    { row: 5, label: "Не відповідають, замінили номер" },
    { row: 7, label: "Не відповідали, зараз ок" },
    { row: 9, label: "Немає зв'язку, продано" },
  ];

  var rows = [["month", "status", "missed_calls"]];
  STATUS_ROWS.forEach(function (s) {
    var values = sourceSheet.getRange(s.row, 2, 1, monthsCount).getValues()[0];
    for (var i = 0; i < months.length; i++) {
      rows.push([months[i], s.label, Number(values[i]) || 0]);
    }
  });

  writeSheet("Ringo_Missed_By_Status_Monthly", rows);
}

function monthLabelToKey(uaLabel) {
  var MONTHS = {
    "січень": 1, "лютий": 2, "березень": 3, "квітень": 4, "травень": 5, "червень": 6,
    "липень": 7, "серпень": 8, "вересень": 9, "жовтень": 10, "листопад": 11, "грудень": 12
  };
  var parts = String(uaLabel).trim().toLowerCase().split(/\s+/);
  var m = MONTHS[parts[0]];
  var y = parseInt(parts[1], 10);
  if (!m || !y) return String(uaLabel);
  return y + "-" + (m < 10 ? "0" + m : m);
}

// ============================================================
// 2. Ringo_Missed_By_Building_Monthly ("дошка позора")
// Колонки: name | region | month | missed_calls
// Пропущені дзвінки (call_status = NO ANSWER) по ЖК, по місяцях,
// за останні 6 місяців (зменшено з 12 — важкий групування по ЖК×місяць
// підвішувало запит; 6 міс безпечніше). Фільтр періоду (1/3/6 міс) — на дашборді.
// Рахуємо напряму з MySQL, а не зі статусів "Пропущені рінго" —
// тому щойно ЖК починає відповідати, воно природно зникає зі списку
// в наступному місяці, без потреби вручну відстежувати статус "вже ок".
// ============================================================
function writeMissedCallsWallOfShame(conn) {
  var sql = `
    SELECT
      COALESCE(NULLIF(b.name_uk, ''), NULLIF(b.address_uk, ''), CONCAT('ЖК #', b.building_id)) AS name,
      gr.nominative_uk AS region,
      DATE_FORMAT(rc.call_timestamp, '%Y-%m') AS month,
      COUNT(*) AS missed_calls
    FROM b2b.ringo_call rc
    INNER JOIN buildings b ON rc.building_id = b.building_id
    LEFT JOIN geo_regions gr ON gr.region_id = b.region_id
    WHERE rc.call_status = 'NO ANSWER'
      AND rc.call_timestamp >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 6 MONTH), '%Y-%m-01')
    GROUP BY b.building_id, COALESCE(NULLIF(b.name_uk, ''), NULLIF(b.address_uk, ''), CONCAT('ЖК #', b.building_id)), gr.nominative_uk, DATE_FORMAT(rc.call_timestamp, '%Y-%m')
    ORDER BY name, month
  `;

  var stmt = conn.prepareStatement(sql);
  var rs = stmt.executeQuery();

  var rows = [["name", "region", "month", "missed_calls"]];
  while (rs.next()) {
    rows.push([
      rs.getString("name"),
      rs.getString("region"),
      rs.getString("month"),
      rs.getInt("missed_calls"),
    ]);
  }
  rs.close(); stmt.close();

  writeSheet("Ringo_Missed_By_Building_Monthly", rows);
}
