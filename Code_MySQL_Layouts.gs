// ============================================================
// Code_MySQL_Layouts.gs
// Синхронізація даних по плануваннях (layouts) з MySQL → Google Sheets
// Використовує getConnection() і writeSheet() з Code_MySQL_Ringostat.gs
// (додати цей файл в той самий Apps Script проєкт)
// Запускати по тригеру: щогодини / раз на день
// ============================================================

function syncLayoutsData() {
  var conn;
  try {
    conn = getConnection();

    writeLayoutsMonthly(conn);
    writeLayoutsCoverage(conn);
    writeLayoutsKM(conn);
    writeLayoutsBuildingsMissing(conn);
    writeKmMonthly(conn);

    Logger.log("✅ Layouts sync done: " + new Date());
  } catch (e) {
    Logger.log("❌ Error: " + e);
    throw e;
  } finally {
    if (conn) conn.close();
  }
}

// ============================================================
// 1. Layouts_Monthly
// Колонки: month | count
// Кількість планувань, доданих по місяцях (останні 24 місяці)
// ⚠️ ПЕРЕВІРТЕ: назва колонки дати створення планування в таблиці `layout`.
// Тут припущено `create_time` — підставте свою (created_at / insert_date / add_date тощо).
// ============================================================
function writeLayoutsMonthly(conn) {
  var sql = `
    SELECT
      DATE_FORMAT(l.create_time, '%Y-%m') AS month,
      COUNT(*) AS cnt
    FROM layout l
    WHERE l.create_time >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 24 MONTH), '%Y-%m-01')
    GROUP BY DATE_FORMAT(l.create_time, '%Y-%m')
    ORDER BY month
  `;

  var stmt = conn.prepareStatement(sql);
  var rs = stmt.executeQuery();

  var rows = [["month", "count"]];
  while (rs.next()) {
    rows.push([rs.getString(1), rs.getInt(2)]);
  }
  rs.close(); stmt.close();

  writeSheet("Layouts_Monthly", rows);
}

// ============================================================
// 2. Layouts_Coverage (key-value)
// ЖК / черги / будинки (секції) без планувань + загальна кількість
// Фільтр: тільки new_building, developer_offer in (available, open_reservation)
// ============================================================
function writeLayoutsCoverage(conn) {
  var sql = `
    SELECT
      -- ЖК без планувань
      (SELECT COUNT(*) FROM (
        SELECT b.building_id
        FROM buildings b
        LEFT JOIN layout l ON b.building_id = l.building_id
        WHERE b.building_type = 'new_building'
          AND b.developer_offer IN ('available', 'open_reservation')
        GROUP BY b.building_id
        HAVING COUNT(DISTINCT l.layout_id) = 0
      ) t1) AS buildings_without,

      -- Всього ЖК (для %)
      (SELECT COUNT(*) FROM buildings b
       WHERE b.building_type = 'new_building'
         AND b.developer_offer IN ('available', 'open_reservation')) AS buildings_total,

      -- Черги без планувань
      (SELECT COUNT(*) FROM (
        SELECT bq.queue_id
        FROM buildings_queues bq
        LEFT JOIN section s ON bq.queue_id = s.queue_id
        LEFT JOIN layout l ON s.house_id = l.house_id
        WHERE bq.developer_offer IN ('available', 'open_reservation')
        GROUP BY bq.queue_id
        HAVING COUNT(DISTINCT l.layout_id) = 0
      ) t2) AS queues_without,

      -- Всього черг (для %)
      (SELECT COUNT(DISTINCT bq.queue_id) FROM buildings_queues bq
       WHERE bq.developer_offer IN ('available', 'open_reservation')) AS queues_total,

      -- Будинки (секції) без планувань
      -- Фільтр саме по статусу будинку (section), а не черги - щоб не тягнути
      -- продані / не стартувавші будинки. Зв'язок section -> layout через house_id.
      (SELECT COUNT(*) FROM (
        SELECT DISTINCT s.house_id
        FROM section s
        WHERE s.developer_offer IN ('available', 'open_reservation')
          AND NOT EXISTS (
            SELECT 1 FROM layout l WHERE l.house_id = s.house_id
          )
      ) t3) AS sections_without,

      -- Всього будинків (секцій) (для %)
      (SELECT COUNT(DISTINCT s.house_id) FROM section s
       WHERE s.developer_offer IN ('available', 'open_reservation')) AS sections_total,

      -- Бонус: планування без площі (з твого запиту) і всього планувань з контуром
      (SELECT COUNT(*)
       FROM layout l
       INNER JOIN layout_contour lc ON l.layout_id = lc.layout_id
       WHERE lc.geo_json_features NOT LIKE '%area%') AS layouts_without_area,

      (SELECT COUNT(*)
       FROM layout l2
       INNER JOIN layout_contour lc2 ON l2.layout_id = lc2.layout_id) AS layouts_with_contour
  `;

  var stmt = conn.prepareStatement(sql);
  var rs = stmt.executeQuery();

  var rows = [["key", "value"]];
  if (rs.next()) {
    rows.push(["buildings_without", rs.getInt("buildings_without")]);
    rows.push(["buildings_total", rs.getInt("buildings_total")]);
    rows.push(["queues_without", rs.getInt("queues_without")]);
    rows.push(["queues_total", rs.getInt("queues_total")]);
    rows.push(["sections_without", rs.getInt("sections_without")]);
    rows.push(["sections_total", rs.getInt("sections_total")]);
    rows.push(["layouts_without_area", rs.getInt("layouts_without_area")]);
    rows.push(["layouts_with_contour", rs.getInt("layouts_with_contour")]);
  }
  rs.close(); stmt.close();

  writeSheet("Layouts_Coverage", rows);
}

// ============================================================
// 3. Layouts_KM (key-value)
// Типові проєкти котеджних містечок (КМ) без фото і без планування,
// і скільки з них без цін (за твоїм запитом).
// ============================================================
function writeLayoutsKM(conn) {
  var sql = `
    SELECT
      (SELECT COUNT(*)
       FROM cottage_typical_project ctp
       LEFT JOIN cottage_project_image cpi ON cpi.project_id = ctp.project_id
       LEFT JOIN cottage_project_layout cpl ON cpl.project_id = ctp.project_id
       WHERE cpi.image_id IS NULL AND cpl.image_id IS NULL) AS km_missing,

      (SELECT COUNT(*) FROM cottage_typical_project) AS km_total,

      (SELECT COUNT(*)
       FROM cottage_price cp
       LEFT JOIN cottage_typical_project ctp ON cp.project_id = ctp.project_id
       LEFT JOIN buildings b ON cp.building_id = b.building_id
       WHERE cp.project_id IS NULL
         AND cp.is_sold = 'no'
         AND b.developer_offer IN ('available', 'open_reservation')) AS km_no_price
  `;

  var stmt = conn.prepareStatement(sql);
  var rs = stmt.executeQuery();

  var rows = [["key", "value"]];
  if (rs.next()) {
    rows.push(["km_missing", rs.getInt("km_missing")]);
    rows.push(["km_total", rs.getInt("km_total")]);
    rows.push(["km_no_price", rs.getInt("km_no_price")]);
  }
  rs.close(); stmt.close();

  writeSheet("Layouts_KM", rows);
}

// ============================================================
// 3b. Layouts_KM_Monthly
// Колонки: month | count
// Скільки нових типових проєктів (ТП) створено по місяцях (останні 24 місяці)
// ⚠️ ПЕРЕВІРТЕ: назва колонки дати створення в cottage_typical_project.
// Тут припущено create_time — підставте свою (created_at / insert_date тощо).
// ============================================================
function writeKmMonthly(conn) {
  var sql = `
    SELECT
      DATE_FORMAT(ctp.create_time, '%Y-%m') AS month,
      COUNT(*) AS cnt
    FROM cottage_typical_project ctp
    WHERE ctp.create_time >= DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 24 MONTH), '%Y-%m-01')
    GROUP BY DATE_FORMAT(ctp.create_time, '%Y-%m')
    ORDER BY month
  `;

  var stmt = conn.prepareStatement(sql);
  var rs = stmt.executeQuery();

  var rows = [["month", "count"]];
  while (rs.next()) {
    rows.push([rs.getString(1), rs.getInt(2)]);
  }
  rs.close(); stmt.close();

  writeSheet("Layouts_KM_Monthly", rows);
}

// ============================================================
// 4. Layouts_Buildings_Missing
// Колонки: ЖК | Регіон | Статус | Будинків без планувань | Всього будинків
// Список ЖК (premium і basic), у яких хоча б один будинок (секція) без планувань.
// ⚠️ ПЕРЕВІРТЕ: назву колонки зв'язку buildings_queues → buildings.
// Тут припущено, що в buildings_queues є колонка `building_id` (як у buildings).
// ⚠️ ПЕРЕВІРТЕ: рахуються тільки будинки (section) зі статусом available/
// open_reservation — тобто у продажі або бронюванні (не продані, не "coming soon").
// Припущено, що в `section` є колонка `developer_offer` (як у buildings).
// ============================================================
function writeLayoutsBuildingsMissing(conn) {
  var sql = `
    SELECT
      COALESCE(NULLIF(b.name_uk, ''), NULLIF(b.address_uk, ''), CONCAT('ЖК #', b.building_id)) AS name,
      gr.nominative_uk AS region,
      b.status AS status,
      SUM(CASE WHEN sec.layout_count = 0 THEN 1 ELSE 0 END) AS sections_without,
      COUNT(*) AS sections_total
    FROM buildings b
    INNER JOIN buildings_queues bq ON bq.building_id = b.building_id
    INNER JOIN (
      SELECT s.house_id, s.queue_id, COUNT(l.layout_id) AS layout_count
      FROM section s
      LEFT JOIN layout l ON l.house_id = s.house_id
      WHERE s.developer_offer IN ('available', 'open_reservation')
      GROUP BY s.house_id, s.queue_id
    ) sec ON sec.queue_id = bq.queue_id
    LEFT JOIN geo_regions gr ON gr.region_id = b.region_id
    WHERE b.building_type = 'new_building'
      AND b.developer_offer IN ('available', 'open_reservation')
    GROUP BY b.building_id, COALESCE(NULLIF(b.name_uk, ''), NULLIF(b.address_uk, ''), CONCAT('ЖК #', b.building_id)), gr.nominative_uk, b.status
    HAVING SUM(CASE WHEN sec.layout_count = 0 THEN 1 ELSE 0 END) > 0
    ORDER BY b.status DESC, sections_without DESC, name
  `;

  var stmt = conn.prepareStatement(sql);
  var rs = stmt.executeQuery();

  var rows = [["ЖК", "Регіон", "Статус", "Будинків без планувань", "Всього будинків"]];
  while (rs.next()) {
    rows.push([
      rs.getString("name"),
      rs.getString("region"),
      rs.getString("status"),
      rs.getInt("sections_without"),
      rs.getInt("sections_total"),
    ]);
  }
  rs.close(); stmt.close();

  writeSheet("Layouts_Buildings_Missing", rows);
}
