// assets/scripts/data/config/PhysicsGroups.ts

/**
 * 物理分组位掩码 —— 必须与编辑器 Project Settings → Physics → 分组顺序一致。
 *
 * 编辑器里 GROUP_1 是第 1 位（值是 1 << 1 = 2，因为第 0 位被 DEFAULT 占了）。
 * ⚠️ 改编辑器分组顺序 = 必须同步改这里，否则碰撞静默失效（不报错）。
 */
export const PHYSICS_GROUP = {
  /** 第 0 位：编辑器默认分组，本项目应该不会使用 */
  DEFAULT: 1 << 0,

  /** GROUP_1 */
  PLAYER: 1 << 1,
  /** GROUP_2 */
  PLAYER_BULLET: 1 << 2,
  /** GROUP_3 */
  ENEMY: 1 << 3,
  /** GROUP_4（预留：敌方子弹） */
  ENEMY_BULLET: 1 << 4,
} as const

/** 位值 → 可读名，仅供调试日志用 */
export function getGroupName(group: number): string {
  for (const key of Object.keys(PHYSICS_GROUP) as (keyof typeof PHYSICS_GROUP)[]) {
    if (PHYSICS_GROUP[key] === group) return key
  }
  return `未知(${group})`
}