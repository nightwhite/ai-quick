# API 调用速览（Gemini / Veo / Sora）

整理了本项目前端直连的主要接口写法，便于复用或排查。

## 通用
- 认证：`Authorization: Bearer <API_KEY>`（Gemini 图像接口使用 `x-goog-api-key`）。
- Base URL：示例使用兼容的中转站 `https://api.gbro.site`，可替换为你的代理或官方地址；不要带末尾 `/`。
- 所有示例均假设前端直连，需确认目标服务开放 CORS。

## Gemini 连续生图
- Endpoint：`POST {BASE}/models/{MODEL}:generateContent`
- MODEL：`gemini-3-pro-image-preview`（1K/2K），`gemini-3-pro-image-preview-4k`（4K）
- Header：`Content-Type: application/json`，`x-goog-api-key: <API_KEY>`
- Body：
```json
{
  "contents": [
    {"role": "user", "parts": [{"text": "美女自拍"}]},
    {"role": "model", "parts": [{"text": "图片已根据上一轮请求生成。"}]}
  ],
  "generationConfig": {
    "responseModalities": ["image"],
    "imageConfig": { "aspectRatio": "16:9", "imageSize": "2K" }
  }
}
```
- 返回：`candidates[0].content.parts` 中的 `inlineData`（base64 图片）或 `text`。

## Veo / Sora 生成视频
- 创建：`POST {BASE}/v1/videos`（`multipart/form-data`）
  - 字段：
    - `model`: Veo 如 `veo_3_1` / `veo_3_1-fast` / `veo_3_1-fl` / `veo_3_1-fast-fl`；Sora 用 `sora-2`
    - `prompt`: 文本提示
    - `seconds`: 时长；`veo_3_1`/`veo_3_1-fast` 且带参考图时强制 8s
    - `size`: `1280x720` / `720x1280` 等
    - `ratio`: `16:9` / `9:16`
    - `input_reference`: 参考图二进制，可多张；Veo `fl` 模型需首帧/尾帧两张
- 查询：`GET {BASE}/v1/videos/{id}`
  - `status` 进入非 pending 后，从返回的 `video_url` / `url` / `output_url` 等字段取视频 URL，或 `video_base64`/`base64` 取 base64。
  - `status` 为 `failed`/`error`/`cancelled` 时读取 `error.message`/`message` 作为失败文案。

## Sora Remix
- Endpoint：`POST {BASE}/v1/videos/{id}/remix`
- Header：`Authorization: Bearer <API_KEY>`，`Content-Type: application/json`
- Body：`{"prompt":"把视频里的小猫改成小狗"}`，返回新 `id`；轮询同上。
