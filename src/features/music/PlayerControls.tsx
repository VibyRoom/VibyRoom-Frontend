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
    onRetryAudio: () => void
    onPlayPause: () => void
    onSkip: () => void
    onSeek: (positionMs: number) => void
}

interface SeekDraft {
    itemId: string
    positionMs: number
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
                                   onRetryAudio,
                                   onPlayPause,
                                   onSkip,
                                   onSeek,
                               }: PlayerControlsProps) {
    const [seekDraft, setSeekDraft] =
        useState<SeekDraft | null>(null)

    const seekDraftRef = useRef<SeekDraft | null>(null)

    const currentItem = playback?.currentItem ?? null
    const track = currentItem?.track ?? null
    const durationMs = track?.durationMs ?? 0
    const status = playback?.status ?? 'stopped'
    const isPlaying = status === 'playing'

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

    // Не запрещаем владельцу отправить Play только из-за
    // устаревшего или ещё не загруженного snapshot.
    const canPlayPause = isOwner && !busy

    const canSeek =
        isOwner &&
        !busy &&
        currentItem !== null &&
        durationMs > 0

    // HTMLAudioElement.play() можно вызвать, пока
    // аудиопоток загружается. Браузер дождётся данных.
    const canStartListening =
        track !== null &&
        !listening &&
        !busy &&
        localAudio.status !== 'idle' &&
        localAudio.status !== 'error'

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

    function getHint(): string {
        if (!playback) {
            return 'Получаем музыкальное состояние комнаты.'
        }

        if (status === 'stopped') {
            if (pendingCount === 0) {
                return 'Добавьте трек в очередь. Владелец сможет запустить его.'
            }

            return isOwner
                ? 'Очередь готова. Нажмите «Запустить очередь», затем включите звук.'
                : 'Треки добавлены. Ожидаем запуска очереди владельцем.'
        }

        if (localAudio.status === 'loading') {
            return 'Загружаем аудиопоток для этого устройства.'
        }

        if (localAudio.status === 'error') {
            return 'Ошибка локального аудио. Попробуйте повторную загрузку.'
        }

        if (status === 'paused') {
            return 'Воспроизведение приостановлено владельцем.'
        }

        return listening
            ? 'Вы слушаете музыку комнаты.'
            : 'Нажмите «Начать прослушивание», чтобы включить звук.'
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
                    {track?.artworkUrl ? (
                        <img
                            src={track.artworkUrl}
                            alt={`Обложка: ${track.title}`}
                        />
                    ) : (
                        <span aria-hidden="true">♫</span>
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
                                changeSeek(Number(event.target.value))
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

                    <div className="music-player-actions">
                        <button
                            type="button"
                            className="button-primary"
                            disabled={!canStartListening}
                            onClick={onStartListening}
                        >
                            {listening
                                ? 'Прослушивание включено'
                                : localAudio.status === 'loading'
                                    ? 'Начать после загрузки'
                                    : 'Начать прослушивание'}
                        </button>

                        {listening && (
                            <button
                                type="button"
                                className="button-secondary"
                                onClick={onStopListening}
                            >
                                Выключить звук
                            </button>
                        )}

                        {(localAudio.status === 'error' || error) &&
                            track && (
                                <button
                                    type="button"
                                    className="button-secondary"
                                    disabled={busy}
                                    onClick={onRetryAudio}
                                >
                                    Повторить загрузку
                                </button>
                            )}

                        {isOwner && (
                            <>
                                <button
                                    type="button"
                                    className="button-secondary"
                                    disabled={!canPlayPause}
                                    onClick={onPlayPause}
                                >
                                    {isPlaying
                                        ? 'Пауза'
                                        : status === 'paused'
                                            ? 'Продолжить'
                                            : 'Запустить очередь'}
                                </button>

                                <button
                                    type="button"
                                    className="button-secondary"
                                    disabled={!currentItem || busy}
                                    onClick={onSkip}
                                >
                                    Следующий трек
                                </button>
                            </>
                        )}
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