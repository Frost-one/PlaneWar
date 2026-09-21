import { _decorator, Component, Node, PhysicsSystem2D } from 'cc'
import { gameManager } from './managers/GameManager'
import { GameState } from './data/GameState'
import { loadShipAssets } from './data/ships/ShipRegistry'
import { loadEnemyAssets } from './data/enemies/EnemyRegistry'

const { ccclass, property } = _decorator

@ccclass('GameEntry')
export class GameEntry extends Component {
  async start() {
    // 启用 2D 物理系统：子弹/敌机已改为物理刚体（RigidBody2D）驱动，
    // 必须开启物理系统，刚体才会被推进与产生碰撞。
    // PhysicsSystem2D.instance.enable = true
    PhysicsSystem2D.instance.debugDrawFlags = 1

    // 游戏启动引导：先把机型资源读齐，再让状态机进入主菜单。
    //
    // 【为什么不新增一个 LOADING 状态】
    //   菜单没起来之前，玩家根本进不去玩法，入口天然是关着的 ——
    //   多加一个状态反而要写一套 UI 和无用的状态迁移。
    //
    // 【加载失败会不会卡住】
    //   不会：loadShipAssets 内部对缺失资源只是跳过并打 error，
    //   所以即使美术还没放进 resources/，游戏也能正常进菜单（只是预览图不换）。
    await loadShipAssets()

    // 敌机外观资源（按 id 的贴图）在进菜单前读齐（与 ships 同一时机）。
    // 共享敌机 body prefab 由 EnemyManager.start() 自己加载持有，不在此处——
    // registry 只缓存「每类外观资源」，与 ShipRegistry 严格对称。
    await loadEnemyAssets()

    // await 之后必须先确认节点还活着：加载期间本节点可能已被销毁。
    // （生命周期规范：任何 await 之后操作节点前都要检查 node.isValid）
    if (!this.node?.isValid) return

    // （后续可在这里初始化音频、场景等管理器）
    gameManager.initListeners()
    gameManager.setGameState(GameState.MENU)
    console.log('[GameEntry] 启动完成，当前状态:', gameManager.getGameState())
  }

}
