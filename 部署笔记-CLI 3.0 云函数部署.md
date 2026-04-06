# 部署笔记：TCB CLI 3.0 云函数部署

> 记录时间：2026-04-06 | 项目：成绩雷达 Web 版

## CLI 版本

```
CloudBase CLI 3.0.1
npm: @cloudbase/cli@3.0.1
```

## 正确的部署命令格式

### 单个云函数部署（推荐）

```bash
cd E:\成绩雷达\成绩雷达_web

tcb fn deploy <函数名> --dir <文件夹相对路径> --force --path /<HTTP路径>
```

**示例（新建4个云函数）：**

```bash
tcb fn deploy phonePasswordLogin --dir cloud-functions/phonePasswordLogin --force --path /phonePasswordLogin

tcb fn deploy phoneRegister --dir cloud-functions/phoneRegister --force --path /phoneRegister

tcb fn deploy phoneResetPassword --dir cloud-functions/phoneResetPassword --force --path /phoneResetPassword

tcb fn deploy updateNickname --dir cloud-functions/updateNickname --force --path /updateNickname
```

**示例（更新已有云函数）：**

```bash
tcb fn deploy emailRegister --dir cloud-functions/emailRegister --force --path /emailRegister

tcb fn deploy passwordLogin --dir cloud-functions/passwordLogin --force --path /passwordLogin

tcb fn deploy resetPassword --dir cloud-functions/resetPassword --force --path /resetPassword

tcb fn deploy emailLogin --dir cloud-functions/emailLogin --force --path /emailLogin

tcb fn deploy phoneLogin --dir cloud-functions/phoneLogin --force --path /phoneLogin
```

## 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `函数名` | ✅ | 云函数名称，如 `phonePasswordLogin` |
| `--dir` | ✅ | 指定函数代码文件夹的**相对路径**（相对于项目根目录） |
| `--force` | ✅ | 覆盖同名函数（首次创建也需要加） |
| `--path` | ⚠️ 必须加 | HTTP 访问服务路径，**必须以 `/` 开头**，否则报 `path invalid` |

## 坑点记录（踩过的坑）

### 坑 1：`--path` vs `--dir` 混淆

❌ **错误用法（CLI 2.x 语法，3.0 已废弃）：**
```bash
tcb fn deploy xxx --path cloud-functions/xxx
# 报错：--path 参数已更换为 HTTP 访问服务路径，请使用 --dir
```

✅ **正确做法：**
```bash
tcb fn deploy xxx --dir cloud-functions/xxx --path /xxx
# --dir = 文件夹路径
# --path = HTTP 路由路径（以 / 开头）
```

---

### 坑 2：不加 `--path` 导致 path invalid

❌ **错误用法：**
```bash
tcb fn deploy xxx --dir cloud-functions/xxx --force
# 报错：[CreateCloudBaseGWAPI] path invalid
```

**原因：** CLI 3.0 默认会为每个云函数创建 HTTP 访问路由。如果不指定 `--path`，路由路径为空，校验失败。

✅ **正确做法：** 加上 `--path /函数名`

---

### 坑 3：`entryFile did not find in code or layers`

**现象：**
```
× 部署失败：云函数创建失败
失败信息: [ResourceNotFound.File] entryFile did not find in code or layers
```

**原因分析：** 
- 使用 `--all` 批量部署 + `cloudbaserc.json` 配置文件时出现
- 可能是配置文件中 `path` 或 `functionRoot` 路径格式不兼容

**解决方案：** 不用配置文件和 `--all`，改用单条命令逐个部署：
```bash
tcb fn deploy <函数名> --dir <目录> --force --path /<路由>
```

---

### 坑 4：`--handler` 参数不存在

❌ **错误用法：**
```bash
tcb fn deploy xxx --handler index.main
# 报错：unknown option '--handler'
```

**说明：** CLI 3.0 移除了 `--handler` 和 `--timeout` 等参数。入口函数从 `package.json` 的 `main` 字段自动推测（默认 `index.js` → 入口 `index.main`）。

**确保 `package.json` 配置正确：**
```json
{
  "name": "你的函数名",
  "main": "index.js",
  "dependencies": { ... }
}
```

---

### 坑 5：`cloudbaserc.json` 批量部署 path invalid

使用 `tcb fn deploy --all` 时，即使配置了 `cloudbaserc.json`，仍然报 `path invalid`。

**结论：** 当前版本批量部署有兼容性问题，建议**逐条命令部署**。

## 目录结构要求

每个云函数文件夹内至少包含：

```
cloud-functions/<函数名>/
├── package.json    # 必须有 main: "index.js"
└── index.js        # 入口文件，导出 exports.main
```

## 部署前检查清单

- [ ] 当前工作目录在项目根目录（`E:\成绩雷达\成绩雷达_web`）
- [ ] 已执行过 `tcb login` 登录
- [ ] 函数文件夹内有 `package.json` + `index.js`
- [ ] `package.json` 中 `main` 字段为 `index.js`
- [ ] 命令包含 `--dir`、`--force`、`--path /xxx` 三个参数
