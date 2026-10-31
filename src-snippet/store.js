const STORAGE_KEY = 'yibao-bills-v1'

export const CATEGORIES = [
  { id: '门诊', label: '门诊', color: '#2563eb' },
  { id: '住院', label: '住院', color: '#7c3aed' },
  { id: '购药', label: '购药', color: '#0d9488' },
  { id: '检查', label: '检查', color: '#d97706' },
  { id: '其他', label: '其他', color: '#64748b' },
]

const RULES = [
  { id: '住院', words: ['住院', '病房', '床位', '出院', '入院', '住院费', '护理费'] },
  { id: '购药', words: ['药', '药店', '药房', '处方', '胶囊', '片剂', '颗粒', '配药', '西药', '中成药', '阿莫西林', '布洛芬', '感冒灵'] },
  { id: '检查', words: ['检查', '化验', '检验', 'CT', 'MRI', 'B超', '彩超', 'X光', '抽血', '影像', '核磁', '超声', '血常规', '心电图'] },
  { id: '门诊', words: ['门诊', '挂号', '复诊', '问诊', '诊所', '诊查', '专家号'] },
]

export function categorize(itemText, explicit) {
  if (explicit && CATEGORIES.some((c) => c.id === explicit)) return explicit
  const t = String(itemText || '')
  for (const rule of RULES) {
    if (rule.words.some((w) => t.toUpperCase().includes(w.toUpperCase()))) return rule.id
  }
  return '其他'
}

export function todayStr() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function uid() {
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function makeBill({ date, item, amount, category, note = '' }) {
  const amt = Number(amount)
  return {
    id: uid(),
    date: date || todayStr(),
    item: String(item || '').trim(),
    amount: Number.isFinite(amt) ? Math.round(amt * 100) / 100 : 0,
    category: categorize(item, category),
    note: String(note || '').trim(),
    createdAt: Date.now(),
  }
}

export function loadBills() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveBills(bills) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bills))
  } catch {
    /* ignore quota */
  }
}

/** Parse pasted text into bill drafts. Supports:
 *  2026-03-12 阿莫西林胶囊 32.5
 *  2026-03-12,门诊挂号,15
 *  2026/03/12\t血常规\t45
 *  03-12 挂号费 15 （year defaults to current）
 */
export function parsePaste(text) {
  const year = new Date().getFullYear()
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const out = []
  const errors = []
  for (const line of lines) {
    if (/^(日期|date|项目|金额)/i.test(line)) continue
    let m = line.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?\s*[,，\t ]+\s*(.+?)\s*[,，\t ]+\s*(-?\d+(?:\.\d+)?)\s*(?:元)?(?:\s*[,，\t ]+\s*(.+))?$/)
    if (!m) {
      m = line.match(/^(\d{1,2})[-/.](\d{1,2})\s*[,，\t ]+\s*(.+?)\s*[,，\t ]+\s*(-?\d+(?:\.\d+)?)\s*(?:元)?(?:\s*[,，\t ]+\s*(.+))?$/)
      if (m) {
        const [, mo, day, item, amount, catOrNote] = m
        const date = `${year}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const maybeCat = CATEGORIES.find((c) => c.id === (catOrNote || '').trim())
        out.push(makeBill({
          date,
          item,
          amount,
          category: maybeCat?.id,
          note: maybeCat ? '' : (catOrNote || ''),
        }))
        continue
      }
      errors.push(line)
      continue
    }
    const [, y, mo, day, item, amount, catOrNote] = m
    const date = `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const maybeCat = CATEGORIES.find((c) => c.id === (catOrNote || '').trim())
    out.push(makeBill({
      date,
      item,
      amount,
      category: maybeCat?.id,
      note: maybeCat ? '' : (catOrNote || ''),
    }))
  }
  return { bills: out, errors }
}

export function monthKey(dateStr) {
  return String(dateStr || '').slice(0, 7)
}

export function summarizeByMonth(bills) {
  const map = {}
  for (const b of bills) {
    const mk = monthKey(b.date) || '未知月份'
    if (!map[mk]) {
      map[mk] = { month: mk, total: 0, byCat: Object.fromEntries(CATEGORIES.map((c) => [c.id, 0])), count: 0 }
    }
    map[mk].total += b.amount
    map[mk].byCat[b.category] = (map[mk].byCat[b.category] || 0) + b.amount
    map[mk].count += 1
  }
  return Object.values(map).sort((a, b) => b.month.localeCompare(a.month))
}

export function formatMoney(n) {
  const v = Number(n) || 0
  return v.toFixed(2)
}

export function formatSummaryText(bills, months) {
  const lines = ['【医保账单整理 · 本地汇总】', `共 ${bills.length} 条记录`, '']
  for (const m of months) {
    lines.push(`▸ ${m.month}　合计 ¥${formatMoney(m.total)}（${m.count} 笔）`)
    for (const c of CATEGORIES) {
      const v = m.byCat[c.id] || 0
      if (v > 0) lines.push(`  · ${c.label} ¥${formatMoney(v)}`)
    }
    lines.push('')
  }
  lines.push('说明：本地整理参考，不连接医保系统、不构成医疗建议。')
  return lines.join('\n')
}

export function sampleBills() {
  return [
    makeBill({ date: '2026-09-03', item: '专家门诊挂号', amount: 28, category: '门诊' }),
    makeBill({ date: '2026-09-03', item: '血常规检查', amount: 45, category: '检查' }),
    makeBill({ date: '2026-09-03', item: '阿莫西林胶囊', amount: 32.5, category: '购药' }),
    makeBill({ date: '2026-09-18', item: '社区门诊复诊', amount: 12, category: '门诊' }),
    makeBill({ date: '2026-09-18', item: '布洛芬缓释胶囊', amount: 18.6, category: '购药' }),
    makeBill({ date: '2026-10-05', item: '胸部CT检查', amount: 280, category: '检查' }),
    makeBill({ date: '2026-10-12', item: '住院床位费（示例）', amount: 160, category: '住院' }),
    makeBill({ date: '2026-10-12', item: '住院护理费（示例）', amount: 90, category: '住院' }),
    makeBill({ date: '2026-10-20', item: '药店配药·感冒灵', amount: 24.8, category: '购药' }),
    makeBill({ date: '2026-10-28', item: '心电图检查', amount: 35, category: '检查' }),
  ]
}

export const PASTE_HINT = `每行一条，例如：
2026-09-03 专家门诊挂号 28
2026-09-03,血常规检查,45
2026-10-05 胸部CT 280 检查`
