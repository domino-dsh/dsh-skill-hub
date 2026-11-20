/**
 * Learning view — 技能学习资料：汉化说明 + 使用示例 + 跨技能综合示例。
 *
 * 独立于目录/开关/角色的「学习」视角。数据存 SQLite（见 store/learning.ts），
 * 这里只做展示与手动录入/编辑。技能名清单复用父级传入的 catalog（与全局
 * 视图一致），点选后按需拉取该技能的学习记录。
 *
 * 状态自包含（不侵入 useSkillHub 的目录/分组 flow），只依赖 api + 技能名清单。
 */
import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import type { CatalogSkill } from '../../protocol.ts'
import type { SkillHubApi } from '../api.ts'
import { errorMessage, tt } from '../helpers.ts'
import type {
  SkillCombo,
  SkillExample,
} from '../../protocol.ts'
import css from './panel.module.css'

interface ExampleDraft {
  title: string
  prompt: string
  expect: string
}

interface ComboDraft {
  title: string
  skillNames: string[]
  summaryZh: string
  prompt: string
}

const emptyExample = (): ExampleDraft => ({ title: '', prompt: '', expect: '' })
const emptyCombo = (): ComboDraft => ({ title: '', skillNames: [], summaryZh: '', prompt: '' })

export function LearningView(props: { api: SkillHubApi; skills: CatalogSkill[] }): JSX.Element {
  const { api, skills } = props
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [examples, setExamples] = useState<SkillExample[]>([])
  const [combos, setCombos] = useState<SkillCombo[]>([])
  const [summaryDraft, setSummaryDraft] = useState('')
  const [exampleDraft, setExampleDraft] = useState<ExampleDraft>(emptyExample())
  const [comboDraft, setComboDraft] = useState<ComboDraft>(emptyCombo())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const filteredSkills = useMemo(() => {
    const q = query.trim().toLocaleLowerCase()
    return q === '' ? skills : skills.filter((s) => s.name.toLocaleLowerCase().includes(q) || s.description.toLocaleLowerCase().includes(q))
  }, [skills, query])

  /** 拉取某技能的学习记录 + 示例。 */
  const loadSkill = useCallback(async (name: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const data = await api.learningSkill(name)
      setExamples(data.examples)
      setSummaryDraft(data.record?.summaryZh ?? '')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }, [api])

  /** 拉取综合示例列表。 */
  const loadCombos = useCallback(async (): Promise<void> => {
    try {
      const data = await api.learningCombos()
      setCombos(data.combos)
    } catch (e) {
      setError(errorMessage(e))
    }
  }, [api])

  useEffect(() => {
    void loadCombos()
  }, [loadCombos])

  /** 点选技能时加载。 */
  const pick = useCallback((name: string): void => {
    setSelected(name)
    setExampleDraft(emptyExample())
    void loadSkill(name)
  }, [loadSkill])

  /** 保存汉化说明。 */
  const saveSummary = useCallback(async (): Promise<void> => {
    if (selected === null) return
    setBusy(true)
    setError(null)
    try {
      await api.saveLearning(selected, summaryDraft)
      setSaved(true)
      window.setTimeout(() => { setSaved(false) }, 1500)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }, [api, selected, summaryDraft])

  /** 新增一条示例。 */
  const addExample = useCallback(async (): Promise<void> => {
    if (selected === null) return
    if (exampleDraft.title.trim() === '' && exampleDraft.prompt.trim() === '') return
    setBusy(true)
    setError(null)
    try {
      const res = await api.addExample({ skillName: selected, ...exampleDraft })
      if (res.example !== undefined) setExamples((prev) => [...prev, res.example!])
      setExampleDraft(emptyExample())
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }, [api, selected, exampleDraft])

  /** 删除一条示例。 */
  const removeExample = useCallback(async (id: number): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await api.deleteExample(id)
      setExamples((prev) => prev.filter((e) => e.id !== id))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }, [api])

  /** 新建综合示例。 */
  const addCombo = useCallback(async (): Promise<void> => {
    if (comboDraft.title.trim() === '') return
    setBusy(true)
    setError(null)
    try {
      const res = await api.addCombo({ ...comboDraft, skillNames: comboDraft.skillNames.filter((n) => n.trim() !== '') })
      if (res.combo !== undefined) setCombos((prev) => [...prev, res.combo!])
      setComboDraft(emptyCombo())
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }, [api, comboDraft])

  /** 删除综合示例。 */
  const removeCombo = useCallback(async (id: number): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await api.deleteCombo(id)
      setCombos((prev) => prev.filter((c) => c.id !== id))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }, [api])

  const toggleComboSkill = useCallback((name: string): void => {
    setComboDraft((prev) => {
      const next = prev.skillNames.includes(name)
        ? prev.skillNames.filter((n) => n !== name)
        : [...prev.skillNames, name]
      return { ...prev, skillNames: next }
    })
  }, [])

  return (
    <div className={css.panel}>
      <div className={css.filterBar}>
        <input className={css.search} value={query} onChange={(event) => { setQuery(event.target.value) }} placeholder={tt('panel.search')} />
      </div>

      {error !== null ? <div className={css.errorBanner} role='alert'><span>{error}</span></div> : null}
      {saved ? <div className={css.successBanner} role='status'><span>{tt('learning.saved')}</span></div> : null}

      <div className={css.learnWrap}>
        {/* 左：技能列表 */}
        <div className={css.learnSkillList}>
          {filteredSkills.length === 0 ? <div className={css.empty}>{tt('learning.noSkills')}</div> : null}
          {filteredSkills.map((skill) => (
            <button
              key={skill.name}
              type='button'
              className={css.learnSkill + (selected === skill.name ? ' ' + css.learnSkillActive : '')}
              onClick={() => { pick(skill.name) }}
            >{skill.name}</button>
          ))}
        </div>

        {/* 右：详情 */}
        <div className={css.learnDetail}>
          {selected === null ? (
            <div className={css.empty}>{tt('learning.pickHint')}</div>
          ) : (
            <>
              <div className={css.sectionTitle}>{selected}</div>

              {/* 汉化说明 */}
              <div className={css.section}>
                <div className={css.formLabel}>{tt('learning.summary')}</div>
                <textarea
                  className={css.input + ' ' + css.learnSummary}
                  value={summaryDraft}
                  onChange={(event) => { setSummaryDraft(event.target.value) }}
                  placeholder={tt('learning.summaryPlaceholder')}
                />
                <button type='button' className={css.button + ' ' + css.primary} disabled={busy} onClick={() => { void saveSummary() }}>{tt('learning.save')}</button>
              </div>

              {/* 使用示例 */}
              <div className={css.section}>
                <div className={css.sectionTitle}>{tt('learning.examples')}</div>
                {examples.length === 0 ? <div className={css.empty}>{tt('learning.noExamples')}</div> : null}
                {examples.map((ex) => (
                  <div key={ex.id} className={css.learnExample}>
                    <div className={css.learnExampleTitle}>{ex.title !== '' ? ex.title : tt('learning.untitled')}</div>
                    {ex.prompt !== '' ? <div className={css.learnExampleLine}><span className={css.formLabel}>{tt('learning.prompt')}</span>{ex.prompt}</div> : null}
                    {ex.expect !== '' ? <div className={css.learnExampleLine}><span className={css.formLabel}>{tt('learning.expect')}</span>{ex.expect}</div> : null}
                    <button type='button' className={css.opBtn} disabled={busy} onClick={() => { void removeExample(ex.id) }}>{tt('learning.delete')}</button>
                  </div>
                ))}
                <div className={css.learnExampleDraft}>
                  <input className={css.input} value={exampleDraft.title} onChange={(e) => { setExampleDraft((p) => ({ ...p, title: e.target.value })) }} placeholder={tt('learning.exampleTitlePlaceholder')} />
                  <textarea className={css.input} value={exampleDraft.prompt} onChange={(e) => { setExampleDraft((p) => ({ ...p, prompt: e.target.value })) }} placeholder={tt('learning.promptPlaceholder')} rows={2} />
                  <textarea className={css.input} value={exampleDraft.expect} onChange={(e) => { setExampleDraft((p) => ({ ...p, expect: e.target.value })) }} placeholder={tt('learning.expectPlaceholder')} rows={2} />
                  <button type='button' className={css.button} disabled={busy} onClick={() => { void addExample() }}>{tt('learning.addExample')}</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 综合使用示例 */}
      <div className={css.section}>
        <div className={css.sectionTitle}>{tt('learning.combos')}</div>
        {combos.length === 0 ? <div className={css.empty}>{tt('learning.noCombos')}</div> : null}
        {combos.map((combo) => (
          <div key={combo.id} className={css.learnExample}>
            <div className={css.learnExampleTitle}>{combo.title}</div>
            {combo.skillNames.length > 0 ? <div className={css.learnExampleLine}><span className={css.formLabel}>{tt('learning.comboSkills')}</span>{combo.skillNames.join(' → ')}</div> : null}
            {combo.summaryZh !== '' ? <div className={css.learnExampleLine}><span className={css.formLabel}>{tt('learning.summary')}</span>{combo.summaryZh}</div> : null}
            {combo.prompt !== '' ? <div className={css.learnExampleLine}><span className={css.formLabel}>{tt('learning.prompt')}</span>{combo.prompt}</div> : null}
            <button type='button' className={css.opBtn} disabled={busy} onClick={() => { void removeCombo(combo.id) }}>{tt('learning.delete')}</button>
          </div>
        ))}
        <div className={css.learnExampleDraft}>
          <input className={css.input} value={comboDraft.title} onChange={(e) => { setComboDraft((p) => ({ ...p, title: e.target.value })) }} placeholder={tt('learning.comboTitlePlaceholder')} />
          <div className={css.learnComboSkills}>
            {skills.map((skill) => (
              <label key={skill.name} className={css.learnComboSkill}><input type='checkbox' checked={comboDraft.skillNames.includes(skill.name)} onChange={() => { toggleComboSkill(skill.name) }} />{skill.name}</label>
            ))}
          </div>
          <textarea className={css.input} value={comboDraft.summaryZh} onChange={(e) => { setComboDraft((p) => ({ ...p, summaryZh: e.target.value })) }} placeholder={tt('learning.summaryPlaceholder')} rows={2} />
          <textarea className={css.input} value={comboDraft.prompt} onChange={(e) => { setComboDraft((p) => ({ ...p, prompt: e.target.value })) }} placeholder={tt('learning.promptPlaceholder')} rows={2} />
          <button type='button' className={css.button} disabled={busy} onClick={() => { void addCombo() }}>{tt('learning.addCombo')}</button>
        </div>
      </div>
    </div>
  )
}
