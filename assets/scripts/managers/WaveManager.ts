// managers/WaveManager.ts
// 波次 runner（编排者）：只读 Stage 数据，按触发条件喊 EnemyManager 出怪，
// 播完且场上无敌机则判定通关。本身不造敌机（那归 EnemyManager）。
import { _decorator, Component } from 'cc'
import { GameState, GameResult, StateChangePayload } from '../data/GameState'
import { eventBus } from '../core/EventBus'
import { gameManager } from './GameManager'
import { EnemyManager } from './EnemyManager'
import { getEnemy } from '../data/enemies/EnemyRegistry'
import type { EnemyId } from '../data/enemies/EnemyConfig'
import { StageData } from '../data/stages/StageTypes'
import { getStage } from '../data/stages/StageTable'

const { ccclass } = _decorator

/** 拍平后的单条生成指令（波内绝对偏移） */
interface PlanEntry {
  t: number
  type: EnemyId
  x?: number
}

@ccclass('WaveManager')
export class WaveManager extends Component {
  private stage: StageData | null = null
  private waveIdx = 0
  private waveElapsed = 0
  private planIdx = 0
  private spawnedInWave = false
  private plan: PlanEntry[] = []

  protected onLoad(): void {
    eventBus.on('state_change', this.onStateChange, this)
  }

  protected onDestroy(): void {
    eventBus.off('state_change', this.onStateChange, this)
  }

  /**
   * 新开一局（菜单/结算 → 游玩）才重置波次；暂停→恢复不重置。
   */
  private onStateChange({ oldState, newState }: StateChangePayload): void {
    if (newState === GameState.PLAYING &&
        (oldState === GameState.MENU || oldState === GameState.OVER)) {
      this.loadStage(0)
    }
  }

  private loadStage(i: number): void {
    this.stage = getStage(i)
    this.beginWave(0)
  }

  /** 进入第 i 波：拍平 count/gap 成"波内偏移"时间线，按 t 升序 */
  private beginWave(i: number): void {
    this.waveIdx = i
    this.waveElapsed = 0
    this.planIdx = 0
    const w = this.stage!.waves[i]
    this.plan = w.spawns.flatMap((e) => {
      const n = e.count ?? 1
      const gap = e.gap ?? 0
      return Array.from({ length: n }, (_, k) => ({
        t: (e.t ?? 0) + k * gap,
        type: e.type,
        x: e.x,
      }))
    }).sort((a, b) => a.t - b.t)
    this.spawnedInWave = this.plan.length === 0
  }

  update(dt: number): void {
    const stage = this.stage
    if (!stage) return
    if (gameManager.getGameState() !== GameState.PLAYING) return // 暂停/结算冻结

    const w = stage.waves[this.waveIdx]
    this.waveElapsed += dt
    const mgr = EnemyManager.getInstance()

    // 1) 投放本波 spawn（按波内偏移 t 触发）
    while (this.planIdx < this.plan.length && this.plan[this.planIdx].t <= this.waveElapsed) {
      const p = this.plan[this.planIdx++]
      const cfg = getEnemy(p.type)?.config
      if (cfg) mgr.spawn(cfg, p.x)
    }
    if (this.planIdx >= this.plan.length) this.spawnedInWave = true

    // 2) 判断能否进下一波
    const cleared = mgr.getAliveCount() === 0
    let advance = false
    if (w.advance === 'time') {
      advance = this.waveElapsed >= w.advanceDelay
    } else if (w.advance === 'clear') {
      advance = this.spawnedInWave && cleared
    } else { // timeOrClear
      advance = this.waveElapsed >= w.advanceDelay || (this.spawnedInWave && cleared)
    }
    if (!advance) return

    // 3) 进下一波，或（最后一波清场）通关
    if (this.waveIdx + 1 < stage.waves.length) {
      this.beginWave(this.waveIdx + 1)
    } else if (this.spawnedInWave && cleared) {
      gameManager.endGame(GameResult.WIN)
    }
  }
}
