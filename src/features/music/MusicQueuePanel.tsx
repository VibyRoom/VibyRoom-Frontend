import { useState, type FormEvent } from 'react'

import type { RoomMember } from '../rooms/types'
import { useRoomMusic } from './useRoomMusic'

import './musicQueue.css'

interface MusicQueuePanelProps {
    music: ReturnType<typeof useRoomMusic>
    members: RoomMember[]
    guestId: string | null
    isOwner: boolean
}

interface TrackArtworkProps {
    artworkUrl: string | null
    className?: string
}

function TrackArtwork({
                          artworkUrl,
                          className = '',
                      }: TrackArtworkProps) {
    const [failedUrl, setFailedUrl] =
        useState<string | null>(null)

    const url = artworkUrl?.trim() ?? ''

    const canDisplayImage =
        url.length > 0 &&
        failedUrl !== url

    return (
        <span
            className={`music-track-artwork ${className}`}
            aria-hidden="true"
        >
            {canDisplayImage ? (
                <img
                    key={url}
                    src={url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={() => setFailedUrl(url)}
                />
            ) : (
                <span className="music-track-artwork-fallback">
                    ♫
                </span>
            )}
        </span>
    )
}

function formatDuration(durationMs: number | null): string {
    if (durationMs === null || durationMs <= 0) {
        return '—'
    }

    const totalSeconds = Math.floor(durationMs / 1000)

    return (
        `${Math.floor(totalSeconds / 60)}:` +
        `${String(totalSeconds % 60).padStart(2, '0')}`
    )
}

export function MusicQueuePanel({
                                    music,
                                    members,
                                    guestId,
                                    isOwner,
                                }: MusicQueuePanelProps) {
    const [query, setQuery] = useState('')

    const items = [...(music.musicState?.queue ?? [])]
        .sort((a, b) => a.position - b.position)

    function search(event: FormEvent<HTMLFormElement>): void {
        event.preventDefault()

        if (query.trim().length >= 2) {
            void music.searchTracks(query.trim())
        }
    }

    return (
        <section
            className="panel music-library"
            aria-labelledby="queue-title"
        >
            <div className="panel-heading queue-heading">
                <div className="queue-title-group">
                    <span
                        className="queue-symbol"
                        aria-hidden="true"
                    >
                        ≡
                    </span>

                    <h2 id="queue-title">
                        Музыкальная очередь
                    </h2>

                    <span className="counter">
                        {items.length}
                    </span>
                </div>

                <span className="music-queue-version">
                    {music.musicState
                        ? `Версия ${music.musicState.version}`
                        : 'Загрузка'}
                </span>
            </div>

            <div className="music-queue-content">
                {music.musicLoading && !music.musicState ? (
                    <p
                        className="music-queue-message"
                        role="status"
                    >
                        Загружаем музыкальное состояние…
                    </p>
                ) : items.length === 0 ? (
                    <div className="queue-empty">
                        <span
                            className="queue-empty-icon"
                            aria-hidden="true"
                        >
                            ♬
                        </span>

                        <h3>Очередь пока пуста</h3>

                        <p>
                            Найдите композицию Audius и добавьте
                            её в общую очередь.
                        </p>
                    </div>
                ) : (
                    <ol className="music-queue-list">
                        {items.map((item, index) => {
                            const addedBy =
                                members.find(
                                    (member) =>
                                        member.guestId ===
                                        item.addedByGuestId,
                                )?.displayName ?? 'Гость'

                            const canRemove =
                                isOwner ||
                                item.addedByGuestId === guestId

                            return (
                                <li
                                    key={item.id}
                                    className="music-queue-item"
                                >
                                    <span className="music-queue-number">
                                        {index + 1}
                                    </span>

                                    <TrackArtwork
                                        artworkUrl={
                                            item.track.artworkUrl
                                        }
                                        className="music-queue-artwork"
                                    />

                                    <div className="music-queue-track">
                                        <strong>
                                            {item.track.title}
                                        </strong>

                                        <small>
                                            {item.track.artists.join(', ')}
                                            {' · '}
                                            Добавил: {addedBy}
                                        </small>
                                    </div>

                                    <span className="music-queue-duration">
                                        {formatDuration(
                                            item.track.durationMs,
                                        )}
                                    </span>

                                    <div className="music-queue-actions">
                                        {isOwner && (
                                            <>
                                                <button
                                                    type="button"
                                                    title="Переместить выше"
                                                    aria-label={
                                                        `Поднять трек ${item.track.title}`
                                                    }
                                                    disabled={
                                                        music.musicBusy ||
                                                        index === 0
                                                    }
                                                    onClick={() => {
                                                        void music.moveTrack(
                                                            item.id,
                                                            index - 1,
                                                        )
                                                    }}
                                                >
                                                    ↑
                                                </button>

                                                <button
                                                    type="button"
                                                    title="Переместить ниже"
                                                    aria-label={
                                                        `Опустить трек ${item.track.title}`
                                                    }
                                                    disabled={
                                                        music.musicBusy ||
                                                        index ===
                                                        items.length - 1
                                                    }
                                                    onClick={() => {
                                                        void music.moveTrack(
                                                            item.id,
                                                            index + 1,
                                                        )
                                                    }}
                                                >
                                                    ↓
                                                </button>
                                            </>
                                        )}

                                        {canRemove && (
                                            <button
                                                type="button"
                                                className="music-queue-remove"
                                                title="Удалить из очереди"
                                                aria-label={
                                                    `Удалить трек ${item.track.title}`
                                                }
                                                disabled={music.musicBusy}
                                                onClick={() => {
                                                    void music.removeTrack(
                                                        item.id,
                                                    )
                                                }}
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                </li>
                            )
                        })}
                    </ol>
                )}

                <div className="music-search">
                    <div className="music-search-heading">
                        <h3>Добавить музыку</h3>

                        <p>
                            Найдите трек или исполнителя в Audius.
                        </p>
                    </div>

                    <form
                        className="music-search-form"
                        onSubmit={search}
                    >
                        <input
                            aria-label="Поиск музыки Audius"
                            type="search"
                            placeholder="Название или исполнитель"
                            value={query}
                            minLength={2}
                            maxLength={100}
                            onChange={(event) => {
                                setQuery(event.target.value)
                            }}
                            required
                        />

                        <button
                            type="submit"
                            className="button-primary"
                            disabled={
                                music.searchBusy ||
                                query.trim().length < 2
                            }
                        >
                            {music.searchBusy
                                ? 'Ищем…'
                                : 'Найти'}
                        </button>
                    </form>

                    {music.searchError && (
                        <p
                            className="room-error"
                            role="alert"
                        >
                            {music.searchError}
                        </p>
                    )}

                    {music.musicError && (
                        <p
                            className="room-error"
                            role="alert"
                        >
                            {music.musicError}
                        </p>
                    )}

                    {music.searchResults.length > 0 && (
                        <ul className="music-search-results">
                            {music.searchResults.map((track) => (
                                <li
                                    key={
                                        `${track.reference.provider}:` +
                                        track.reference.trackId
                                    }
                                    className="music-search-result"
                                >
                                    <TrackArtwork
                                        artworkUrl={track.artworkUrl}
                                        className="music-search-artwork"
                                    />

                                    <div className="music-search-track">
                                        <strong>
                                            {track.title}
                                        </strong>

                                        <small>
                                            {track.artists.join(', ')}
                                            {' · '}
                                            {formatDuration(
                                                track.durationMs,
                                            )}
                                        </small>
                                    </div>

                                    <button
                                        type="button"
                                        disabled={
                                            music.musicBusy ||
                                            !track.durationMs ||
                                            track.durationMs <= 0
                                        }
                                        onClick={() => {
                                            void music.addTrack(
                                                track.reference,
                                            )
                                        }}
                                    >
                                        Добавить
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    {!music.searchBusy &&
                        music.searchResults.length === 0 &&
                        !music.searchError && (
                            <p className="music-queue-message">
                                Введите запрос и нажмите «Найти».
                            </p>
                        )}
                </div>
            </div>
        </section>
    )
}