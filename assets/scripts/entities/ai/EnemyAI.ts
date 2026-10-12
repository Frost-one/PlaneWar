import type { Enemy } from '../Enemy'
import { BossAI } from './BossAI'

/**
 * 每帧传给 AI 的"当时事实"。
 * 故意只放最小量：AI 要读敌机自身状态（位置/血量）直接读 `enemy`，
 * 要读玩家位置未来再加字段；这里只承载帧步进与移动相位时间。
 */
export interface AIContext {
  /** 本帧时间步长（秒） */
  readonly dt: number
  /**
   * 当前移动相位时间（秒）。Enemy.resetPhaseTime() 可把它归零，
   * 让正弦 / 绕圈在阶段切换时从 0 重新摆相，避免"绕到一半接着绕"的错位。
   */
  readonly elapsed: number
}

/**
 * 敌机策略契约 —— 单个敌机实体的"脑子"。
 *
 * 与项目现有约定完全一致：Emitter(接口) + LaneEmitter(类)、IVfx(接口) + ExplosionVfx(类)，
 * 这里也是 EnemyAI(接口) + 各实现类（DefaultEnemyAI / BossAI）。
 *
 * 【职责边界（与玩家同构）】
 *   - 玩家：读"输入(意图)" → 调 ShipConfig.emitters（能力）
 *   - 敌机：读"AI(意图)"   → 调 config.moves / config.emitters（能力）
 *   AI 只负责"设意图"——调用 enemy.useMove(...) / enemy.setWeapons(...)，
 *   不亲自写节点位置、不亲自 tick 子弹（执行仍留在 Enemy.update）。
 *   这样 config 只声明"拥有什么能力"，编排权完全交给 AI，写死的阶段/发射器从数据里消失。
 */
export interface EnemyAI {
  /**
   * 每帧决策。Enemy.update 在"暂停判定之后、物理执行之前"委托调用它。
   * @param enemy 持有本 AI 的敌机实体（通过其公开方法设意图）
   * @param ctx   本帧事实
   */
  update(enemy: Enemy, ctx: AIContext): void

  /** 可选：初始化 / 对象池换 cfg 复用时复位 AI 内部状态（如阶段序号） */
  reset?(): void
}

/**
 * 按敌机 id 取得对应策略。
 *
 * 为什么不放进 config：AI 是"行为/策略"，不属于"能力目录"这份纯数据；
 * 它按敌机种类(规则)分发即可，和"配置表只声明能力"的边界不冲突。
 *   - 普通 / 精英：DefaultEnemyAI（极简，下降 + 全部发射器）
 *   - Boss：     BossAI（多阶段走位 + 换弹幕）
 */
export function createEnemyAI(id: string): EnemyAI {
  if (id === 'enemy_boss') return new BossAI()
  return new DefaultEnemyAI()
}

/**
 * 默认 AI：普通机 / 精英机共用。
 *
 * 行为极简——每帧选 descent 移动 + 启用配置里全部发射器，
 * 等价于原"单阶段敌机"；也是 DefaultEnemyAI 作为"兜底/示例"的定位。
 * 想给某类敌机更聪明的走位时，写一个新 EnemyAI 实现即可，Enemy 本体一行不用改。
 */
export class DefaultEnemyAI implements EnemyAI {
  update(enemy: Enemy, _ctx: AIContext): void {
    enemy.useMove('descent')
    enemy.useAllWeapons()
  }
}
