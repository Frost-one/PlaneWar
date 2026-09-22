/**
 * @property 必填校验。
 *
 * 【这个函数挡住什么成本】
 *   @property 漏拖不报错、只静默失效 —— 表现是"分数不动""按钮点了没反应"，
 *   要靠肉眼从现象反推原因。把它变成"启动即崩、且一次列出全部缺失"，
 *   排查成本从"猜"降到"看一眼控制台"。
 *
 * 【为什么用 throw，而不是 warn】
 *   漏拖是【程序员错误】（改了 prefab 才可能发生，不会在运行中随机出现），
 *   不是环境错误。程序员错误就该 fail fast —— 带着空引用继续跑只会让崩溃点
 *   远离原因（几秒后在别处抛 Cannot read properties of null）。
 *
 * ⚠️ 本函数只管【必填】属性。可空有回退的属性（如 Player.beamLayer）
 *    不要放进这里 —— 它们在使用处自己 warn，因为回退逻辑也在那里。
 *
 * 【为什么不用 cc 自带的 assert】
 *   Cocos 的 assert 逻辑是反的（cocos/core/platform/debug.ts:206）：
 *   DEV 下只 console.error 不中断，正式包才 throw。达不到"开发期立刻停"的目的。
 */

/**
 * 校验一组【必填】的 @property 是否已拖引用；有缺失则先整批打 error 再抛异常。
 *
 * @param owner 类名，仅用于日志指名
 * @param props `{ 属性名: 属性值 }` —— 传对象字面量，字段改名/写错时 TS 会直接报错
 * @throws 有任一属性缺失时抛出，中断当前组件的初始化
 */
export function validateRequiredProps(
  owner: string,
  props: Record<string, unknown>,
): void {
  const missing = Object.keys(props).filter((name) => {
    const v = props[name]
    // 空数组也算"没拖"：[] 在 JS 里是 truthy，光靠 !v 抓不到（MapManager 的贴图数组就会漏）
    return !v || (Array.isArray(v) && v.length === 0)
  })
  if (missing.length === 0) return

  // 先把全部缺失列出来再抛：只抛异常的话一次只能看到一个，修完再跑才能看到下一个
  const msg = `[${owner}] 以下属性没拖：${missing.join('、')}`
  console.error(msg)
  throw new Error(msg)
}
