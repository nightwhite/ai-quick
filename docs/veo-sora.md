# Veo / Sora 接入说明

本项目的 Veo / Sora 调用是纯前端实现（`api.ts`），浏览器直接向远端视频生成服务发请求。下面抽出通用做法，便于在其他项目中复用。

## 基本思路
- 前端收集提示词、时长、分辨率、参考图等参数。
- 调用 `/v1/videos` 创建任务，得到 `id`。
- 轮询 `/v1/videos/:id`，直到任务完成，解析返回的 `video_url` 或 `video_base64`。

## 配置
- 所有视频提供方都用 `Bearer <API Token>` 方式鉴权。
- Base URL 与 Token 优先读「设置」里 per-provider 配置；为空时回退到 shared 配置（见 `ensureVideoConfig`）。
- 必填项：`baseUrl`（不带末尾 `/`）与 `apiKey`；缺失时直接报错提示用户补全。

## 创建视频任务（POST `/v1/videos`）
核心实现：`createVideoJob` in `api.ts`。
```ts
const formData = new FormData();
formData.append("model", model);          // Veo: veo_3_1 / veo_3_1-fast / ...；Sora: sora-2-hd / sora2
formData.append("prompt", prompt);
formData.append("seconds", clampDuration(provider, duration, model, hasReferenceImage));
formData.append("size", size);            // e.g. 1280x720 / 720x1280
formData.append("ratio", aspectRatio);    // "16:9" / "9:16"
imageParts.forEach((img, idx) => formData.append("input_reference", blobFromBase64(img), "reference" + idx));

await fetch(`${baseUrl}/v1/videos`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: formData });
```

### 时长策略
- Sora：允许 10、15 秒，默认 10。
- Veo：默认允许 2/4/6/8/10/15 秒；当 `model` 为 `veo_3_1` 或 `veo_3_1-fast` 且传了参考图时，强制 8 秒（`clampDuration` 里实现）。

### 参考图上传
- 支持多张参考图，字段名统一为 `input_reference`，值是 Blob。
- Blob 由 base64 转二进制再包装，保留原 mime（见 `createVideoJob` 内部 `Blob` 构造）。

## 查询任务（GET `/v1/videos/:id`）
核心实现：`getVideoJobStatus` in `api.ts`。
```ts
const res = await fetch(`${baseUrl}/v1/videos/${encodeURIComponent(jobId)}`, {
  headers: { Authorization: `Bearer ${apiKey}` },
});
const payload = await res.json();
const status = (payload.status || "").toLowerCase();
const done = !["queued","pending","processing","running","generating","in_progress"].includes(status);
```

### 结果解析
- 状态非 pending 后，`buildVideoPartsFromPayload` 会从以下字段择一提取：
  - URL：`video_url` / `url` / `output_url` / `result_url` / `video` / `output` / `videos[]` / `outputs[]`。
  - Base64：`video_base64` / `base64` / `content`（也会查 nested `video` 对象）。
- 若 `status` 为 `failed/error/cancelled`，直接返回错误文案。

## Sora Remix（POST `/v1/videos/:id/remix`）
本项目对 Sora 2 增加了 Remix 入口，API 兼容示例：
```bash
curl -X POST "$BASE/v1/videos/<job_id>/remix" \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"把视频里的小猫改成小狗"}'
```
前端调用在 `createSoraRemixJob` 中实现，成功会返回新的 `id`，之后继续用 `getVideoJobStatus` 轮询。

## 快速复用
1) 复制 `api.ts` 中与视频相关的函数：`ensureVideoConfig`、`clampDuration`、`createVideoJob`、`getVideoJobStatus`、`buildVideoPartsFromPayload`。  
2) 在 UI 侧收集 `prompt`、`model`、`seconds`、`ratio`、`size`、参考图 base64，并传入 `createVideoJob`。  
3) 拿到 `jobId` 后按固定间隔调用 `getVideoJobStatus`；`parts` 中含最终视频 URL/base64，直接渲染即可。  
4) 保持 `Authorization: Bearer` 头和 `/v1/videos` 路径不变，即可兼容 Veo/Sora 目前的中转服务实现。

如需完全自定义 UI，只要遵循上述请求/解析约定即可，无需依赖本项目的其他状态管理。
