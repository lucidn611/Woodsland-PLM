const express = require('express')
const router = express.Router()
const db = require('../db')

router.get('/', async (req, res) => {
  try {
    const { project_id } = req.query
    if (!project_id) return res.status(400).json({ error: 'Thiếu project_id' })
    const rows = await db.all_p(`
      SELECT v.*,
        (SELECT COUNT(*) FROM acceptances a WHERE a.version_id = v.id AND a.confirmed_use=1) AS accepted_count
      FROM versions v WHERE v.project_id = ? ORDER BY v.created_at DESC
    `, [project_id])
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/', async (req, res) => {
  try {
    const { project_id, version, changelog, demo_link, created_by } = req.body
    if (!project_id || !version) return res.status(400).json({ error: 'Thiếu thông tin' })
    const r = await db.run_p(
      'INSERT INTO versions (project_id, version, changelog, demo_link, created_by) VALUES (?, ?, ?, ?, ?)',
      [project_id, version, changelog || '', demo_link || '', created_by || '']
    )
    await db.run_p("UPDATE projects SET status='review' WHERE id=?", [project_id])
    res.json({ id: r.lastID })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.put('/:id/status', async (req, res) => {
  try {
    await db.run_p('UPDATE versions SET status=? WHERE id=?', [req.body.status, req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/:id/acceptances', async (req, res) => {
  try {
    const rows = await db.all_p('SELECT * FROM acceptances WHERE version_id=?', [req.params.id])
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/:id/accept', async (req, res) => {
  try {
    const { person, department, confirmed_use, confirmed_trained, note } = req.body
    if (!person) return res.status(400).json({ error: 'Thiếu tên người xác nhận' })
    await db.run_p(
      `INSERT INTO acceptances (version_id, person, department, confirmed_use, confirmed_trained, note)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(version_id, person) DO UPDATE SET
         confirmed_use=excluded.confirmed_use,
         confirmed_trained=excluded.confirmed_trained,
         note=excluded.note,
         updated_at=datetime('now','localtime')`,
      [req.params.id, person, department || '', confirmed_use ? 1 : 0, confirmed_trained ? 1 : 0, note || '']
    )
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
