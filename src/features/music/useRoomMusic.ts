import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from 'react'

import {
    ApiError,
    getErrorMessage,
} from '../../shared/api/httpClient'

import {
    AudioPlayerService,
    type LocalAudioState,
} from './AudioPlayerService'

import { AudiusStreamResolver } from './AudiusStreamResolver'
import { PlaybackSyncService } from './PlaybackSyncService'
import { RoomMusicStateStore } from './RoomMusicStateStore'
import { ServerClockService } from './ServerClockService'
import { musicApi } from './musicApi'

import type {
    MusicTrack,
    QueueChangedEvent,
    RoomMusicState,
    TrackReference,
} from './types'

interface MusicRuntime {
    refresh(): Promise<void>
    onMusicStateChanged(state: RoomMusicState): void
    onQueueChanged(event: QueueChangedEvent): void
    startListening(): void
    stopListening(): void
    retryAudio(): void
    playPause(): Promise<void>
    skip(): Promise<void>
    seek(positionMs: number): Promise<void>
    addTrack(reference: TrackReference): Promise<void>
    removeTrack(itemId: string): Promise<void>
    moveTrack(itemId: string, position: number): Promise<void>
    searchTracks(query: string): Promise<void>
}

const initialAudio: LocalAudioState = {
    status: 'idle',
    positionSeconds: 0,
    durationSeconds: null,
    error: null,
}

function isAbortError(error: unknown): boolean {
    return (
        error instanceof Error &&
        error.name === 'AbortError'
    )
}

function isPermanentRequestFailure(
    error: unknown,
): boolean {
    return (
        error instanceof ApiError &&
        [401, 403, 404].includes(error.status)
    )
}

export function useRoomMusic(roomId: string) {
    const runtimeRef = useRef<MusicRuntime | null>(null)

    const [musicState, setMusicState] =
        useState<RoomMusicState | null>(null)

    const [localAudio, setLocalAudio] =
        useState<LocalAudioState>(initialAudio)

    const [listening, setListening] = useState(false)
    const [musicBusy, setMusicBusy] = useState(false)
    const [musicLoading, setMusicLoading] = useState(true)
    const [musicError, setMusicError] =
        useState<string | null>(null)
    const [positionMs, setPositionMs] = useState(0)

    const [searchResults, setSearchResults] =
        useState<MusicTrack[]>([])

    const [searchBusy, setSearchBusy] = useState(false)
    const [searchError, setSearchError] =
        useState<string | null>(null)

    useEffect(() => {
        let alive = true
        let mutationBusy = false

        let refreshTask: Promise<void> | null = null
        let refreshPending = false

        let retryTimer: number | null = null
        let retryDelayMs = 2000

        let searchController: AbortController | null = null

        const lifetime = new AbortController()
        const player = new AudioPlayerService()
        const clock = new ServerClockService()
        const resolver = new AudiusStreamResolver()
        const store = new RoomMusicStateStore(roomId)

        const sync = new PlaybackSyncService(
            player,
            clock,
            resolver,
        )

        const unsubscribeState = store.subscribe((state) => {
            if (alive) {
                setMusicState(state)
            }
        })

        const unsubscribeAudio = player.subscribe((state) => {
            if (alive) {
                setLocalAudio(state)
            }
        })

        function clearRetry(): void {
            if (retryTimer !== null) {
                window.clearTimeout(retryTimer)
                retryTimer = null
            }
        }

        function scheduleRetry(error: unknown): void {
            if (
                !alive ||
                lifetime.signal.aborted ||
                isPermanentRequestFailure(error) ||
                !navigator.onLine ||
                retryTimer !== null
            ) {
                return
            }

            const delay = retryDelayMs

            retryDelayMs = Math.min(
                retryDelayMs * 2,
                30000,
            )

            retryTimer = window.setTimeout(() => {
                retryTimer = null

                if (
                    alive &&
                    !lifetime.signal.aborted &&
                    navigator.onLine
                ) {
                    void refresh()
                }
            }, delay)
        }

        function reportAudioFailure(error: unknown): void {
            if (
                !alive ||
                lifetime.signal.aborted ||
                isAbortError(error)
            ) {
                return
            }

            if (sync.isListeningEnabled()) {
                sync.stopListening()
                setListening(false)
            }

            setMusicError(getErrorMessage(error))
        }

        function synchronize(state: RoomMusicState): void {
            void sync.applyState(state.playback)
                .then(() => {
                    if (!alive) {
                        return
                    }

                    setPositionMs(
                        Math.round(
                            sync.getTargetPositionSeconds() * 1000,
                        ),
                    )
                })
                .catch(reportAudioFailure)

            const next =
                state.queue[0]?.track.reference ?? null

            void sync.preloadNext(next).catch(() => {
                // Ошибка предзагрузки не останавливает музыку.
            })
        }

        function applyRestState(
            state: RoomMusicState,
            startedAt: number,
            receivedAt: number,
        ): void {
            if (!alive) {
                return
            }

            const result = store.applyRestSnapshot(state)

            if (result === 'stale') {
                // Realtime мог доставить более новую версию,
                // пока REST-запрос был в пути.
                return
            }

            clock.observe(
                state.serverTimeUtc,
                startedAt,
                receivedAt,
            )

            synchronize(state)
        }

        async function refresh(): Promise<void> {
            if (!alive || lifetime.signal.aborted) {
                return
            }

            if (refreshTask) {
                refreshPending = true
                await refreshTask
                return
            }

            const task = (async () => {
                if (store.getSnapshot() === null) {
                    setMusicLoading(true)
                }

                try {
                    do {
                        refreshPending = false

                        const startedAt = Date.now()

                        try {
                            const state = await musicApi.getState(
                                roomId,
                                lifetime.signal,
                            )

                            if (
                                !alive ||
                                lifetime.signal.aborted
                            ) {
                                return
                            }

                            applyRestState(
                                state,
                                startedAt,
                                Date.now(),
                            )

                            clearRetry()
                            retryDelayMs = 2000
                            setMusicError(null)
                        } catch (error) {
                            if (
                                alive &&
                                !lifetime.signal.aborted &&
                                !isAbortError(error)
                            ) {
                                setMusicError(
                                    getErrorMessage(error),
                                )

                                scheduleRetry(error)
                            }

                            break
                        }
                    } while (
                        refreshPending &&
                        alive &&
                        !lifetime.signal.aborted
                        )
                } finally {
                    if (alive) {
                        setMusicLoading(false)
                    }
                }
            })()

            refreshTask = task

            try {
                await task
            } finally {
                if (refreshTask === task) {
                    refreshTask = null
                }
            }
        }

        function onMusicStateChanged(
            state: RoomMusicState,
        ): void {
            if (!alive) {
                return
            }

            try {
                const result =
                    store.applyRealtimeSnapshot(state)

                if (result === 'gap') {
                    void refresh()
                } else if (result === 'applied') {
                    synchronize(state)
                }
            } catch (error) {
                reportAudioFailure(error)
                void refresh()
            }
        }

        function onQueueChanged(
            event: QueueChangedEvent,
        ): void {
            if (
                !alive ||
                event.roomId !== roomId
            ) {
                return
            }

            const version = store.getVersion()

            if (
                version === null ||
                event.version > version
            ) {
                void refresh()
            }
        }

        async function executeMutation(
            action: (
                version: number,
            ) => Promise<RoomMusicState | null>,
            refreshFirst = false,
        ): Promise<void> {
            if (!alive || mutationBusy) {
                return
            }

            mutationBusy = true
            setMusicBusy(true)
            setMusicError(null)

            try {
                if (
                    refreshFirst ||
                    store.getVersion() === null
                ) {
                    await refresh()
                }

                if (!alive) {
                    return
                }

                const version = store.getVersion()

                if (version === null) {
                    throw new Error(
                        'Не удалось получить музыкальное состояние.',
                    )
                }

                const startedAt = Date.now()
                const updated = await action(version)

                if (!alive) {
                    return
                }

                if (updated) {
                    applyRestState(
                        updated,
                        startedAt,
                        Date.now(),
                    )
                } else {
                    await refresh()
                }
            } catch (error) {
                if (
                    !alive ||
                    lifetime.signal.aborted ||
                    isAbortError(error)
                ) {
                    return
                }

                if (
                    error instanceof ApiError &&
                    [409, 412, 428].includes(error.status)
                ) {
                    await refresh()
                }

                setMusicError(getErrorMessage(error))
            } finally {
                mutationBusy = false

                if (alive) {
                    setMusicBusy(false)
                }
            }
        }

        function startListening(): void {
            if (!alive) {
                return
            }

            setMusicError(null)
            setListening(true)

            // HTMLAudioElement.play() вызывается
            // непосредственно из пользовательского клика.
            void sync.startListening().catch(
                (error: unknown) => {
                    if (!alive) {
                        return
                    }

                    sync.stopListening()
                    setListening(false)
                    reportAudioFailure(error)
                },
            )
        }

        function stopListening(): void {
            sync.stopListening()

            if (alive) {
                setListening(false)
            }
        }

        function retryAudio(): void {
            if (!alive) {
                return
            }

            setMusicError(null)

            void sync.retryCurrentTrack()
                .then(() => {
                    if (alive) {
                        setPositionMs(
                            Math.round(
                                sync.getTargetPositionSeconds() * 1000,
                            ),
                        )
                    }
                })
                .catch(reportAudioFailure)
        }

        async function playPause(): Promise<void> {
            await executeMutation(
                (version) => {
                    const status =
                        store.getSnapshot()?.playback.status

                    switch (status) {
                        case 'playing':
                            return musicApi.pause(
                                roomId,
                                version,
                                lifetime.signal,
                            )

                        case 'paused':
                            return musicApi.resume(
                                roomId,
                                version,
                                lifetime.signal,
                            )

                        default:
                            return musicApi.play(
                                roomId,
                                version,
                                lifetime.signal,
                            )
                    }
                },
                true,
            )
        }

        async function skip(): Promise<void> {
            await executeMutation((version) =>
                musicApi.skip(
                    roomId,
                    version,
                    lifetime.signal,
                ),
            )
        }

        async function seek(
            nextPositionMs: number,
        ): Promise<void> {
            await executeMutation((version) =>
                musicApi.seek(
                    roomId,
                    version,
                    nextPositionMs,
                    lifetime.signal,
                ),
            )
        }

        async function addTrack(
            reference: TrackReference,
        ): Promise<void> {
            await executeMutation(async () => {
                await musicApi.addTrack(
                    roomId,
                    reference,
                    lifetime.signal,
                )

                return null
            })
        }

        async function removeTrack(
            itemId: string,
        ): Promise<void> {
            await executeMutation(async (version) => {
                await musicApi.removeTrack(
                    roomId,
                    itemId,
                    version,
                    lifetime.signal,
                )

                return null
            })
        }

        async function moveTrack(
            itemId: string,
            position: number,
        ): Promise<void> {
            await executeMutation(async (version) => {
                await musicApi.moveTrack(
                    roomId,
                    itemId,
                    position,
                    version,
                    lifetime.signal,
                )

                return null
            })
        }

        async function searchTracks(
            query: string,
        ): Promise<void> {
            searchController?.abort()

            const controller = new AbortController()
            searchController = controller

            setSearchBusy(true)
            setSearchError(null)
            setSearchResults([])

            try {
                const response = await musicApi.search(
                    query,
                    controller.signal,
                )

                if (
                    alive &&
                    !controller.signal.aborted
                ) {
                    setSearchResults(response.tracks)
                }
            } catch (error) {
                if (
                    alive &&
                    !controller.signal.aborted &&
                    !isAbortError(error)
                ) {
                    setSearchError(
                        getErrorMessage(error),
                    )
                }
            } finally {
                if (
                    alive &&
                    !controller.signal.aborted
                ) {
                    setSearchBusy(false)
                }
            }
        }

        function onBrowserReturn(): void {
            if (
                alive &&
                navigator.onLine &&
                document.visibilityState === 'visible'
            ) {
                void refresh()
            }
        }

        function onNetworkRestored(): void {
            if (
                alive &&
                !lifetime.signal.aborted
            ) {
                clearRetry()
                void refresh()
            }
        }

        runtimeRef.current = {
            refresh,
            onMusicStateChanged,
            onQueueChanged,
            startListening,
            stopListening,
            retryAudio,
            playPause,
            skip,
            seek,
            addTrack,
            removeTrack,
            moveTrack,
            searchTracks,
        }

        document.addEventListener(
            'visibilitychange',
            onBrowserReturn,
        )

        window.addEventListener(
            'focus',
            onBrowserReturn,
        )

        window.addEventListener(
            'online',
            onNetworkRestored,
        )

        const timer = window.setInterval(() => {
            if (!alive) {
                return
            }

            sync.correctDrift()

            setPositionMs(
                Math.round(
                    sync.getTargetPositionSeconds() * 1000,
                ),
            )
        }, 1000)

        return () => {
            alive = false

            lifetime.abort()
            searchController?.abort()

            clearRetry()
            window.clearInterval(timer)

            document.removeEventListener(
                'visibilitychange',
                onBrowserReturn,
            )

            window.removeEventListener(
                'focus',
                onBrowserReturn,
            )

            window.removeEventListener(
                'online',
                onNetworkRestored,
            )

            runtimeRef.current = null

            unsubscribeState()
            unsubscribeAudio()

            sync.dispose()
            player.dispose()
        }
    }, [roomId])

    const refreshMusic = useCallback(
        () =>
            runtimeRef.current?.refresh() ??
            Promise.resolve(),
        [],
    )

    const onMusicStateChanged = useCallback(
        (state: RoomMusicState) => {
            runtimeRef.current?.onMusicStateChanged(state)
        },
        [],
    )

    const onQueueChanged = useCallback(
        (event: QueueChangedEvent) => {
            runtimeRef.current?.onQueueChanged(event)
        },
        [],
    )

    const startListening = useCallback(() => {
        runtimeRef.current?.startListening()
    }, [])

    const stopListening = useCallback(() => {
        runtimeRef.current?.stopListening()
    }, [])

    const retryAudio = useCallback(() => {
        runtimeRef.current?.retryAudio()
    }, [])

    const playPause = useCallback(
        () =>
            runtimeRef.current?.playPause() ??
            Promise.resolve(),
        [],
    )

    const skip = useCallback(
        () =>
            runtimeRef.current?.skip() ??
            Promise.resolve(),
        [],
    )

    const seek = useCallback(
        (nextPositionMs: number) =>
            runtimeRef.current?.seek(nextPositionMs) ??
            Promise.resolve(),
        [],
    )

    const addTrack = useCallback(
        (reference: TrackReference) =>
            runtimeRef.current?.addTrack(reference) ??
            Promise.resolve(),
        [],
    )

    const removeTrack = useCallback(
        (itemId: string) =>
            runtimeRef.current?.removeTrack(itemId) ??
            Promise.resolve(),
        [],
    )

    const moveTrack = useCallback(
        (itemId: string, position: number) =>
            runtimeRef.current?.moveTrack(
                itemId,
                position,
            ) ?? Promise.resolve(),
        [],
    )

    const searchTracks = useCallback(
        (query: string) =>
            runtimeRef.current?.searchTracks(query) ??
            Promise.resolve(),
        [],
    )

    return {
        musicState,
        localAudio,
        listening,
        musicBusy,
        musicLoading,
        musicError,
        positionMs,

        searchResults,
        searchBusy,
        searchError,

        refreshMusic,
        onMusicStateChanged,
        onQueueChanged,
        startListening,
        stopListening,
        retryAudio,
        playPause,
        skip,
        seek,
        addTrack,
        removeTrack,
        moveTrack,
        searchTracks,
    }
}