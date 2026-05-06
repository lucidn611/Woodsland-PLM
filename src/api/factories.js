const express = require('express')
const db = require('../db')

// ===== CALCULATIONS =====
function calcElectrical(machines) {
  if (!machines.length) return null
  const totalDemand = machines.reduce((s, m) => s + m.demand * m.duty_factor, 0) * 1.2
  const voltage = machines[0].voltage || 380
  const pf = machines[0].power_factor || 0.85
  const I = totalDemand * 1000 / (Math.sqrt(3) * voltage * pf)
  const I_cable = I * 1.25
  const rho = 0.0175
  const crossSection = Math.max(I_cable / 3, 1)
  const R = rho * 50 / crossSection
  const vDrop = +(Math.sqrt(3) * I * R / voltage * 100).toFixed(2)
  return {
    totalDemand: +totalDemand.toFixed(2),
    I: +I.toFixed(2), I_cable: +I_cable.toFixed(2),
    vDrop, vDropAlert: vDrop > 5
  }
}

function calcDust(machines) {
  if (!machines.length) return null
  const totalDemand = machines.reduce((s, m) => s + m.demand * m.duty_factor, 0) * 1.2
  const v = 20
  const Q = totalDemand / 60
  const D = Math.sqrt(4 * Q / (Math.PI * v)) * 1000
  const vReal = Q / (Math.PI * (D / 1000) ** 2 / 4)
  return {
    totalDemand: +totalDemand.toFixed(2),
    D: +D.toFixed(1), vReal: +vReal.toFixed(1),
    vAlert: vReal < 15 ? 'low' : vReal > 25 ? 'high' : null
  }
}

function calcAir(machines) {
  if (!machines.length) return null
  const totalDemand = machines.reduce((s, m) => s + m.demand * m.duty_factor, 0) * 1.2
  const Q_actual = totalDemand / (8 / 1.013)
  const Q_actual_s = Q_actual / 60
  const vMax = 8
  const D = Math.sqrt(4 * Q_actual_s / (Math.PI * vMax)) * 1000
  return {
    totalDemand: +totalDemand.toFixed(2),
    Q_actual: +Q_actual.toFixed(2),
    D: +D.toFixed(1)
  }
}

function getLoadStatus(pct) {
  if (pct < 80) return 'normal'
  if (pct <= 100) return 'warning'
  return 'overload'
}
function calcLoad(demand, capacity) {
  if (!capacity) return { load_pct: 0, status: 'normal' }
  const p = +(demand / capacity * 100).toFixed(1)
  return { load_pct: p, status: getLoadStatus(p) }
}
function getCalc(sys_type, machines) {
  const active = machines.filter(m => m.status === 'active')
  if (!active.length) return null
  if (sys_type === 'electrical') return calcElectrical(active)
  if (sys_type === 'dust') return calcDust(active)
  return calcAir(active)
}

// ===== FACTORIES ROUTER =====
const factoriesRouter = express.Router()

factoriesRouter.get('/', async (req, res) => {
  try { res.json(await db.all_p('SELECT * FROM inf_factories ORDER BY id DESC')) }
  catch (e) { res.status(500).json({ error: e.message }) }
})
factoriesRouter.post('/', async (req, res) => {
  try {
    const { name, description, location } = req.body
    if (!name) return res.status(400).json({ error: 'Thiếu tên nhà máy' })
    const r = await db.run_p('INSERT INTO inf_factories (name,description,location) VALUES(?,?,?)',
      [name, description || '', location || ''])
    res.json({ id: r.lastID })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
factoriesRouter.get('/:id', async (req, res) => {
  try {
    const f = await db.get_p('SELECT * FROM inf_factories WHERE id=?', [req.params.id])
    if (!f) return res.status(404).json({ error: 'Không tìm thấy' })
    res.json(f)
  } catch (e) { res.status(500).json({ error: e.message }) }
})
factoriesRouter.put('/:id', async (req, res) => {
  try {
    const { name, description, location } = req.body
    await db.run_p('UPDATE inf_factories SET name=?,description=?,location=? WHERE id=?',
      [name, description || '', location || '', req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
factoriesRouter.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id
    const l1s = await db.all_p('SELECT id FROM inf_level1 WHERE factory_id=?', [id])
    for (const l1 of l1s) {
      const l2s = await db.all_p('SELECT id FROM inf_level2 WHERE level1_id=?', [l1.id])
      for (const l2 of l2s) await db.run_p('DELETE FROM inf_machines WHERE level2_id=?', [l2.id])
      await db.run_p('DELETE FROM inf_level2 WHERE level1_id=?', [l1.id])
    }
    await db.run_p('DELETE FROM inf_level1 WHERE factory_id=?', [id])
    await db.run_p('DELETE FROM inf_factories WHERE id=?', [id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Level1 under factory+system
factoriesRouter.get('/:fid/systems/:sys_type/level1', async (req, res) => {
  try {
    res.json(await db.all_p('SELECT * FROM inf_level1 WHERE factory_id=? AND sys_type=? ORDER BY id',
      [req.params.fid, req.params.sys_type]))
  } catch (e) { res.status(500).json({ error: e.message }) }
})
factoriesRouter.post('/:fid/systems/:sys_type/level1', async (req, res) => {
  try {
    const { name, description, capacity, unit } = req.body
    if (!name) return res.status(400).json({ error: 'Thiếu tên' })
    const r = await db.run_p(
      'INSERT INTO inf_level1 (factory_id,sys_type,name,description,capacity,unit) VALUES(?,?,?,?,?,?)',
      [req.params.fid, req.params.sys_type, name, description || '', capacity || 0, unit || ''])
    res.json({ id: r.lastID })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Dashboard
factoriesRouter.get('/:fid/dashboard', async (req, res) => {
  try {
    const fid = req.params.fid
    const factory = await db.get_p('SELECT * FROM inf_factories WHERE id=?', [fid])
    if (!factory) return res.status(404).json({ error: 'Không tìm thấy' })
    const sysTypes = ['electrical', 'dust', 'air']
    const sysLabels = { electrical: 'Hệ thống Điện', dust: 'Hệ thống Hút bụi', air: 'Hệ thống Khí nén' }
    const sysUnits = { electrical: 'kW', dust: 'm³/phút', air: 'm³/phút' }
    const systems = {}
    const alerts = []
    for (const sys of sysTypes) {
      const l1s = await db.all_p('SELECT * FROM inf_level1 WHERE factory_id=? AND sys_type=?', [fid, sys])
      let totalDemand = 0, totalCap = 0, machCount = 0
      for (const l1 of l1s) {
        const l2s = await db.all_p('SELECT * FROM inf_level2 WHERE level1_id=?', [l1.id])
        totalCap += l1.capacity
        let l1Demand = 0
        for (const l2 of l2s) {
          const ms = await db.all_p("SELECT * FROM inf_machines WHERE level2_id=? AND status='active'", [l2.id])
          machCount += ms.length
          const d = ms.reduce((s, m) => s + m.demand * m.duty_factor, 0) * 1.2
          l1Demand += d
          if (l2.capacity > 0) {
            const { load_pct, status } = calcLoad(d, l2.capacity)
            if (status !== 'normal') alerts.push({ sys, level: status, item: `${l1.name} → ${l2.name}`, load_pct })
          }
        }
        totalDemand += l1Demand
        if (l1.capacity > 0) {
          const { load_pct, status } = calcLoad(l1Demand, l1.capacity)
          if (status !== 'normal') alerts.push({ sys, level: status, item: l1.name, load_pct })
        }
      }
      const { load_pct, status } = calcLoad(totalDemand, totalCap)
      systems[sys] = {
        label: sysLabels[sys], unit: sysUnits[sys],
        l1Count: l1s.length, machCount,
        totalDemand: +totalDemand.toFixed(2), totalCap,
        load_pct, status
      }
    }
    res.json({ factory, systems, alerts })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Tree
factoriesRouter.get('/:fid/systems/:sys_type/tree', async (req, res) => {
  try {
    const { fid, sys_type } = req.params
    const l1s = await db.all_p('SELECT * FROM inf_level1 WHERE factory_id=? AND sys_type=? ORDER BY id', [fid, sys_type])
    const tree = []
    for (const l1 of l1s) {
      const l2s = await db.all_p('SELECT * FROM inf_level2 WHERE level1_id=? ORDER BY id', [l1.id])
      let l1Demand = 0
      const l1Children = []
      for (const l2 of l2s) {
        const machines = await db.all_p('SELECT * FROM inf_machines WHERE level2_id=? ORDER BY id', [l2.id])
        const activeMachines = machines.filter(m => m.status === 'active')
        const d = activeMachines.reduce((s, m) => s + m.demand * m.duty_factor, 0) * 1.2
        l1Demand += d
        const { load_pct, status } = calcLoad(d, l2.capacity)
        const calc = getCalc(sys_type, activeMachines)
        l1Children.push({ ...l2, machines, load_pct, load_status: status, calc })
      }
      const { load_pct, status } = calcLoad(l1Demand, l1.capacity)
      tree.push({ ...l1, children: l1Children, load_pct, load_status: status })
    }
    res.json(tree)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Diagram
factoriesRouter.get('/:fid/systems/:sys_type/diagram', async (req, res) => {
  try {
    const { fid, sys_type } = req.params
    const factory = await db.get_p('SELECT * FROM inf_factories WHERE id=?', [fid])
    const l1s = await db.all_p('SELECT * FROM inf_level1 WHERE factory_id=? AND sys_type=? ORDER BY id', [fid, sys_type])
    const nodes = [{ id: `f${fid}`, label: factory.name, type: 'factory', x: 0, y: 0 }]
    const edges = []
    let xIdx = 0
    for (const l1 of l1s) {
      const l2s = await db.all_p('SELECT * FROM inf_level2 WHERE level1_id=? ORDER BY id', [l1.id])
      const l1x = xIdx
      nodes.push({ id: `l1${l1.id}`, label: l1.name, capacity: l1.capacity, unit: l1.unit, type: 'level1', x: l1x, y: 1 })
      edges.push({ from: `f${fid}`, to: `l1${l1.id}` })
      let lx = xIdx
      for (const l2 of l2s) {
        const machines = await db.all_p('SELECT * FROM inf_machines WHERE level2_id=? ORDER BY id', [l2.id])
        nodes.push({ id: `l2${l2.id}`, label: l2.name, capacity: l2.capacity, unit: l2.unit, type: 'level2', x: lx, y: 2 })
        edges.push({ from: `l1${l1.id}`, to: `l2${l2.id}` })
        for (const m of machines) {
          nodes.push({ id: `m${m.id}`, label: m.name, demand: m.demand, status: m.status, type: 'machine', x: lx, y: 3 })
          edges.push({ from: `l2${l2.id}`, to: `m${m.id}` })
          lx++
        }
        if (!machines.length) lx++
      }
      xIdx = Math.max(xIdx + 1, lx)
    }
    res.json({ nodes, edges })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ===== LEVEL1 ROUTER =====
const level1Router = express.Router()

level1Router.get('/:id', async (req, res) => {
  try {
    const row = await db.get_p('SELECT * FROM inf_level1 WHERE id=?', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Không tìm thấy' })
    res.json(row)
  } catch (e) { res.status(500).json({ error: e.message }) }
})
level1Router.put('/:id', async (req, res) => {
  try {
    const { name, description, capacity, unit } = req.body
    await db.run_p('UPDATE inf_level1 SET name=?,description=?,capacity=?,unit=? WHERE id=?',
      [name, description || '', capacity || 0, unit || '', req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
level1Router.delete('/:id', async (req, res) => {
  try {
    const l2s = await db.all_p('SELECT id FROM inf_level2 WHERE level1_id=?', [req.params.id])
    for (const l2 of l2s) await db.run_p('DELETE FROM inf_machines WHERE level2_id=?', [l2.id])
    await db.run_p('DELETE FROM inf_level2 WHERE level1_id=?', [req.params.id])
    await db.run_p('DELETE FROM inf_level1 WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
level1Router.get('/:l1id/level2', async (req, res) => {
  try {
    res.json(await db.all_p('SELECT * FROM inf_level2 WHERE level1_id=? ORDER BY id', [req.params.l1id]))
  } catch (e) { res.status(500).json({ error: e.message }) }
})
level1Router.post('/:l1id/level2', async (req, res) => {
  try {
    const { name, description, capacity, unit } = req.body
    if (!name) return res.status(400).json({ error: 'Thiếu tên' })
    const r = await db.run_p(
      'INSERT INTO inf_level2 (level1_id,name,description,capacity,unit) VALUES(?,?,?,?,?)',
      [req.params.l1id, name, description || '', capacity || 0, unit || ''])
    res.json({ id: r.lastID })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ===== LEVEL2 ROUTER =====
const level2Router = express.Router()

level2Router.get('/:id', async (req, res) => {
  try {
    const row = await db.get_p('SELECT * FROM inf_level2 WHERE id=?', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Không tìm thấy' })
    res.json(row)
  } catch (e) { res.status(500).json({ error: e.message }) }
})
level2Router.put('/:id', async (req, res) => {
  try {
    const { name, description, capacity, unit } = req.body
    await db.run_p('UPDATE inf_level2 SET name=?,description=?,capacity=?,unit=? WHERE id=?',
      [name, description || '', capacity || 0, unit || '', req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
level2Router.delete('/:id', async (req, res) => {
  try {
    await db.run_p('DELETE FROM inf_machines WHERE level2_id=?', [req.params.id])
    await db.run_p('DELETE FROM inf_level2 WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
level2Router.get('/:l2id/machines', async (req, res) => {
  try {
    res.json(await db.all_p('SELECT * FROM inf_machines WHERE level2_id=? ORDER BY id', [req.params.l2id]))
  } catch (e) { res.status(500).json({ error: e.message }) }
})
level2Router.post('/:l2id/machines', async (req, res) => {
  try {
    const { name, demand, duty_factor, voltage, power_factor, status, note } = req.body
    if (!name) return res.status(400).json({ error: 'Thiếu tên' })
    const r = await db.run_p(
      'INSERT INTO inf_machines (level2_id,name,demand,duty_factor,voltage,power_factor,status,note) VALUES(?,?,?,?,?,?,?,?)',
      [req.params.l2id, name, demand || 0, duty_factor ?? 0.7, voltage || 380, power_factor || 0.85, status || 'active', note || ''])
    res.json({ id: r.lastID })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ===== MACHINES ROUTER =====
const machinesRouter = express.Router()

machinesRouter.get('/:id', async (req, res) => {
  try {
    const row = await db.get_p('SELECT * FROM inf_machines WHERE id=?', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Không tìm thấy' })
    res.json(row)
  } catch (e) { res.status(500).json({ error: e.message }) }
})
machinesRouter.put('/:id', async (req, res) => {
  try {
    const { name, demand, duty_factor, voltage, power_factor, status, note } = req.body
    await db.run_p(
      'UPDATE inf_machines SET name=?,demand=?,duty_factor=?,voltage=?,power_factor=?,status=?,note=? WHERE id=?',
      [name, demand || 0, duty_factor ?? 0.7, voltage || 380, power_factor || 0.85, status || 'active', note || '', req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})
machinesRouter.delete('/:id', async (req, res) => {
  try {
    await db.run_p('DELETE FROM inf_machines WHERE id=?', [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = { factoriesRouter, level1Router, level2Router, machinesRouter }
