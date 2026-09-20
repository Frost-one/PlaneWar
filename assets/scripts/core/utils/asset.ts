import { resources } from 'cc'
import type { Asset, Constructor } from 'cc'

/**
 * 资源加载工具 —— `resources.load` 的 Promise 封装。
 *
 * 【为什么要包一层】
 *   1. 原始 API 是回调风格，和 async/await 混用会写出回调金字塔；
 *   2. 失败时统一打日志并回落 null，调用方只判空，不用到处 try/catch；
 *   3. 将来要换成 Asset Bundle / 远程加载，只改这个文件，业务无感。
 *
 * 【为什么在 core/utils，而不是业务目录】
 *   它只认识「路径 + 类型」，不认识飞机、特效、音效 —— 任何资源都能用。
 *   反过来 core 不允许反向依赖 data / entities（否则通用工具被业务概念污染），
 *   所以「按机型遍历加载」那种认识 ShipConfig 的活留在 ShipRegistry，不进这里。
 *
 * 【路径写法】相对 assets/resources/，**不带扩展名**（引擎按 uuid 索引，不按文件名）：
 *   'ships/ship_red/bullet'             ← prefab / 音频写文件名即可
 *   'ships/ship_red/ship/spriteFrame'   ← 取贴图要带 /spriteFrame 子资源后缀
 *   ✗ 'ships/ship_red/bullet.prefab'    ← 写了扩展名反而找不到
 *
 * 【加载失败时先查这三条】
 *   ① 文件是否真的在 assets/resources/ 目录下（不在就加载不到）
 *   ② 路径末尾有没有多写扩展名
 *   ③ 取 SpriteFrame 时有没有漏掉 /spriteFrame 后缀
 */

/**
 * 加载单个资源，失败返回 null（已打出错误日志）。
 *
 * @param path 相对 assets/resources/ 的路径，不带扩展名
 * @param type 资源类型构造器，如 Prefab / SpriteFrame / AudioClip
 */
export function loadAsset<T extends Asset>(path: string, type: Constructor<T>): Promise<T | null> {
  return new Promise((resolve) => {
    resources.load(path, type, (err, asset) => {
      if (err || !asset) {
        logLoadFailure(path, type, err)
        resolve(null)
        return
      }
      resolve(asset)
    })
  })
}

/**
 * 加载失败时打一行日志：路径 + 类型 + 引擎原因。
 *
 * 保持一行的原因：这类日志通常是批量出现的（一次加载十几个资源），
 * 多行模板会把控制台刷爆，反而看不清缺了哪几个。
 * 排查要点写在 loadAsset 的注释里，不进运行时日志。
 */
function logLoadFailure(path: string, type: unknown, err: Error | null): void {
  const typeName = (type as { name?: string } | undefined)?.name ?? '未知'
  const reason = err?.message ? `${err.message}` : '未知'
  console.error(
    '[asset] 资源加载失败\n' +
      `路径：${path}\n` +
      `类型：${typeName}\n` +
      `原因：${reason}`,
  )
}

/** 批量并发加载；返回数组与入参顺序一致，失败项为 null */
export function loadAssetList<T extends Asset>(
  paths: readonly string[],
  type: Constructor<T>,
): Promise<(T | null)[]> {
  return Promise.all(paths.map((p) => loadAsset(p, type)))
}

/**
 * 可选资源的便捷写法：没配路径直接给 null，省得调用方写三元。
 * 激光机型没有子弹 prefab，走的就是这条路。
 */
export function loadAssetOrNull<T extends Asset>(
  path: string | undefined,
  type: Constructor<T>,
): Promise<T | null> {
  return path ? loadAsset(path, type) : Promise.resolve(null)
}
