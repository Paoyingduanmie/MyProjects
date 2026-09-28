# AGENTS.md — 项目协作规则

本文件是给 AI 助手（Devin 等）和人类协作者的项目规则说明。在本仓库中工作时请遵守以下约定。

## 仓库定位

`MyProjects` 是一个小型项目集合仓库。每个独立小项目放在仓库根目录下的独立子目录中，互不干扰，共享本规则文件。

## 目录结构约定

```
MyProjects/
├── AGENTS.md            # 本文件
├── README.md            # 仓库总览
├── web/                 # 网页/PWA 项目（devin-mobile：Devin 移动端）
├── app/                 # 原生/壳应用类项目
├── tools/               # 小工具、脚本类
├── playground/          # 独立小项目（小游戏、玩具、实验品），每个一个子目录
│   ├── <game>/          #   单文件 web 小游戏（index.html）
│   ├── android/         #   小游戏合集安卓壳：打包所有 <game>/index.html 上 launcher
│   └── dist/            #   合集 APK 分发（在线更新用 version.json + apk）
```

- 按类型分目录：`web/` 网页、`app/` 应用、`tools/` 工具脚本、`playground/` 独立小项目（单文件 web 游戏放 `playground/<game>/`，`playground/android/` 自动把它们打进合集 APK）。同类有多项目时在分类下再建子目录。
- 项目目录名使用小写 kebab-case（如 `todo-cli`、`image-resizer`）。
- 共享的工具链/SDK 不放进仓库，由云端环境（`~/toolchains` + blueprint）提供。

## 代码规范

- 优先最小改动：只做任务要求的修改，不顺手重构无关代码。
- 遵循各项目目录内已有的代码风格和依赖管理方式，不随意引入新框架。
- 每个项目在其 README 里写清楚：用途、环境要求、运行命令、测试命令。
- 不提交密钥、token、`.env` 等敏感文件；需要密钥时用环境变量引用。

## Git 工作流

- 主分支为 `main`，所有改动通过 PR 合入，不直接推 main。
- 分支命名：`devin/<时间戳>-<简短描述>`（AI 会话默认）或 `<类型>/<描述>`（如 `feat/add-timer`）。
- 提交信息用简洁祈使句说明"做什么"，必要时在正文写"为什么"。

## PR 规范

- PR 描述包含：改动动机（为什么）、主要改动点、如何验证。
- 一个 PR 只做一件事；跨项目的改动拆成多个 PR。

## 验证要求

- 有测试的项目：改动后运行该项目的测试。
- 无测试的小项目：至少验证主入口能正常启动/运行。
- 有 lint/typecheck 配置的项目必须跑过再发 PR。

## 本机环境与快速同步（Windows 主机）

- **本地克隆**：`D:\MyProjects`
- **远程**：`git@gitlab.com:moonnancy881-dotcom/myprojects.git`（SSH）
  - SSH key：`~/.ssh/id_ed25519_gitlab`（`~/.ssh/config` 已配 `Host gitlab.com`）
  - HTTPS 备用：`https://gitlab.com/moonnancy881-dotcom/myprojects.git`
- **默认分支**：`main`
- **快速同步命令**：
  ```bash
  cd /d/MyProjects
  git pull --rebase            # 拿云端 MR 合入的代码
  git status                   # 本地改动 add/commit/push
  ```
- **MR 合入方式**：无 GitLab API token 时，可本地 `git merge <MR分支>` 后 `git push origin main`，GitLab 自动识别 MR 为 merged。
- **`web/` = devin-mobile（Devin 移动端 PWA）**：`config.json`（含 api_key/PAT）被 gitignore，每台机器各自维护，绝不提交。
- **注意**：python 直接写 Z:/网络盘文件会被公司 DLP 透明加密（IDE/node 读到密文），改仓库文件用本机 `C:\` 路径，或用 bash 重定向/`cp` 写 Z:。
