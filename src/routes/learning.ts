/**
 * 学习域路由：技能汉化说明 + 使用示例 + 跨技能综合示例。
 *
 * 数据走独立 SQLite（见 store/learning.ts）。与 sidecar 路由共享同一套
 * 请求围栏（信任栅栏 → 方法 → 总开关 → JSON 体 → 写头），纯学习资料，
 * 不碰技能源文件、不进 system-prompt。
 *
 * 路径全部挂在 /api/skill-hub/learning/* 下。删除沿用本族的「POST + 标记」
 * 惯例（RouteSpec 只收 GET/POST）：在 body 里传 `delete: true` 表示删除。
 */
import {
  SKILL_HUB_API,
  type LearningWriteResponse,
} from '../protocol.ts'
import {
  readStrings,
  readString,
  writeError,
  writeJson,
  writeRouteError,
  type RouteSpec,
  type SkillHubRouteDeps,
} from './helpers.ts'
import { createLearningStore, type LearningStore } from '../store/learning.ts'
import { homeOf } from './deps.ts'

/** 学习库的惰性获取：优先用 deps 注入的实例，否则按 home 打开默认库。 */
export function resolveLearningStore(deps: SkillHubRouteDeps): LearningStore {
  return deps.learning ?? createLearningStore(homeOf(deps))
}

function readNumber(body: Record<string, unknown>, key: string): number | undefined {
  const value = body[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readId(body: Record<string, unknown>, url: URL): number {
  const idRaw = url.searchParams.get('id') ?? readString(body, 'id')
  const id = Number(idRaw)
  return Number.isInteger(id) && id > 0 ? id : 0
}

/** 学习域全部路由 spec。 */
export function learningRoutes(deps: SkillHubRouteDeps): RouteSpec[] {
  const learning = (): LearningStore => resolveLearningStore(deps)

  return [
    // ------------------------------------------------------ 健康检查
    {
      path: SKILL_HUB_API.learningHealth,
      methods: ['GET'],
      handler: async ({ res }) => {
        writeJson(res, 200, { ok: true })
      },
    },

    // --------------------------------------------------- 取一个技能
    {
      path: SKILL_HUB_API.learningSkill,
      methods: ['GET'],
      handler: async ({ res, url }) => {
        const name = url.searchParams.get('name') ?? ''
        if (name === '') { writeError(res, 400, 'skill name is required'); return }
        const store = learning()
        writeJson(res, 200, {
          record: store.getSkill(name),
          examples: store.listExamples(name),
        })
      },
    },

    // ------------------------------------------------- 存汉化说明
    {
      path: SKILL_HUB_API.learningSkill,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, url, body }) => {
        const name = url.searchParams.get('name') ?? readString(body, 'skillName')
        const summaryZh = readString(body, 'summaryZh')
        if (name === '') { writeError(res, 400, 'skill name is required'); return }
        try {
          const record = learning().saveSkill(name, summaryZh)
          writeJson(res, 200, { ok: true, record } satisfies LearningWriteResponse)
        } catch (error) {
          writeRouteError(res, error)
        }
      },
    },

    // ------------------------------------------------- 加一条示例
    {
      path: SKILL_HUB_API.learningExamples,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, body }) => {
        const skillName = readString(body, 'skillName')
        if (skillName === '') { writeError(res, 400, 'skillName is required'); return }
        try {
          const example = learning().addExample({
            skillName,
            title: readString(body, 'title'),
            prompt: readString(body, 'prompt'),
            expect: readString(body, 'expect'),
            sort: readNumber(body, 'sort') ?? 0,
          })
          writeJson(res, 200, { ok: true, example } satisfies LearningWriteResponse)
        } catch (error) {
          writeRouteError(res, error)
        }
      },
    },

    // ------------------------------------------------- 改/删一条示例
    {
      path: SKILL_HUB_API.learningExample,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, url, body }) => {
        const id = readId(body, url)
        if (id === 0) { writeError(res, 400, 'example id is required'); return }
        try {
          if (body.delete === true) {
            learning().deleteExample(id)
            writeJson(res, 200, { ok: true })
          } else {
            const example = learning().updateExample({
              id,
              title: readString(body, 'title'),
              prompt: readString(body, 'prompt'),
              expect: readString(body, 'expect'),
              sort: readNumber(body, 'sort'),
            })
            writeJson(res, 200, { ok: true, example } satisfies LearningWriteResponse)
          }
        } catch (error) {
          writeRouteError(res, error)
        }
      },
    },

    // ------------------------------------------------- 综合示例列表/新建
    {
      path: SKILL_HUB_API.learningCombos,
      methods: ['GET', 'POST'],
      jsonBody: true,
      handler: async ({ req, res, body }) => {
        try {
          if (req.method === 'GET') {
            writeJson(res, 200, { combos: learning().listCombos() })
          } else {
            const combo = learning().addCombo({
              title: readString(body, 'title'),
              skillNames: readStrings(body, 'skillNames'),
              summaryZh: readString(body, 'summaryZh'),
              prompt: readString(body, 'prompt'),
            })
            writeJson(res, 200, { ok: true, combo } satisfies LearningWriteResponse)
          }
        } catch (error) {
          writeRouteError(res, error)
        }
      },
    },

    // ------------------------------------------------- 改/删一条综合示例
    {
      path: SKILL_HUB_API.learningCombo,
      methods: ['POST'],
      jsonBody: true,
      handler: async ({ res, url, body }) => {
        const id = readId(body, url)
        if (id === 0) { writeError(res, 400, 'combo id is required'); return }
        try {
          if (body.delete === true) {
            learning().deleteCombo(id)
            writeJson(res, 200, { ok: true })
          } else {
            const combo = learning().updateCombo({
              id,
              title: readString(body, 'title'),
              skillNames: readStrings(body, 'skillNames'),
              summaryZh: readString(body, 'summaryZh'),
              prompt: readString(body, 'prompt'),
            })
            writeJson(res, 200, { ok: true, combo } satisfies LearningWriteResponse)
          }
        } catch (error) {
          writeRouteError(res, error)
        }
      },
    },
  ]
}
