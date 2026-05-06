const express = require('express')
const router = express.Router()
const db = require('../db')

router.get('/', async (req, res) => {
  try {
    const { project_id } = req.query
    if (!project_id) return res.status(400).json({ error: 'Thiếu project_id' })
    const rows = await db.all_p(`
      SELECT c.*,
        (SELECT COUNT(*) FROM cm_students s WHERE s.class_id = c.id AND s.status='active') AS student_count
      FROM cm_classes c WHERE c.project_id=? ORDER BY c.created_at DESC
    `, [project_id])
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/', async (req, res) => {
  try {
    const { project_id, name, description, teacher, schedule, start_date, end_date, max_students } = req.body
    if (!project_id || !name) return res.status(400).json({ error: 'Thiếu thông tin' })
    const r = await db.run_p(
      `INSERT INTO cm_classes (project_id, name, description, teacher, schedule, start_date, end_date, max_students)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [project_id, name, description || '', teacher || '', schedule || '', start_date || '', end_date || '', max_students || 30]
    )
    res.json({ id: r.lastID })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.put('/:id', async (req, res) => {
  try {
    const { name, description, teacher, schedule, start_date, end_date, max_students, status } = req.body
    await db.run_p(
      `UPDATE cm_classes SET name=?, description=?, teacher=?, schedule=?, start_date=?, end_date=?, max_students=?, status=? WHERE id=?`,
      [name, description || '', teacher || '', schedule || '', start_date || '', end_date || '', max_students || 30, status || 'active', req.params.id]
    )
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/:id', async (req, res) => {
  try {
    await db.run_p('DELETE FROM cm_students WHERE class_id=?', [req.params.id])
    await db.run_p('DELETE FROM cm_classes WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
