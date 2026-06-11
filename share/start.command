#!/bin/bash
# TalentPilot（觅talent）— 本地启动脚本（macOS 双击运行）
# 用法：双击 start.command；首次运行会自动 npm install。

set -e

cd "$(dirname "$0")"

# 找 node：优先 PATH，再尝试 nvm 默认
if ! command -v node >/dev/null 2>&1; then
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    export NVM_DIR="$HOME/.nvm"
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  echo "❌ 找不到 node。请先安装 Node.js 20+（推荐 https://nodejs.org/）"
  echo "按任意键退出..."
  read -n 1
  exit 1
fi

echo "✓ 使用 node $(node -v)"

# 首次或缺依赖时安装
if [ ! -d node_modules ]; then
  echo "📦 首次启动，正在安装依赖（约 2-3 分钟，请耐心等）..."
  npm install
fi

PORT="${PORT:-3000}"

echo ""
echo "============================================================"
echo "🚀 TalentPilot 启动中..."
echo "服务地址: http://localhost:$PORT"
echo "首次使用："
echo "  1) 右上角「AI 设置」填入 API Key"
echo "  2) 切到 微博/小红书 扫描页，点「未登录」按钮扫码"
echo "  3) 填表 → 开始扫描"
echo "停止服务: 关闭这个终端窗口"
echo "============================================================"
echo ""

# 用 dev 模式启动（最终用户体验更稳；首次访问每页要编译几秒，之后秒开）
# 多用户隔离开启：每个浏览器一份独立 db
RADAR_MULTI_USER=true PORT=$PORT npm run dev
