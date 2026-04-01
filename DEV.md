# 成绩管家 - 开发文档

> 本文档面向 AI 助手和新开发者，用于快速理解项目架构、数据结构和开发约定。

## 项目概览

- **项目名称**：成绩管家
- **仓库地址**：`git@github.com:lucian-why/chengjuanjia.git`
- **在线地址**：https://lucian-why.github.io/chengjiguanjia/
- **部署方式**：GitHub Pages（推送至 `main` 分支自动部署）
- **当前分支**：`dev/v2-refactor`（开发在 dev 分支，稳定后合入 main）
- **架构**：单文件 SPA（Single Page Application），所有 HTML/CSS/JS 在 `index.html` 一个文件中

## 技术栈

| 依赖 | 版本 | 用途 | 引入方式 |
|------|------|------|----------|
| Chart.js | 4.4.1 | 雷达图、趋势折线图 | CDN |
| SheetJS (xlsx) | 0.18.5 | Excel 导入导出 | CDN |
| Google Fonts | - | Noto Serif SC / Noto Sans SC | CDN |

**没有构建工具**。直接双击 `index.html` 即可运行，无需 npm/webpack/vite。

## 文件结构

```
E:\成绩管家\
├── index.html          # 唯一的生产文件（HTML + CSS + JS 全部内联）
├── README.md           # 项目介绍
├── DEV.md              # 本文档（开发细节）
├── index-legacy.html   # 旧版备份（勿动）
├── inject-test-data.html  # 测试用数据注入页（开发辅助）
├── test-data.js        # 测试数据脚本（开发辅助）
├── click_test1.png     # 测试截图
└── test_page.png       # 测试截图
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
