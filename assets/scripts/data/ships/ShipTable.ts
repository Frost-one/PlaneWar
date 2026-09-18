import type { ShipConfig } from './ShipConfig'
import { SHIP_RED } from './ShipRed'
import { SHIP_GREEN } from './ShipGreen'
import { SHIP_BLUE } from './ShipBlue'

/**
 * 机型全表 + 查询入口。
 *
 * 【为什么它必须独立成文件，不能合并回 ShipConfig.ts】
 *   它要 value-import 三个机型文件；而那三个文件又要 import type ShipConfig。
 *   合并就等于让契约层反向依赖数据层 —— 虽然 import type 编译后消失、跑得起来，
 *   但只要有人把 `import { ShipConfig }` 写成值引用，立刻成循环依赖。
 *   拆开后 **ShipConfig.ts 是零运行时代码的纯类型文件，循环在结构上不可能发生。**
 */

/** 全部机型（顺序即 spriteIndex 的约定顺序） */
export const SHIP_TABLE: readonly ShipConfig[] = [SHIP_RED, SHIP_GREEN, SHIP_BLUE]

/** 默认机型：还没选过时的兜底 */
export const DEFAULT_SHIP_ID = SHIP_RED.id

/** 全部机型 id（存档校验 / Debug 面板用） */
export const SHIP_IDS: readonly string[] = SHIP_TABLE.map((c) => c.id)

/** 按 id 查机型，查不到返回 null（调用方自行决定兜底） */
export function getShip(id: string): ShipConfig | null {
  return SHIP_TABLE.find((c) => c.id === id) ?? null
}

/** 兜底版：查不到时回落默认机型。UI 用这个，省得到处写 `?? SHIP_TABLE[0]` */
export function getShipOr(id: string): ShipConfig {
  return getShip(id) ?? SHIP_RED
}

/**
 * 循环取"第 offset 架"（选机界面左右箭头用）。
 * 把取模逻辑收在这里，是因为 JS 的 % 对负数返回负值（-1 % 3 === -1，不是 2），
 * 必须 `((x % n) + n) % n` 才对 —— 这种坑不该让 UI 层记。
 */
export function cycleShip(currentId: string, offset: number): ShipConfig {
  const total = SHIP_TABLE.length
  const current = SHIP_TABLE.findIndex((c) => c.id === currentId)
  const base = current < 0 ? 0 : current
  return SHIP_TABLE[(((base + offset) % total) + total) % total]
}

/**
 * ⚠️ 这里【没有】取装配的函数，也没有火力等级的钳制 —— 都是刻意的：
 *    - 装配直接读 `cfg.emitters`（多一层包装没有带来任何信息）
 *    - 等级是发射器每次开火时读的一个数，越界由各发射器自己 clamp
 *      （见 Emitter.ts 的 fireLevel 注释）。在这层钳制反而会掩盖"等级配错了"。
 */
