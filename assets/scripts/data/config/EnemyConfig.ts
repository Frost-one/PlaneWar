/**
 * 敌机配置表 —— 敌机数值的唯一权威来源
 *
 * 设计约定（详见记忆 planewar.md「配置表定稿」）：
 * - 只放"换一种敌机就会变"的值；所有敌机共享的参数（受击闪白时长、死亡特效 Prefab 等）
 *   留在 Enemy.prefab 的 @property 上，不要写到这里。
 * - 速度一律写 px/s（设计单位）。转物理单位只在写入 RigidBody2D.linearVelocity 时
 *   除以 PHYSICS_2D_PTM_RATIO(32)，全工程只有那一处转换。
 * - "波次 / 出现时机 / 编队"不属于敌机属性，将来放 WaveConfig，不要加到这里。
 * - 【外观 / 尺寸】三种敌机各有【独立 prefab】（Enemy_Normal / Enemy_Elite / Enemy_Boss）。
 *   外观图、Sprite 尺寸、节点缩放、碰撞体，全部在各自 prefab 里调好 —— 配置表只留纯数值。
 *   本表的 prefabIndex 对应 EnemyManager 上 @property([Prefab]) 数组的下标。
 *   为什么不在配置里放"体型缩放"：那会与 prefab 内已调好的尺寸【相乘】，
 *   造成二次放大，且不报错、只会悄悄变大（典型"看着能跑但数值错"）。
 *   ⚠️ 放大同一张小图一定会糊；原型阶段可接受，最终仍需美术提供大图（届时只换图、不动代码）。
 *   例外：玩家侧不适用（弹幕 STG 的玩家判定框须远小于机体），ShipConfig 里需独立配 hitRadius。
 */

/** 敌机移动轨迹 */
export enum EnemyMovePattern {
  /** 直线下坠：普通机 */
  Straight = 'Straight',
  /** 正弦横摆：精英机，更难打中 */
  Sine = 'Sine',
  /** 入场后悬停：配了 `hoverY` 则降下去后停住（BOSS），否则直接穿屏 */
  Hover = 'Hover',
}

/** 单种敌机的配置（只读模板） */
export interface EnemyConfig {
  /** 唯一标识：波次表 / EnemyManager 用它查表 */
  readonly id: string
  /** 显示名（调试与编辑器里辨认用） */
  readonly name: string
  /** 血量模板；运行时 Enemy.hp 表示当前值，由它初始化 */
  readonly maxHp: number
  /** 下坠速度（px/s，设计单位） */
  readonly speed: number
  /** 被击毁时给玩家的分数（由 enemy_die 事件载荷携带，GameManager 不再写死） */
  readonly score: number
  /**
   * 撞到玩家时对玩家造成的伤害。
   *
   * ⚠️ 取代原先全局写死的 `GameConfig.COLLIDE_DAMAGE_PLAYER` ——
   *    撞机伤害应当随敌机强弱变化（BOSS 撞你和杂兵撞你掉一样血，说不通）。
   *    等 Enemy 接线时把伤害放进 `player_hit` 事件载荷，那个全局常量即可删除。
   */
  readonly collideDamage: number
  /** 移动轨迹 */
  readonly movePattern: EnemyMovePattern

  // —— 轨迹参数：按 movePattern 取用，用不到的可以省略（与 LaneLevel 的扁平表风格一致）——
  /**
   * `Sine` 用：横向摆动的【幅度】（px，单侧）。省略 = 0（退化为直线）。
   * 运行时：x = 出生 x + amplitude · sin(2π · frequency · t)
   */
  readonly sineAmplitude?: number
  /** `Sine` 用：每秒完成的完整摆动次数（Hz）。省略 = 0 */
  readonly sineFrequency?: number
  /**
   * `Hover` 用：入场后【悬停】的 y 坐标（px，相对容器）。省略 = 不悬停，直接穿屏。
   *
   * ⚠️ BOSS 的悬停 = "从上方进场 → 降到 hoverY → 停住"，之后的弹幕留到 BOSS 阶段。
   * ⚠️ 需要悬停的敌机（如 BOSS）应由 EnemyManager **显式给 x**（一般取屏幕中心），
   *    不要走"随机 x"那条路。
   */
  readonly hoverY?: number
  /** 击毁后掉落道具的概率（0 ~ 1） */
  readonly dropChance: number
  /** 是否 BOSS：多阶段、血条、清场例外等行为据此判断 */
  readonly isBoss: boolean
  /**
   * 预制体序号：对应 EnemyManager 上 @property([Prefab]) 数组的下标。
   *
   * 3 种敌机 = 3 个独立 prefab（外观 / 尺寸 / 碰撞体都在 prefab 里定），
   * 本字段只负责"这一种敌机用哪个 prefab"。
   * 环境约定：EnemyManager 里该数组的顺序必须与本表的 ENEMY_CONFIGS 顺序一致；
   * 长度不匹配时 Manager 应 console.warn 并回落到第 0 个。
   */
  readonly prefabIndex: number

  // TODO(掉落系统)：将来补 dropTable?: DropEntry[]（按权重抽道具）；现在只需要掉 P 道具
}

/**
 * 数值校准依据：按 TTK（击杀耗时）倒推，而不是"打几发"
 *
 * 原因：三种武器单发伤害不同，"发数"无法统一；TTK 才是玩家真实感受。
 * 锚点 = 玩家打到该敌机时的【预期火力等级】对应的有效 dps（已含散射扇形命中率折损）
 *
 *   普通 : lv1 火力, ~45  dps, 目标 ~0.4s        → maxHp 16
 *   精英 : lv3 火力, ~110 dps, 目标 ~2.5s        → maxHp 260
 *   BOSS : lv5 火力, ~150 dps, 目标 ~40s（多阶段）→ maxHp 6000
 *
 * 好处：以后改武器伤害时，只要"预期火力等级"这个前提不变，
 *       就能按同一公式重算敌机血量，不会出现"改完子弹杂兵变 0.1 秒秒杀"。
 *
 * ⚠️ 以下均为占位数值，需与各机型弹道数值（见 data/ships/）联动复算。
 *
 * ⚠️ `collideDamage`（撞机伤害）不在 TTK 体系里 —— 它要和 `PlayerData.hp` 联动校准，
 *    下面是纯粹占位（PlayerData.hp 目前是 100）。
 */

/** 普通机：直线下坠，用于构成波次的主体 */
export const ENEMY_NORMAL: EnemyConfig = {
  id: 'e_normal',
  name: '普通机',
  maxHp: 16,
  speed: 160,
  score: 10,
  collideDamage: 25,
  movePattern: EnemyMovePattern.Straight,
  dropChance: 0.08,
  isBoss: false,
  prefabIndex: 0,
}

/** 精英机：正弦横摆、血量厚、掉落率高 */
export const ENEMY_ELITE: EnemyConfig = {
  id: 'e_elite',
  name: '精英机',
  maxHp: 260,
  speed: 110,
  score: 50,
  collideDamage: 40,
  movePattern: EnemyMovePattern.Sine,
  sineAmplitude: 120,
  sineFrequency: 0.6,
  dropChance: 0.35,
  isBoss: false,
  prefabIndex: 1,
}

/** BOSS：血厚、多阶段、必掉；悬停与弹幕留到 BOSS 阶段再加 */
export const ENEMY_BOSS: EnemyConfig = {
  id: 'e_boss',
  name: 'BOSS',
  maxHp: 6000,
  speed: 60,
  score: 500,
  collideDamage: 60,
  movePattern: EnemyMovePattern.Hover,
  hoverY: 250,
  dropChance: 1,
  isBoss: true,
  prefabIndex: 2,
}

/** 全部敌机配置（顺序即 prefabIndex 的约定顺序，须与 EnemyManager 的 prefab 数组对齐） */
export const ENEMY_CONFIGS: readonly EnemyConfig[] = [
  ENEMY_NORMAL,
  ENEMY_ELITE,
  ENEMY_BOSS,
]

/**
 * 按 id 查敌机配置。
 * 找不到时返回 null，由调用方决定兜底策略（目前回落到普通机）。
 */
export function getEnemyConfig(id: string): EnemyConfig | null {
  return ENEMY_CONFIGS.find((config) => config.id === id) ?? null
}

/** 默认敌机：EnemyManager 还没接波次表时的兜底 */
export const DEFAULT_ENEMY_ID = ENEMY_NORMAL.id
