import type { Node } from 'cc'
import type { GameState, GameResult } from '../data/GameState'
import type { IPlayerData } from '../data/PlayerData'
import type { PickupId, PickupType } from '../data/pickups/PickupConfig'

/**
 * 事件载荷类型（集中声明，与 GameEventMap 配套）。
 * 这些类型只在「事件系统」这一层使用，不污染各业务模块。
 */

/** 敌机死亡载荷：击杀点 / 分数 / 掉落概率，由 Enemy.takeDamage 归零时一次性发出 */
export interface EnemyDiePayload {
  enemyNode: Node
  score: number
  dropChance: number
}

/** 敌机被命中载荷：命中点优先传碰撞坐标，缺失时由接收方回退敌机中心 */
export interface EnemyHitPayload {
  enemyNode: Node
  hitPoint?: { x: number; y: number }
}

/** 玩家受击载荷：敌机撞击（enemyNode 存在）或敌弹命中（enemyNode 不存在） */
export interface PlayerHitPayload {
  playerNode: Node
  enemyNode?: Node
  damage: number
}

/**
 * state_change 事件载荷：状态迁移三元组 + 结算结果。
 * - oldState：迁移前的状态
 * - newState：迁移后的状态
 * - result：结算结果（仅 newState === GameState.OVER 时有意义，其余为 NONE）
 *
 * 订阅方按需解构，例如：
 * - 只关心"现在是什么状态"：`({ newState }: StateChangePayload) => ...`
 * - 需要区分"从哪来"：`({ oldState, newState }: StateChangePayload) => ...`
 */
export interface StateChangePayload {
  oldState: GameState
  newState: GameState
  result: GameResult
}

/**
 * 拾取事件载荷：必有 id + type，其余按类型带对应字面量（加法扩展，不破坏旧签名）。
 * Player.onPickup 按 data.type 取 levels / heal / shield；data.id 标记是哪一件道具。
 */
export interface PickupPayload {
  id: PickupId
  type: PickupType
  levels?: number
  heal?: number
  shield?: number
}

/**
 * 全局事件映射表：事件名 → 载荷类型。
 *
 * 这是「类型化事件总线」的核心：EventBus 的 on/emit/off 都以它为泛型约束，于是——
 *   ① 事件名拼错 → 编译期拦截；
 *   ② emit 的载荷形状不对 → 编译期拦截；
 *   ③ 订阅回调自动拿到精确类型，不再需要 `as` 断言。
 *
 * 调用处的事件名字符串（如 'enemy_die'）本身就是联合成员，无需替换成常量；
 * 新增事件只需在此加一行，并在对应 emit/on 处补上即可。
 *
 * ⚠️ 资源就绪类事件（*_assets_ready）载荷为 undefined：emit 时不传第二参数，
 *   on 的回调可写成 `() => void`（不收参数）。
 */
export interface GameEventMap {
  state_change: StateChangePayload
  player_data_change: Readonly<IPlayerData>
  player_hit: PlayerHitPayload
  enemy_hit: EnemyHitPayload
  enemy_die: EnemyDiePayload
  pickup_collected: PickupPayload
  ship_assets_ready: undefined
  enemy_assets_ready: undefined
  pickup_assets_ready: undefined
  vfx_assets_ready: undefined
}
