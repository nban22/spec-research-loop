#!/usr/bin/env node
/**
 * prompt-guard — enforcer cho rule "Prompt audit & prompt log" (deliverable #5).
 *
 *   node .claude/hooks/prompt-guard.mjs capture              # Claude Code: UserPromptSubmit
 *   node .claude/hooks/prompt-guard.mjs audit                # Claude Code: PostToolUse (Write|Edit)
 *   node .claude/hooks/prompt-guard.mjs stop [--host=NAME]   # Claude Code / Antigravity: Stop
 *
 * --host=claude       (mặc định) lỗi -> stderr + exit 2 (agent đọc được, phải sửa)
 * --host=antigravity  lỗi -> stdout {"decision":"continue","reason":...}, luôn exit 0
 *
 * Không phụ thuộc package ngoài. Chạy được cả Git Bash lẫn PowerShell.
 */

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------- constants

const REQUIRED_PROMPTS = [
  'generator',
  'judge_gap',
  'judge_contribution',
  'judge_experiment',
  'judge_evidence',
  'judge_readiness',
]
const JUDGE_IDS = REQUIRED_PROMPTS.filter((id) => id.startsWith('judge_'))
const FRONTMATTER_KEYS = ['id', 'version', 'model', 'inputs', 'output', 'updated']
const SCOPE_DIRS = ['backend', 'frontend', 'prompts', 'docs', '.claude', '.agents']
const SNAPSHOT_IGNORE = new Set(['node_modules', '.next', 'dist', 'build', 'coverage', '.git', '.state', '.turbo'])
const SRC_DIRS = ['backend/src', 'frontend/src']
const SRC_EXT = new Set(['.ts', '.tsx'])
const HARDCODED_PROMPT = /you are an?\b|hãy đóng vai|system prompt/i
const DEV_LOG_DIR = 'prompts/dev-log'
const STATE_FILE = '.claude/.state/turn.json'

// ---------------------------------------------------------------- utilities

const mode = process.argv[2] ?? 'stop'
const host = (process.argv.find((a) => a.startsWith('--host=')) ?? '--host=claude').slice(7)

async function readStdin() {
  if (process.stdin.isTTY) return {}
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return {}
  }
}

function resolveRoot(input) {
  const fromEnv = process.env.CLAUDE_PROJECT_DIR
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv
  const fromAntigravity = Array.isArray(input.workspacePaths) ? input.workspacePaths[0] : null
  if (fromAntigravity && fs.existsSync(fromAntigravity)) return fromAntigravity
  return process.cwd()
}

const pad = (n) => String(n).padStart(2, '0')
const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const isoStamp = (d = new Date()) => `${isoDate(d)}T${pad(d.getHours())}${pad(d.getMinutes())}`

function read(root, rel) {
  try {
    return fs.readFileSync(path.join(root, rel), 'utf8')
  } catch {
    return null
  }
}

function walk(root, rel, out = []) {
  let entries
  try {
    entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const child = `${rel}/${e.name}`
    if (e.isDirectory()) walk(root, child, out)
    else if (SRC_EXT.has(path.extname(e.name))) out.push(child)
  }
  return out
}

// ------------------------------------------------------------------ audit A

/** Tách block frontmatter mở đầu file. */
function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!m) return null
  const fields = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line)
    if (kv) fields[kv[1]] = kv[2].trim()
  }
  return { fields, body: text.slice(m[0].length) }
}

/** Audit một file prompt. `mustBeToday` chỉ bật cho file vừa bị sửa trong turn này. */
function auditPromptFile(root, id, { mustBeToday = false } = {}) {
  const rel = `prompts/${id}.md`
  const text = read(root, rel)
  const errors = []
  const warnings = []
  if (text === null) return { errors, warnings, missing: true }

  const fm = parseFrontmatter(text)
  if (!fm) {
    errors.push(`${rel}: thiếu block frontmatter \`---\` ở đầu file.`)
    return { errors, warnings, missing: false }
  }

  for (const key of FRONTMATTER_KEYS) {
    if (!fm.fields[key]) errors.push(`${rel}: frontmatter thiếu \`${key}\`.`)
  }
  if (fm.fields.id && fm.fields.id !== id) {
    errors.push(`${rel}: frontmatter \`id: ${fm.fields.id}\` không khớp tên file (\`${id}\`).`)
  }
  if (fm.fields.updated) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.fields.updated)) {
      errors.push(`${rel}: \`updated: ${fm.fields.updated}\` sai định dạng YYYY-MM-DD.`)
    } else if (mustBeToday && fm.fields.updated !== isoDate()) {
      errors.push(`${rel}: vừa sửa file nhưng \`updated: ${fm.fields.updated}\` ≠ hôm nay (${isoDate()}).`)
    }
  }

  // #2 — generator phải yêu cầu structured JSON output.
  if (id === 'generator' && !/\bjson\b/i.test(fm.body)) {
    errors.push(`${rel}: không thấy yêu cầu structured JSON output (checklist #2).`)
  }

  // #4 — judge_evidence phải đối chiếu citation với nguồn thật.
  if (id === 'judge_evidence') {
    if (!/semantic\s*scholar|arxiv/i.test(fm.body)) {
      errors.push(`${rel}: phải nêu rõ nguồn đối chiếu (Semantic Scholar / arXiv API) — checklist #4.`)
    }
    if (!/\bdoi\b|\burl\b/i.test(fm.body)) {
      errors.push(`${rel}: phải kiểm tra \`Source.doi\` / \`Source.url\` — checklist #4.`)
    }
  }

  // #3 — mỗi judge prompt tự đứng độc lập (heuristic: không nhắc id judge khác).
  if (JUDGE_IDS.includes(id)) {
    for (const other of JUDGE_IDS) {
      if (other !== id && fm.body.includes(other)) {
        warnings.push(`${rel}: nhắc tới \`${other}\` — kiểm tra lại checklist #3 (prompt phải tự đứng độc lập).`)
      }
    }
  }

  return { errors, warnings, missing: false }
}

/** #1 — đủ 6 file. Chỉ bật khi đã bắt đầu viết prompt, để không chặn repo trống. */
function auditCompleteness(root) {
  const present = REQUIRED_PROMPTS.filter((id) => read(root, `prompts/${id}.md`) !== null)
  if (present.length === 0) return { errors: [], warnings: [], started: false }
  const missing = REQUIRED_PROMPTS.filter((id) => !present.includes(id))
  return {
    started: true,
    warnings: [],
    errors: missing.length ? [`prompts/: thiếu ${missing.length}/6 file bắt buộc — ${missing.map((id) => `${id}.md`).join(', ')}.`] : [],
  }
}

/** #5 — không còn prompt hardcode trong source. */
function auditHardcodedPrompts(root) {
  const hits = []
  for (const dir of SRC_DIRS) {
    for (const rel of walk(root, dir)) {
      const text = read(root, rel)
      if (text === null) continue
      text.split(/\r?\n/).forEach((line, i) => {
        if (HARDCODED_PROMPT.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`)
      })
    }
  }
  return hits.length
    ? { errors: [`Prompt hardcode trong source (checklist #5) — tách ra file \`prompts/\` rồi đọc file:\n    ${hits.join('\n    ')}`], warnings: [] }
    : { errors: [], warnings: [] }
}

// ------------------------------------------------------------------ audit B

function devLogEntries(root) {
  try {
    return fs
      .readdirSync(path.join(root, DEV_LOG_DIR))
      .filter((f) => /^\d{3}__.*\.md$/.test(f))
      .sort()
  } catch {
    return []
  }
}

function nextDevLogNumber(entries) {
  const max = entries.reduce((acc, f) => Math.max(acc, Number(f.slice(0, 3))), 0)
  return String(max + 1).padStart(3, '0')
}

function auditDevLogNumbering(entries) {
  const nums = entries.map((f) => Number(f.slice(0, 3)))
  const warnings = []
  const dupes = nums.filter((n, i) => nums.indexOf(n) !== i)
  if (dupes.length) warnings.push(`${DEV_LOG_DIR}/: số thứ tự trùng — ${[...new Set(dupes)].map((n) => String(n).padStart(3, '0')).join(', ')}.`)
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] !== nums[i - 1] + 1) {
      warnings.push(`${DEV_LOG_DIR}/: số thứ tự đứt quãng giữa ${String(nums[i - 1]).padStart(3, '0')} và ${String(nums[i]).padStart(3, '0')}.`)
      break
    }
  }
  return warnings
}

/**
 * Vân tay của cây file trong scope: path + mtime + size.
 * Không dùng `git status --porcelain` — output của nó không đổi khi sửa nội dung một file
 * vốn đã dirty hoặc untracked, tức là bỏ lọt đúng trường hợp phổ biến nhất trong một turn.
 */
function scopeSnapshot(root) {
  const parts = []
  const visit = (rel, depth) => {
    if (depth > 12 || parts.length > 20000) return
    let entries
    try {
      entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (SNAPSHOT_IGNORE.has(e.name)) continue
      const child = `${rel}/${e.name}`
      if (e.isDirectory()) visit(child, depth + 1)
      else {
        try {
          const st = fs.statSync(path.join(root, child))
          parts.push(`${child}:${Math.round(st.mtimeMs)}:${st.size}`)
        } catch {
          /* ignore */
        }
      }
    }
  }
  for (const dir of SCOPE_DIRS) visit(dir, 0)
  parts.sort()
  return createHash('sha1').update(parts.join('\n')).digest('hex')
}

// ----------------------------------------------------------------- reporting

function emit(errors, warnings, { stopHookActive = false } = {}) {
  if (!errors.length && !warnings.length) process.exit(0)

  const lines = []
  if (errors.length) lines.push('PROMPT AUDIT — FAIL (sửa ngay trong turn này, không để nợ):', ...errors.map((e) => `  ✗ ${e}`))
  if (warnings.length) lines.push('PROMPT AUDIT — cảnh báo:', ...warnings.map((w) => `  ! ${w}`))
  lines.push('Rule: .claude/rules/prompt-audit.md')
  const report = lines.join('\n')

  if (host === 'antigravity') {
    process.stdout.write(JSON.stringify(errors.length ? { decision: 'continue', reason: report } : {}))
    process.exit(0)
  }

  // Claude Code: exit 2 -> stderr được đưa lại cho agent. stopHookActive để tránh vòng lặp Stop.
  if (errors.length && !stopHookActive) {
    process.stderr.write(report + '\n')
    process.exit(2)
  }
  process.stdout.write(JSON.stringify({ systemMessage: report }))
  process.exit(0)
}

// ---------------------------------------------------------------------- main

const input = await readStdin()
const root = resolveRoot(input)

if (mode === 'capture') {
  // Chụp lại prompt nguyên văn + trạng thái git đầu turn, để Stop hook đối chiếu.
  const statePath = path.join(root, STATE_FILE)
  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  fs.writeFileSync(
    statePath,
    JSON.stringify(
      {
        startedAt: new Date().toISOString(),
        stamp: isoStamp(),
        prompt: input.prompt ?? '',
        snapshot: scopeSnapshot(root),
        devLog: devLogEntries(root),
        blocked: false,
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

if (mode === 'audit') {
  // PostToolUse: chỉ soi file prompt vừa bị ghi -> phản hồi hẹp, nhanh, không chặn oan.
  // Khớp theo đuôi đường dẫn: hook nhận path tuyệt đối kiểu Windows lẫn POSIX.
  const file = String(input.tool_input?.file_path ?? input.tool_response?.filePath ?? '').replace(/\\/g, '/')
  const m = /(?:^|\/)prompts\/([a-z0-9_]+)\.md$/i.exec(file)
  if (!m) process.exit(0)
  const { errors, warnings } = auditPromptFile(root, m[1], { mustBeToday: true })
  emit(errors, warnings)
}

// mode === 'stop' — audit toàn bộ + guard dev-log.
const errors = []
const warnings = []

const completeness = auditCompleteness(root)
errors.push(...completeness.errors)

if (completeness.started) {
  for (const id of REQUIRED_PROMPTS) {
    const r = auditPromptFile(root, id)
    if (!r.missing) {
      errors.push(...r.errors)
      warnings.push(...r.warnings)
    }
  }
}

const hardcoded = auditHardcodedPrompts(root)
errors.push(...hardcoded.errors)

// --- phần B: dev-log
let state = null
try {
  state = JSON.parse(read(root, STATE_FILE) ?? 'null')
} catch {
  state = null
}

const entries = devLogEntries(root)
warnings.push(...auditDevLogNumbering(entries))

const snapshot = scopeSnapshot(root)
const filesTouched = state ? snapshot !== state.snapshot : entries.length === 0 ? false : null
const devLogAdded = state ? entries.length > (state.devLog?.length ?? 0) : false

if (filesTouched === true && !devLogAdded) {
  const stamp = state?.stamp ?? isoStamp()
  errors.push(
    [
      `${DEV_LOG_DIR}/: turn này có thay đổi file trong ${SCOPE_DIRS.join('/, ')}/ nhưng chưa ghi dev-log.`,
      `    Tạo \`${DEV_LOG_DIR}/${nextDevLogNumber(entries)}__${stamp}__<slug-ngan>.md\` với frontmatter (stt, timestamp, model, scope),`,
      `    mục \`## Prompt\` chép NGUYÊN VĂN prompt của người dùng, mục \`## Kết quả\` 1–3 dòng.`,
      state?.prompt ? `    Prompt nguyên văn đã được lưu sẵn ở \`${STATE_FILE}\` (field \`prompt\`).` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  )
}

// Đánh dấu đã chặn một lần, để lần Stop kế tiếp không lặp vô hạn.
const stopHookActive = input.stop_hook_active === true || state?.blocked === true
if (state && errors.length && !state.blocked) {
  try {
    fs.writeFileSync(path.join(root, STATE_FILE), JSON.stringify({ ...state, blocked: true }, null, 2))
  } catch {
    /* ignore */
  }
}

emit(errors, warnings, { stopHookActive })
