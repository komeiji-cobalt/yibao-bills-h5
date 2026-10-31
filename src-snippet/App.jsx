import { useEffect, useMemo, useState } from 'react'
import {
  CATEGORIES, loadBills, saveBills, makeBill, parsePaste, summarizeByMonth,
  formatMoney, formatSummaryText, sampleBills, todayStr, PASTE_HINT, categorize,
} from './store.js'

function useCopy() {
  const [copied, setCopied] = useState('')
  const copy = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try {
        if (!document.execCommand('copy')) throw new Error('复制失败')
      } finally {
        ta.remove()
      }
    }
    setCopied(key)
    setTimeout(() => setCopied(''), 1600)
  }
  return [copied, copy]
}

const EMPTY = { date: todayStr(), item: '', amount: '', category: '', note: '' }

export default function App() {
  const [tab, setTab] = useState('bills')
  const [bills, setBills] = useState(() => loadBills())
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [paste, setPaste] = useState('')
  const [pasteMsg, setPasteMsg] = useState('')
  const [filterMonth, setFilterMonth] = useState('全部')
  const [filterCat, setFilterCat] = useState('全部')
  const [toast, setToast] = useState('')
  const [copied, copy] = useCopy()

  useEffect(() => { saveBills(bills) }, [bills])

  useEffect(() => {
    if (location.hash === '#demo') {
      setBills(sampleBills())
      setTab('summary')
    }
  }, [])

  useEffect(() => {
    if (!showForm) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') setShowForm(false) }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [showForm])

  const months = useMemo(() => summarizeByMonth(bills), [bills])
  const monthOptions = useMemo(() => {
    const set = new Set(bills.map((b) => String(b.date || '').slice(0, 7)).filter(Boolean))
    return ['全部', ...[...set].sort((a, b) => b.localeCompare(a))]
  }, [bills])

  const filtered = useMemo(() => {
    return [...bills]
      .filter((b) => filterMonth === '全部' || String(b.date).startsWith(filterMonth))
      .filter((b) => filterCat === '全部' || b.category === filterCat)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.createdAt - a.createdAt)
  }, [bills, filterMonth, filterCat])

  const totalAll = useMemo(() => bills.reduce((s, b) => s + (Number(b.amount) || 0), 0), [bills])
  const summaryText = useMemo(() => formatSummaryText(bills, months), [bills, months])

  const flash = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 1800)
  }

  const openAdd = () => {
    setEditingId(null)
    setForm({ ...EMPTY, date: todayStr() })
    setShowForm(true)
  }

  const openEdit = (b) => {
    setEditingId(b.id)
    setForm({
      date: b.date,
      item: b.item,
      amount: String(b.amount),
      category: b.category,
      note: b.note || '',
    })
    setShowForm(true)
  }

  const onItemBlur = () => {
    if (!form.category && form.item.trim()) {
      setForm((f) => ({ ...f, category: categorize(f.item) }))
    }
  }

  const saveForm = (e) => {
    e?.preventDefault?.()
    if (!form.item.trim()) {
      flash('请填写项目名称')
      return
    }
    if (form.amount === '' || !Number.isFinite(Number(form.amount))) {
      flash('请填写有效金额')
      return
    }
    const bill = makeBill({
      date: form.date || todayStr(),
      item: form.item,
      amount: form.amount,
      category: form.category || categorize(form.item),
      note: form.note,
    })
    if (editingId) {
      setBills((prev) => prev.map((b) => (b.id === editingId ? { ...bill, id: editingId, createdAt: b.createdAt } : b)))
      flash('已更新')
    } else {
      setBills((prev) => [bill, ...prev])
      flash('已添加')
    }
    setShowForm(false)
  }

  const removeBill = (id) => {
    setBills((prev) => prev.filter((b) => b.id !== id))
    flash('已删除')
  }

  const applyPaste = () => {
    const { bills: parsed, errors } = parsePaste(paste)
    if (!parsed.length) {
      setPasteMsg(errors.length ? `未能识别 ${errors.length} 行，请按示例格式填写` : '请先粘贴账单文本')
      return
    }
    setBills((prev) => [...parsed, ...prev])
    setPaste('')
    setPasteMsg(`已导入 ${parsed.length} 条${errors.length ? `，跳过 ${errors.length} 行` : ''}`)
    flash(`已导入 ${parsed.length} 条`)
    setTab('bills')
  }

  const loadDemo = () => {
    setBills(sampleBills())
    setTab('summary')
    flash('已载入示例')
  }

  const clearAll = () => {
    if (!confirm('确定清空本机全部账单记录？')) return
    setBills([])
    flash('已清空')
  }

  return (
    <div className="app">
      <header className="hero">
        <div className="brand">
          <div className="logo">账</div>
          <div>
            <h1>医保账单整理</h1>
            <p>本地分类汇总 · 一眼看清花费</p>
          </div>
        </div>
        <nav className="tabs" aria-label="主导航">
          <button type="button" className={tab === 'bills' ? 'on' : ''} onClick={() => setTab('bills')}>账单</button>
          <button type="button" className={tab === 'paste' ? 'on' : ''} onClick={() => setTab('paste')}>粘贴</button>
          <button type="button" className={tab === 'summary' ? 'on' : ''} onClick={() => setTab('summary')}>汇总</button>
        </nav>
      </header>

      <main>
        {tab === 'bills' && (
          <>
            <section className="card summary">
              <div>
                <span>共 <b>{bills.length}</b> 笔</span>
                <span style={{ marginLeft: 12 }}>合计 <b>¥{formatMoney(totalAll)}</b></span>
              </div>
              <button type="button" className="link" onClick={openAdd}>＋ 记一笔</button>
            </section>

            <section className="card filters">
              <label className="lbl">月份</label>
              <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
                {monthOptions.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <label className="lbl" style={{ marginTop: 10 }}>分类</label>
              <div className="chips">
                <button type="button" className={filterCat === '全部' ? 'on' : ''} onClick={() => setFilterCat('全部')}>全部</button>
                {CATEGORIES.map((c) => (
                  <button key={c.id} type="button" className={filterCat === c.id ? 'on' : ''} onClick={() => setFilterCat(c.id)}>{c.label}</button>
                ))}
              </div>
            </section>

            {filtered.length === 0 ? (
              <section className="card empty">
                <p>还没有账单。可点「记一笔」手动录入，或到「粘贴」页批量导入；也可载入示例快速体验。</p>
                <button type="button" className="ghost" onClick={loadDemo}>载入示例</button>
              </section>
            ) : (
              filtered.map((b) => (
                <article key={b.id} className="card item">
                  <div className="item-top">
                    <div>
                      <h3>{b.item}</h3>
                      <p className="meta-line">{b.date} · <span className={`pill cat-${b.category}`}>{b.category}</span></p>
                      {b.note ? <p className="note">{b.note}</p> : null}
                    </div>
                    <div className="amt">¥{formatMoney(b.amount)}</div>
                  </div>
                  <div className="row-actions">
                    <button type="button" onClick={() => openEdit(b)}>编辑</button>
                    <button type="button" className="danger" onClick={() => removeBill(b.id)}>删除</button>
                  </div>
                </article>
              ))
            )}
          </>
        )}

        {tab === 'paste' && (
          <section className="card">
            <p className="scope">把账单明细粘贴到下方，每行一条。系统会按关键词自动归入门诊 / 住院 / 购药 / 检查 / 其他。数据只保存在本机，不上传。</p>
            <label className="lbl">账单文本</label>
            <textarea
              rows={10}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={PASTE_HINT}
            />
            <p className="hint">格式：日期 + 项目 + 金额，可用空格、逗号或制表符分隔；可选第 4 列写分类。</p>
            {pasteMsg ? <p className="count">{pasteMsg}</p> : null}
            <button type="button" className="primary" onClick={applyPaste}>识别并导入</button>
            <button
              type="button"
              className="ghost"
              onClick={() => setPaste(`2026-09-03 专家门诊挂号 28\n2026-09-03 血常规检查 45\n2026-09-03 阿莫西林胶囊 32.5\n2026-10-05 胸部CT检查 280\n2026-10-12 住院床位费 160`)}
            >
              填入示例文本
            </button>
          </section>
        )}

        {tab === 'summary' && (
          <>
            <section className="card">
              <p className="scope">按月份与分类汇总本机账单，可一键复制汇总文本。仅供本地整理参考。</p>
              <div className="actions">
                <button
                  type="button"
                  className="primary sm"
                  onClick={() => { copy('sum', summaryText); flash(copied === 'sum' ? '已复制' : '已复制汇总') }}
                >
                  {copied === 'sum' ? '已复制' : '复制汇总文本'}
                </button>
                <button type="button" className="ghost sm" onClick={loadDemo}>载入示例</button>
              </div>
              {bills.length === 0 ? (
                <p className="hint" style={{ marginTop: 12 }}>暂无数据，请先记一笔或载入示例。</p>
              ) : (
                <pre className="full-text">{summaryText}</pre>
              )}
            </section>

            {months.map((m) => (
              <section key={m.month} className="card">
                <div className="item-top">
                  <h3 style={{ margin: 0 }}>{m.month}</h3>
                  <div className="amt">¥{formatMoney(m.total)}</div>
                </div>
                <p className="meta-line">{m.count} 笔</p>
                <ul className="cat-bars">
                  {CATEGORIES.map((c) => {
                    const v = m.byCat[c.id] || 0
                    if (!v) return null
                    const pct = m.total > 0 ? Math.round((v / m.total) * 100) : 0
                    return (
                      <li key={c.id}>
                        <div className="bar-label">
                          <span className={`pill cat-${c.id}`}>{c.label}</span>
                          <span>¥{formatMoney(v)} · {pct}%</span>
                        </div>
                        <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, background: c.color }} /></div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}

            <section className="card">
              <button type="button" className="ghost danger-border" onClick={clearAll}>清空本机全部记录</button>
            </section>
          </>
        )}

        <p className="foot-note">本地整理参考，不连接医保系统、不构成医疗建议</p>
      </main>

      {showForm && (
        <div className="modal" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false) }}>
          <form className="sheet" onSubmit={saveForm}>
            <h2>{editingId ? '编辑账单' : '记一笔'}</h2>
            <div className="grid">
              <div className="full">
                <label className="lbl">日期</label>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
              </div>
              <div className="full">
                <label className="lbl">项目名称</label>
                <input
                  value={form.item}
                  onChange={(e) => setForm({ ...form, item: e.target.value })}
                  onBlur={onItemBlur}
                  placeholder="如：门诊挂号、血常规、阿莫西林"
                  required
                />
              </div>
              <div>
                <label className="lbl">金额（元）</label>
                <input
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label className="lbl">分类</label>
                <select
                  value={form.category || categorize(form.item)}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div className="full">
                <label className="lbl">备注（可选）</label>
                <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="医院 / 科室等" />
              </div>
            </div>
            <div className="sheet-actions actions" style={{ marginTop: 14 }}>
              <button type="button" className="ghost sm" onClick={() => setShowForm(false)}>取消</button>
              <button type="submit" className="primary sm">保存</button>
            </div>
          </form>
        </div>
      )}

      {toast ? <div className="toast" role="status">{toast}</div> : null}
      <footer>医保账单整理 · 数据仅存本机</footer>
    </div>
  )
}
