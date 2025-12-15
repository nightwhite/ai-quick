<div align="center">
<img width="1200" height="475" alt="项目横幅" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 本地运行与部署

本仓库包含本地运行所需的一切。

在 AI Studio 查看应用：https://ai.studio/apps/drive/1gC6YketJaa-SZFc3WA3Xg7y2Ekd9zPmk

## 本地运行（网站）

**前置条件：** Node.js

1. 安装依赖：
   ```bash
   npm install
   # or
   pnpm install
   ```

2. （可选）配置 `.env.local`：
   - 默认情况下，页面里的「设置」弹窗会把 Base URL / Key 保存在浏览器 `localStorage`，随用随填即可。
   - 如果你想预置一个保底的 Key / Base URL，可参考 `.env.example` 写入 `VITE_GEMINI_API_KEY`、`VITE_GEMINI_BASE_URL` 等变量；它们会被打包到前端，请确保只在可信环境使用。

3. 启动前端（已不需要任何 Node/API 服务端）：
   ```bash
   npm run dev
   # or
   pnpm dev
   ```
   打开浏览器访问 `http://localhost:3000`，在页面右上角的「设置」中填写各模型的 Base URL / API Token，即可直接从浏览器调用远端接口。

## 说明

- 项目已完全前端化：浏览器会直接访问 Gemini/Veo/Sora 等远端 API，请确保这些 API 开放了 CORS，并且你了解把 Key 暴露在前端的风险。
- 「设置」面板会把每个模型的 Base URL / Key 保存到 `localStorage`，便于日常切换；如果要彻底移除本地记录，可点击设置里的「重置」。
- （可选）你仍可通过 `.env` 为前端提供默认的 `VITE_GEMINI_API_KEY`/`VITE_GEMINI_BASE_URL`，用于无人值守或演示环境。

## 快速验收清单

- 运行 `pnpm dev` → 打开 `http://localhost:3000`，在「设置」中填入远端 API 的 Base URL / Key。
- 切到「图片」：输入提示词即可调用 Gemini REST，支持连续修图（不上传新图时会复用最近一张）。
- 切到「Veo / Sora」：输入提示词即可创建视频任务，前端会轮询 `/v1/videos/:id` 并展示 URL/base64 结果。
