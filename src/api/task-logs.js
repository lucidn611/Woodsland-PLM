const express = require('express')
const router = express.Router()
const db = require('../db')

// Lấy logs của 1 dự án
router.get('/', async (req, res) => {
  try {
    const { project_id } = req.query
    if (!project_id) return res.status(400).json({ error: 'Thiếu project_id' })
    const rows = await db.all_p(
      'SELECT * FROM task_logs WHERE project_id=? ORDER BY created_at DESC LIMIT 50',
      [project_id]
    )
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Claude Code báo kết quả về (gọi từ MCP tool report_result)
router.post('/', async (req, res) => {
  try {
    const { project_id, status, message, files_changed } = req.body
    if (!project_id || !status) return res.status(400).json({ error: 'Thiếu project_id hoặc status' })
    const validStatus = ['success', 'partial', 'failed', 'need_info']
    if (!validStatus.includes(status)) return res.status(400).json({ error: `status phải là: ${validStatus.join(', ')}` })
    const r = await db.run_p(
      `INSERT INTO task_logs (project_id, status, message, files_changed) VALUES (?, ?, ?, ?)`,
      [project_id, status, message || '', files_changed || '']
    )
    res.json({ id: r.lastID })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/:id', async (req, res) => {
  try {
    await db.run_p('DELETE FROM task_logs WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
