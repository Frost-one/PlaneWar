import { GameResult, GameState, StateChangePayload } from '../data/GameState'
import { eventBus } from '../core/EventBus'
import { playerData } from '../data/PlayerData'
import { GameConfig } from '../data/config/GameConfig'
import { Component } from 'cc'
/**
 * 游戏全局状态管理器（单例）
 * 统一维护游戏流程状态机：MENU / PLAYING / PAUSED / OVER。
 * 状态切换统一通过 setGameState 完成，并对同状态做去重；
 * 切换时会向事件总线广播 "state_change"，供 HUD、菜单、结算等 UI 订阅刷新。
 *
 * 注意：分数、生命等玩家数据不在此类保存，
 * 而是统一委托给数据层 playerData（唯一数据源），本类只负责流程与规则。
 *
 * 单例实例见文件底部导出的 gameManager，各模块 import 后直接使用。
 */
export class GameManager {
  /**
   * 合法的状态迁移表：key = 当前状态，value = 允许迁移到的目标状态列表。
   * 仅用于"是否放行"的守卫，不承载任何副作用；新增状态时在这里集中声明。
   *
   * 迁移图（线性 + 少量回边）：
   *   MENU    → PLAYING
   *   PLAYING → PAUSED | OVER
   *   PAUSED  → PLAYING | MENU
   *   OVER    → PLAYING | MENU
   */
  private static readonly TRANSITIONS: Record<GameState, GameState[]> = {
    [GameState.MENU]: [GameState.PLAYING],
    [GameState.PLAYING]: [GameState.PAUSED, GameState.OVER],
    [GameState.PAUSED]: [GameState.PLAYING, GameState.MENU],
    [GameState.OVER]: [GameState.PLAYING, GameState.MENU],
  }

  /** 当前游戏状态，默认从主菜单进入 */
  private currentState: GameState = GameState.MENU
  private result: GameResult = GameResult.NONE

  /**
   * 获取当前游戏状态
   * @returns 当前所处的 GameState
   */
  public getGameState(): GameState {
    return this.currentState
  }

  /**
   * 获取当前结算结果（仅在 state === GameState.OVER 时有意义）
   * @returns 当前 GameResult，非结束状态时为 GameResult.NONE
   */
  public getGameResult(): GameResult {
    return this.result
  }

  /**
   * 获取当前状态快照（与 state_change 事件载荷同构）。
   * 供 UI 在启动时主动拉取一次用于初始化显隐，无需手工拼装对象。
   * 注意：启动时没有"上一个状态"，故 oldState 取当前状态本身。
   * @returns 当前 { oldState, newState, result }
   */
  public getStateSnapshot(): StateChangePayload {
    return {
      oldState: this.currentState,
      newState: this.currentState,
      result: this.result,
    }
  }

  /**
   * 判断从当前状态迁移到目标状态是否合法
   * @param to 目标状态
   * @returns 合法返回 true，否则 false
   */
  private canTransition(to: GameState): boolean {
    return GameManager.TRANSITIONS[this.currentState].includes(to)
  }

  /**
   * 设置新的游戏状态（唯一的改状态入口）。
   * - 同状态重复调用会被去重，避免无意义的重复广播
   * - 非法迁移会被 TRANSITIONS 表拦截并告警
   *
   * @param nextState 目标状态
   * @param result 结算结果，仅进入 OVER 时需要传
   */
  public setGameState(nextState: GameState, result: GameResult = GameResult.NONE): void {
    if (this.currentState === nextState) return

    if (!this.canTransition(nextState)) {
      console.warn(`[GameManager] 非法状态迁移：${this.currentState} -> ${nextState}，已忽略`)
      return
    }

    const oldState = this.currentState
    this.currentState = nextState
    this.result = result
    eventBus.emit('state_change', { oldState, newState: nextState, result })
    console.log(`[GameManager] 状态切换：${oldState} -> ${nextState}, 游戏结果：${result}`)
  }

  /** 获取当前分数（委托数据层） */
  public getScore(): number {
    return playerData.getSnapshot().score
  }

  public initListeners(): void {
    eventBus.on('enemy_die', this.onEnemyDie, this)
    eventBus.on('player_hit', this.onPlayerHit, this)
  }

  private onEnemyDie(data: { enemyNode?: Component, score: number }): void {
    console.log('敌机死亡：', data)
    playerData.addScore(data.score)

    // 临时做的胜利条件
    // if (playerData.getSnapshot().score >= 500) {
    //   this.endGame(GameResult.WIN)
    // }
  }

  /**
   * 玩家被敌机撞击：扣血并判定游戏结束。
   * 扣血量取自 GameConfig.COLLIDE_DAMAGE_PLAYER，
   * 生命归零则切到 OVER 结算状态。
   */
  private onPlayerHit(data: { enemyNode?: Component, playerNode?: Component, damage: number }): void {
    console.log('玩家被撞：', data)
    playerData.takeDamage(data.damage)
    if (playerData.isDead()) {
      this.endGame(GameResult.LOSE)
    }
  }

  // ==================== 状态切换函数（按语义命名，外部只调这些） ====================

  /**
   * 新开一局：由主菜单 / 结算界面进入游玩状态。
   * 会重置玩家数据（分数、生命回到初始）。
   * 合法来源：MENU、OVER
   */
  public startGame(): void {
    playerData.reset()
    this.setGameState(GameState.PLAYING)
  }

  /**
   * 继续游戏：由暂停状态返回游玩状态。
   * 与 startGame 的区别：**不重置任何数据**，仅解冻。
   * 合法来源：PAUSED
   */
  public resumeGame(): void {
    this.setGameState(GameState.PLAYING)
  }

  /**
   * 暂停游戏：由游玩状态进入暂停状态。
   * 合法来源：PLAYING
   */
  public pauseGame(): void {
    this.setGameState(GameState.PAUSED)
  }

  /**
   * 游戏结束：进入结算状态，并记录本局结果。
   * 合法来源：PLAYING
   * @param result 结算结果（WIN / LOSE）
   */
  public endGame(result: GameResult): void {
    this.setGameState(GameState.OVER, result)
  }

  /**
   * 回到主菜单：供"暂停界面 / 结算界面"上的"返回菜单"按钮调用。
   * 合法来源：PAUSED、OVER
   */
  public backToMenu(): void {
    this.setGameState(GameState.MENU)
  }
}

/** 全局唯一实例，供各模块 import 后直接使用 */
export const gameManager = new GameManager()
