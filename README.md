# AI Quick：生图 / 生成视频示例

这是一个纯前端的生图 + 生成视频示例项目：浏览器直接调用远端 Gemini（图像）和 Veo / Sora（视频）接口，可在本地快速演示“从提示词到图片、从提示词到视频、基于参考图生成视频/首尾帧视频、Sora Remix”等能力。

本仓库包含本地运行所需的一切。

## 功能概览
- 图片：基于 Gemini 生成与连续修图（可复用上一张图）。
- 视频：Veo / Sora 直接由前端发起任务并轮询结果，支持参考图，Veo fl 模型需上传首尾帧；Veo 在 `veo_3_1` / `veo_3_1-fast` 加参考图时自动固定 8 秒。
- Remix：Sora 任务（id 以 `sora-2:` 开头）可在消息中点击 Remix 按钮，用新提示词二次生成。
- 兼容中转站：已验证 `https://api.gbro.site` 可同时代理 Gemini / Veo / Sora（需在「设置」里填入对应 Base URL 与 Token）。
- API 细节：见 `docs/api-usage.md` 与 `docs/veo-sora.md`。

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

## 快速验收清单

- 运行 `pnpm dev` → 打开 `http://localhost:3000`，在「设置」中填入远端 API 的 Base URL / Key。
- 切到「图片」：输入提示词即可调用 Gemini REST，支持连续修图（不上传新图时会复用最近一张）。
- 切到「Veo / Sora」：输入提示词即可创建视频任务，前端会轮询 `/v1/videos/:id` 并展示 URL/base64 结果；Veo 在上传参考图且模型为 `veo_3_1`/`veo_3_1-fast` 时会自动固定 8 秒；带 `fl` 的 Veo 模型需上传首尾帧两张图。
- Sora 任务（id 形如 `sora-2:...`）支持 Remix，点消息里的 Remix 按钮输入新提示词即可基于原视频再生成一版。
- 想在其他项目复用 Veo/Sora 调用方式，可参考 `docs/veo-sora.md`。
