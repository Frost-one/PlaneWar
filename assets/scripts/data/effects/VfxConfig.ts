import type { Node, Prefab } from 'cc'

/**
 * 特效层 1：契约 / 配置定义（与 ship/enemy 的 *Config.ts 同款——只定义类型，
 * 不含运行时行为；运行时的"怎么加载、怎么播"在层2/层3）。
 */

/**
 * 特效 id 字面量联合（= 哪一类特效）。
 *
 * 与 ship/enemy 的 ShipId / EnemyId 同款：用字符串字面量联合而非枚举，
 * 运行时仍是裸字符串（零开销、与外部数据天然兼容），但写错（如 'explsion'）tsc 直接拦截。
 * 新增特效：在此加一个值 + 在 VfxRegistry 登记。
 */
export type VfxId = 'hit' | 'explosion' 
// | 'playerHit' | 'upgrade' | 'entry'

/**
 * 一个正在播放的特效的可控句柄。
 * manager 拿到句柄后用于暂停 / 恢复 / 强制停止（清空），但不负责回收节点——
 * 回收统一由 manager 在 done 回调或 cancel 后处理。
 */
export interface VfxHandle {
  pause(): void
  resume(): void
  /** 仅停止内部计时 / 动画，不回收节点（回收归 manager） */
  cancel(): void
}

/**
 * 所有具体特效必须实现的契约（泛型 P = 该特效自己的参数类型）。
 *
 * - prefabPath：本特效自己的池模板 prefab 路径（每个特效自己声明，不再共享一个壳）。
 *   壳内部装什么由特效决定：可以是空 Sprite 壳（代码驱动，模型 A），也可以是带
 *   Animation / Particle 组件的预制体（烤动画，模型 B）—— manager 不关心内部。
 * - prefab：load() 后填充的 Prefab 实例，manager 据此借/还节点（按 prefab 分池）。
 * - load()：加载本特效需要的资源（prefab 必加载；模型 A 还要加载自己的帧）。
 * - play(node, params, done)：在 manager 借出的节点上播；
 *   ① 节点摆位由特效自己按 params 决定（manager 只负责借出并归零变换）；
 *   ② 播完调 done() 让 manager 回收。
 *
 * 为什么 P 是泛型而不是统一 VfxSpawn：不同特效参数差异大（爆炸只要落点 {x,y}，
 * 光束要 from/to 两个端点），统一可选字段既不诚实也浪费；让每个特效声明自己的
 * 参数类型，调用方显式传必要参数，类型安全落在"调用方↔特效"这一层。
 */
export interface IVfx<P = unknown> {
  readonly id: VfxId
  readonly type: VfxId
  readonly prefabPath: string
  prefab: Prefab | null
  load(): Promise<void>
  play(node: Node, params: P, done: () => void): VfxHandle
}
