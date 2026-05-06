const express = require('express')
const router = express.Router()
const db = require('../db')

router.get('/', async (req, res) => {
  try {
    const { project_id } = req.query
    if (!project_id) return res.status(400).json({ error: 'Thiếu project_id' })
    const rows = await db.all_p('SELECT * FROM training WHERE project_id=? ORDER BY created_at DESC', [project_id])
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/', async (req, res) => {
  try {
    const { project_id, title, content, type, created_by } = req.body
    if (!project_id || !title) return res.status(400).json({ error: 'Thiếu thông tin' })
    const r = await db.run_p(
      'INSERT INTO training (project_id, title, content, type, created_by) VALUES (?, ?, ?, ?, ?)',
      [project_id, title, content || '', type || 'doc', created_by || '']
    )
    res.json({ id: r.lastID })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.put('/:id', async (req, res) => {
  try {
    const { title, content, type } = req.body
    await db.run_p('UPDATE training SET title=?, content=?, type=? WHERE id=?', [title, content || '', type || 'doc', req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/:id', async (req, res) => {
  try {
    await db.run_p('DELETE FROM training WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
