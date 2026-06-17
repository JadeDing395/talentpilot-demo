# TalentPilot（觅talent）

**AI 招聘官引擎** · ArtStation / 微博 / 小红书 三平台并发寻访 + AI 评分 + 候选人库管理 + 人工确认触达

---

## 🚀 下载后第一步（macOS 必做）

下载解压后，在终端粘贴这一行命令，**回车即可解除 macOS 拦截**，然后双击 `start.command` 启动：

```bash
xattr -dr com.apple.quarantine ~/Downloads/talentpilot-demo-main && open ~/Downloads/talentpilot-demo-main/start.command
```

> 如果解压到其他位置，把路径中的 `~/Downloads/talentpilot-demo-main` 替换成实际路径即可。
> 打开「终端」方法：按 `Command + 空格` 搜索「终端」或「Terminal」。

---

## 这能做什么

- 一次填表,在 **ArtStation / 微博 / 小红书** 三平台并发搜索画师 / 原画师 / 插画师
- 你自己接入 AI key,让 Claude / GPT 综合 bio + 作品图给候选人打分(6 维评分)
- 命中的人一键入库,支持标签 / 笔记 / 阶段管理 / 飞书表格导出
- 每个浏览器自动独立候选人库,多人共用同一份代码无冲突
- AI key 和登录态全部本地保存,**不上服务器**

---

## 快速开始(macOS 双击启动)

### 系统要求

- macOS（M1 / Intel 均可）
- Node.js 20+（没装的话先去 [nodejs.org](https://nodejs.org/) 下载安装）
- 第一次启动需要联网下载 Chrome（puppeteer 用，约 200MB）

---

### ⚠️ 第一步：解除 macOS 安全限制（必做，只需一次）

从网上下载的文件，macOS 会自动拦截。按以下步骤解除：

1. 打开「**访达（Finder）**」，找到解压后的 `TalentPilot-demo` 文件夹
2. 打开「**终端**」（在启动台搜索「终端」或「Terminal」）
3. 在终端里输入以下内容（注意最后有一个空格）：
   ```
   xattr -d com.apple.quarantine 
   ```
4. 不要按回车，先把 `start.command` 文件**从 Finder 拖进终端窗口**，路径会自动填入
5. 然后按回车，没有报错即成功
6. 现在可以**双击 `start.command`** 正常启动了

> 如果上面步骤搞不定，也可以：打开「系统设置」→「隐私与安全性」→ 滚到底部 → 找到 `start.command 已被阻止` → 点「仍要打开」

---

### 启动步骤

1. 双击 `start.command`（完成上面的解除步骤后）
2. 首次会自动 `npm install`（约 2-3 分钟，会下载 Chrome，请耐心等）
3. 安装完成后浏览器会**自动打开** `http://localhost:3001`
4. 以后每次双击启动，浏览器会自动弹出，无需手动输地址

### 首次使用

1. **右上角 ⚙️「AI 设置」** 配置:
   - **Base URL**:留空走 Claude / OpenAI 官方;公司内网填网关地址(如 `https://llm-proxy.tapsvc.com`)
   - **API Key**:你自己的 sk-...(全程只存浏览器 localStorage,服务端永不留存)
   - **模型**:下拉里选 Claude 4.7 / 4.6 / GPT-5 / GPT-4o 等;或选「自定义」填 gateway 上的私有 model id
   - **协议**:选模型时自动联动(Claude → Anthropic 原生 / GPT → OpenAI 兼容)
   - 保存时会自动 ping 测试,绿色 ✓ 即接通

2. **扫描渠道卡** — 三张卡片(ArtStation / 微博 / 小红书)选择要扫描的平台:
   - ArtStation:公开 API,**无需登录**
   - 微博 / 小红书:点卡片右侧的「扫码登录」 → modal 显示二维码 → 手机扫码
   - 全程后台 headless,**不会弹任何 Chrome 窗口**

3. **填表 + 开始扫描**
   - 岗位 / JD / 美术风格 / 关键词(支持 IP 名如"原神""鸣潮") / 评分配置
   - 点 `🔍 开始扫描` → 三平台并发抓取 + 实时显示进度 + AI 评分
   - 命中的人会出现在下方,可一键入库

---

## 关键约定(隐私 & 安全)

- **AI Key 永不上服务器**:完全本地 localStorage 存储;每次扫描请求随 body 带给后端使用,后端用完即弃
- **平台登录态本地存**:cookies 落在 `.chrome-profile-weibo` / `.chrome-profile-xhs` 目录,**绝对不会发到外部**
- **候选人库多用户隔离**:每个浏览器一份独立 db(`data/db-{uuid}.json`),无意中开两个浏览器互不污染
- **Token 用量本地累计**:`data/usage-{uuid}.json`,扫描页右上角的 Gateway 配额面板实时显示

---

## 评分维度(默认权重)

| 维度 | 权重 | 说明 |
|---|---|---|
| JD 匹配度 | 35 | 岗位职责 / 作品方向匹配 |
| 关键词匹配 | 20 | 风格 / 工具 / 关键词(IP / 题材) |
| 背景经验 | 15 | 项目级别 / 商业经验 |
| 教育与履历 | 10 | 学历 / 专业 |
| 开放度 | 5 | 约稿 / 求职意向 |
| 粉丝影响力 | 15 | 粉丝量 + 平台认证 |

可在扫描表单 → 「评分维度与权重」折叠区按需调整。**总和必须 = 100** 才能开始扫描。

---

## 风险与限制

- **微博/小红书有反爬机制**,建议:
  - 单次扫描每平台 ≤ 20 人
  - 遇到风控页(captcha / "请勿频繁操作")立刻停扫,等 1-2 小时再来
  - 持续大量扫描可能让你的 IP 被平台标记,建议必要时换网络(4G 热点)
- **登录态有效期**:
  - 微博 cookie 通常 30-90 天
  - 小红书 cookie 通常 30 天
  - 过期会在卡片显示"未登录",点「扫码登录」重扫即可
- **小红书反爬比较严**:即使 cookie 在 disk,服务端可能 invalidate 你的 session。如果扫描报"页面提示需登录",到卡片点右侧「重新登录」小灰链接强制重新扫码

---

## 故障排除

| 现象 | 解决 |
|---|---|
| 双击 `start.command` 提示"无法验证" | 见上方「⚠️ 第一步」，用终端拖拽命令解除一次即可 |
| 终端显示「找不到 node」 | 先去 [nodejs.org](https://nodejs.org/) 装 Node.js 20+ |
| `npm install` 卡死 | 网络问题。可以尝试切换 npm 源:`npm config set registry https://registry.npmmirror.com` |
| 扫描时报"登录态失效" | 到扫描渠道卡片点右侧「重新登录」小链接,重新扫码 |
| 扫描卡很久没结果 | 看终端日志的 `[WB]` / `[XHS]` / `[AS]` 行;可能撞风控,等 1 小时再试 |
| 想清空候选人库 | 关闭服务,删除 `data/` 目录下的所有 `db-*.json` 和 `usage-*.json` 文件 |
| 想停止服务 | 关闭那个终端窗口即可 |

---

## 关于数据

- 启动后会自动在 `data/` 目录下生成你的候选人库 db 文件
- 每个浏览器有自己的 uuid,互不影响
- 数据全在你本机,删除整个项目目录即彻底清除
