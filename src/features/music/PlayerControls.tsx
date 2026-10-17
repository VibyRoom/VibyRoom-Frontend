import { useRef, useState } from 'react'

import type { LocalAudioState } from './AudioPlayerService'
import type { PlaybackState } from './types'

import './playerControls.css'

interface PlayerControlsProps {
    playback: PlaybackState | null
    pendingCount: number
    positionMs: number
    localAudio: LocalAudioState
    listening: boolean
    isOwner: boolean
    busy: boolean
    error?: string | null

    onStartListening: () => void
    onStopListening: () => void
    onToggleMute: () => void
    onRetryAudio: () => void
    onPlayPause: () => void
    onSkip: () => void
    onSeek: (positionMs: number) => void
}

interface SeekDraft {
    itemId: string
    positionMs: number
}

type PlayerIconName =
    | 'power'
    | 'play'
    | 'pause'
    | 'next'
    | 'reload'
    | 'volume'
    | 'mute'

function PlayerIcon({ name }: { name: PlayerIconName }) {
    return (
        <svg
            width="23"
            height="23"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            {name === 'power' && (
                <>
                    <path d="M12 2v10" />
                    <path d="M18.4 6.2a9 9 0 1 1-12.8 0" />
                </>
            )}

            {name === 'play' && (
                <path
                    d="M8 5.5 18 12 8 18.5z"
                    fill="currentColor"
                    stroke="none"
                />
            )}

            {name === 'pause' && (
                <>
                    <rect
                        x="6.5"
                        y="5"
                        width="4"
                        height="14"
                        rx="1"
                        fill="currentColor"
                        stroke="none"
                    />

                    <rect
                        x="13.5"
                        y="5"
                        width="4"
                        height="14"
                        rx="1"
                        fill="currentColor"
                        stroke="none"
                    />
                </>
            )}

            {name === 'next' && (
                <>
                    <path
                        d="M4 5.5 12 12 4 18.5z"
                        fill="currentColor"
                        stroke="none"
                    />

                    <path
                        d="M11 5.5 19 12 11 18.5z"
                        fill="currentColor"
                        stroke="none"
                    />

                    <path d="M20 5v14" />
                </>
            )}

            {name === 'reload' && (
                <>
                    <path d="M20 11a8 8 0 0 0-13.7-5.7L4 7.5" />
                    <path d="M4 3.5v4h4" />
                    <path d="M4 13a8 8 0 0 0 13.7 5.7l2.3-2.2" />
                    <path d="M20 20.5v-4h-4" />
                </>
            )}

            {(name === 'volume' || name === 'mute') && (
                <>
                    <path d="M4 9v6h4l5 4V5L8 9H4z" />

                    {name === 'volume' ? (
                        <>
                            <path d="M16 9a5 5 0 0 1 0 6" />
                            <path d="M19 6a9 9 0 0 1 0 12" />
                        </>
                    ) : (
                        <>
                            <path d="m17 9 5 6" />
                            <path d="m22 9-5 6" />
                        </>
                    )}
                </>
            )}
        </svg>
    )
}

function formatTime(milliseconds: number): string {
    const seconds = Number.isFinite(milliseconds)
        ? Math.max(0, Math.floor(milliseconds / 1000))
        : 0

    return (
        `${Math.floor(seconds / 60)}:` +
        `${String(seconds % 60).padStart(2, '0')}`
    )
}

export function PlayerControls({
                                   playback,
                                   pendingCount,
                                   positionMs,
                                   localAudio,
                                   listening,
                                   isOwner,
                                   busy,
                                   error,
                                   onStartListening,
                                   onStopListening,
                                   onToggleMute,
                                   onRetryAudio,
                                   onPlayPause,
                                   onSkip,
                                   onSeek,
                               }: PlayerControlsProps) {
    const [seekDraft, setSeekDraft] =
        useState<SeekDraft | null>(null)

    const [failedArtworkUrl, setFailedArtworkUrl] =
        useState<string | null>(null)

    const seekDraftRef = useRef<SeekDraft | null>(null)

    const currentItem = playback?.currentItem ?? null
    const track = currentItem?.track ?? null

    const durationMs = track?.durationMs ?? 0
    const status = playback?.status ?? 'stopped'

    const isPlaying = status === 'playing'

    const artworkUrl = track?.artworkUrl?.trim() ?? ''

    const showArtwork =
        artworkUrl.length > 0 &&
        failedArtworkUrl !== artworkUrl

    const hasAudioProblem = Boolean(
        localAudio.status === 'error' ||
        localAudio.error ||
        (error && track),
    )

    const localPositionMs = Math.round(
        localAudio.positionSeconds * 1000,
    )

    const displayedPositionMs =
        listening &&
        localAudio.status !== 'idle' &&
        localAudio.status !== 'error'
            ? localPositionMs
            : positionMs

    const pendingPosition =
        seekDraft !== null &&
        currentItem !== null &&
        seekDraft.itemId === currentItem.id
            ? seekDraft.positionMs
            : displayedPositionMs

    const progressMs = Math.max(
        0,
        Math.min(durationMs, pendingPosition),
    )

    const canSeek =
        isOwner &&
        !busy &&
        currentItem !== null &&
        durationMs > 0

    const canStartListening =
        track !== null &&
        !busy &&
        localAudio.status !== 'idle' &&
        localAudio.status !== 'error'

    const canTogglePower =
        listening || canStartListening

    function changeSeek(nextPosition: number): void {
        if (!currentItem || !canSeek) {
            return
        }

        const draft: SeekDraft = {
            itemId: currentItem.id,
            positionMs: Math.max(
                0,
                Math.min(durationMs - 1, nextPosition),
            ),
        }

        seekDraftRef.current = draft
        setSeekDraft(draft)
    }

    function commitSeek(): void {
        const draft = seekDraftRef.current

        seekDraftRef.current = null
        setSeekDraft(null)

        if (
            !draft ||
            !currentItem ||
            draft.itemId !== currentItem.id ||
            !canSeek
        ) {
            return
        }

        onSeek(draft.positionMs)
    }

    function togglePower(): void {
        if (listening) {
            onStopListening()
        } else {
            onStartListening()
        }
    }

    function getHint(): string {
        if (!playback) {
            return 'Получаем музыкальное состояние комнаты.'
        }

        if (status === 'stopped') {
            return pendingCount === 0
                ? 'Добавьте музыку в очередь.'
                : 'Очередь готова к воспроизведению.'
        }

        if (localAudio.status === 'error') {
            return 'Ошибка аудио. Нажмите обновление потока.'
        }

        if (localAudio.status === 'loading') {
            return 'Загружаем аудиопоток…'
        }

        if (!listening) {
            return 'Нажмите Power, чтобы включить прослушивание.'
        }

        if (localAudio.muted) {
            return 'Звук выключен на этом устройстве.'
        }

        if (status === 'paused') {
            return 'Воспроизведение приостановлено.'
        }

        return 'Вы слушаете музыку комнаты.'
    }

    return (
        <section
            className="panel music-player"
            aria-labelledby="music-player-title"
        >
            <div className="panel-heading music-player-heading">
                <div>
                    <span className="section-kicker">
                        Совместное прослушивание
                    </span>

                    <h2 id="music-player-title">
                        Сейчас играет
                    </h2>
                </div>

                <span className="music-player-server-status">
                    {status === 'playing'
                        ? 'Воспроизведение'
                        : status === 'paused'
                            ? 'Пауза'
                            : 'Остановлено'}
                </span>
            </div>

            <div className="music-player-body">
                <div className="music-player-cover">
                    {showArtwork ? (
                        <img
                            key={artworkUrl}
                            src={artworkUrl}
                            alt={`Обложка: ${track?.title ?? 'трек'}`}
                            loading="eager"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            onError={() => {
                                setFailedArtworkUrl(artworkUrl)
                            }}
                        />
                    ) : (
                        <span
                            className="music-player-cover-fallback"
                            aria-hidden="true"
                        >
                            ♫
                        </span>
                    )}
                </div>

                <div className="music-player-details">
                    <div className="music-player-track">
                        <h3>
                            {track?.title ?? 'Нет текущего трека'}
                        </h3>

                        <p>
                            {track
                                ? track.artists.join(', ')
                                : 'Композиция ещё не запущена.'}
                        </p>
                    </div>

                    <div className="music-player-progress">
                        <input
                            aria-label="Позиция воспроизведения"
                            type="range"
                            min={0}
                            max={Math.max(1, durationMs - 1)}
                            step={1000}
                            value={progressMs}
                            disabled={!canSeek}
                            onChange={(event) => {
                                changeSeek(
                                    Number(event.target.value),
                                )
                            }}
                            onPointerUp={commitSeek}
                            onKeyUp={commitSeek}
                            onBlur={commitSeek}
                        />

                        <div className="music-player-time">
                            <span>{formatTime(progressMs)}</span>
                            <span>{formatTime(durationMs)}</span>
                        </div>
                    </div>

                    <div
                        className="music-player-actions"
                        aria-label="Управление музыкой"
                    >
                        <button
                            type="button"
                            className={
                                `music-control music-control-power ${
                                    listening ? 'is-active' : ''
                                }`
                            }
                            aria-label={
                                listening
                                    ? 'Выключить прослушивание'
                                    : 'Включить прослушивание'
                            }
                            title={
                                listening
                                    ? 'Выключить прослушивание'
                                    : 'Включить прослушивание'
                            }
                            aria-pressed={listening}
                            disabled={!canTogglePower}
                            onClick={togglePower}
                        >
                            <PlayerIcon name="power" />
                        </button>

                        <button
                            type="button"
                            className={
                                `music-control ${
                                    localAudio.muted ? 'is-muted' : ''
                                }`
                            }
                            aria-label={
                                localAudio.muted
                                    ? 'Включить звук'
                                    : 'Выключить звук'
                            }
                            title={
                                localAudio.muted
                                    ? 'Включить звук'
                                    : 'Выключить звук'
                            }
                            aria-pressed={localAudio.muted}
                            onClick={onToggleMute}
                        >
                            <PlayerIcon
                                name={
                                    localAudio.muted
                                        ? 'mute'
                                        : 'volume'
                                }
                            />
                        </button>

                        {isOwner && (
                            <>
                                <span
                                    className="music-controls-divider"
                                    aria-hidden="true"
                                />

                                <button
                                    type="button"
                                    className="music-control music-control-primary"
                                    aria-label={
                                        isPlaying
                                            ? 'Поставить на паузу'
                                            : status === 'paused'
                                                ? 'Продолжить воспроизведение'
                                                : 'Запустить очередь'
                                    }
                                    title={
                                        isPlaying
                                            ? 'Пауза'
                                            : 'Воспроизведение'
                                    }
                                    disabled={busy}
                                    onClick={onPlayPause}
                                >
                                    <PlayerIcon
                                        name={
                                            isPlaying
                                                ? 'pause'
                                                : 'play'
                                        }
                                    />
                                </button>

                                <button
                                    type="button"
                                    className="music-control"
                                    aria-label="Следующий трек"
                                    title="Следующий трек"
                                    disabled={!currentItem || busy}
                                    onClick={onSkip}
                                >
                                    <PlayerIcon name="next" />
                                </button>
                            </>
                        )}

                        <button
                            type="button"
                            className={
                                `music-control music-control-reload ${
                                    hasAudioProblem ? 'needs-attention' : ''
                                }`
                            }
                            aria-label={
                                hasAudioProblem
                                    ? 'Ошибка аудио. Перезагрузить поток'
                                    : 'Перезагрузить аудиопоток'
                            }
                            title="Перезагрузить аудиопоток"
                            disabled={!currentItem}
                            onClick={onRetryAudio}
                        >
                            <PlayerIcon name="reload" />

                            {hasAudioProblem && (
                                <span
                                    className="music-control-alert"
                                    aria-hidden="true"
                                >
                                    !
                                </span>
                            )}
                        </button>
                    </div>

                    <p
                        className="music-player-local-status"
                        role="status"
                    >
                        {getHint()}
                    </p>
                </div>
            </div>

            {(error || localAudio.error) && (
                <div className="room-error" role="alert">
                    {error || localAudio.error}
                </div>
            )}
        </section>
    )
}