# Contin Player

Contin Player 是一個以 Video.js v10 建立的 PWA 影片播放器。它可以匯入多份 `playlist.txt`、保存播放清單與每部影片的觀看進度，並在影片結束後接續播放下一部。

## 功能

- 從本機匯入 `playlist.txt`，自訂播放清單名稱
- 透過下拉選單切換多個播放清單
- 重新命名、用新檔案更新或刪除播放清單
- 各清單分別記住目前影片與播放秒數
- 相同影片在更新清單後保留既有進度
- 播放完畢後自動接續下一部
- 倒退／快進 10 秒、上一部／下一部
- 鍵盤 `J`、`L`、`←`、`→` 快速跳轉
- 觸控裝置雙擊播放器左右區域快退／快進
- 可安裝的 PWA 應用程式殼層

## playlist.txt 格式

使用 UTF-8 純文字檔，每行放置一個完整 MP4 URL：

```text
# 空白行和以 # 開頭的註解會被忽略
https://media.example.com/show/show_S1_EP01.mp4
https://media.example.com/show/show_S1_EP02.mp4
```

解析器支援 BOM、LF、CRLF 與含查詢參數的 MP4 URL。無效網址和非 `.mp4` 路徑會在匯入預覽中標示並略過；單一清單最多 500 部影片。

影片伺服器應支援 HTTPS、正確的 `video/mp4` Content-Type 與 HTTP Range Requests，才能穩定拖曳進度。Contin 會以 `Range: bytes=0-0` 檢查來源，並要求回應包含 `206 Partial Content`、`Accept-Ranges: bytes` 及有效的 `Content-Range`；缺少任一項時，播放器會停用跳轉並提供「完整載入影片」的降級方案（單部上限 512 MB）。跨來源 MP4 必須允許正式 Sites 網域與本機開發來源透過 CORS 讀取，並公開上述回應標頭，才能完成檢查與使用降級方案。

## 技術架構

- vinext、React 19、TypeScript
- `@videojs/react@10.0.0-beta.25`
- IndexedDB：播放清單、影片排序、目前影片與播放進度
- Service Worker + Web App Manifest：PWA 應用程式殼層
- OpenAI Sites：建置與部署

本專案沒有後端資料庫，也沒有播放清單 API。原始 `playlist.txt` 只在瀏覽器內解析；清單名稱、影片 URL、排序與觀看進度全部保存在目前瀏覽器的 IndexedDB。MP4 影片仍從原始 URL 串流，不會上傳到 Contin Player。

## 本機開發

需求：Node.js `>=22.13.0`。

```bash
npm install
npm run dev
```

開啟 `http://localhost:3000`。開發版與正式 Sites 網域各自使用獨立的瀏覽器儲存空間，因此本機建立的清單不會自動出現在正式網站。

常用指令：

```bash
npm run typecheck      # TypeScript 型別檢查
npm run lint           # ESLint
npm run build          # 建立 Sites 部署輸出
npm test               # 建置並執行產物測試
```

## 資料模型

- IndexedDB 資料庫：`contin-player`
- `playlists` object store：清單名稱、來源檔名、影片項目、排序、目前影片與逐片進度
- `settings` object store：最後使用的播放清單

播放期間每 10 秒同步一次進度，並在暫停、切換影片、頁面進入背景或關閉時再次保存。下一次開啟時會回到最後的清單、影片與秒數；瀏覽器若禁止有聲自動播放，使用者仍需點擊一次播放。

資料只存在同一個瀏覽器與使用者設定檔，不會跨裝置同步。清除該網站的瀏覽資料、重設瀏覽器設定檔或移除相關網站資料時，清單與進度也會消失。

## PWA 與離線限制

Service Worker 會快取應用程式介面與靜態資產，不會自動快取大型 MP4。離線時可開啟應用程式殼層並讀取本機清單；影片能否播放仍取決於來源檔案是否可連線。

## 部署

專案使用 `.openai/hosting.json` 設定 Sites，並明確不綁定 D1 或 R2。正式 Sites slug 為 `contin-player`。

部署目標：<https://contin-player.poychang.chatgpt.site>

## Git 規範

- 以可驗證的功能為單位提交
- 功能或操作方式改變時同步更新本文件
- 不提交 `.env*`、`.wrangler/`、建置產物、部署憑證或影片檔
