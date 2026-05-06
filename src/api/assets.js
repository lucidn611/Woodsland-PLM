const express = require('express')
const router = express.Router()
const db = require('../db')

// GET all assets (with optional filters)
router.get('/', async (req, res) => {
  try {
    const { status, category, department, search } = req.query
    let where = []
    let params = []
    if (status) { where.push('a.status = ?'); params.push(status) }
    if (category) { where.push('a.category = ?'); params.push(category) }
    if (department) { where.push('a.department = ?'); params.push(department) }
    if (search) { where.push("(a.name LIKE ? OR a.code LIKE ?)"); params.push(`%${search}%`, `%${search}%`) }
    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const rows = await db.all_p(`SELECT a.* FROM assets a ${whereStr} ORDER BY a.updated_at DESC`, params)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET single asset with history
router.get('/:id', async (req, res) => {
  try {
    const asset = await db.get_p('SELECT * FROM assets WHERE id = ?', [req.params.id])
    if (!asset) return res.status(404).json({ error: 'Không tìm thấy tài sản' })
    const history = await db.all_p('SELECT * FROM asset_history WHERE asset_id = ? ORDER BY created_at DESC', [req.params.id])
    res.json({ ...asset, history })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// POST create asset
router.post('/', async (req, res) => {
  try {
    const { code, name, category, location, department, status, purchase_date, purchase_value, current_value, description, note } = req.body
    if (!name) return res.status(400).json({ error: 'Thiếu tên tài sản' })
    const r = await db.run_p(
      `INSERT INTO assets (code, name, category, location, department, status, purchase_date, purchase_value, current_value, description, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code || '', name, category || '', location || '', department || '', status || 'in_use', purchase_date || '', purchase_value || 0, current_value || 0, description || '', note || '']
    )
    await db.run_p(
      `INSERT INTO asset_history (asset_id, action, new_status, note, changed_by) VALUES (?, 'create', ?, ?, ?)`,
      [r.lastID, status || 'in_use', 'Tạo mới tài sản', req.body.changed_by || '']
    )
    res.json({ id: r.lastID })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// PUT update asset
router.put('/:id', async (req, res) => {
  try {
    const old = await db.get_p('SELECT * FROM assets WHERE id = ?', [req.params.id])
    if (!old) return res.status(404).json({ error: 'Không tìm thấy tài sản' })
    const { code, name, category, location, department, status, purchase_date, purchase_value, current_value, description, note } = req.body
    await db.run_p(
      `UPDATE assets SET code=?, name=?, category=?, location=?, department=?, status=?, purchase_date=?, purchase_value=?, current_value=?, description=?, note=?, updated_at=datetime('now','localtime') WHERE id=?`,
      [code || '', name || old.name, category || '', location || '', department || '', status || old.status, purchase_date || '', purchase_value || 0, current_value || 0, description || '', note || '', req.params.id]
    )
    if (status && status !== old.status) {
      await db.run_p(
        `INSERT INTO asset_history (asset_id, action, old_status, new_status, note, changed_by) VALUES (?, 'status_change', ?, ?, ?, ?)`,
        [req.params.id, old.status, status, req.body.history_note || '', req.body.changed_by || '']
      )
    }
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// DELETE asset
router.delete('/:id', async (req, res) => {
  try {
    await db.run_p('DELETE FROM asset_history WHERE asset_id = ?', [req.params.id])
    await db.run_p('DELETE FROM assets WHERE id = ?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// GET stats/summary
router.get('/stats/summary', async (req, res) => {
  try {
    const total = await db.get_p('SELECT COUNT(*) as count FROM assets')
    const byStatus = await db.all_p('SELECT status, COUNT(*) as count FROM assets GROUP BY status')
    const byCategory = await db.all_p('SELECT category, COUNT(*) as count FROM assets GROUP BY category')
    const totalValue = await db.get_p('SELECT SUM(current_value) as total FROM assets')
    res.json({ total: total.count, byStatus, byCategory, totalValue: totalValue.total || 0 })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
