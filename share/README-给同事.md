# TalentPilot（觅talent） — 同事版使用说明

三平台 AI 招聘官引擎：**ArtStation + 微博 + 小红书**

## 安装

需要先装 [Node.js 20+](https://nodejs.org/)。

```bash
# 1. 进目录
cd TalentPilot/share

# 2. 装依赖
# ⚠️ 用 npm ci,不要用 npm install,避免 puppeteer / patch-package 版本漂移
npm ci

# 3. 配环境变量
cp .env.example .env
# 打开 .env,填入你自己的 LITELLM_API_KEY
# 如走官方 Anthropic / 代理网关,再按需补 ANTHROPIC_BASE_URL / MODEL

# 4. 启动
chmod +x start.command
./start.command
```

启动后访问 **http://localhost:3000/scan**。

## 这版包含什么

- ICP 投喂面板：公司 URL / 一句话 / 成功简历 / 标杆主页
- 官网招聘页抓真实 JD：抓岗位列表 → 点选岗位 → 回填 ICP 的 `position` / `jd`
- 千人千面触达草稿：每个候选人单独生成，**必须人工确认**才会标记发送
- 三平台扫描：ArtStation / 微博 / 小红书

## 关键约定

- AI Key 不随代码分发，**你自己在 `.env` 或页面 AI 设置里填**
- `share/data/` 里没有真实候选人数据，只放了空库占位
- 微博 / 小红书登录态只保存在你本机的浏览器 profile，不会打包进这个目录

## 评分默认权重

- `JD 匹配度`: 40
- `关键词匹配`: 20
- `背景经验`: 15
- `教育与履历`: 5
- `开放度`: 5
- `粉丝影响力`: 15

原则：**作品契合优先，学历信息缺失不再被系统性打低分。**

## 常见问题

**Q: 启动后微博 / 小红书显示未登录？**  
A: 在扫描页顶部的平台卡片里点「扫码登录」，登录态会只保存在你本机。

**Q: AI 调用报未配置？**  
A: 先检查 `.env` 里的 `LITELLM_API_KEY`，或者页面右上角「AI 设置」是否已填。

**Q: 端口 3000 被占了？**  
A: `lsof -ti:3000 | xargs kill -9` 后重启。
