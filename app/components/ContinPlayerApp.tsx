"use client";

import {
  Gesture,
  Hotkey,
  SeekButton,
  createPlayer,
} from "@videojs/react";
import { Video, VideoSkin, videoFeatures } from "@videojs/react/video";
import {
  type ChangeEvent,
  type FormEvent,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createPlaylist,
  deletePlaylist as deleteStoredPlaylist,
  getActivePlaylistId,
  getPlaylist,
  listPlaylists,
  savePlaybackProgress,
  setActivePlaylist,
  setCurrentPlaylistItem,
  updatePlaylist,
  type PlaylistDetail,
  type PlaylistInputItem,
  type PlaylistItem,
  type PlaylistSummary,
} from "../lib/playlist-store";

const Player = createPlayer({ features: videoFeatures });
const SAVE_INTERVAL_MS = 10_000;

interface ParsedFile {
  items: PlaylistInputItem[];
  invalidLines: number[];
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remainder = whole % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function titleFromUrl(value: string, index: number) {
  try {
    const segment = new URL(value).pathname.split("/").filter(Boolean).at(-1) ?? "";
    const decoded = decodeURIComponent(segment).replace(/\.mp4$/i, "");
    return decoded.replace(/[_-]+/g, " ").trim() || `影片 ${index + 1}`;
  } catch {
    return `影片 ${index + 1}`;
  }
}

function parsePlaylistText(text: string): ParsedFile {
  const items: PlaylistInputItem[] = [];
  const invalidLines: number[] = [];
  text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .forEach((rawLine, lineIndex) => {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) return;
      try {
        const url = new URL(line);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error();
        if (!url.pathname.toLowerCase().endsWith(".mp4")) throw new Error();
        if (items.length >= 500) throw new Error();
        items.push({ url: url.toString(), title: titleFromUrl(line, items.length) });
      } catch {
        invalidLines.push(lineIndex + 1);
      }
    });
  return { items, invalidLines };
}

function fileBaseName(filename: string) {
  return filename.replace(/\.[^.]+$/, "").trim() || "我的播放清單";
}

function PlayerPanel({
  playlistId,
  item,
  previous,
  next,
  autoPlay,
  onSelect,
  onProgress,
}: {
  playlistId: string;
  item: PlaylistItem;
  previous: PlaylistItem | null;
  next: PlaylistItem | null;
  autoPlay: boolean;
  onSelect: (itemId: string, autoPlay?: boolean) => void;
  onProgress: (
    itemId: string,
    progress: Pick<PlaylistItem, "currentTime" | "duration" | "completed" | "progressUpdatedAt">,
  ) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const resumeApplied = useRef(false);
  const lastSavedAt = useRef(0);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [playlistFinished, setPlaylistFinished] = useState(false);

  const saveProgress = useCallback(
    (media: HTMLVideoElement, completed = false) => {
      const progress = {
        playlistId,
        itemId: item.id,
        currentTime: media.currentTime,
        duration: Number.isFinite(media.duration) ? media.duration : 0,
        completed,
      };
      const progressUpdatedAt = new Date().toISOString();
      onProgress(item.id, {
        currentTime: progress.currentTime,
        duration: progress.duration,
        completed,
        progressUpdatedAt,
      });
      void savePlaybackProgress(progress).catch((reason) => {
        console.error("Unable to save playback progress to IndexedDB", reason);
      });
      lastSavedAt.current = Date.now();
    },
    [item.id, onProgress, playlistId],
  );

  useEffect(() => {
    const persistBeforeLeaving = () => {
      const media = videoRef.current;
      if (media && media.currentTime > 0 && !media.ended) {
        saveProgress(media);
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") persistBeforeLeaving();
    };
    window.addEventListener("pagehide", persistBeforeLeaving);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", persistBeforeLeaving);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [saveProgress]);

  const onLoadedMetadata = (event: SyntheticEvent<HTMLVideoElement>) => {
    const media = event.currentTarget;
    videoRef.current = media;
    if (!resumeApplied.current) {
      const resumeAt = Math.max(0, item.currentTime);
      if (resumeAt > 1 && resumeAt < media.duration - 1) media.currentTime = resumeAt;
      resumeApplied.current = true;
    }
    if (autoPlay) {
      void media.play().catch(() => setAutoplayBlocked(true));
    }
  };

  const onTimeUpdate = (event: SyntheticEvent<HTMLVideoElement>) => {
    if (Date.now() - lastSavedAt.current >= SAVE_INTERVAL_MS) {
      saveProgress(event.currentTarget);
    }
  };

  const onEnded = (event: SyntheticEvent<HTMLVideoElement>) => {
    saveProgress(event.currentTarget, true);
    if (next) {
      onSelect(next.id, true);
    } else {
      setPlaylistFinished(true);
    }
  };

  const selectSibling = (sibling: PlaylistItem | null) => {
    const media = videoRef.current;
    if (media && media.currentTime > 0) saveProgress(media);
    if (sibling) onSelect(sibling.id);
  };

  return (
    <section className="player-card" aria-label="影片播放器">
      <div className="now-playing">
        <div>
          <span className="eyebrow">現正播放</span>
          <h1>{item.title}</h1>
        </div>
        <span className="episode-pill">第 {item.position + 1} 部</span>
      </div>

      <Player.Provider>
        <div className="video-stage">
          <VideoSkin className="contin-video-skin">
            <Video
              ref={videoRef}
              src={item.url}
              playsInline
              preload="metadata"
              onLoadedMetadata={onLoadedMetadata}
              onTimeUpdate={onTimeUpdate}
              onPause={(event) => saveProgress(event.currentTarget)}
              onEnded={onEnded}
            />
          </VideoSkin>
          <Hotkey keys="ArrowLeft" action="seekStep" value={-10} />
          <Hotkey keys="ArrowRight" action="seekStep" value={10} />
          <Hotkey keys="j" action="seekStep" value={-10} />
          <Hotkey keys="l" action="seekStep" value={10} />
          <Gesture type="doubletap" region="left" action="seekStep" value={-10} />
          <Gesture type="doubletap" region="right" action="seekStep" value={10} />
        </div>

        <div className="transport-bar">
          <button
            className="transport-button subtle"
            type="button"
            disabled={!previous}
            onClick={() => selectSibling(previous)}
          >
            <span aria-hidden="true">‹</span> 上一部
          </button>
          <SeekButton
            seconds={-10}
            label="倒退 10 秒"
            render={(props) => (
              <button {...props} type="button" className="transport-button seek">
                <span aria-hidden="true">↶</span> 10 秒
              </button>
            )}
          />
          <SeekButton
            seconds={10}
            label="快進 10 秒"
            render={(props) => (
              <button {...props} type="button" className="transport-button seek">
                10 秒 <span aria-hidden="true">↷</span>
              </button>
            )}
          />
          <button
            className="transport-button subtle"
            type="button"
            disabled={!next}
            onClick={() => selectSibling(next)}
          >
            下一部 <span aria-hidden="true">›</span>
          </button>
        </div>
      </Player.Provider>

      {item.currentTime > 1 && !item.completed && (
        <p className="resume-note">已從 {formatTime(item.currentTime)} 接續</p>
      )}
      {autoplayBlocked && (
        <button
          className="notice-action"
          type="button"
          onClick={() => void videoRef.current?.play()}
        >
          瀏覽器暫停了自動播放，點這裡繼續下一部
        </button>
      )}
      {playlistFinished && <p className="finish-note">這個播放清單已全部播放完畢。</p>}
    </section>
  );
}

function PlaylistModal({
  mode,
  playlist,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  playlist: PlaylistDetail | null;
  onClose: () => void;
  onSaved: (playlistId?: string) => Promise<void>;
}) {
  const [name, setName] = useState(mode === "edit" ? playlist?.playlist.name ?? "" : "");
  const [filename, setFilename] = useState("");
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const readFile = async (file: File) => {
    setError("");
    const result = parsePlaylistText(await file.text());
    setFilename(file.name);
    setParsed(result);
    if (mode === "create" && !name.trim()) setName(fileBaseName(file.name));
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void readFile(file);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError("請輸入播放清單名稱。");
    if (mode === "create" && !parsed?.items.length) {
      return setError("請選擇包含有效 MP4 網址的 list.txt。");
    }
    if (parsed && !parsed.items.length) return setError("檔案中沒有有效的 MP4 網址。");

    setSaving(true);
    setError("");
    try {
      if (mode === "create") {
        const id = await createPlaylist({
          name,
          originalFilename: filename,
          items: parsed?.items ?? [],
        });
        await onSaved(id);
      } else if (playlist) {
        await updatePlaylist(playlist.playlist.id, {
          name,
          ...(parsed ? { originalFilename: filename, items: parsed.items } : {}),
        });
        await onSaved(playlist.playlist.id);
      }
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "儲存失敗。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="playlist-modal-title">
        <div className="modal-heading">
          <div>
            <span className="eyebrow">{mode === "create" ? "建立清單" : "管理清單"}</span>
            <h2 id="playlist-modal-title">
              {mode === "create" ? "匯入你的影片" : "更新播放清單"}
            </h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="關閉">
            ×
          </button>
        </div>

        <form onSubmit={submit}>
          <label className="field-label" htmlFor="playlist-name">播放清單名稱</label>
          <input
            id="playlist-name"
            className="text-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            placeholder="例如：軍師聯盟"
            autoFocus
          />

          <label className="file-drop" htmlFor="playlist-file">
            <span className="file-mark" aria-hidden="true">＋</span>
            <strong>{filename || (mode === "edit" ? "選擇新的 list.txt（選填）" : "選擇 list.txt")}</strong>
            <small>每行一個完整的 MP4 網址，最多 500 部</small>
          </label>
          <input
            id="playlist-file"
            className="visually-hidden"
            type="file"
            accept=".txt,text/plain"
            onChange={onFileChange}
          />

          {parsed && (
            <div className="parse-result" role="status">
              <span>找到 <strong>{parsed.items.length}</strong> 部影片</span>
              {parsed.invalidLines.length > 0 && (
                <span className="warning">
                  略過 {parsed.invalidLines.length} 行（第 {parsed.invalidLines.slice(0, 5).join("、")} 行
                  {parsed.invalidLines.length > 5 ? "…" : ""}）
                </span>
              )}
            </div>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <button className="button secondary" type="button" onClick={onClose}>取消</button>
            <button className="button primary" type="submit" disabled={saving}>
              {saving ? "儲存中…" : mode === "create" ? "建立播放清單" : "儲存變更"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ContinPlayerApp() {
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PlaylistDetail | null>(null);
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const [autoPlayItemId, setAutoPlayItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"create" | "edit" | null>(null);

  const loadPlaylist = useCallback(async (id: string) => {
    const loaded = await getPlaylist(id);
    if (!loaded) throw new Error("找不到這個播放清單。");
    setDetail(loaded);
    setAutoPlayItemId(null);
    setCurrentItemId(loaded.currentItemId ?? loaded.items[0]?.id ?? null);
  }, []);

  const refresh = useCallback(
    async (preferredId?: string) => {
      setLoading(true);
      setError("");
      try {
        const [storedPlaylists, storedActiveId] = await Promise.all([
          listPlaylists(),
          getActivePlaylistId(),
        ]);
        setPlaylists(storedPlaylists);
        const selected =
          preferredId ??
          (storedPlaylists.some((entry) => entry.id === storedActiveId)
            ? storedActiveId
            : storedPlaylists[0]?.id) ??
          null;
        setActivePlaylistId(selected);
        if (selected) await loadPlaylist(selected);
        else {
          setDetail(null);
          setCurrentItemId(null);
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "無法載入播放清單。");
      } finally {
        setLoading(false);
      }
    },
    [loadPlaylist],
  );

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  const selectPlaylist = async (id: string) => {
    setActivePlaylistId(id);
    setLoading(true);
    setError("");
    try {
      await Promise.all([
        loadPlaylist(id),
        setActivePlaylist(id),
      ]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "無法切換播放清單。");
    } finally {
      setLoading(false);
    }
  };

  const deletePlaylist = async () => {
    if (!detail) return;
    if (!window.confirm(`確定要刪除「${detail.playlist.name}」嗎？觀看進度也會一併刪除。`)) return;
    setLoading(true);
    try {
      await deleteStoredPlaylist(detail.playlist.id);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "刪除失敗。");
      setLoading(false);
    }
  };

  const currentIndex = detail?.items.findIndex((item) => item.id === currentItemId) ?? -1;
  const currentItem = currentIndex >= 0 ? detail?.items[currentIndex] ?? null : null;
  const previousItem = currentIndex > 0 ? detail?.items[currentIndex - 1] ?? null : null;
  const nextItem =
    detail && currentIndex >= 0 && currentIndex < detail.items.length - 1
      ? detail.items[currentIndex + 1]
      : null;
  const completedCount = useMemo(
    () => detail?.items.filter((item) => item.completed).length ?? 0,
    [detail],
  );
  const updateVisibleProgress = useCallback(
    (
      itemId: string,
      progress: Pick<
        PlaylistItem,
        "currentTime" | "duration" | "completed" | "progressUpdatedAt"
      >,
    ) => {
      setDetail((current) =>
        current
          ? {
              ...current,
              currentItemId: itemId,
              items: current.items.map((item) =>
                item.id === itemId ? { ...item, ...progress } : item,
              ),
            }
          : current,
      );
    },
    [],
  );
  const selectItem = (itemId: string, autoPlay = false) => {
    setAutoPlayItemId(autoPlay ? itemId : null);
    setCurrentItemId(itemId);
    if (detail) {
      void setCurrentPlaylistItem(detail.playlist.id, itemId).catch((reason) => {
        console.error("Unable to save the selected item to IndexedDB", reason);
      });
    }
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <a className="brand" href="#top" aria-label="Contin 首頁">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>contin</span>
        </a>
        <div className="header-actions">
          <label className="playlist-select-label" htmlFor="playlist-select">播放清單</label>
          <select
            id="playlist-select"
            className="playlist-select"
            value={activePlaylistId ?? ""}
            disabled={!playlists.length || loading}
            onChange={(event) => void selectPlaylist(event.target.value)}
          >
            {!playlists.length && <option value="">尚未建立</option>}
            {playlists.map((playlist) => (
              <option value={playlist.id} key={playlist.id}>
                {playlist.name} · {playlist.itemCount} 部
              </option>
            ))}
          </select>
          <button className="button primary compact" type="button" onClick={() => setModal("create")}>＋ 新增清單</button>
        </div>
      </header>

      {error && (
        <div className="global-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void refresh(activePlaylistId ?? undefined)}>重試</button>
        </div>
      )}

      {loading && !detail ? (
        <div className="loading-state" role="status">
          <span className="loading-orbit" />
          正在準備你的播放空間…
        </div>
      ) : !detail ? (
        <section className="empty-state">
          <span className="empty-kicker">YOUR NEXT EPISODE STARTS HERE</span>
          <h1>把清單交給 Contin，<br />從此不再找上次看到哪裡。</h1>
          <p>匯入一份每行一個 MP4 網址的 list.txt。Contin 會記住每個播放清單、每一部影片，以及你停下的位置。</p>
          <button className="button primary hero-button" type="button" onClick={() => setModal("create")}>匯入第一個播放清單</button>
          <div className="empty-features" aria-label="主要功能">
            <span><strong>01</strong> 自動接續下一部</span>
            <span><strong>02</strong> 每個清單獨立續播</span>
            <span><strong>03</strong> 安裝成 PWA</span>
          </div>
        </section>
      ) : (
        <div className="content-grid" id="top">
          <div className="main-column">
            {currentItem ? (
              <PlayerPanel
                key={currentItem.id}
                playlistId={detail.playlist.id}
                item={currentItem}
                previous={previousItem}
                next={nextItem}
                autoPlay={autoPlayItemId === currentItem.id}
                onSelect={selectItem}
                onProgress={updateVisibleProgress}
              />
            ) : (
              <section className="player-card no-video">這個播放清單沒有可播放的影片。</section>
            )}
            <div className="shortcut-hint">
              <span>快捷鍵</span>
              <kbd>J</kbd><small>倒退</small>
              <kbd>L</kbd><small>快進</small>
              <kbd>←</kbd><kbd>→</kbd><small>10 秒</small>
            </div>
          </div>

          <aside className="queue-card" aria-label="待播清單">
            <div className="queue-heading">
              <div>
                <span className="eyebrow">播放清單</span>
                <h2>{detail.playlist.name}</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setModal("edit")} aria-label="管理播放清單">•••</button>
            </div>
            <div className="queue-progress">
              <div><span style={{ width: `${detail.items.length ? (completedCount / detail.items.length) * 100 : 0}%` }} /></div>
              <p>{completedCount} / {detail.items.length} 已播放</p>
            </div>
            <ol className="episode-list">
              {detail.items.map((item) => {
                const active = item.id === currentItemId;
                const percent = item.duration > 0 ? Math.min(100, (item.currentTime / item.duration) * 100) : 0;
                return (
                  <li key={item.id}>
                    <button className={`episode-row${active ? " active" : ""}`} type="button" onClick={() => selectItem(item.id)} aria-current={active ? "true" : undefined}>
                      <span className="episode-number">{String(item.position + 1).padStart(2, "0")}</span>
                      <span className="episode-copy">
                        <strong>{item.title}</strong>
                        <span>{item.completed ? "已播放" : item.currentTime > 0 ? `看到 ${formatTime(item.currentTime)}` : "尚未播放"}</span>
                        {percent > 0 && !item.completed && <span className="mini-progress"><i style={{ width: `${percent}%` }} /></span>}
                      </span>
                      <span className="episode-status" aria-hidden="true">{item.completed ? "✓" : active ? "▶" : ""}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="queue-footer">
              <button className="text-button" type="button" onClick={() => setModal("edit")}>重新命名或更新清單</button>
              <button className="text-button danger" type="button" onClick={() => void deletePlaylist()}>刪除</button>
            </div>
          </aside>
        </div>
      )}

      <footer className="app-footer">
        <span>Contin Player</span>
        <span>進度只保存在這個瀏覽器 · Powered by Video.js v10</span>
      </footer>

      {modal && (
        <PlaylistModal
          mode={modal}
          playlist={detail}
          onClose={() => setModal(null)}
          onSaved={async (id) => refresh(id ?? activePlaylistId ?? undefined)}
        />
      )}
    </main>
  );
}
