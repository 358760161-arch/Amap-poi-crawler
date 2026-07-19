# AMap POI Crawler

一个纯前端的高德地图 POI 区域采集网页工具。

## 功能

- 加载高德地图 JSAPI v2.0
- 在地图上绘制和编辑多边形区域
- 按 POI 类型或自定义关键词查询区域内 POI
- 前端去重并在地图和表格中预览结果
- 导出 Excel `.xlsx`
- 导出 GeoJSON `.geojson`

## 使用方式

直接打开 `index.html`，或用本地静态服务访问本目录。

页面启动后需要填写：

- 高德 Web端 JS API Key
- securityJsCode

然后点击「初始化地图」，绘制多边形，选择 POI 类型或输入关键词，再点击「开始查询」。

## 参数说明

- 每页数量：每次请求最多返回多少条 POI，建议 25 或 50。
- 最大页数：每个查询任务最多翻多少页，用于控制配额消耗。
- 请求间隔(ms)：每页请求之间的等待时间，建议 300-800ms。
- 坐标系：当前导出使用高德返回的 GCJ-02 坐标。

## 注意事项

不要把自己的真实 Key 和 securityJsCode 写死到代码里。公开部署时建议让用户自行填写 Key，或使用后端代理保护密钥。

高德返回坐标为 GCJ-02。如果要和 WGS84 数据叠加分析，需要额外做坐标转换。

## GitHub Pages

如果部署到 GitHub Pages：

1. 打开仓库 `Settings`
2. 进入 `Pages`
3. Source 选择 `Deploy from a branch`
4. Branch 选择 `main` 和 `/root`
5. 保存后等待页面生成

访问地址通常为：

```text
https://<username>.github.io/<repository>/
```
