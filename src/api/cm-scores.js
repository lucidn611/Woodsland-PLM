const router = require('express').Router()
const db = require('../db')

const SUBJECTS = ['toan', 'van', 'anh']
const SUBJECT_LABELS = { toan: 'Toán', van: 'Văn', anh: 'Anh' }

// GET /api/cm-scores?class_id=1
// Lấy điểm tất cả học viên trong lớp (gộp 3 môn)
router.get('/', async (req, res) => {
  try {
    const { class_id } = req.query
    if (!class_id) return res.status(400).json({ error: 'class_id required' })

    const students = await db.all_p(
      `SELECT * FROM cm_students WHERE class_id = ? AND status = 'active' ORDER BY full_name`,
      [class_id]
    )

    const scores = await db.all_p(
      `SELECT * FROM cm_scores WHERE class_id = ?`,
      [class_id]
    )

    // Map scores by student_id + subject
    const scoreMap = {}
    scores.forEach(s => {
      if (!scoreMap[s.student_id]) scoreMap[s.student_id] = {}
      scoreMap[s.student_id][s.subject] = { id: s.id, score: s.score, note: s.note }
    })

    const result = students.map(st => ({
      student_id: st.id,
      full_name: st.full_name,
      toan: scoreMap[st.id]?.toan?.score ?? null,
      van: scoreMap[st.id]?.van?.score ?? null,
      anh: scoreMap[st.id]?.anh?.score ?? null,
      toan_note: scoreMap[st.id]?.toan?.note ?? '',
      van_note: scoreMap[st.id]?.van?.note ?? '',
      anh_note: scoreMap[st.id]?.anh?.note ?? '',
    }))

    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST /api/cm-scores — lưu điểm hàng loạt
// body: { class_id, records: [{ student_id, toan, van, anh }] }
router.post('/', async (req, res) => {
  try {
    const { class_id, records } = req.body
    if (!class_id || !records) return res.status(400).json({ error: 'class_id, records required' })

    for (const r of records) {
      for (const subject of SUBJECTS) {
        if (r[subject] === null || r[subject] === undefined || r[subject] === '') continue
        const existing = await db.get_p(
          'SELECT id FROM cm_scores WHERE student_id = ? AND class_id = ? AND subject = ?',
          [r.student_id, class_id, subject]
        )
        if (existing) {
          await db.run_p(
            'UPDATE cm_scores SET score = ?, note = ? WHERE id = ?',
            [parseFloat(r[subject]), r[subject + '_note'] || '', existing.id]
          )
        } else {
          await db.run_p(
            'INSERT INTO cm_scores (student_id, class_id, subject, score, note) VALUES (?, ?, ?, ?, ?)',
            [r.student_id, class_id, subject, parseFloat(r[subject]), r[subject + '_note'] || '']
          )
        }
      }
    }
    res.json({ ok: true, count: records.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
