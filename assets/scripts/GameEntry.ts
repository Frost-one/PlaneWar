import { _decorator, Component, Node, PhysicsSystem2D } from 'cc'
import { gameManager } from './managers/GameManager'
import { GameState } from './data/GameState'


const { ccclass, property } = _decorator

@ccclass('GameEntry')
export class GameEntry extends Component {
  start() {
    // 启用 2D 物理系统：子弹已改为物理刚体（RigidBody2D）驱动，
    // 必须开启物理系统，刚体才会被推进与产生碰撞。
    // PhysicsSystem2D.instance.enable = true
    // PhysicsSystem2D.instance.debugDrawFlags = 1

    // 游戏启动引导：让状态机进入主菜单
    // （后续可在这里初始化音频、场景等管理器）
    gameManager.setGameState(GameState.MENU)
    gameManager.initListeners()
    console.log('[GameEntry] 启动完成，当前状态:', gameManager.getGameState())
  }

  update(deltaTime: number) {
		
	}
}
