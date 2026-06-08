// ============================================================
// Code_MySQL_Ringostat.gs
// Синхронізація даних Ringostat з MySQL → Google Sheets
// Запускати по тригеру: щогодини
// ============================================================

var DB_HOST = ScriptProperties.getProperty("DB_HOST");
var DB_PORT = ScriptProperties.getProperty("DB_PORT") || "3306";
var DB_NAME = ScriptProperties.getProperty("DB_NAME");
var DB_USER = ScriptProperties.getProperty("DB_USER");
var DB_PASS = ScriptProperties.getProperty("DB_PASS");

var SHEET_ID = "1G40uOzR0pMyFw8BoEDChmbTEJhkyVTlrwWVKCokevgg";

// Назва колонки з назвою ЖК в таблиці buildings
var BUILDING_NAME_COL = "name_uk";

function syncRingostatData() {
  var conn;
  try {
    var url = "jdbc:mysql://" + DB_HOST + ":" + DB_PORT + "/" + DB_NAME + "?useSSL=false";
    conn = Jdbc.getConnection(url, DB_USER, DB_PASS);

    writeRingoKpiMonthly(conn);
    writeRingoByRegion(conn);
    writeRingoKM(conn);

    Logger.log("✅ Ringostat sync done: " + new Date());
  } catch (e) {
    Logger.log("❌ Error: " + e);
    throw e;
  } finally {
    if (conn) conn.close();
  }
}

// ============================================================
// 1. Ringo_KPI_Monthly
// Колонки: month | total_calls | missed_calls | basic_calls | premium_calls | km_premium_calls
// Останні 6 місяців, не-котеджні ЖК (+ окремо cottage+premium для КМ)
// ============================================================
function writeRingoKpiMonthly(conn) {
  var sql = `
    SELECT
      DATE_FORMAT(rc.call_timestamp, '%Y-%m') AS month,
      COUNT(*)                                                               AS total_calls,
      SUM(CASE WHEN rc.call_status = 'NO ANSWER' THEN 1 ELSE 0 END)         AS missed_calls,
      SUM(CASE WHEN b.popularity = 'basic'   THEN 1 ELSE 0 END)             AS basic_calls,
      SUM(CASE WHEN b.popularity = 'premium' THEN 1 ELSE 0 END)             AS premium_calls,
      0                                                                      AS km_premium_calls
    FROM b2b.ringo_call rc
    INNER JOIN buildings b ON rc.building_id = b.building_id
    WHERE rc.call_timestamp >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 6 MONTH), '%Y-%m-01')
      AND b.building_type != 'cottage'
    GROUP BY DATE_FORMAT(rc.call_timestamp, '%Y-%m')

    UNION ALL

    SELECT
      DATE_FORMAT(rc.call_timestamp, '%Y-%m') AS month,
      0, 0, 0, 0,
      COUNT(*) AS km_premium_calls
    FROM b2b.ringo_call rc
    INNER JOIN buildings b ON rc.building_id = b.building_id
    WHERE rc.call_timestamp >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 6 MONTH), '%Y-%m-01')
      AND b.building_type = 'cottage'
      AND b.popularity = 'premium'
    GROUP BY DATE_FORMAT(rc.call_timestamp, '%Y-%m')
    ORDER BY month DESC
  `;

  // Агрегуємо результат двох UNION рядків по місяцю
  var stmt = conn.prepareStatement(sql);
  var rs = stmt.executeQuery();
  var raw = {};
  while (rs.next()) {
    var m = rs.getString(1);
    if (!raw[m]) raw[m] = [m, 0, 0, 0, 0, 0];
    raw[m][1] += rs.getInt(2); // total
    raw[m][2] += rs.getInt(3); // missed
    raw[m][3] += rs.getInt(4); // basic
    raw[m][4] += rs.getInt(5); // premium
    raw[m][5] += rs.getInt(6); // km_premium
  }
  rs.close(); stmt.close();

  var rows = [["month","total_calls","missed_calls","basic_calls","premium_calls","km_premium_calls"]];
  Object.keys(raw).sort().reverse().forEach(function(m) { rows.push(raw[m]); });

  writeSheet("Ringo_KPI_Monthly", rows);
}

// ============================================================
// 2. Ringo_By_Region
// Колонки: month | region | basic_calls | premium_calls | total_calls
// ============================================================
function writeRingoByRegion(conn) {
  var sql = `
    SELECT
      DATE_FORMAT(rc.call_timestamp, '%Y-%m') AS month,
      CASE
        WHEN gc.city_id = 1 THEN 'Київ'
        ELSE CONCAT(gr.nominative_uk, ' область')
      END                                                                    AS region,
      SUM(CASE WHEN b.popularity = 'basic'   THEN 1 ELSE 0 END)             AS basic_calls,
      SUM(CASE WHEN b.popularity = 'premium' THEN 1 ELSE 0 END)             AS premium_calls,
      COUNT(*)                                                               AS total_calls
    FROM b2b.ringo_call rc
    INNER JOIN buildings b  ON rc.building_id = b.building_id
    INNER JOIN geo_regions gr ON b.region_id  = gr.region_id
    INNER JOIN geo_cities  gc ON b.city_id    = gc.city_id
    WHERE rc.call_timestamp >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 6 MONTH), '%Y-%m-01')
      AND b.building_type != 'cottage'
    GROUP BY
      DATE_FORMAT(rc.call_timestamp, '%Y-%m'),
      CASE WHEN gc.city_id = 1 THEN 'Київ' ELSE CONCAT(gr.nominative_uk, ' область') END
    ORDER BY month DESC, total_calls DESC
  `;

  var stmt = conn.prepareStatement(sql);
  var rs = stmt.executeQuery();
  var rows = [["month","region","basic_calls","premium_calls","total_calls"]];
  while (rs.next()) {
    rows.push([rs.getString(1), rs.getString(2), rs.getInt(3), rs.getInt(4), rs.getInt(5)]);
  }
  rs.close(); stmt.close();

  writeSheet("Ringo_By_Region", rows);
}

// ============================================================
// 3. Ringo_KM
// Тільки cottage + premium ЖК — кількість дзвінків по ЖК
// Колонки: month | building_id | building_name | region | calls
// ============================================================
function writeRingoKM(conn) {
  var sql = `
    SELECT
      DATE_FORMAT(rc.call_timestamp, '%Y-%m')                                AS month,
      b.building_id,
      IFNULL(b.name_uk, CONCAT('КМ #', b.building_id))                      AS building_name,
      CASE
        WHEN gc.city_id = 1 THEN 'Київ'
        ELSE CONCAT(gr.nominative_uk, ' область')
      END                                                                    AS region,
      COUNT(*)                                                               AS calls
    FROM b2b.ringo_call rc
    INNER JOIN buildings b  ON rc.building_id = b.building_id
    INNER JOIN geo_regions gr ON b.region_id  = gr.region_id
    INNER JOIN geo_cities  gc ON b.city_id    = gc.city_id
    WHERE rc.call_timestamp >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 6 MONTH), '%Y-%m-01')
      AND b.building_type = 'cottage'
      AND b.popularity    = 'premium'
    GROUP BY
      DATE_FORMAT(rc.call_timestamp, '%Y-%m'),
      b.building_id,
      b.name_uk,
      CASE WHEN gc.city_id = 1 THEN 'Київ' ELSE CONCAT(gr.nominative_uk, ' область') END
    ORDER BY month DESC, calls DESC
  `;

  var stmt = conn.prepareStatement(sql);
  var rs = stmt.executeQuery();
  var rows = [["month","building_id","building_name","region","calls"]];
  while (rs.next()) {
    rows.push([rs.getString(1), rs.getInt(2), rs.getString(3), rs.getString(4), rs.getInt(5)]);
  }
  rs.close(); stmt.close();

  writeSheet("Ringo_KM", rows);
}

// ============================================================
// Утиліта: перезапис листа
// ============================================================
function writeSheet(sheetName, rows) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  sheet.clearContents();
  if (rows.length > 0) {
    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  }
  Logger.log("✅ " + sheetName + " — " + (rows.length - 1) + " рядків");
}
