/**
 * 游戏全局状态枚举
 * 用于驱动整个游戏的流程切换（GameManager 维护当前状态，UI 依据状态切换显示）。
 */
export enum GameState {
  /** 主菜单 / 标题界面 */
  MENU = 'MENU',
  /** 游戏进行中 */
  PLAYING = 'PLAYING',
  /** 暂停 */
  PAUSED = 'PAUSED',
  /** 游戏结束 */
  OVER = 'OVER',
}

/** 结算结果：仅在 GameState.OVER 时有效 */
export enum GameResult {
  NONE = 'NONE',
  WIN = 'WIN',
  LOSE = 'LOSE',
}

/**
 * state_change 事件的载荷：状态迁移三元组 + 结算结果。
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