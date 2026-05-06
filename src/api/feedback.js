const express = require('express')
const router = express.Router()
const db = require('../db')

router.get('/', async (req, res) => {
  try {
    const { project_id } = req.query
    if (!project_id) return res.status(400).json({ error: 'Thiếu project_id' })
    const rows = await db.all_p(`
      SELECT f.*,
        (SELECT COUNT(*) FROM votes v WHERE v.feedback_id = f.id AND v.vote_type='up') AS votes_up,
        (SELECT COUNT(*) FROM votes v WHERE v.feedback_id = f.id AND v.vote_type='down') AS votes_down
      FROM feedback f WHERE f.project_id = ? ORDER BY f.created_at DESC
    `, [project_id])
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/', async (req, res) => {
  try {
    const { project_id, author, content } = req.body
    if (!project_id || !author || !content) return res.status(400).json({ error: 'Thiếu thông tin' })
    const r = await db.run_p(
      'INSERT INTO feedback (project_id, author, content) VALUES (?, ?, ?)',
      [project_id, author, content]
    )
    res.json({ id: r.lastID })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.put('/:id/status', async (req, res) => {
  try {
    const { status, reject_reason, priority } = req.body
    if (priority !== undefined) {
      await db.run_p('UPDATE feedback SET status=?, reject_reason=?, priority=? WHERE id=?', [status, reject_reason || '', priority, req.params.id])
    } else {
      await db.run_p('UPDATE feedback SET status=?, reject_reason=? WHERE id=?', [status, reject_reason || '', req.params.id])
    }
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/:id/vote', async (req, res) => {
  try {
    const { voter, vote_type } = req.body
    if (!voter || !vote_type) return res.status(400).json({ error: 'Thiếu thông tin' })
    await db.run_p(
      `INSERT INTO votes (feedback_id, voter, vote_type) VALUES (?, ?, ?)
       ON CONFLICT(feedback_id, voter) DO UPDATE SET vote_type=excluded.vote_type`,
      [req.params.id, voter, vote_type]
    )
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/:id', async (req, res) => {
  try {
    await db.run_p('DELETE FROM feedback WHERE id = ?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
