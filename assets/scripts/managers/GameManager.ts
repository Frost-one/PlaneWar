import { GameState } from '../data/GameState'
import { eventBus } from '../core/EventBus'
import { playerData } from '../data/PlayerData'
import { GameConfig } from '../data/GameConfig'
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
  /** 当前游戏状态，默认从主菜单进入 */
  private currentState: GameState = GameState.MENU

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

  /** 获取当前分数（委托数据层） */
  public getScore(): number {
    return playerData.getSnapshot().score
  }


  public initListeners(): void {
    eventBus.on('enemy_die', this.onEnemyDie, this)
    eventBus.on('player_hit', this.onPlayerHit, this)
  }

  private onEnemyDie(data: { bulletNode?: Component, enemyNode?: Component }): void {
    console.log('敌机死亡：', data)
    playerData.addScore(10)
  }

  /**
   * 玩家被敌机撞击：扣血并判定游戏结束。
   * 扣血量取自 GameConfig.COLLIDE_DAMAGE_PLAYER，
   * 生命归零则切到 OVER 结算状态。
   */
  private onPlayerHit(data: { enemyNode?: Component, playerNode?: Component }): void {
    console.log('玩家被撞：', data)
    playerData.takeDamage(GameConfig.COLLIDE_DAMAGE_PLAYER)
    if (playerData.isDead()) {
      this.gameOver()
    }
  }

  /**
   * 开始游戏：由主菜单/结算界面进入游玩状态
   * 开局先把玩家数据重置（分数、生命回到初始），再进入 PLAYING。
   */
  public startGame(): void {
    playerData.reset()
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