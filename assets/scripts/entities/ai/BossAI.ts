import type { EnemyAI, AIContext } from './EnemyAI'
import type { Enemy } from '../Enemy'

/** Boss 悬停线（下降到的 y，与 EnemyBoss.ts 的 moves 共享此常量） */
const BOSS_HOVER_Y = 220
/** 横扫阶段持续秒数（到时切三角） */
const SWEEP_DURATION = 7
/** 三角阶段持续秒数（到时回横扫，形成 1↔2 循环） */
const TRIANGLE_DURATION = 7

/**
 * Boss 策略：复刻雷霆战机的"入场下降 → 顶部横扫(扇形) → 三角移动(瞄准) → 循环"走位。
 *
 * 【关键】"何时做什么"的全部逻辑都在这里（AI），EnemyBoss.ts 配置表只声明它"拥有"
 *   descent / sweep / triangle 三个移动能力 + spread / aim 两个开火能力。
 *   想换套路只改这个文件，数据表一行不用动 —— 这正是用户要的
 *   "config 只定义技能和行为，具体怎么调用、什么时候调用看 AI"。
 *
 * 【与玩家的同构】
 *   玩家每帧读输入决定用哪几个 ShipConfig.emitters；
 *   这里每帧读自身状态（高度 / 阶段内时间）决定用哪个 move、启用哪些 emitter。
 *
 * ⚠️ 手感参数（SWEEP/TRIANGLE 时长、悬停线）是初值，需在 Cocos 编辑器实测微调。
 */
export class BossAI implements EnemyAI {
  /** 当前阶段：0=下降入场 1=横扫+扇形 2=三角+瞄准 */
  private phase = 0

  reset(): void {
    this.phase = 0
  }

  update(enemy: Enemy, ctx: AIContext): void {
    // 1. 先推进阶段切换（取先到者）
    if (this.phase === 0 && enemy.node.position.y <= BOSS_HOVER_Y) {
      this.phase = 1
      enemy.resetPhaseTime()          // 进入横扫：相位时间归零，正弦从 0 重新摆
    } else if (this.phase === 1 && ctx.elapsed >= SWEEP_DURATION) {
      this.phase = 2
      enemy.resetPhaseTime()          // 进入三角：相位时间归零
    } else if (this.phase === 2 && ctx.elapsed >= TRIANGLE_DURATION) {
      this.phase = 1
      enemy.resetPhaseTime()          // 回到横扫（wrap 循环），相位归零
    }

    // 2. 再按当前阶段"设意图"——只选能力，不亲自写位置 / tick 子弹
    switch (this.phase) {
      case 0:
        enemy.useMove('descent')
        enemy.clearWeapons()          // 入场下降不开火
        break
      case 1:
        enemy.useMove('sweep')
        enemy.setWeapons(['spread'])  // 顶部横扫配扇形散射
        break
      case 2:
        enemy.useMove('triangle')
        enemy.setWeapons(['aim'])     // 三角走位配更快的直射
        break
    }
  }
}
