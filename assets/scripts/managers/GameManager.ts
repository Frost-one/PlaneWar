import { GameState } from '../data/GameState'
import { eventBus } from '../core/EventBus'
import { playerData } from '../data/PlayerData'
import { Component } from 'cc'
/**
 * 游戏全局状态管理器（单例）
 * 统一维护游戏流程状态机：MENU / PLAYING / PAUSED / OVER。
 * 状态切换统一通过 setGameState 完成，并对同状态做去重；
 * 切换时会向事件总线广播 "state_change"，供 HUD、菜单、结算等 UI 订阅刷新。
 *
 * 单例实例见文件底部导出的 gameManager，各模块 import 后直接使用。
 */
export class GameManager {
  /** 当前游戏状态，默认从主菜单进入 */
  private currentState: GameState = GameState.MENU
  private score: number = 0

  /**
   * 获取当前游戏状态
   * @returns 当前所处的 GameState
   */
  public getGameState(): GameState {
    return this.currentState
  }

  /**
   * 设置新的游戏状态（唯一的改状态入口）
   * 若目标状态与当前状态相同则直接忽略，避免无意义的重复广播。
   * @param state 目标状态
   */
  public setGameState(state: GameState): void {
    if (this.currentState === state) return

    this.currentState = state
    eventBus.emit('state_change', state)
    console.log(`[GameManager] 状态切换 -> ${state}`)
  }

  public getScore(): number {
    return this.score
  }

  public addScore(num: number): void {
    this.score += num
    eventBus.emit('score_change', this.score)
    console.log(`score 分数改变 -> ${this.score}`)
  }

  public initListeners(): void {
    eventBus.on('enemy_die', this.onEnemyDie, this)
  }

  private onEnemyDie(data: { bulletNode?: Component, enemyNode?: Component }): void {
    console.log('敌机死亡：', data)
    // data.bulletNode.destroy()
    // data.enemyNode.destroy()
    // this.addScore(10)
    playerData.addScore(10)
  }

  /**
   * 开始游戏：由主菜单/结算界面进入游玩状态
   * （后续如需在开局时重置分数、命数，可在此调用对应的 reset 逻辑）
   */
  public startGame(): void {
    this.setGameState(GameState.PLAYING)
  }

  /**
   * 游戏结束：玩家生命耗尽后进入结算状态
   */
  public gameOver(): void {
    this.setGameState(GameState.OVER)
  }

  /**
   * 暂停游戏：由游玩状态进入暂停状态
   * 暂停后可调用 startGame() 继续，或调用 backToMenu() 返回主菜单。
   */
  public gamePause(): void {
    this.setGameState(GameState.PAUSED)
  }

  /**
   * 回到主菜单：供"暂停界面 / 结算界面"上的"返回菜单"按钮调用
   */
  public backToMenu(): void {
    this.setGameState(GameState.MENU)
  }
}

/** 全局唯一实例，供各模块 import 后直接使用 */
export const gameManager = new GameManager()