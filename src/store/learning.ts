/**
 * 学习域存储 —— 独立的 SQLite 数据库。
 *
 * 与 sidecar（`dsh-skill-hub.json`）平行：sidecar 记录「开关/分组/来源」等
 * 中枢运行时状态，学习库记录「汉化说明/使用示例/综合示例」这类学习资料。
 * 两者互不读写彼此的文件，没有并发序或原子写的耦合。
 *
 * 选 SQLite 而非 JSON 的理由：学习资料是「按技能名随机读写 + 多条示例」的
 * 关系型数据，且量会涨；SQLite 的索引查询、事务、幂等 upsert 都比手写
 * JSON 更省事、更稳。单用户本机场景用 better-sqlite3（同步、零配置）。
 *
 * 本期只写入工数据（`generatedBy='manual'`）。AI 生成 / 反馈给 AI 是预留
 * 扩展位：schema 已留 `generated_by` 列，将来接 `ctx.llm` 时无需迁移。
 */
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import type {
  SkillCombo,
  SkillExample,
  SkillLearnRecord,
} from '../protocol.ts'
import { StoreError } from './errors.ts'

/** 学习库文件（相对 DSH home）。 */
export function learningDbPath(home: string): string {
  return join(home, 'dsh-skill-hub-learning.db')
}

interface LearnRow {
  skill_name: string
  summary_zh: string
  generated_by: string
  created_at: number
  updated_at: number
}

interface ExampleRow {
  id: number
  skill_name: string
  title: string
  prompt: string
  expect: string
  sort: number
  created_at: number
}

interface ComboRow {
  id: number
  title: string
  skill_names: string
  summary_zh: string
  prompt: string
  created_at: number
}

/** 学习库的领域方法面。 */
export interface LearningStore {
  getSkill(name: string): SkillLearnRecord | null
  saveSkill(name: string, summaryZh: string): SkillLearnRecord
  listExamples(name: string): SkillExample[]
  addExample(input: { skillName: string; title: string; prompt: string; expect: string; sort?: number }): SkillExample
  updateExample(input: { id: number; title: string; prompt: string; expect: string; sort?: number }): SkillExample
  deleteExample(id: number): void
  listCombos(): SkillCombo[]
  addCombo(input: { title: string; skillNames: string[]; summaryZh: string; prompt: string }): SkillCombo
  updateCombo(input: { id: number; title: string; skillNames: string[]; summaryZh: string; prompt: string }): SkillCombo
  deleteCombo(id: number): void
  close(): void
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS skill_learn (
  skill_name   TEXT PRIMARY KEY,
  summary_zh   TEXT NOT NULL DEFAULT '',
  generated_by TEXT NOT NULL DEFAULT 'manual',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS skill_example (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_name TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  prompt     TEXT NOT NULL DEFAULT '',
  expect     TEXT NOT NULL DEFAULT '',
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_example_skill ON skill_example(skill_name, sort, id);
CREATE TABLE IF NOT EXISTS skill_combo (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL DEFAULT '',
  skill_names TEXT NOT NULL DEFAULT '[]',
  summary_zh  TEXT NOT NULL DEFAULT '',
  prompt      TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);
`

function mapLearn(r: LearnRow): SkillLearnRecord {
  return {
    skillName: r.skill_name,
    summaryZh: r.summary_zh,
    generatedBy: r.generated_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function mapExample(r: ExampleRow): SkillExample {
  return {
    id: r.id,
    skillName: r.skill_name,
    title: r.title,
    prompt: r.prompt,
    expect: r.expect,
    sort: r.sort,
    createdAt: r.created_at,
  }
}

function mapCombo(r: ComboRow): SkillCombo {
  let names: string[] = []
  try {
    const parsed = JSON.parse(r.skill_names)
    if (Array.isArray(parsed)) names = parsed.filter((n): n is string => typeof n === 'string')
  } catch { /* 坏数据按空处理 */ }
  return {
    id: r.id,
    title: r.title,
    skillNames: names,
    summaryZh: r.summary_zh,
    prompt: r.prompt,
    createdAt: r.created_at,
  }
}

/** 打开（不存在则创建）学习库。 */
export function createLearningStore(home: string): LearningStore {
  mkdirSync(home, { recursive: true })
  const db = new Database(learningDbPath(home))
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)

  const stmt = {
    getLearn: db.prepare('SELECT * FROM skill_learn WHERE skill_name = ?'),
    upsertLearn: db.prepare(`
      INSERT INTO skill_learn (skill_name, summary_zh, generated_by, created_at, updated_at)
      VALUES (@skillName, @summaryZh, 'manual', @now, @now)
      ON CONFLICT(skill_name) DO UPDATE SET summary_zh = excluded.summary_zh, updated_at = excluded.updated_at
    `),
    listExamples: db.prepare('SELECT * FROM skill_example WHERE skill_name = ? ORDER BY sort, id'),
    insertExample: db.prepare(`
      INSERT INTO skill_example (skill_name, title, prompt, expect, sort, created_at)
      VALUES (@skillName, @title, @prompt, @expect, @sort, @now)
    `),
    getExample: db.prepare('SELECT * FROM skill_example WHERE id = ?'),
    updateExample: db.prepare('UPDATE skill_example SET title = @title, prompt = @prompt, expect = @expect, sort = @sort WHERE id = @id'),
    deleteExample: db.prepare('DELETE FROM skill_example WHERE id = ?'),
    listCombos: db.prepare('SELECT * FROM skill_combo ORDER BY id'),
    insertCombo: db.prepare(`
      INSERT INTO skill_combo (title, skill_names, summary_zh, prompt, created_at)
      VALUES (@title, @skillNames, @summaryZh, @prompt, @now)
    `),
    getCombo: db.prepare('SELECT * FROM skill_combo WHERE id = ?'),
    updateCombo: db.prepare('UPDATE skill_combo SET title = @title, skill_names = @skillNames, summary_zh = @summaryZh, prompt = @prompt WHERE id = @id'),
    deleteCombo: db.prepare('DELETE FROM skill_combo WHERE id = ?'),
  }

  return {
    getSkill(name: string): SkillLearnRecord | null {
      const row = stmt.getLearn.get(name) as LearnRow | undefined
      return row === undefined ? null : mapLearn(row)
    },

    saveSkill(name: string, summaryZh: string): SkillLearnRecord {
      const now = Date.now()
      stmt.upsertLearn.run({ skillName: name, summaryZh, now })
      return mapLearn(stmt.getLearn.get(name) as LearnRow)
    },

    listExamples(name: string): SkillExample[] {
      return (stmt.listExamples.all(name) as ExampleRow[]).map(mapExample)
    },

    addExample(input): SkillExample {
      const now = Date.now()
      const info = stmt.insertExample.run({
        skillName: input.skillName,
        title: input.title,
        prompt: input.prompt,
        expect: input.expect,
        sort: input.sort ?? 0,
        now,
      })
      return mapExample(stmt.getExample.get(info.lastInsertRowid) as ExampleRow)
    },

    updateExample(input): SkillExample {
      const existing = stmt.getExample.get(input.id) as ExampleRow | undefined
      if (existing === undefined) throw new StoreError('not-found', 'example not found: ' + input.id)
      stmt.updateExample.run({
        id: input.id,
        title: input.title,
        prompt: input.prompt,
        expect: input.expect,
        sort: input.sort ?? existing.sort,
      })
      return mapExample(stmt.getExample.get(input.id) as ExampleRow)
    },

    deleteExample(id: number): void {
      stmt.deleteExample.run(id)
    },

    listCombos(): SkillCombo[] {
      return (stmt.listCombos.all() as ComboRow[]).map(mapCombo)
    },

    addCombo(input): SkillCombo {
      const now = Date.now()
      const info = stmt.insertCombo.run({
        title: input.title,
        skillNames: JSON.stringify(input.skillNames),
        summaryZh: input.summaryZh,
        prompt: input.prompt,
        now,
      })
      return mapCombo(stmt.getCombo.get(info.lastInsertRowid) as ComboRow)
    },

    updateCombo(input): SkillCombo {
      const existing = stmt.getCombo.get(input.id) as ComboRow | undefined
      if (existing === undefined) throw new StoreError('not-found', 'combo not found: ' + input.id)
      stmt.updateCombo.run({
        id: input.id,
        title: input.title,
        skillNames: JSON.stringify(input.skillNames),
        summaryZh: input.summaryZh,
        prompt: input.prompt,
      })
      return mapCombo(stmt.getCombo.get(input.id) as ComboRow)
    },

    deleteCombo(id: number): void {
      stmt.deleteCombo.run(id)
    },

    close(): void {
      db.close()
    },
  }
}

export type { SkillCombo, SkillExample, SkillLearnRecord }
