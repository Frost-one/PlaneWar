// data/stages/StageTypes.ts
// 关卡（Stage）= 一关；每关由若干【波次 Wave】组成，每波自带"如何进入下一波"的触发条件。
// 纯数据类型，运行时不依赖任何逻辑，策划改数值/顺序无需碰代码。

import type { EnemyId } from '../enemies/EnemyConfig'

/** 波次推进方式 */
export type WaveAdvance = 'time' | 'clear' | 'timeOrClear'

/** 波内单条刷怪指令 */
export interface SpawnEvent {
  /** 敌机种类：用 EnemyId 字面量联合，写错 id 编译期即拦截 */
  type: EnemyId
  /** 本波开始后的偏移秒；默认 0（与波起点同刻） */
  t?: number
  /** 连刷数量；默认 1 */
  count?: number
  /** 连刷间隔秒；默认 0（同刻一起出） */
  gap?: number
  /** 固定横向位置；不写则由 EnemyManager 按 cfg 决定（Boss 居中、其余随机） */
  x?: number
}

/** 一波敌机 */
export interface WaveData {
  /** 进下一波的条件 */
  advance: WaveAdvance
  /**
   * 触发延迟（秒），语义随 advance 而不同：
   * - 'time'       ：本波开始后等这么久即进下一波（无视清场）
   * - 'clear'      ：本波敌机全灭后等这么久再进下一波（无视时间）
   * - 'timeOrClear'：两者取先到（杀快了立即出，杀慢了到点也出）
   */
  advanceDelay: number
  /** 本波要刷的敌机列表 */
  spawns: SpawnEvent[]
}

/** 一关 */
export interface StageData {
  id: string
  waves: WaveData[]
}
