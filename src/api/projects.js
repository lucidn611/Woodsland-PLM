const express = require('express')
const router = express.Router()
const db = require('../db')
const path = require('path')
const fs = require('fs')
const XLSX = require('xlsx')

router.get('/', async (req, res) => {
  try {
    const { status } = req.query
    const where = status ? `WHERE p.status = '${status.replace(/'/g,"''")}'` : ''
    const rows = await db.all_p(`
      SELECT p.*,
        (SELECT COUNT(*) FROM feedback f WHERE f.project_id = p.id) AS feedback_count,
        (SELECT COUNT(*) FROM versions v WHERE v.project_id = p.id) AS version_count
      FROM projects p ${where} ORDER BY p.created_at DESC
    `)
    res.json(rows)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/:id', async (req, res) => {
  try {
    const p = await db.get_p('SELECT * FROM projects WHERE id = ?', [req.params.id])
    if (!p) return res.status(404).json({ error: 'Không tìm thấy' })
    res.json(p)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.post('/', async (req, res) => {
  try {
    const { title, department, participants, meeting_date, problem, demo_link, created_by, module_type, status, priority, deadline, expected_users, expected_outcome, contact } = req.body
    if (!title) return res.status(400).json({ error: 'Thiếu tên dự án' })
    const r = await db.run_p(
      `INSERT INTO projects (title, department, participants, meeting_date, problem, demo_link, created_by, module_type, status, priority, deadline, expected_users, expected_outcome, contact)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, department || '', JSON.stringify(participants || []), meeting_date || '', problem || '', demo_link || '', created_by || '', module_type || '', status || 'pending', priority || '', deadline || '', expected_users || '', expected_outcome || '', contact || '']
    )
    res.json({ id: r.lastID })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.put('/:id', async (req, res) => {
  try {
    const { title, department, participants, meeting_date, problem, demo_link, status, module_type, priority, deadline, expected_users, expected_outcome, contact } = req.body
    await db.run_p(
      `UPDATE projects SET title=?, department=?, participants=?, meeting_date=?, problem=?, demo_link=?, status=?, module_type=?, priority=?, deadline=?, expected_users=?, expected_outcome=?, contact=? WHERE id=?`,
      [title, department || '', JSON.stringify(participants || []), meeting_date || '', problem || '', demo_link || '', status, module_type || '', priority || '', deadline || '', expected_users || '', expected_outcome || '', contact || '', req.params.id]
    )
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id
    // Xóa cascade toàn bộ data liên quan
    const classIds = (await db.all_p('SELECT id FROM cm_classes WHERE project_id=?', [id])).map(r => r.id)
    if (classIds.length) {
      const ph = classIds.map(() => '?').join(',')
      await db.run_p(`DELETE FROM cm_attendance WHERE class_id IN (${ph})`, classIds)
      await db.run_p(`DELETE FROM cm_scores WHERE class_id IN (${ph})`, classIds)
      await db.run_p(`DELETE FROM cm_students WHERE class_id IN (${ph})`, classIds)
      await db.run_p(`DELETE FROM cm_classes WHERE project_id=?`, [id])
    }
    const versionIds = (await db.all_p('SELECT id FROM versions WHERE project_id=?', [id])).map(r => r.id)
    if (versionIds.length) {
      const ph = versionIds.map(() => '?').join(',')
      await db.run_p(`DELETE FROM acceptances WHERE version_id IN (${ph})`, versionIds)
    }
    const feedbackIds = (await db.all_p('SELECT id FROM feedback WHERE project_id=?', [id])).map(r => r.id)
    if (feedbackIds.length) {
      const ph = feedbackIds.map(() => '?').join(',')
      await db.run_p(`DELETE FROM votes WHERE feedback_id IN (${ph})`, feedbackIds)
    }
    await db.run_p('DELETE FROM feedback WHERE project_id=?', [id])
    await db.run_p('DELETE FROM versions WHERE project_id=?', [id])
    await db.run_p('DELETE FROM training WHERE project_id=?', [id])
    await db.run_p('DELETE FROM task_logs WHERE project_id=?', [id])
    await db.run_p('DELETE FROM project_attachments WHERE project_id=?', [id])
    await db.run_p('DELETE FROM projects WHERE id=?', [id])
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

router.get('/:id/prompt-package', async (req, res) => {
  try {
    const p = await db.get_p('SELECT * FROM projects WHERE id=?', [req.params.id])
    if (!p) return res.status(404).json({ error: 'Không tìm thấy' })
    const feedbacks = await db.all_p(
      `SELECT f.*, (SELECT COUNT(*) FROM votes v WHERE v.feedback_id=f.id AND v.vote_type='up') AS votes_up
       FROM feedback f WHERE f.project_id=? AND f.status='approved' ORDER BY f.priority DESC, votes_up DESC`,
      [req.params.id]
    )
    const versions = await db.all_p('SELECT * FROM versions WHERE project_id=? ORDER BY created_at DESC LIMIT 1', [req.params.id])
    const latestVersion = versions[0]

    // Đọc tất cả file Excel đính kèm
    const attachments = await db.all_p('SELECT * FROM project_attachments WHERE project_id=? ORDER BY created_at ASC', [req.params.id])
    let excelContent = ''
    for (const att of attachments.filter(a => a.filename.match(/\.(xlsx|xls)$/i))) {
      try {
        const filePath = path.join(__dirname, '../../data/attachments', String(p.id), att.filename)
        if (fs.existsSync(filePath)) {
          excelContent += `\n### File: ${att.original_name}\n`
          const wb = XLSX.readFile(filePath)
          wb.SheetNames.forEach(sheetName => {
            const ws = wb.Sheets[sheetName]
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
            const nonEmpty = rows.filter(r => r.some(c => String(c).trim()))
            if (nonEmpty.length === 0) return
            excelContent += `#### Sheet: ${sheetName}\n`
            nonEmpty.slice(0, 60).forEach(row => {
              const line = row.map(c => String(c).trim()).filter(c => c).join(' | ')
              if (line) excelContent += `${line}\n`
            })
            if (nonEmpty.length > 60) excelContent += `_(còn ${nonEmpty.length - 60} dòng nữa...)_\n`
          })
        }
      } catch (e) { excelContent += `_(Lỗi đọc file ${att.original_name}: ${e.message})_\n` }
    }

    let prompt = `# Prompt Package - ${p.title}\n`
    prompt += `Ngày tạo: ${new Date().toLocaleString('vi-VN')}\n\n`
    prompt += `## ⚠️ YÊU CẦU BẮT BUỘC KHI VIẾT CODE\n`
    prompt += `- Toàn bộ text hiển thị trong app PHẢI viết tiếng Việt đầy đủ dấu\n`
    prompt += `- KHÔNG được viết không dấu (sai: "Quan ly tai san", đúng: "Quản lý tài sản")\n`
    prompt += `- File HTML phải có thẻ \`<meta charset="UTF-8">\` ở đầu\n\n`
    prompt += `## 1. Thông tin dự án\n`
    prompt += `- **Tên dự án:** ${p.title}\n`
    prompt += `- **Phòng ban:** ${p.department || 'N/A'}\n`
    prompt += `- **Vấn đề cần giải quyết:** ${p.problem || 'N/A'}\n`
    if (p.expected_outcome) prompt += `- **Mục tiêu:** ${p.expected_outcome}\n`
    if (p.expected_users) prompt += `- **Người dùng dự kiến:** ${p.expected_users}\n`
    if (p.demo_link) prompt += `- **Link demo hiện tại:** ${p.demo_link}\n`
    if (attachments.length) prompt += `- **File đính kèm:** ${attachments.map(a => a.original_name).join(', ')}\n`
    if (excelContent) {
      prompt += `\n## 2. Nội dung file Excel đính kèm\n`
      prompt += `_Đây là cấu trúc/dữ liệu từ file Excel phòng ban cung cấp. Hãy dựa vào đây để xây dựng app đúng với thực tế._\n`
      prompt += excelContent
    }
    if (latestVersion) {
      prompt += `- **Phiên bản mới nhất:** ${latestVersion.version}\n`
      if (latestVersion.changelog) prompt += `- **Changelog:** ${latestVersion.changelog}\n`
    }
    const sectionOffset = excelContent ? 1 : 0
    prompt += `\n## ${2 + sectionOffset}. Các yêu cầu cần phát triển (đã được phê duyệt)\n`
    if (feedbacks.length === 0) {
      prompt += `_(Chưa có yêu cầu nào được phê duyệt)_\n`
    } else {
      feedbacks.forEach((f, i) => {
        prompt += `\n### Yêu cầu ${i + 1}: ${f.author}\n`
        prompt += `${f.content}\n`
        prompt += `_(👍 ${f.votes_up} lượt ủng hộ)_\n`
      })
    }
    // Module-specific context
    if (p.module_type === 'class_manager') {
      const classes = await db.all_p(
        `SELECT c.name, (SELECT COUNT(*) FROM cm_students s WHERE s.class_id=c.id) AS student_count FROM cm_classes c WHERE c.project_id=?`,
        [req.params.id]
      )
      prompt += `\n## 3. Cấu trúc dữ liệu hiện có (Module: Quản lý lớp học)\n`
      prompt += `App chạy tại: \`C:\\Quan_ly_vong_doi\\DX-LIFECYCLE\` — Node.js + Express + SQLite (không dùng build)\n\n`
      prompt += `### Các file cần quan tâm:\n`
      prompt += `- \`src/db.js\` — SQLite schema, tables: \`cm_classes\`, \`cm_students\`\n`
      prompt += `- \`src/api/cm-classes.js\` — REST API: GET/POST/PUT/DELETE /api/cm-classes\n`
      prompt += `- \`src/api/cm-students.js\` — REST API: GET/POST/PUT/DELETE /api/cm-students\n`
      prompt += `- \`public/index.html\` — Vue 3 CDN frontend, tab module ở dòng ~404\n`
      prompt += `- \`index.js\` — Express server port 2020\n\n`
      prompt += `### Schema database:\n`
      prompt += `\`\`\`sql\n`
      prompt += `cm_classes: id, project_id, name, description, teacher, schedule, start_date, end_date, max_students, status, created_at\n`
      prompt += `cm_students: id, class_id, full_name, phone, email, dob, address, note, status, joined_at\n`
      prompt += `\`\`\`\n`
      if (classes.length > 0) {
        prompt += `\n### Dữ liệu hiện có: ${classes.length} lớp\n`
        classes.forEach(c => { prompt += `- "${c.name}": ${c.student_count} học viên\n` })
      }
      prompt += `\n### Nguyên tắc khi sửa:\n`
      prompt += `- KHÔNG tạo app mới, chỉ sửa trong thư mục DX-LIFECYCLE\n`
      prompt += `- KHÔNG dùng build tool — frontend là Vue 3 CDN thuần trong public/index.html\n`
      prompt += `- Nếu thêm bảng DB mới: dùng \`ALTER TABLE\` hoặc \`CREATE TABLE IF NOT EXISTS\` trong db.js\n`
      prompt += `- Nếu thêm API mới: tạo file trong src/api/ rồi đăng ký trong index.js\n`
      prompt += `- Nếu thêm UI mới: thêm vào tab module trong public/index.html\n`
      prompt += `- Sau khi sửa xong: liệt kê các file đã thay đổi\n`
    }

    prompt += `\n## QUAN TRỌNG — Quy tắc kỹ thuật:\n`
    prompt += `- KHÔNG tạo Express server riêng hay chạy trên port mới\n`
    prompt += `- Toàn bộ app phải nằm trong một file duy nhất: \`C:\\Quan_ly_vong_doi\\DX-LIFECYCLE\\public\\apps\\${p.id}\\index.html\`\n`
    prompt += `- Dùng HTML/CSS/JS thuần hoặc Vue 3 CDN, gọi API qua \`/api/...\` (cùng port 2020)\n`
    prompt += `- App truy cập tại: \`http://localhost:2020/apps/${p.id}/\`\n`
    prompt += `\n## QUAN TRỌNG — Yêu cầu UI/UX bắt buộc:\n`
    prompt += `### Font & màu sắc:\n`
    prompt += `- Import font: \`<link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap" rel="stylesheet">\`\n`
    prompt += `- Áp dụng: \`font-family: 'Be Vietnam Pro', sans-serif\`\n`
    prompt += `- Màu chủ đạo: \`#2563eb\` (xanh dương), nền trang: \`#f1f5f9\`, card: \`#ffffff\`, viền: \`#e2e8f0\`\n`
    prompt += `- Text chính: \`#1e293b\`, text phụ: \`#64748b\`\n`
    prompt += `\n### Thư viện CDN được dùng:\n`
    prompt += `- Chart.js (nếu cần biểu đồ): \`<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>\`\n`
    prompt += `- Vue 3 (nếu cần reactive): \`<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>\`\n`
    prompt += `- Font Awesome (icon): \`<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">\`\n`
    prompt += `\n### Chuẩn giao diện:\n`
    prompt += `- **Header cố định** trên cùng: tên app + các số liệu tổng quan (tổng, đang dùng, v.v.)\n`
    prompt += `- **Bảng dữ liệu**: header nền \`#f8fafc\`, dòng chẵn lẻ xen kẽ màu, hover highlight, cột số căn phải\n`
    prompt += `- **Form**: label trên input, border focus màu chủ đạo, thông báo lỗi màu đỏ ngay dưới field\n`
    prompt += `- **Nút bấm**: có hover effect (opacity hoặc darken), nút submit có loading state (disable + spinner)\n`
    prompt += `- **Badge trạng thái**: mỗi trạng thái một màu riêng (xanh/vàng/đỏ/xám)\n`
    prompt += `- **Toast thông báo**: dùng div nổi góc phải thay vì \`alert()\` của browser\n`
    prompt += `- **Số tiền**: format \`1.000.000 ₫\` (toLocaleString('vi-VN') + ' ₫')\n`
    prompt += `- **Ngày tháng**: hiển thị dd/mm/yyyy\n`
    prompt += `- **Responsive**: hoạt động tốt trên màn hình từ 768px trở lên\n`
    prompt += `- **Trạng thái rỗng**: khi chưa có dữ liệu hiện icon + text hướng dẫn, không để trống\n`

    res.json({ prompt, project: p.title, feedback_count: feedbacks.length })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router
