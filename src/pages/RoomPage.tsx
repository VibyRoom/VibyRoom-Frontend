import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { VibyBrand } from '../components/VibyBrand'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { InviteQrButton } from '../components/InviteQrButton'

import {
    createOrContinueGuestSession,
} from '../features/guest-session/guestSession'

import {
    RoomRealtime,
    type RealtimeConnectionState,
} from '../features/presence/roomRealtime'

import { roomsApi } from '../features/rooms/roomsApi'
import type { RoomDetails, RoomMember } from '../features/rooms/types'

import { useRoomMusic } from '../features/music/useRoomMusic'
import { PlayerControls } from '../features/music/PlayerControls'
import { MusicQueuePanel } from '../features/music/MusicQueuePanel'
import { AiDjPanel } from '../features/music/AiDjPanel'

import {
    ApiError,
    getErrorMessage,
} from '../shared/api/httpClient'

type ConnectionState =
    | 'connecting'
    | RealtimeConnectionState

type TerminalState =
    | 'closed'
    | 'removed'
    | 'unavailable'
    | null

type Confirmation =
    | { type: 'close' }
    | { type: 'remove'; member: RoomMember }
    | { type: 'transfer'; member: RoomMember }

const connectionLabels: Record<ConnectionState, string> = {
    connecting: 'Подключение',
    connected: 'На связи',
    reconnecting: 'Переподключение',
    disconnected: 'Нет соединения',
}

export function RoomPage() {
    const { roomId = '' } = useParams()
    const navigate = useNavigate()

    const music = useRoomMusic(roomId)

    const {
        refreshMusic,
        onMusicStateChanged,
        onQueueChanged,
        stopListening,
    } = music

    const [room, setRoom] = useState<RoomDetails | null>(null)
    const [guestId, setGuestId] = useState<string | null>(null)

    const [onlineGuests, setOnlineGuests] =
        useState<Set<string>>(new Set())

    const [connectionState, setConnectionState] =
        useState<ConnectionState>('connecting')

    const [terminalState, setTerminalState] =
        useState<TerminalState>(null)

    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [retryVersion, setRetryVersion] = useState(0)

    const [copied, setCopied] =
        useState<'code' | 'link' | null>(null)

    const [confirmation, setConfirmation] =
        useState<Confirmation | null>(null)

    const operationInProgress = useRef(false)

    useEffect(() => {
        let active = true
        let ended = false
        let realtime: RoomRealtime | null = null
        let roomRequestVersion = 0

        const controller = new AbortController()

        function finishSession(
            state: Exclude<TerminalState, null>,
        ): void {
            if (!active || ended) {
                return
            }

            ended = true
            stopListening()
            setTerminalState(state)

            if (realtime) {
                void realtime.stop().catch(() => {})
            }
        }

        async function reloadRoom(): Promise<void> {
            if (!active || ended) {
                return
            }

            const version = ++roomRequestVersion

            try {
                const updated = await roomsApi.get(
                    roomId,
                    controller.signal,
                )

                if (
                    !active ||
                    ended ||
                    version !== roomRequestVersion
                ) {
                    return
                }

                if (updated.status === 'closed') {
                    finishSession('closed')
                    return
                }

                setRoom(updated)
            } catch (cause) {
                if (
                    !active ||
                    ended ||
                    controller.signal.aborted
                ) {
                    return
                }

                if (
                    cause instanceof ApiError &&
                    cause.status === 404
                ) {
                    finishSession('unavailable')
                    return
                }

                setError(getErrorMessage(cause))
            }
        }

        async function initialize(): Promise<void> {
            try {
                const session =
                    await createOrContinueGuestSession(
                        controller.signal,
                    )

                if (!active) {
                    return
                }

                const details = await roomsApi.get(
                    roomId,
                    controller.signal,
                )

                if (!active) {
                    return
                }

                if (details.status === 'closed') {
                    finishSession('closed')
                    return
                }

                setGuestId(session.guestId)
                setRoom(details)
                setLoading(false)

                // REST сначала восстанавливает состояние,
                // SignalR затем приносит изменения.
                void refreshMusic()

                realtime = new RoomRealtime(roomId, {
                    onPresence(snapshot) {
                        if (active && !ended) {
                            setOnlineGuests(
                                new Set(snapshot.onlineGuestIds),
                            )
                        }
                    },

                    onChanged() {
                        if (active && !ended) {
                            void reloadRoom()
                        }
                    },

                    onClosed() {
                        finishSession('closed')
                    },

                    onRevoked(reason) {
                        finishSession(
                            reason === 'roomClosed'
                                ? 'closed'
                                : 'removed',
                        )
                    },

                    onConnectionState(state) {
                        if (!active || ended) {
                            return
                        }

                        setConnectionState(state)

                        if (state !== 'connected') {
                            setOnlineGuests(new Set())
                        } else {
                            // После reconnect REST обязателен.
                            void refreshMusic()
                            void reloadRoom()
                        }
                    },

                    onMusicStateChanged(state) {
                        if (active && !ended) {
                            onMusicStateChanged(state)
                        }
                    },

                    onQueueChanged(event) {
                        if (active && !ended) {
                            onQueueChanged(event)
                        }
                    },
                })

                await realtime.start()
            } catch (cause) {
                if (
                    !active ||
                    ended ||
                    controller.signal.aborted
                ) {
                    return
                }

                setConnectionState('disconnected')
                setError(getErrorMessage(cause))
            } finally {
                if (active) {
                    setLoading(false)
                }
            }
        }

        void initialize()

        return () => {
            active = false
            ended = true
            roomRequestVersion++
            controller.abort()

            if (realtime) {
                void realtime.stop().catch(() => {})
            }
        }
    }, [
        roomId,
        retryVersion,
        refreshMusic,
        onMusicStateChanged,
        onQueueChanged,
        stopListening,
    ])

    async function executeRoomAction(
        action: () => Promise<void>,
        refreshRoom = false,
    ): Promise<boolean> {
        if (operationInProgress.current || terminalState) {
            return false
        }

        operationInProgress.current = true
        setBusy(true)
        setError('')

        try {
            await action()

            if (refreshRoom) {
                const updated = await roomsApi.get(roomId)
                setRoom(updated)
            }

            return true
        } catch (cause) {
            setError(getErrorMessage(cause))
            return false
        } finally {
            operationInProgress.current = false
            setBusy(false)
        }
    }

    async function leaveRoom(): Promise<void> {
        const success = await executeRoomAction(
            () => roomsApi.leave(roomId),
        )

        if (success) {
            navigate('/', { replace: true })
        }
    }

    async function confirmAction(): Promise<void> {
        const pending = confirmation

        if (!pending) {
            return
        }

        let success = false

        switch (pending.type) {
            case 'close':
                success = await executeRoomAction(
                    () => roomsApi.close(roomId),
                )
                break

            case 'remove':
                success = await executeRoomAction(
                    () => roomsApi.removeMember(
                        roomId,
                        pending.member.guestId,
                    ),
                    true,
                )
                break

            case 'transfer':
                success = await executeRoomAction(
                    () => roomsApi.transferOwnership(
                        roomId,
                        pending.member.guestId,
                    ),
                    true,
                )
                break
        }

        if (success) {
            setConfirmation(null)

            if (pending.type === 'close') {
                stopListening()
                setTerminalState('closed')
            }
        }
    }

    async function copyText(
        text: string,
        kind: 'code' | 'link',
    ): Promise<void> {
        try {
            await navigator.clipboard.writeText(text)
            setCopied(kind)
            setError('')
        } catch {
            setError('Не удалось скопировать приглашение.')
        }
    }

    function retryConnection(): void {
        if (busy) {
            return
        }

        setRoom(null)
        setGuestId(null)
        setOnlineGuests(new Set())
        setLoading(true)
        setConnectionState('connecting')
        setError('')
        setRetryVersion((version) => version + 1)
    }

    if (terminalState) {
        const messages = {
            closed: {
                title: 'Комната закрыта',
                description: 'Совместная сессия завершена.',
            },
            removed: {
                title: 'Участие завершено',
                description:
                    'Вы больше не являетесь участником комнаты.',
            },
            unavailable: {
                title: 'Комната недоступна',
                description:
                    'Комната закрыта или у вас нет доступа.',
            },
        }

        const message = messages[terminalState]

        return (
            <main className="page narrow">
                <div className="panel stack terminal-panel">
                    <span className="eyebrow">VibyRoom</span>
                    <h1>{message.title}</h1>

                    <p className="muted-text">
                        {message.description}
                    </p>

                    <Link
                        to="/"
                        className="button button-primary"
                    >
                        На главную
                    </Link>
                </div>
            </main>
        )
    }

    if (loading) {
        return (
            <main className="page narrow">
                <div className="panel stack">
                    <p role="status">
                        Подключаемся к комнате…
                    </p>
                </div>
            </main>
        )
    }

    if (!room) {
        return (
            <main className="page narrow">
                <div className="panel stack">
                    <h1>Комната недоступна</h1>

                    <p className="form-error" role="alert">
                        {error || 'Не удалось загрузить комнату.'}
                    </p>

                    <button
                        type="button"
                        onClick={retryConnection}
                    >
                        Повторить
                    </button>

                    <Link to="/" className="subtle">
                        На главную
                    </Link>
                </div>
            </main>
        )
    }

    const me = room.members.find(
        (member) => member.guestId === guestId,
    )

    const isOwner = me?.role === 'owner'
    const connected = connectionState === 'connected'

    const onlineCount = connected
        ? room.members.filter(
            (member) => onlineGuests.has(member.guestId),
        ).length
        : null

    const invitationUrl =
        `${window.location.origin}/invite/` +
        encodeURIComponent(room.inviteCode)

    let confirmTitle = ''
    let confirmDescription = ''
    let confirmLabel = ''
    let destructive = false

    if (confirmation?.type === 'close') {
        confirmTitle = 'Закрыть комнату?'
        confirmDescription =
            'Все участники будут отключены. ' +
            'Закрытие нельзя отменить.'
        confirmLabel = 'Закрыть комнату'
        destructive = true
    } else if (confirmation?.type === 'remove') {
        confirmTitle = 'Исключить участника?'
        confirmDescription =
            `${confirmation.member.displayName} ` +
            'больше не сможет находиться в этой комнате.'
        confirmLabel = 'Исключить'
        destructive = true
    } else if (confirmation?.type === 'transfer') {
        confirmTitle = 'Передать владение?'
        confirmDescription =
            `${confirmation.member.displayName} станет владельцем. ` +
            'Вы останетесь участником.'
        confirmLabel = 'Передать владение'
    }

    return (
        <div className="app-shell">
            <header className="app-header">
                <VibyBrand />

                <div className="header-room">
                    <div
                        className="header-room-icon"
                        aria-hidden="true"
                    >
                        ♫
                    </div>

                    <div className="header-room-info">
                        <strong title={room.name}>
                            {room.name}
                        </strong>

                        <span>
                            Совместная музыкальная комната
                        </span>
                    </div>
                </div>

                <div className="header-invitation">
                    <div className="header-copy-block">
                        <div className="copy-content">
                            <span className="field-caption">
                                Код приглашения
                            </span>

                            <code title={room.inviteCode}>
                                {room.inviteCode}
                            </code>
                        </div>

                        <button
                            type="button"
                            className="copy-icon-button"
                            aria-label="Скопировать код"
                            onClick={() => {
                                void copyText(room.inviteCode, 'code')
                            }}
                        >
                            {copied === 'code' ? '✓' : '⧉'}
                        </button>
                    </div>

                    <div className="header-copy-block invite-link-block">
                        <div className="copy-content">
                            <span className="field-caption">
                                Ссылка приглашения
                            </span>

                            <span
                                className="copy-value"
                                title={invitationUrl}
                            >
                                {invitationUrl}
                            </span>
                        </div>

                        <button
                            type="button"
                            className="copy-icon-button"
                            aria-label="Скопировать ссылку"
                            onClick={() => {
                                void copyText(invitationUrl, 'link')
                            }}
                        >
                            {copied === 'link' ? '✓' : '⧉'}
                        </button>
                    </div>
                </div>

                <div className="header-user-actions">
                    <span className="header-role">
                        {isOwner ? 'Ведущий' : 'Участник'}
                    </span>

                    <button
                        type="button"
                        className="button-outline-danger"
                        disabled={busy}
                        onClick={() => void leaveRoom()}
                    >
                        Выйти
                    </button>
                </div>
            </header>

            <div className="room-layout">
                <aside
                    className="panel participants-panel"
                    aria-label="Участники комнаты"
                >
                    <div className="panel-heading participants-heading">
                        <div>
                            <h2>Участники</h2>

                            <span className="counter">
                                {room.members.length}
                            </span>
                        </div>

                        <span className="capacity-text">
                            / {room.capacity}
                        </span>
                    </div>

                    <div className="presence-summary">
                        <span
                            className={
                                `status-dot ${connected ? 'online' : ''}`
                            }
                            aria-hidden="true"
                        />

                        <span>
                            {onlineCount === null
                                ? 'Статус неизвестен'
                                : `${onlineCount} онлайн`}
                        </span>
                    </div>

                    <ul className="participants-list">
                        {room.members.map((member) => {
                            const isMe = member.guestId === guestId

                            const isOnline =
                                connected &&
                                onlineGuests.has(member.guestId)

                            return (
                                <li
                                    key={member.guestId}
                                    className="participant"
                                >
                                    <div className="participant-top">
                                        <span
                                            className={
                                                `status-dot ${isOnline ? 'online' : ''}`
                                            }
                                            aria-hidden="true"
                                        />

                                        <div className="participant-info">
                                            <div className="participant-name-line">
                                                <strong>
                                                    {member.displayName}
                                                </strong>

                                                {member.role === 'owner' && (
                                                    <span className="owner-tag">
                                                        Ведущий
                                                    </span>
                                                )}

                                                {isMe && (
                                                    <span className="you-tag">
                                                        Вы
                                                    </span>
                                                )}
                                            </div>

                                            <small>
                                                {!connected
                                                    ? 'Статус неизвестен'
                                                    : isOnline
                                                        ? 'В сети'
                                                        : 'Не в сети'}
                                            </small>
                                        </div>
                                    </div>

                                    {isOwner && !isMe && (
                                        <div className="participant-controls">
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => {
                                                    setError('')
                                                    setConfirmation({
                                                        type: 'transfer',
                                                        member,
                                                    })
                                                }}
                                            >
                                                Передать владение
                                            </button>

                                            <button
                                                type="button"
                                                className="participant-remove"
                                                disabled={busy}
                                                onClick={() => {
                                                    setError('')
                                                    setConfirmation({
                                                        type: 'remove',
                                                        member,
                                                    })
                                                }}
                                            >
                                                Исключить
                                            </button>
                                        </div>
                                    )}
                                </li>
                            )
                        })}
                    </ul>

                    <div className="participants-footer">
                        <button
                            type="button"
                            className="button-secondary invite-button"
                            onClick={() => {
                                void copyText(invitationUrl, 'link')
                            }}
                        >
                            <span aria-hidden="true">＋</span>

                            {copied === 'link'
                                ? 'Ссылка скопирована'
                                : 'Пригласить друзей'}
                        </button>

                        <InviteQrButton
                            invitationUrl={invitationUrl}
                            roomName={room.name}
                        />
                    </div>
                </aside>

                <main className="room-main">
                    <div className="room-notices">
                        <div
                            className="connection-indicator"
                            role="status"
                        >
                            <span
                                className={
                                    `status-dot ${connected ? 'online' : ''}`
                                }
                                aria-hidden="true"
                            />

                            <span>
                                {connectionLabels[connectionState]}
                            </span>

                            {connectionState === 'disconnected' && (
                                <button
                                    type="button"
                                    className="text-action"
                                    disabled={busy}
                                    onClick={retryConnection}
                                >
                                    Подключиться снова
                                </button>
                            )}
                        </div>

                        {error && (
                            <div className="room-error" role="alert">
                                {error}
                            </div>
                        )}
                    </div>

                    <PlayerControls
                        playback={music.musicState?.playback ?? null}
                        pendingCount={music.musicState?.queue.length ?? 0}
                        positionMs={music.positionMs}
                        localAudio={music.localAudio}
                        listening={music.listening}
                        isOwner={isOwner}
                        busy={music.musicBusy}
                        error={music.musicError}
                        onStartListening={music.startListening}
                        onStopListening={music.stopListening}
                        onRetryAudio={music.retryAudio}
                        onPlayPause={() => {
                            void music.playPause()
                        }}
                        onSkip={() => {
                            void music.skip()
                        }}
                        onSeek={(positionMs) => {
                            void music.seek(positionMs)
                        }}
                    />

                    {isOwner && (
                        <AiDjPanel
                            roomId={roomId}
                            music={music}
                        />
                    )}

                    <MusicQueuePanel
                        music={music}
                        members={room.members}
                        guestId={guestId}
                        isOwner={isOwner}
                    />

                    {isOwner && (
                        <div className="owner-settings">
                            <span className="muted-text">
                                Управление комнатой
                            </span>

                            <button
                                type="button"
                                className="button-outline-danger"
                                disabled={busy}
                                onClick={() => {
                                    setError('')
                                    setConfirmation({ type: 'close' })
                                }}
                            >
                                Закрыть комнату
                            </button>
                        </div>
                    )}
                </main>
            </div>

            {confirmation && (
                <ConfirmDialog
                    title={confirmTitle}
                    description={confirmDescription}
                    confirmLabel={confirmLabel}
                    destructive={destructive}
                    busy={busy}
                    error={error || undefined}
                    onCancel={() => {
                        if (!busy) {
                            setConfirmation(null)
                            setError('')
                        }
                    }}
                    onConfirm={() => {
                        void confirmAction()
                    }}
                />
            )}
        </div>
    )
}