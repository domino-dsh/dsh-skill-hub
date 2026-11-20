/**
 * 学习域协议：技能的中文说明、使用示例、跨技能综合示例。
 *
 * 数据存独立 SQLite（`~/.dsh/dsh-skill-hub-learning.db`），与 sidecar 的
 * JSON state 平行、互不干扰。纯学习/沉淀用途，不碰技能源文件、不进
 * system-prompt —— AI 生成与「反馈给 AI」是预留扩展位，本期不实现。
 */

/** 一个技能的学习主记录（汉化说明等）。 */
export interface SkillLearnRecord {
  /** 技能名（主键，与目录里的技能名一致）。 */
  skillName: string
  /** 汉化/学习说明（面向人的中文说明，Markdown 或纯文本）。 */
  summaryZh: string
  /** 预留：由哪一个来源生成/录入（'manual' | 'ai' 等），本期恒为 'manual'。 */
  generatedBy: string
  /** 毫秒时间戳。 */
  createdAt: number
  /** 毫秒时间戳。 */
  updatedAt: number
}

/** 一条使用示例。 */
export interface SkillExample {
  id: number
  skillName: string
  /** 示例标题（短句）。 */
  title: string
  /** 用户会怎么说 / 提示词用法。 */
  prompt: string
  /** 会得到什么 / 预期效果。 */
  expect: string
  /** 排序权重（越小越靠前）。 */
  sort: number
  createdAt: number
}

/** 跨技能的综合使用示例（技能联动）。 */
export interface SkillCombo {
  id: number
  /** 综合示例标题。 */
  title: string
  /** 关联的技能名（JSON 字符串数组）。 */
  skillNames: string[]
  /** 综合说明。 */
  summaryZh: string
  /** 综合提示词用法。 */
  prompt: string
  createdAt: number
}

/** GET /learning/:name —— 一个技能的完整学习视图。 */
export interface LearningSkillResponse {
  record: SkillLearnRecord | null
  examples: SkillExample[]
}

export interface LearningExamplesResponse {
  examples: SkillExample[]
}

export interface LearningComboResponse {
  combos: SkillCombo[]
}

/** PUT /learning/:name —— 保存汉化说明。 */
export interface LearningSaveRequest {
  summaryZh: string
}

/** POST/PUT /learning/examples —— 新建或修改一条示例。 */
export interface LearningExampleRequest {
  id?: number
  skillName: string
  title: string
  prompt: string
  expect: string
  sort?: number
}

/** POST/PUT /learning/combos —— 新建或修改一条综合示例。 */
export interface LearningComboRequest {
  id?: number
  title: string
  skillNames: string[]
  summaryZh: string
  prompt: string
}

/** 通用写结果（沿用现有路由的 ok 惯例）。 */
export interface LearningWriteResponse {
  ok: boolean
  record?: SkillLearnRecord
  example?: SkillExample
  combo?: SkillCombo
  examples?: SkillExample[]
  combos?: SkillCombo[]
}

/** DELETE 结果。 */
export interface LearningDeleteResponse {
  ok: boolean
}
