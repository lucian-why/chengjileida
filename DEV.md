# 成绩管家 - 开发文档

> 本文档面向 AI 助手和新开发者，用于快速理解项目架构、数据结构和开发约定。

## 项目概览

- **项目名称**：成绩雷达
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
E:\成绩雷达\成绩雷达_web\
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

## 注册/登录合并模式（2026-04-06）

### 背景

原系统只有验证码登录一种方式，且前后端架构不统一：
- 前端用 Cloudbase Auth SDK 的 `getVerification`/`signInWithEmail`
- 后端有自建云函数 `emailRegister`/`passwordLogin`/`resetPassword` 但未接入前端
- 导致验证码登录一直报 `verification_id and verification_code required` 错误

本次重构统一为**混合架构**：

| 功能 | 走的通道 | 说明 |
|------|----------|------|
| 发送验证码 | **腾讯云官方 Auth SDK** | `auth.getVerification()`，走官方邮件通道 |
| 验证码注册/登录 | **自建云函数 `emailRegister`** | 自动判断新用户注册 / 老用户登录 |
| 密码登录 | **自建云函数 `passwordLogin`** | 邮箱 + 密码，不需要验证码 |
| 重置密码 | **自建云函数 `resetPassword`** | 邮箱 + 验证码 + 新密码 |

### 设计方案：合并模式（无感注册）

**核心思路**：不区分"注册"和"登录"两个入口，用户只看到一种操作——输入邮箱 + 验证码点登录。

- **新用户**：首次用验证码登录 → 云函数自动创建账号 → 返回"注册成功"
- **老用户**：直接用验证码或密码登录 → 返回"登录成功"
- **密码可选**：验证码模式下可填密码也可留空；填了以后就能用密码登录
- **昵称暂不做**：后续在个人中心实现昵称设置功能

### UI 交互

```
┌─────────────────────────────┐
│         ×                   │
│       成绩雷达               │
│  登录后可启用云端备份与多端同步 │
│                             │
│  邮箱                        │
│  ┌───────────────────────┐   │
│  │ 请输入常用邮箱地址      │   │
│  └───────────────────────┘   │
│                             │
│  验证码                      │
│  ┌────────────┐ ┌─────────┐ │
│  │ 输入6位验证码 │ │发送验证码│ │
│  └────────────┘ └─────────┘ │
│                             │
│  设置密码 (可选)              │
│  ┌───────────────────────┐   │
│  │ 留空则仅使用验证码登录   │   │
│  └───────────────────────┘   │
│                             │
│    或使用密码登录 ▸          │
│                             │
│  ┌───────────────────────┐   │
│  │     验证码登录          │   │
│  └───────────────────────┘   │
│  ┌ 暂不登录，返回页面 ─────┐  │
│  └────────────────────────┘  │
│                             │
│  （状态提示区）                │
└─────────────────────────────┘
```

点击"或使用密码登录 ▸"后切换为：

```
  密码
  ┌───────────────────────┐
  │ 请输入登录密码          │
  └───────────────────────┘

  ◂ 返回验证码登录

  ┌───────────────────────┐
  │       密码登录          │
  └───────────────────────┘
```

### 改动清单

#### 1. `src/cloud-tcb.js` — 完全重写

- **移除**：Cloudbase Auth SDK 的 `getAuth()`、`authInstance` 单例、`read/writeVerificationInfo()`、`mapAuthUser()`(旧版)
- **新增**：
  - `sendEmailCode(email)` — 改为每次新建 SDK 实例调 `auth.getVerification()`，不再缓存 auth 实例
  - `emailCodeLogin(email, code, [password])` — 调用云函数 `emailRegister`，支持可选密码参数
  - `passwordLogin(email, password)` — 调用云函数 `passwordLogin`
  - `resetPassword(email, code, newPassword)` — 调用云函数 `resetPassword`
  - `normalizePassword()` — 密码校验（6~64 字符）
  - `mapCloudUser()` — 将云函数返回格式映射为前端统一格式
- **保留**：`initTCB() / callFunction() / saveAuthSession() / clearAuthStorage() / verifyToken() / getCurrentUser() / signOut()` 等

#### 2. `src/auth.js` — 新增导出

- **新增导出**：`emailCodeLogin(email, code, [pwd])`、`passwordLogin(email, pwd)`、`resetPassword(email, code, pwd)`
- **保留兼容**：`emailLogin(email, code)` 仍可用（内部转发到 `emailCodeLogin`）

#### 3. `src/login-ui.js` — UI 重构

- **移除**：`VERIFICATION_INFO_KEY` 相关的本地读取/恢复逻辑（不再需要 localStorage 中转 verification info）
- **新增**：
  - 双模式切换：验证码模式（默认）/ 密码模式（点击切换）
  - 可选密码输入框（验证码模式下的"设置密码(可选)"）
  - 发送验证码按钮 60s 倒计时
  - 模式切换按钮 `.login-mode-switch`
  - 提交按钮文字随模式变化："验证码登录" ↔ "密码登录"
- **每次打开重置**为验证码模式，避免状态残留

#### 4. `src/styles.css` — 新增样式

- `.login-mode-switch` — 模式切换按钮样式
- `.switch-arrow` + hover 动画
- `.login-inline-row` — 验证码行内布局（从旧代码中提取确认存在）

### 云函数接口约定

#### `emailRegister` — 验证码注册/登录

```json
// 请求
{ "email": "user@example.com", "code": "123456", "password": "可选" }
// 成功响应
{ "code": 0, "message": "注册成功/登录成功", "data": { "token": "...", "user": { ... }, "expiresIn": 604800 } }
// 错误码：400(参数错) 401(验证码无效) 409(已注册)
```

#### `passwordLogin` — 密码登录

```json
// 请求
{ "email": "user@example.com", "password": "xxxxxx" }
// 成功响应同上
// 错误码：400(参数错) 401(账号/密码错) 402(未设密码) 403(被禁用)
```

#### `resetPassword` — 重置密码

```json
// 请求
{ "email": "...", "code": "123456", "newPassword": "xxxxxx" }
// 错误码：400 401(验证码无效) 404(未注册)
```

### 验证要点

- [ ] 默认显示验证码登录界面
- [ ] 发送验证码后按钮进入 60s 倒计时
- [ ] 新用户首次验证码登录 → 自动注册成功（控制台显示"注册成功"）
- [ ] 老用户验证码登录 → 正常登录
- [ ] 切换到密码模式 → 显示密码输入框，提交按钮变为"密码登录"
- [ ] 密码登录正常工作
- [ ] 验证码模式下设置可选密码 → 注册同时设密，之后可以用密码登录
- [ ] 验证码模式不填密码 → 仅验证码登录，不影响后续设密码
- [ ] 构建通过：`npm run build` → dist/index.html 单文件输出

## 验证码登录优化（2026-04-05）

### 背景 / Bug

用户发送邮箱验证码后，若误触关闭登录弹窗（点击 ×、取消按钮、按 Escape、或点击遮罩层），再次打开登录页时虽然邮箱和验证码输入框的值还在，但点击「验证码登录」会提示"请先发送验证码"，导致已发的验证码无法复用。

### 根因（更新：2026-04-05 深度排查）

**表面现象**：`cloud-tcb.js:184` 的 `emailLogin()` 对 verification_info 做了前端校验。

**真正根因**：项目使用 `@cloudbase/js-sdk@^2.27.2`（v2 版本），v2 的 `signInWithEmail` 要求传入 `getVerification` 返回的**完整 verificationInfo 对象**。但原代码在发送验证码后**只拆存了 `verification_id` 和 `is_user` 两个字段**，登录时自己拼了一个不完整的对象回传。SDK 收到不完整的 verificationInfo → 报 `verification_id and verification_code required`。

```js
// ❌ 原代码：拆散存储 + 重组时丢失字段
writeVerificationInfo({
  email,
  verification_id: info.verification_id,  // 只存了一个字段
  is_user: info.is_user
});
// 登录时：
signInWithEmail({ verificationInfo: { verification_id, is_user } })  // 不完整！

// ✅ 修复后：存储完整对象，登录时原样回传
writeVerificationInfo({ email, rawVerificationInfo: info });  // 整个对象存下
// 登录时：
signInWithEmail({ verificationInfo: storedInfo.rawVerificationInfo })  // 原样传回
```

**误触关闭弹窗后验证码失效的连锁原因**：由于 verificationInfo 对象不完整，即使 localStorage 里数据还在、前端校验通过，SDK 层面也会因为缺少必要字段而拒绝 → 用户感知为"验证码失效"。

### 改动清单

#### 1. `src/cloud-tcb.js` — `emailLogin()` 容错处理

- **移除硬性前置拦截**（原第 184~186 行）
- 改为"有 verification_info 就带上尝试调用 SDK，没有也允许调用（让服务端决定）"
- 新增**验证码错误语义识别**：SDK 返回的错误信息若包含 `验证码|verification|expired|invalid|过期|无效` 等关键词，返回明确提示「验证码已过期或无效，请重新发送」而非笼统的"登录失败"

#### 2. `src/login-ui.js` — 登录页状态恢复 + 关闭提示

- **新增本地 `readVerificationInfo()` 函数**：从 `localStorage`（key: `tcb_email_verification_info`）读取验证信息，避免依赖 cloud-tcb.js 内部实现
- **`showLoginPage()` 增强**：打开登录页时自动检测是否有之前发送但未使用的 `verification_info`
  - 若有 → 自动填入之前使用的邮箱地址（仅当输入框为空时）
  - 显示友好提示：「✉️ 之前已发送过验证码（可能仍有效），可直接输入验证码尝试登录」
- **`hideLoginPage()` 增强**：关闭/取消登录页时检测是否残留未使用的 `verification_info`
  - 若有 → 显示短暂浮层 toast（2.5s 自动消失）：「验证码仍有效，随时回来继续登录」
- **新增 `showTransientToast()` 工具函数**：纯 DOM 实现，不依赖外部框架，固定定位显示在页面顶部中央

### 改动文件汇总

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `src/cloud-tcb.js` | Bug 修复 + 容错 | `emailLogin()` 移除硬性拦截，改为宽容策略 + 语义化错误提示 |
| `src/login-ui.js` | 体验优化 | 登录页打开时自动恢复验证码状态；关闭时显示 toast 提示 |

### 验证要点

- [ ] 发送验证码 → 关闭弹窗 → 重新打开 → 邮箱自动填充 + 显示"验证码可能仍有效"提示
- [ ] 发送验证码 → 关闭弹窗 → 页面顶部出现蓝色 toast "验证码仍有效，随时回来继续登录"
- [ ] 验证码未过期时直接输入验证码可成功登录
- [ ] 验证码已过期时显示明确的"请重新发送"提示
- [ ] 未发送过验证码时正常提示"请先发送验证码"
- [ ] 正常流程（发验证码→立即输入→登录）不受影响
