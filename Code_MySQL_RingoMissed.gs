// ============================================================
// Code_MySQL_RingoMissed.gs
// Аналітика пропущених дзвінків Ringostat:
// 1) копіює вручну підтримувану статистику з таблиці "Пропущені рінго"
//    (інша Google Таблиця, доступна лише твоєму акаунту — тому читаємо
//    її через SpreadsheetApp, а не через публічний API-ключ)
// 2) "дошка позора" по ЖК з пропущеними дзвінками — тепер напряму з
//    місячних аркушів тієї ж таблиці ("Травень 2025", "Червень 2025"...),
//    де вже є готові total/missed/% і статус причини (той самий скрипт,
//    що будує аркуш "Аналітика"). MySQL більше не потрібен.
// Додати цей файл в той самий Apps Script проєкт, що й Code_MySQL_Ringostat.gs
// (використовує його writeSheet() / SHEET_ID)
// Запускати по тригеру: раз на день
// ============================================================

// Джерело: "Пропущені рінго" — окрема таблиця, gid береться з посилання
// https://docs.google.com/spreadsheets/d/10cRDvJjY7IKQqANqElPKoAUT-Q-yWK9mugOa6sjn9hs/edit?gid=1315996403
var MISSED_SOURCE_SHEET_ID = "10cRDvJjY7IKQqANqElPKoAUT-Q-yWK9mugOa6sjn9hs";
var MISSED_SOURCE_GID = 1315996403;

// Статус, який вважаємо "вже вирішеним" — не показуємо в дошці позора
var RESOLVED_STATUS = "не відповідали, зараз ок";

function syncRingoMissedAnalytics() {
  syncMissedCallsFromSourceSheet();
  writeMissedCallsWallOfShame();
  Logger.log("Ringo missed-calls sync done: " + new Date());
}

// ============================================================
// 1. Ringo_Missed_By_Status_Monthly
// Колонки: month | status | missed_calls
// Копія вручну підтримуваної статистики з "Пропущені рінго".
// ⚠️ ПЕРЕВІРТЕ: якщо на вкладці "Пропущені рінго" зміниться розташування
// рядків/колонок, оновіть STATUS_ROWS і діапазон місяців нижче.
// ============================================================
function syncMissedCallsFromSourceSheet() {
  var sourceSs = SpreadsheetApp.openById(MISSED_SOURCE_SHEET_ID);
  var sourceSheet = getSheetByGid(sourceSs, MISSED_SOURCE_GID);
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

function getSheetByGid(spreadsheet, gid) {
  var sheets = spreadsheet.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === gid) return sheets[i];
  }
  return null;
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

function normalizeReasonStatus(value) {
  return (value || "").toString().trim()
    .replace(/[ʼ'`]/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// ============================================================
// 2. Ringo_Missed_By_Building_Monthly ("дошка позора")
// Колонки: name | month | missed_calls | total_calls
// Читаємо напряму з місячних аркушів джерельної таблиці ("Травень 2025",
// "Червень 2025" ...) — там для кожного номера/ЖК уже є total_calls,
// missed_calls і статус причини. Рядки зі статусом "не відповідали,
// зараз ок" (уже вирішено) пропускаємо.
// ⚠️ ПЕРЕВІРТЕ: індекси колонок нижче (B=назва/адреса, C=всього,
// D=пропущено, G=статус) відповідають структурі на момент написання.
// ============================================================
function writeMissedCallsWallOfShame() {
  var sourceSs = SpreadsheetApp.openById(MISSED_SOURCE_SHEET_ID);

  var monthSheets = sourceSs.getSheets().filter(function (s) {
    return /^[а-яґєії]+\s+20\d{2}$/i.test(s.getName().trim());
  });

  var rows = [["name", "month", "missed_calls", "total_calls"]];

  monthSheets.forEach(function (sheet) {
    var monthKeyStr = monthLabelToKey(sheet.getName());
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    data.forEach(function (row) {
      var name = (row[1] || "").toString().trim();
      var total = Number(row[2]) || 0;
      var missed = Number(row[3]) || 0;
      var status = normalizeReasonStatus(row[6]);

      if (!name || total === 0) return;
      if (status === RESOLVED_STATUS) return; // вже ок — пропускаємо

      rows.push([name, monthKeyStr, missed, total]);
    });
  });

  writeSheet("Ringo_Missed_By_Building_Monthly", rows);
}
