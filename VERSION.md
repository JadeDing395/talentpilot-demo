# TalentPilot 版本记录

## v2.0.0 — 2026-06-11（本地保存，未推 GitHub）

### 品牌
- 全面更名为 **TalentPilot（觅talent）**，旧名 Social Talent Radar 已清除

### 核心功能
- **ICP 反推**：多入口投喂（简历/JD/URL），AI 生成招聘画像，跨页面不被打断
- **官网 JD 抓取**：通用多页抓取（自动翻页/加载更多），心动等动态招聘页可正常召回动画师岗位
- **渠道推荐排序**：ICP 弹窗内根据岗位特征给出渠道优先级建议
- **触达草稿**：AI 千人千面生成触达文案，人工确认 UI

### 召回优化
- **微博**：搜索从"搜正文反推"改为「找人」账号搜索，真正召回画师账号（非路人玩家）
- **小红书**：webpack 内部 API 召回，跳过无效 fetchProfile；401/captcha 给出友好提示
- **ArtStation**：puppeteer 搜艺术家接口

### 评分优化
- 权重再平衡：jd 35→40，education 10→5（社交平台不强要求学历）
- 服务端归一化：修复 followers 越界 bug（followers=21 超限问题）
- 学历信息缺失给中位分，不扣底分

### UI / UX
- 扫描结果页新增平台筛选（全部 / 微博 / 小红书 / ArtStation）
- 猫咪 Loading 动画（真透明 PNG，上下浮动 + 粉色进度条），三处等待场景均适用
- Hydration bug 修复（RadarScanForm localStorage SSR/CSR 不一致）
- 品牌换名后全局无旧字样

### 脱敏 / 安全
- 默认公司 URL 清空（不再硬编码 xd.com）
- 空岗位时禁止反推 ICP，前后端均有拦截
- share/ 分发版：无真实数据、无 .env、无 node_modules、无 chrome profile

---

## v1.0.0 — 2026-05 (commit: 5a848d1)
- 三平台基础版：ArtStation + 微博 + 小红书
- 扫描 + 评分 + 候选人库
