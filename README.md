# [魔方栈](https://huazhechen.gitee.io/cuber)


- 优美而强大的网页魔方

- 地址: <https://huazhechen.gitee.io/cuber>
- 地址: <https://andnnl.github.io/cuber/dist>

  <img width="120px" src="resource/icon.png"  alt="icon"/>

- 使用过程中发现任何问题, 或者有任何需求和想法, 欢迎联系作者:
  > 微信: huazhechen
  >
  > QQ: 37705123
  >
  > email: <37705123@qq.com>
# 运行
  npm run watch
# 推送
  git push github HEAD:v2
# Android APP 打包
  打包教程见 [android/README.md](android/README.md)（一键脚本: `bash android/build-apk.sh`，产物 release APK 约 3MB）
# 功能介绍
## 新增功能，可选白底配色，十字求解
- 十字/XCross 求解算法使用独立 Rust 项目 [cube_cross_solve](https://gitee.com/andnnl/cube_cross_solve)，编译为 WASM 供前端调用

## [十字/F2L 预判训练](https://andnnl.github.io/cuber/dist/?mode=crossf2l)

- 打乱后观察紫色标记的目标块 (F2L 槽位的角块+棱块)，预测十字完成后它们到达的位置并点击选块
- Cross / XCross 两种求解模式，解法列表可切换，支持单步/播放验证预判
- 内置计时与正误判定，支持 z2 / y / y' 基准视角切换与自定义打乱公式

  ![crossf2l-trainer](screenshot/crossf2l-trainer.png)

## 物理键盘

<table class="table" id="vrckey" style="display: inline-block;">
<tr><th colspan=10>按键表</th></tr>
<tr>
<td>1<br><br></td><td>2<br><br></td><td>3<br><span>&lt;</span></td><td>4<br><span>&gt;</span></td><td>5<br><span>M</span></td>
<td>6<br><span>M</span></td><td>7<br><span>&lt;</span></td><td>8<br><span>&gt;</span></td><td>9<br><br></td><td>0<br><br></td>
</tr><tr>
<td>Q<br><span> z'</span></td><td>W<br><span>  B</span></td><td>E<br><span> L'</span></td><td>R<br><span>Lw'</span></td><td>T<br><span>  x</span></td> 
<td>Y<br><span>  x</span></td><td>U<br><span> Rw</span></td><td>I<br><span>  R</span></td><td>O<br><span> B'</span></td><td>P<br><span>  z</span></td> 
</tr><tr>
<td>A<br><span> y'</span></td><td>S<br><span>  D</span></td><td>D<br><span>  L</span></td><td>F<br><span> U'</span></td><td>G<br><span> F'</span></td>
<td>H<br><span>  F</span></td><td>J<br><span>  U</span></td><td>K<br><span> R'</span></td><td>L<br><span> D'</span></td><td>;<br><span>  y</span></td>
</tr><tr>
<td>Z<br><span> Dw</span></td><td>X<br><span> M'</span></td><td>C<br><span>Uw'</span></td><td>V<br><span> Lw</span></td><td>B<br><span> x'</span></td>
<td>N<br><span> x'</span></td><td>M<br><span>Rw'</span></td><td>,<br><span> Uw</span></td><td>.<br><span> M'</span></td><td>/<br><span>Dw'</span></td>
</tr>
<tr>
<td></td>
<td>↑<br><span> R</span></td>
<td></td>
</tr>
<tr>
<td>←<br><span> U</span></td>
<td>↓<br><span> R'</span></td>
<td>→<br><span> U'</span></td>
</tr>
</table>

## [虚拟魔方](https://huazhechen.gitee.io/cuber)

- 触控操作

  ![touch](screenshot/touch.gif)

- 撤销操作

  ![undo](screenshot/undo.gif)

- 操作历史

  ![history](screenshot/history.gif)

- 自定义打乱

  ![scramble](screenshot/scramble.gif)

- 复盘

  ![replay](screenshot/replay.gif)

## [复原教程](https://huazhechen.gitee.io/cuber/?mode=algs)

- 公式播放

  ![algs-player](screenshot/algs-player.gif)

* 公式列表

  ![algs-list](screenshot/algs-list.gif)

- 播放控制

  ![algs-step](screenshot/algs-step.gif)

## [动画制作](https://huazhechen.gitee.io/cuber?mode=director)

- 场景布置与截图

  ![snap](screenshot/snap.gif)

- 动画编写与播放

  ![action](screenshot/action.gif)

- 导出 gif

  ![gif](screenshot/gif.gif)

- 自由涂色

  ![colorize](screenshot/colorize.gif)

- 输出配置

  ![output](screenshot/output.gif)

- 动画共享

  ![output](screenshot/share.gif)

## 配置选项

- 阶数选择

  ![order](screenshot/order.gif)

- 操作设置

  ![control](screenshot/control.gif)

- 外观设置

  ![appear](screenshot/appear.gif)

- 主题设置

  ![theme](screenshot/theme.gif)

## 技术栈

- typescript
- webpack
- threejs
- vue
- vuetify
