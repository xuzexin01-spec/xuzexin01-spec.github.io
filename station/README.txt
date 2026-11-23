# 未来车站 · 360° 网页漫游 / FUTURE STATION 360° TOUR

把 Blender 主场景（build/station_master.blend）渲染成 8 个等距柱状全景机位，
用 Pannellum 搭成静态网页导览。功能对齐参考项目（月球便利店 360° 导览）。

## 打开方式

    # 双击一键启动（推荐）
    station\tour\启动漫游.bat

    # 或手动
    powershell -File tour\serve.ps1
    python -m http.server 8770 --bind 0.0.0.0 --directory station\tour\site

浏览器打开：
  本机        http://127.0.0.1:8770/
  其他设备    http://<本机当前IPv4>:8770/   （ipconfig 查看；网段会随路由器变化，
              例如从 192.168.0.x 变成 192.168.31.x，旧网址就不可用了）

## 机位（8 个）

| # | id | 站名 | 位置 (m) | 说明 |
|---|---|---|---|---|
| 01 | axis | 站台主轴 / PLATFORM AXIS | (11.0, 6.0, 2.90) | 主站台轴测：列车、轨行区、82 m 拱顶 |
| 02 | train | 车头特写 / THE NOSE | (9.6, 17.0, 2.90) | CRH 车头、黑色风挡、蓝色腰线 |
| 03 | vault | 穹顶与树柱 / CANOPY VAULT | (-3.5, 46.0, 2.90) | 仰视主桁架、玻璃网格、树形柱 |
| 04 | terrace | 高架夹层 / MEZZANINE | (-24.4, 40.0, 9.25) | 7.6 m 夹层平台与玻璃栏板 |
| 05 | bridge | 跨线廊桥 / CONCOURSE BRIDGE | (15.0, 149.0, 9.25) | 横跨轨行区的廊桥 |
| 06 | rail | 轨行区 / TRACK FIELD | (39.2, 96.0, 2.90) | 道砟、枕木、亮轨面、接触网 |
| 07 | hall | 站房内廊 / STATION ARCADE | (-21.2, 60.0, 2.90) | 暖光商业内廊、石材柱廊、导向标识 |
| 08 | south | 南端全景 / SOUTH APPROACH | (11.0, -42.0, 2.90) | 300 m 长站台的全景收束 |

全景统一按“图像中心 = 正北（+Y）”渲染：相机 rotation_euler = (90°, 0, 0)，
等距柱状投影，4096×2048，Cycles CUDA 110 spp + OIDN，JPEG q88（约 1.2–1.4 MB/张）。
站点 yaw/pitch 只决定进入时的初始视角；小地图视角锥由 viewer 实时 yaw 驱动。

## 功能

- 全屏 360° 全景：拖动环顾、滚轮/双指缩放、触摸拖动
- 入场页（海报背景 + 机位索引）→ 载入进度（真实字节百分比）→ 进入
- 顶部 HUD：品牌 / 自动环顾 / 关于 / 全屏
- 机位标题卡：编号、中英文名、一句话导览
- 站内导航小地图：assets/plan.png 平面图 + 8 个机位点 + 实时视角锥 + 航向读数，点击圆点切换
- 底部机位标签栏（8 个），当前机位高亮
- 画面内热点：自动指向最近的 3 个机位（按世界坐标计算方位角），带编号与中文标签
- 关于弹窗（场景事实 + 快捷键）、Toast 提示、加载/错误兜底（可重试）
- 键盘：←/→ 上一/下一机位，R 自动环顾，F 全屏，Esc 关闭弹窗
- 深链：#axis #train … 直接进入某机位，切换机位时同步 hash
- 移动端适配；尊重 prefers-reduced-motion

## 目录

    tour/
      serve.ps1                 静态服务器（8770）
      render_tour.py            Blender 全景/海报/平面图渲染器（可 --only <ids>）
      qa_tour.py                资源自检（2:1、尺寸、亮度、海报、平面图）
      manifest.json             与 site/manifest.json 相同的机位清单
      site/                     网站根目录（document root）
        index.html
        css/style.css
        js/tour.js
        vendor/pannellum.{js,css}
        manifest.json           运行时读取
        assets/panos/<id>.jpg   4096×2048 等距柱状全景
        assets/poster/<id>.jpg  1280×720 入场/海报图
        assets/plan.png         1000×2280 平面图（+Y 朝上）
        assets/render_report.json
      _qa/                      CDP 浏览器自动测试（cdp_probe.js / cdp_actions.js）

## 重新渲染

    # 全部机位 + 海报 + 平面图
    & D:\blender5.2.3\blender.exe --background --factory-startup ^
        --python station\tour\render_tour.py -- --out station\tour\site\assets

    # 只重渲某个机位 / 调整样本
    ... --python station\tour\render_tour.py -- --only axis,train --samples 110

修改 manifest 里的 pos 后必须重渲对应机位；改 yaw/pitch 只需重渲海报（或直接用运行时初始视角）。

## 与参考项目的对应关系

参考项目（月球便利店）为 5 机位 Pannellum 导览；本项目为 8 机位、同一套交互范式，
在以下方面对齐：入场页、加载进度、顶部控制、机位标题、圆点小地图 + 视角锥、
底部机位栏、自动热点、关于弹窗、自动环顾、全屏、键盘与深链；额外增加了平面图小地图、
航向读数、错误兜底与移动端优化。