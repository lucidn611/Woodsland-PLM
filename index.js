require('dotenv').config()
const express = require('express')
const path = require('path')
const os = require('os')
const app = express()
const PORT = process.env.PORT || 2020

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, 'public')))

const multer = require('multer')
const fs = require('fs')
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'data/attachments', req.params.id || 'tmp')
    fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    cb(null, Date.now() + ext)
  }
})
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } })

app.post('/api/projects/:id/upload', upload.array('files', 10), async (req, res) => {
  try {
    const db = require('./src/db')
    const results = []
    for (const file of req.files) {
      const filename = file.filename
      const originalname = Buffer.from(file.originalname, 'latin1').toString('utf8')
      await db.run_p('INSERT INTO project_attachments (project_id, filename, original_name) VALUES (?,?,?)',
        [req.params.id, filename, originalname])
      results.push({ filename, originalname })
    }
    res.json({ ok: true, files: results })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/projects/:id/attachments', async (req, res) => {
  try {
    const db = require('./src/db')
    const rows = await db.all_p('SELECT * FROM project_attachments WHERE project_id=? ORDER BY created_at ASC', [req.params.id])
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/projects/:id/attachments/:attachId', async (req, res) => {
  try {
    const db = require('./src/db')
    const att = await db.get_p('SELECT * FROM project_attachments WHERE id=? AND project_id=?', [req.params.attachId, req.params.id])
    if (!att) return res.status(404).json({ error: 'Không tìm thấy' })
    const filePath = path.join(__dirname, 'data/attachments', req.params.id, att.filename)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    await db.run_p('DELETE FROM project_attachments WHERE id=?', [req.params.attachId])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/projects/:id/download/:attachId', async (req, res) => {
  try {
    const db = require('./src/db')
    const att = await db.get_p('SELECT * FROM project_attachments WHERE id=? AND project_id=?', [req.params.attachId, req.params.id])
    if (!att) return res.status(404).json({ error: 'Không có file' })
    const filePath = path.join(__dirname, 'data/attachments', req.params.id, att.filename)
    res.download(filePath, att.original_name)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

const { spawn } = require('child_process')
const CLAUDE_BIN = 'C:\\Users\\Administrator\\AppData\\Roaming\\npm\\claude.cmd'
const MCP_CONFIG = 'C:\\Quan_ly_vong_doi\\MCP-SERVER-QL\\mcp-config.json'
const buildingProjects = new Set()

app.post('/api/projects/:id/reset-app', (req, res) => {
  const appFile = path.join(__dirname, 'public/apps', req.params.id, 'index.html')
  if (fs.existsSync(appFile)) fs.unlinkSync(appFile)
  buildingProjects.delete(req.params.id)
  res.json({ ok: true })
})

app.get('/api/projects/:id/app-status', (req, res) => {
  const appFile = path.join(__dirname, 'public/apps', req.params.id, 'index.html')
  res.json({ exists: fs.existsSync(appFile), building: buildingProjects.has(req.params.id) })
})

app.post('/api/projects/:id/build', (req, res) => {
  const id = req.params.id
  if (buildingProjects.has(id)) return res.json({ ok: true, building: true, message: 'Đang build...' })
  const appFile = path.join(__dirname, 'public/apps', id, 'index.html')
  if (fs.existsSync(appFile)) return res.json({ ok: true, building: false, exists: true })

  buildingProjects.add(id)
  res.json({ ok: true, building: true, message: 'Bắt đầu build...' })

  const prompt = `Use the get_prompt_package tool with project_id=${id} to get requirements, then build the app. IMPORTANT: ALL text displayed in the app MUST be in Vietnamese with full diacritics (e.g. "Quản lý" not "Quan ly", "Tổng cộng" not "Tong cong"). Then call report_result when done.`
  const tmpBat = path.join(os.tmpdir(), `build_${id}_${Date.now()}.bat`)
  fs.writeFileSync(tmpBat, `@echo off\nchcp 65001 >nul\n"${CLAUDE_BIN}" -p "${prompt}" --mcp-config "${MCP_CONFIG}" --allowedTools "mcp__ql__*,Read,Edit,Write,Bash,Glob,Grep" --dangerously-skip-permissions\n`, 'utf8')
  const child = spawn('cmd.exe', ['/d', '/s', '/c', tmpBat], { cwd: 'C:\\Quan_ly_vong_doi', stdio: 'ignore', env: { ...process.env } })
  child.on('error', () => { buildingProjects.delete(id); try { fs.unlinkSync(tmpBat) } catch {} })
  child.on('close', () => { buildingProjects.delete(id); try { fs.unlinkSync(tmpBat) } catch {} })
  setTimeout(() => { child.kill(); buildingProjects.delete(id); try { fs.unlinkSync(tmpBat) } catch {} }, 15 * 60 * 1000)
})

app.post('/api/verify-pin', (req, res) => {
  const { pin } = req.body
  if (pin === (process.env.ADMIN_PIN || '2020')) res.json({ ok: true })
  else res.status(401).json({ ok: false })
})

// Webhook tự động deploy khi push GitHub
app.post('/api/deploy', (req, res) => {
  const secret = req.headers['x-deploy-secret']
  if (secret !== (process.env.DEPLOY_SECRET || 'woodsland2020')) return res.status(401).json({ ok: false })
  res.json({ ok: true, message: 'Deploy started' })
  const { exec } = require('child_process')
  exec('git -C "C:\\Quan_ly_vong_doi\\DX-LIFECYCLE" pull origin main && git -C "C:\\Quan_ly_vong_doi\\MCP-SERVER-QL" pull origin main', (err, stdout) => {
    console.log('[Deploy]', stdout || err?.message)
    setTimeout(() => { exec('pm2 restart dx-lifecycle auto-worker') }, 2000)
  })
})

app.use('/api/projects', require('./src/api/projects'))
app.use('/api/feedback', require('./src/api/feedback'))
app.use('/api/versions', require('./src/api/versions'))
app.use('/api/training', require('./src/api/training'))
app.use('/api/cm-classes', require('./src/api/cm-classes'))
app.use('/api/cm-students', require('./src/api/cm-students'))
app.use('/api/cm-attendance', require('./src/api/cm-attendance'))
app.use('/api/cm-scores', require('./src/api/cm-scores'))
app.use('/api/task-logs', require('./src/api/task-logs'))
app.use('/api/assets', require('./src/api/assets'))
const factoriesApi = require('./src/api/factories')
app.use('/api/factories', factoriesApi.factoriesRouter)
app.use('/api/level1', factoriesApi.level1Router)
app.use('/api/level2', factoriesApi.level2Router)
app.use('/api/machines', factoriesApi.machinesRouter)

// Serve project apps tại /apps/:id/
app.use('/apps/:id', (req, res, next) => {
  const appDir = path.join(__dirname, 'public', 'apps', req.params.id)
  express.static(appDir)(req, res, () => { // eslint-disable-line
    // fallback về index.html của app đó nếu route không tồn tại (SPA support)
    const fs = require('fs')
    const indexFile = path.join(appDir, 'index.html')
    if (fs.existsSync(indexFile)) {
      res.sendFile(indexFile)
    } else {
      res.status(404).send(`<h2>Ứng dụng chưa được xây dựng</h2><p>Dự án ID ${req.params.id} chưa có app. Hãy gửi yêu cầu về Claude Code.</p>`)
    }
  })
})

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.listen(PORT, () => console.log(`DX Lifecycle Manager running on http://localhost:${PORT}`))
