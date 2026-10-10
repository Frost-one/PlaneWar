// data/stages/Stage1.ts
// 第一关：4 波，Boss 在关底，清场即通关。
import { StageData } from './StageTypes'

export const Stage_1: StageData = {
  id: 'stage_1',
  waves: [
    // 第 1 波：开场 1 秒后出，靠时间推进（t 为波内偏移）
    {
      advance: 'time',
      advanceDelay: 1.0,
      spawns: [
        { type: 'e_normal', count: 4, gap: 0.3 },
      ]
    },
    // 第 2 波：清场或满 2 秒，哪个先到算哪个（雷霆式混血，奖励操作）
    {
      advance: 'timeOrClear',
      advanceDelay: 2.0,
      spawns: [
        { type: 'e_normal', count: 3, gap: 0.8 },
        { type: 'e_normal', count: 3, gap: 0.8 },
        { type: 'e_elite', t: 1.2 },
      ]
    },
    // 第 3 波：必须上一波全灭才来（明日方舟式 checkpoint）
    {
      advance: 'clear',
      advanceDelay: 1.0,
      spawns: [
        { type: 'e_elite' },
        { type: 'e_normal', count: 3, gap: 0.4 },
        { type: 'e_elite', t: 1 },
        { type: 'e_elite', t: 2 },
      ]
    },
    // 关底 Boss 波：同样清场门控，清完即通关
    {
      advance: 'clear',
      advanceDelay: 0.5,
      spawns: [
        { type: 'e_boss' },
        { type: 'e_normal', t: 2, count: 3, gap: 1 },
        { type: 'e_normal', t: 3, count: 3, gap: 1 },
      ]
    },
  ],
}
