const express = require('express')
const router = express.Router()
const db = require('../db')

router.get('/', async (req, res) => {
  try {
    const { class_id, search } = req.query
    if (!class_id) return res.status(400).json({ error: 'Thiếu class_id' })
    let sql = 'SELECT * FROM cm_students WHERE class_id=?'
    const params = [class_id]
    if (search) {
      sql += ' AND (full_name LIKE ? OR phone LIKE ? OR email LIKE ?)'
      params.push(`%${search}%`, `%${search}%`, `%${search}%`)
    }
    sql += ' ORDER BY full_name ASC'
    const rows = await db.all_p(sql, params)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/', async (req, res) => {
  try {
    const { class_id, full_name, phone, email, dob, address, note } = req.body
    if (!class_id || !full_name) return res.status(400).json({ error: 'Thiếu thông tin' })
    const r = await db.run_p(
      `INSERT INTO cm_students (class_id, full_name, phone, email, dob, address, note) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [class_id, full_name, phone || '', email || '', dob || '', address || '', note || '']
    )
    res.json({ id: r.lastID })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.put('/:id', async (req, res) => {
  try {
    const { full_name, phone, email, dob, address, note, status } = req.body
    await db.run_p(
      `UPDATE cm_students SET full_name=?, phone=?, email=?, dob=?, address=?, note=?, status=? WHERE id=?`,
      [full_name, phone || '', email || '', dob || '', address || '', note || '', status || 'active', req.params.id]
    )
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PUT /api/cm-students/:id/transfer — chuyển lớp
router.put('/:id/transfer', async (req, res) => {
  try {
    const { new_class_id } = req.body
    if (!new_class_id) return res.status(400).json({ error: 'Thiếu new_class_id' })
    const student = await db.get_p('SELECT * FROM cm_students WHERE id=?', [req.params.id])
    if (!student) return res.status(404).json({ error: 'Không tìm thấy học viên' })
    const newClass = await db.get_p('SELECT * FROM cm_classes WHERE id=?', [new_class_id])
    if (!newClass) return res.status(404).json({ error: 'Không tìm thấy lớp đích' })
    await db.run_p('UPDATE cm_students SET class_id=? WHERE id=?', [new_class_id, req.params.id])
    res.json({ ok: true, from_class: student.class_id, to_class: new_class_id })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/:id', async (req, res) => {
  try {
    await db.run_p('DELETE FROM cm_students WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
