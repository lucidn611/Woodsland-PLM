const router = require('express').Router()
const db = require('../db')

// GET /api/cm-attendance?class_id=1&date=2026-03-18
// GET /api/cm-attendance?class_id=1&week=2026-03-17 (lấy cả tuần từ thứ 2)
router.get('/', async (req, res) => {
  try {
    const { class_id, date, week } = req.query
    if (!class_id) return res.status(400).json({ error: 'class_id required' })

    if (week) {
      // Lấy điểm danh cả tuần (T2 -> CN)
      const weekStart = week // expect Monday date
      const rows = await db.all_p(
        `SELECT a.*, s.full_name FROM cm_attendance a
         JOIN cm_students s ON s.id = a.student_id
         WHERE a.class_id = ? AND a.date >= ? AND a.date <= date(?, '+6 days')
         ORDER BY a.date, s.full_name`,
        [class_id, weekStart, weekStart]
      )
      return res.json(rows)
    }

    if (date) {
      const rows = await db.all_p(
        `SELECT a.*, s.full_name FROM cm_attendance a
         JOIN cm_students s ON s.id = a.student_id
         WHERE a.class_id = ? AND a.date = ?
         ORDER BY s.full_name`,
        [class_id, date]
      )
      return res.json(rows)
    }

    // Mặc định: lấy tất cả
    const rows = await db.all_p(
      `SELECT a.*, s.full_name FROM cm_attendance a
       JOIN cm_students s ON s.id = a.student_id
       WHERE a.class_id = ? ORDER BY a.date DESC, s.full_name`,
      [class_id]
    )
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET /api/cm-attendance/summary?class_id=1&week=2026-03-17
// Thống kê số buổi đi học trong tuần của từng học viên
router.get('/summary', async (req, res) => {
  try {
    const { class_id, week } = req.query
    if (!class_id) return res.status(400).json({ error: 'class_id required' })

    let sql, params
    if (week) {
      sql = `SELECT s.id, s.full_name,
              COUNT(CASE WHEN a.status='present' THEN 1 END) AS present_count,
              COUNT(CASE WHEN a.status='absent' THEN 1 END) AS absent_count,
              COUNT(CASE WHEN a.status='late' THEN 1 END) AS late_count
             FROM cm_students s
             LEFT JOIN cm_attendance a ON a.student_id = s.id AND a.class_id = s.class_id
               AND a.date >= ? AND a.date <= date(?, '+6 days')
             WHERE s.class_id = ? AND s.status = 'active'
             GROUP BY s.id ORDER BY s.full_name`
      params = [week, week, class_id]
    } else {
      sql = `SELECT s.id, s.full_name,
              COUNT(CASE WHEN a.status='present' THEN 1 END) AS present_count,
              COUNT(CASE WHEN a.status='absent' THEN 1 END) AS absent_count,
              COUNT(CASE WHEN a.status='late' THEN 1 END) AS late_count
             FROM cm_students s
             LEFT JOIN cm_attendance a ON a.student_id = s.id AND a.class_id = s.class_id
             WHERE s.class_id = ? AND s.status = 'active'
             GROUP BY s.id ORDER BY s.full_name`
      params = [class_id]
    }
    const rows = await db.all_p(sql, params)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/cm-attendance — điểm danh hàng loạt
// body: { class_id, date, records: [{ student_id, status, note }] }
router.post('/', async (req, res) => {
  try {
    const { class_id, date, records } = req.body
    if (!class_id || !date || !records) return res.status(400).json({ error: 'class_id, date, records required' })

    // Xóa điểm danh cũ của ngày đó rồi insert mới
    await db.run_p('DELETE FROM cm_attendance WHERE class_id = ? AND date = ?', [class_id, date])

    for (const r of records) {
      await db.run_p(
        'INSERT INTO cm_attendance (student_id, class_id, date, status, note) VALUES (?, ?, ?, ?, ?)',
        [r.student_id, class_id, date, r.status || 'present', r.note || '']
      )
    }
    res.json({ ok: true, count: records.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// DELETE /api/cm-attendance/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.run_p('DELETE FROM cm_attendance WHERE id = ?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
