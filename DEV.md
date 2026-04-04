# 成绩管家 - 开发文档

> 本文档面向 AI 助手和新开发者，用于快速理解项目架构、数据结构和开发约定。

## 项目概览

- **项目名称**：成绩管家
- **仓库地址**：`git@github.com:lucian-why/chengjiguanjia.git`
- **在线地址**：https://lucian-why.github.io/chengjiguanjia/
- **部署方式**：GitHub Pages（推送至 `main` 分支自动部署）
- **当前分支**：`main`（直接在 main 上开发，推送即部署）
- **架构**：Vite + ES Module 多文件项目，构建后输出单文件 `dist/index.html` 部署到 GitHub Pages

## 技术栈

| 依赖 | 版本 | 用途 | 引入方式 |
|------|------|------|----------|
| Chart.js | 4.4.1 | 雷达图、趋势折线图 | CDN |
| SheetJS (xlsx) | 0.18.5 | Excel 导入导出 | CDN |
| Google Fonts | - | Noto Serif SC / Noto Sans SC | CDN |

**构建工具**：Vite 6 + `vite-plugin-singlefile`。开发时用 `npm run dev`（HMR 热更新），部署时 `npm run build` 产出单文件。

## 文件结构

```
E:\成绩管家\成绩管家_web\
├── index.html              # 纯 HTML 模板（DOM 结构 + CDN 引用）
├── vite.config.js          # Vite 配置（singlefile 插件）
├── package.json            # 项目依赖
├── .gitignore              # Git 忽略规则
├── src/
│   ├── app.js              # 入口文件：依赖注入、事件绑定、window 注册、初始化
│   ├── store.js            # 全局状态对象（state）
│   ├── storage.js          # 数据持久化层（localStorage CRUD）
│   ├── modal.js            # 弹窗系统（confirm / toast）
│   ├── utils.js            # 工具函数（escHtml, updateScoreMax, updateCharts）
│   ├── styles.css          # 全部样式（1688 行）
│   ├── exam-list.js        # 考试列表渲染与选择
│   ├── exam-detail.js      # 考试详情渲染、模态框、表单提交
│   ├── batch.js            # 批量填写成绩
│   ├── profile.js          # 档案管理 UI
│   ├── chart-radar.js      # 雷达图（科目对比 + 多考试对比）
│   ├── chart-trend.js      # 趋势图（分数/排名折线图 + 标签切换）
│   ├── chart-zoom.js       # 图表放大查看
│   ├── import-export.js    # Excel 导入导出（SheetJS）
│   ├── report.js           # 分享报告生成（html2canvas 截图）
│   └── demo-data.js        # 示例数据（首次启动注入）
├── dist/                   # 构建产物（GitHub Pages 部署用）
│   └── index.html          # 单文件产物（~109KB，CSS+JS 全内联）
├── README.md               # 项目介绍
├── DEV.md                  # 本文档
└── index-legacy-v2.html    # 重构前完整备份（4525 行，勿动）
```

## 数据模型

### 档案（Profile）

```javascript
{
    id: 'profile_' + Date.now(),  // 字符串，如 "profile_1712345678901"
    name: '张三',                   // 档案名称
    createdAt: '2025-01-01T00:00:00.000Z'  // ISO 日期字符串
}
```

**存储键**：`xueji_profiles`（localStorage，JSON 数组）
**活跃档案键**：`xueji_active_profile`（localStorage，存储 profile id 字符串）

### 考试（Exam）

```javascript
{
    id: 1712345678901,              // 数字，Date.now() 生成
    profileId: 'profile_xxx',       // 所属档案 ID
    name: '第一次月考',             // 考试名称
    startDate: '2025-03-15',        // 考试日期（字符串，格式 YYYY-MM-DD）
    createdAt: '2025-03-15T...',    // 创建时间（ISO）
    // 排名信息（可选）
    totalClassRank: 5,              // 总分班级排名
    totalGradeRank: 42,             // 总分年级排名
    classTotal: 45,                 // 班级人数
    gradeTotal: 500,                // 年级人数
    // 科目列表
    subjects: [
        {
            name: '语文',           // 科目名称
            score: 108,             // 得分（数字）
            fullScore: 150,         // 满分（数字），用于雷达图计算得分率
            classRank: 2,           // 班级排名（可选，数字）
            gradeRank: 18,          // 年级排名（可选，数字）
            notes: ''               // 备注
        },
        // ...更多科目
    ]
}
```

**存储键**：`xueji_exams_{profileId}`（每个档案独立存储，JSON 数组）

### localStorage 键名汇总

| 键名 | 类型 | 说明 |
|------|------|------|
| `xueji_profiles` | JSON 数组 | 所有档案列表 |
| `xueji_active_profile` | 字符串 | 当前活跃档案 ID |
| `xueji_exams_{profileId}` | JSON 数组 | 某档案下的所有考试 |
| `xueji_trend_mode` | 字符串 | 趋势图模式：`score`/`rank`/`radar` |

## 页面结构（SPA 路由）

应用是单页应用，通过 JS 控制 `display: none/block` 切换视图：

| 区域 | DOM ID | 说明 |
|------|--------|------|
| 侧边栏 | `sidebar` | 考试列表 + 档案切换下拉框 |
| 考试详情 | `tab-exam` | 选中考试的总览 + 各科成绩卡片 |
| 成绩分析 | `tab-analysis` | 包含三个子标签：分数趋势、排名趋势、科目对比（雷达图） |
| 设置 | `tab-settings` | 档案管理（新增/重命名/删除/切换） |

### 成绩分析子标签

通过 `trendAnalysisMode` 变量控制，存储在 `xueji_trend_mode`：
- `score`：分数趋势折线图（默认）
- `rank`：排名趋势折线图（分班级/年级两种）
- `radar`：科目对比雷达图

## 核心函数索引

### 数据操作

| 函数 | 说明 |
|------|------|
| `getProfiles()` / `saveProfiles()` | 读写档案列表 |
| `getActiveProfileId()` / `setActiveProfileId()` | 读写活跃档案 |
| `getExams(profileId)` / `saveExams(profileId, exams)` | 读写某档案的考试列表 |
| `getExamsAll()` | 获取所有档案的所有考试（导入用） |

### 渲染

| 函数 | 说明 |
|------|------|
| `renderExamList()` | 渲染侧边栏考试列表 |
| `renderExamDetail()` | 渲染考试详情页 |
| `renderProfileSwitcher()` | 渲染侧边栏档案切换下拉框 |
| `renderProfileList()` | 渲染设置页档案管理面板 |
| `renderRadarCompareChips()` | 渲染雷达图对比考试选择器 chip |
| `updateRadarChart()` | 更新雷达图数据 |
| `updateChartTabs()` | 更新趋势图标签状态 |
| `updateTrendChart()` | 更新趋势图数据 |

### 交互

| 函数 | 说明 |
|------|------|
| `selectExam(examId)` | 选中考试（examId 是数字） |
| `switchToProfile(index)` | 切换档案（index 是数组下标） |
| `toggleRadarCompare(examId)` | 切换雷达图对比考试选择（examId 是数字） |
| `showConfirmDialog({title, message, iconType, onConfirm})` | 自定义确认弹窗 |
| `showToast({icon, iconType, title, message, onClose})` | 自定义提示弹窗 |

## UI 组件约定

### 弹窗系统

- **不要使用原生 `alert()` / `confirm()` / `prompt()`**（WorkBuddy 内置浏览器会拦截）
- 确认操作使用 `showConfirmDialog()`，支持 `iconType: 'danger'/'success'/'info'`
- 提示信息使用 `showToast()`，复用 `confirmModal` DOM
- 模态框类名添加 `.active` 显示，移除隐藏

### 色彩系统（CSS 变量）

```css
--bg-primary: #faf8f5;      /* 页面背景 */
--bg-card: #ffffff;          /* 卡片背景 */
--text-primary: #2d2a26;     /* 主文字 */
--text-secondary: #6b6560;   /* 次要文字 */
--accent-warm: #e8a87c;      /* 暖橙强调色 */
--accent-green: #7cb98b;     /* 绿色 */
--accent-blue: #7ca9c9;      /* 蓝色 */
--accent-purple: #9b8dc4;    /* 紫色 */
--border-color: #e8e4de;     /* 边框 */
```

### 排名标签规则

- 班级排名用 **"班X"** 格式（如 班32）
- 年级排名用 **"校X"** 格式（如 校42），不用"年级"
- 显示排名时，如果有年级人数则显示百分比：`校第42名 (8.4%)  年级500人`

### 响应式断点

- `768px` 以下为移动端布局
- 移动端侧边栏变为抽屉式，通过汉堡按钮打开

## 雷达图（科目对比）

### 概述

雷达图位于「成绩分析」标签下的「科目对比」子标签中。显示各科得分率（score/fullScore×100%）。

### 数据要求

- 至少 3 科有满分数据（fullScore > 0）才能生成
- 没有满分的科目会被过滤掉
- 对比考试中缺少的科目对应的数据点为 null，不绘制

### 多选对比机制

- 用户可点击考试 chip 最多选择 3 场考试与当前考试同时对比
- `selectedCompareIds` 数组存储已选对比考试 ID（数字类型）
- 选满 3 场后其余 chip 自动置灰（disabled class）
- 切换考试/档案时自动清理无效的已选 ID

### 配色与样式

使用 `RADAR_COMPARE_STYLES` 数组，4 种高对比样式：

| 索引 | 颜色 | 用途 | 填充 | 点样式 | 线宽 |
|------|------|------|------|--------|------|
| 0 | 橙红 #E8643C | 当前考试 | ✅ 半透明 | 圆形 | 3px |
| 1 | 蓝 #3278D2 | 对比1 | ❌ | 方形 | 2.5px |
| 2 | 紫 #8C3CB4 | 对比2 | ❌ | 三角形 | 2.5px |
| 3 | 绿 #28AA64 | 对比3 | ❌ | 星形 | 2px |

### Tooltip 规则

- **当前考试**：显示详细分数 + 排名（如 `第一次月考: 108/150  班2  校18`）
- **对比考试**：只显示百分比（如 `第二次月考: 72%`），避免手机端误触信息过载

### 关键变量

- `radarChart`：Chart.js 实例
- `selectedCompareIds`：已选对比考试 ID 数组（数字类型）
- `RADAR_COMPARE_STYLES`：4 种样式配置

## Excel 导入导出

### 导出格式

SheetJS 导出为 `.xlsx`，每场考试一个 sheet，sheet 名为考试名称。表头：`科目 | 分数 | 满分 | 班级排名 | 年级排名 | 备注`。总分排名信息在最后一行。

### 导入格式

Excel 第一行为考试信息行：`考试名称, 开始日期, 班级排名, 年级排名, 班级人数, 年级人数`。后续每行为科目数据：`科目名, 分数, 满分, 班级排名, 年级排名, 备注`。

## 常见陷阱

1. **exam.id 是数字类型**，onclick 传参时不要加引号，否则 `indexOf` 严格比较会失败
2. **档案切换下拉框**传的是数组 index 而不是 profile.id
3. **趋势图模式**切换时需要手动调用对应的 update 函数
4. **localStorage 键名带 profileId**，不同档案的数据完全隔离
5. **科目 fullScore 可能为 0 或不存在**，雷达图需要过滤这类科目

## 架构重构计划（Vite 模块化）

### 目标

将当前 4525 行的单文件 `index.html` 拆分为 Vite 多文件模块化项目，提升可维护性和后续扩展能力。

### 重构原则

1. **最小侵入性**：只做文件拆分，不改业务逻辑和 UI
2. **向后兼容**：localStorage 数据结构不变，用户无感知迁移
3. **回退策略**：拆分前备份 `index-legacy-v2.html`，出问题可立即回退
4. **同步修复已知 Bug**：趁重构顺手修掉 `saveExams` 调用 bug

### 目标文件结构

```
成绩管家_web/
├── index.html              ← 纯 HTML 结构（DOM + 弹窗模板）
├── vite.config.js          ← Vite 配置
├── package.json
├── src/
│   ├── main.js             ← 入口文件，初始化 + 事件绑定
│   ├── store.js            ← 全局状态管理（currentExamId, selectedCompareIds 等）
│   ├── storage.js          ← 数据持久化层（策略模式，支持本地/云端切换）
│   ├── modal.js            ← 弹窗组件（showConfirmDialog / showToast）
│   ├── utils.js            ← 工具函数
│   ├── exam-list.js        ← 考试列表渲染与交互
│   ├── exam-detail.js      ← 考试详情渲染与编辑
│   ├── batch.js            ← 批量填写成绩
│   ├── profile.js          ← 档案管理（新增/重命名/删除/切换）
│   ├── chart-trend.js      ← 趋势图（分数/排名折线图）
│   ├── chart-radar.js      ← 雷达图（科目对比）
│   ├── chart-zoom.js       ← 图表放大查看
│   ├── import-export.js    ← Excel 导入导出
│   ├── report.js           ← 分享报告生成
│   └── demo-data.js        ← 示例数据（新用户首次打开注入）
├── dist/                   ← 构建产物（GitHub Pages 部署用）
│   └── index.html          ← 单文件产物
└── index-legacy-v2.html    ← 重构前完整备份
```

### 模块依赖关系

```
main.js（入口）
  ├── store.js（全局状态）
  ├── storage.js（数据层）
  ├── modal.js（弹窗）
  ├── utils.js（工具）
  ├── exam-list.js
  │     ├── storage.js
  │     ├── store.js
  │     └── modal.js
  ├── exam-detail.js
  │     ├── storage.js
  │     ├── store.js
  │     └── modal.js
  ├── chart-trend.js / chart-radar.js / chart-zoom.js
  │     ├── storage.js
  │     └── store.js
  ├── import-export.js
  │     ├── storage.js
  │     └── modal.js
  ├── profile.js
  │     ├── storage.js
  │     └── modal.js
  └── report.js
        ├── storage.js
        └── store.js
```

### 存储层设计（策略模式）

`storage.js` 采用策略模式，根据用户状态（免费/VIP）自动切换存储后端，业务代码零感知：

```javascript
// LocalStrategy — 免费用户，localStorage
const LocalStrategy = {
    async getExams(profileId, excludeHidden) { /* localStorage 读取 */ },
    async saveExams(exams) { /* localStorage 写入 */ },
    async getProfiles() { /* ... */ },
    async saveProfiles(profiles) { /* ... */ },
};

// CloudStrategy — VIP 用户，云端 API
const CloudStrategy = {
    async getExams(profileId, excludeHidden) { /* fetch('/api/exams') */ },
    async saveExams(exams) { /* fetch('/api/exams', { method: 'PUT' }) */ },
    async getProfiles() { /* fetch('/api/profiles') */ },
    async saveProfiles(profiles) { /* fetch('/api/profiles', { method: 'PUT' }) */ },
};

// 统一入口 — 业务代码只调这些
let currentStrategy = LocalStrategy;
export function getExams(...args) { return currentStrategy.getExams(...args); }
export function saveExams(...args) { return currentStrategy.saveExams(...args); }
// ...

// 切换策略（VIP 开通 / 过期时调用）
export function switchToCloud() { currentStrategy = CloudStrategy; }
export function switchToLocal() { currentStrategy = LocalStrategy; }
```

**关键约束**：
- 所有存储接口统一为 `async`，调用方必须 `await`
- 免费用户：数据存 localStorage，单设备使用，不需要登录
- VIP 用户：数据存云端，多设备同步，需要登录

### 数据迁移方案

| 场景 | 做法 |
|------|------|
| 免费用户开通 VIP | 本地数据一次性上传到云端，`switchToCloud()` |
| VIP 过期回退 | 云端数据最后一次下载到本地，`switchToLocal()` |
| 多设备冲突 | 初期用"最后写入胜出" + updatedAt 时间戳，后续可升级 diff 合并 |

### 新增预留模块

| 模块 | 用途 | 状态 |
|------|------|------|
| `storage.js` | 策略模式 + async 接口 | **本次重构实现** |
| `api.js` | HTTP 请求封装 | 占位文件，后端开发时启用 |
| `auth.js` | 登录 / Token / VIP 状态判断 | 后端开发时新增 |
| `sync.js` | 数据迁移、冲突检测、同步状态 | 后端开发时新增 |

### 构建与部署

- **构建工具**：Vite + `vite-plugin-singlefile`（产物为单个 HTML）
- **CDN 大库**：Chart.js / xlsx / html2canvas 不打包，仍通过 CDN 引入
- **部署流程**：`npm run build` → 产物到 `dist/` → 部署到 GitHub Pages
- **开发体验**：`npm run dev` 启动开发服务器，支持 HMR 热更新

### 模块契约规范

每个模块文件顶部应包含注释说明其职责、依赖和对外接口：

```javascript
/**
 * exam-detail.js — 考试详情模块
 *
 * 职责：渲染选中考试的详情、编辑/添加考试、编辑成绩
 *
 * 依赖：
 *   - storage.js：读写考试数据（async）
 *   - store.js：读取 currentExamId
 *   - modal.js：使用 showConfirmDialog / showToast
 *
 * 对外暴露：
 *   - renderExamDetail()：渲染详情页
 *   - openExamModal()：打开编辑考试弹窗
 *   - closeExamModal()：关闭编辑考试弹窗
 *
 * 不负责：
 *   - 不直接修改 store 中的 currentExamId（由 main.js 的 selectExam 处理）
 *   - 不处理图表（由 chart-*.js 负责）
 */
```

### 编码约定

1. **文件大小**：每个模块不超过 300 行
2. **命名规范**：`render` 前缀 = 渲染函数，`open/close` = 弹窗操作，`handle` = 事件处理
3. **注释写"为什么"**：业务规则和历史决策用注释说明，不写显而易见的"是什么"
4. **禁止跨模块直接操作 DOM**：各模块只操作自己的区域
5. **禁止在 storage.js 中调用 UI 函数**
6. **禁止在 store.js 中写业务逻辑**

### 验证清单

重构完成后需手动验证以下功能：

- [ ] 新用户首次打开，自动注入示例数据
- [ ] 创建/切换/删除/重命名档案
- [ ] 添加/编辑/删除考试
- [ ] 成绩录入与编辑（单个 + 批量）
- [ ] 考试详情页显示（总分、各科、排名）
- [ ] 趋势图（分数/排名两种模式切换）
- [ ] 雷达图（科目对比 + 多选对比考试）
- [ ] 图表放大查看
- [ ] Excel 导入导出
- [ ] 分享报告生成
- [ ] 最强/最弱科目分析提示
- [ ] 雷达图默认选中最新考试
- [ ] 移动端响应式布局
- [ ] localStorage 数据兼容（旧用户数据不丢失）

### 当前进度

| 模块 | 状态 |
|------|------|
| `store.js` | ✅ 已完成 |
| `storage.js` | ✅ 已完成 |
| `styles.css` | ✅ 已完成 |
| `modal.js` | ✅ 已完成 |
| `utils.js` | ✅ 已完成 |
| `exam-list.js` | ✅ 已完成 |
| `exam-detail.js` | ✅ 已完成（含 saveExams bug 修复） |
| `batch.js` | ✅ 已完成 |
| `profile.js` | ✅ 已完成 |
| `chart-trend.js` | ✅ 已完成 |
| `chart-radar.js` | ✅ 已完成 |
| `chart-zoom.js` | ✅ 已完成 |
| `import-export.js` | ✅ 已完成 |
| `report.js` | ✅ 已完成 |
| `demo-data.js` | ✅ 已完成 |
| `app.js`（入口） | ✅ 已完成 |
| `index.html` 改为纯 HTML | ✅ 已完成 |
| Vite 构建验证 | ✅ 通过（dist/index.html = 111KB 单文件） |
| 功能回归测试 | ⏳ 待手动验证 |

## ⚠️ 编码注意事项（重要）

### index.html 文件编码必须为 UTF-8（无 BOM）

`index.html` 是纯 UTF-8 编码的单文件 SPA，**绝对不能**使用以下 PowerShell 命令处理该文件：

```powershell
# ❌ 以下操作会把文件转为 UTF-16 LE，导致中文全部乱码：
Get-Content index.html | ... > index.html          # 重定向
Set-Content index.html -Value $content              # 写入
Add-Content index.html -Value $content              # 追加
Out-File -FilePath index.html -InputObject $content   # 输出
```

**正确做法**：使用支持 UTF-8 的方式读写文件：

```powershell
# ✅ 正确：
[System.IO.File]::WriteAllText("index.html", $content, [System.Text.UTF8Encoding]::new($false))
$content = [System.IO.File]::ReadAllText("index.html", [System.Text.UTF8Encoding]::new($false))
```

或直接用编辑器（VS Code、Notepad++ 等）保存时选择 "UTF-8" 编码。

### 历史教训（2026-04-02）

提交 `ef6de07` 和 `a0a353d` 因 PowerShell 操作导致 `index.html` 从 UTF-8 被错误转换为 UTF-16 LE，中文全部损坏。最终从 `bf792a2` 恢复，丢失了以下功能（待重新实现）：

- 新用户首次打开自动注入示例数据
- 雷达图默认选中最新考试
- 最强/最弱科目分析提示

**核心原则**：`index.html` 的中文注释和 UI 字符串是该文件的灵魂，编码一旦损坏极难恢复，务必谨慎操作。
