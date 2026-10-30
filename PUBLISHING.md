# 发布 / 分发这份 fork

这是给你（发布者）看的。收件人只需要看 `README.md` / `README.zh-CN.md`。

## 这个仓库为什么能直接装

- `dist/` 是**预构建产物**，已随仓库提交；`package.json` 里**没有** `scripts`、没有
  `devDependencies`。所以别人装的时候不会有 `prepare` / `postinstall` 跑起来，
  也就不会撞上 pnpm 的 build 审批门（`allowBuilds`）。
- `package.json` 的 `files` 只放 `dist` / `bundle` / `locale` / `icon.svg`，
  所以 git 安装时 pnpm 打出来的包不会带上 `.backups/`、`.pooltest/`、README 之外的东西。
- 换行统一 LF（`.gitattributes` 已固定），`bundle/cordis.patch.yml` 尤其不能变 CRLF。

## 推上去

这台机器上没装 git，先装：

```powershell
winget install --id Git.Git -e
```

装完**重开一个终端**（PATH 才生效），确认：

```powershell
git --version
```

然后在**本仓库目录**（就是你现在放 `package.json` 的这个文件夹）里：

```powershell
git init -b main
git config user.name  "你的名字"
git config user.email "你的邮箱"
git add -A
git status --short          # 应该只有 50 个文件，且不含 .backups/ .pooltest/
git commit -m "dsh-model-pool 0.1.0: fork of dsh-llm-fallbacks 0.6.5, official-tail gate removed"
```

建一个空的 GitHub 仓库（**不要**勾选自动生成 README / .gitignore / LICENSE，
否则第一次 push 会冲突），然后：

```powershell
git remote add origin https://github.com/<你的账号>/dsh-model-pool.git
git push -u origin main
```

## 建议顺手做的两件事

1. 在 `package.json` 顶层加真实仓库地址（可选，只影响 npm 页面的链接）：

   ```json
   "repository": { "type": "git", "url": "https://github.com/<你的账号>/dsh-model-pool.git" }
   ```

2. 打个 tag，别人就能锁版本：`git tag v0.1.0 && git push --tags`。
   收件人可以用 `github:<账号>/dsh-model-pool#v0.1.0` 指定这个 tag。

## 收件人怎么装

```sh
dsh plugin --profile web add github:<你的账号>/dsh-model-pool
```

或在 DSH Desktop 的 **设置 → 插件** 安装框里填同样的 `github:<账号>/dsh-model-pool`。

三条硬性前提（漏一条就装不上或不起作用）：

- 对方机器要能访问 GitHub（或配好代理）。
- 对方的 DSH 宿主版本要满足 `@deepseek-ai/* ^0.2.0-rc.2`。
- 对方**不能**同时装官方 `dsh-llm-fallbacks` —— patch 行 id `llm-fallbacks` 是共用的。
- 装完必须**重启 DSH Desktop**；重启后池是空的，得自己在
  **设置 → 插件配置 → 模型池** 里填 `rootChain`（设置 → 通用 里那一行只是只读状态）。

## 以后改代码怎么发版

`dist/` 是提交进仓库的，改完 `dist/` 必须一起提交，否则别人装到的是旧代码。
改的时候按顺序：

1. 改 `dist/index.js` / `dist/client/index.js`（这两个是 bundle，直接编辑）
2. `ELECTRON_RUN_AS_NODE=1 "<DSH Desktop 路径>" dist/index.js --check` 确认语法
3. 把 `package.json` 的 `version` 加一格
4. `git add -A && git commit && git tag vX.Y.Z && git push --tags`

测过的探针脚本不在仓库里（`.pooltest/` 已在 `.gitignore` 中）：
`effort-probe.mjs` 验推理档位并集与就近映射，`adapter-probe.mjs` 驱动真实 adapter 验路由与错误码，
`check-links.mjs` 验 README 锚点，`scan-repo.mjs` 扫本地路径与密钥。
