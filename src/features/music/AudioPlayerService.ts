export type LocalAudioStatus =
    | 'idle'
    | 'loading'
    | 'ready'
    | 'playing'
    | 'paused'
    | 'buffering'
    | 'ended'
    | 'error'

export interface LocalAudioState {
    status: LocalAudioStatus
    positionSeconds: number
    durationSeconds: number | null
    error: string | null
}

type AudioStateListener = (
    state: LocalAudioState,
) => void

export class AudioPlayerService {
    private readonly audio = new Audio()
    private readonly preloader = new Audio()
    private readonly listeners =
        new Set<AudioStateListener>()

    private sourceUrl: string | null = null
    private preloadedUrl: string | null = null

    private status: LocalAudioStatus = 'idle'
    private error: string | null = null
    private cancelLoad: (() => void) | null = null
    private disposed = false

    constructor() {
        this.audio.preload = 'auto'
        this.preloader.preload = 'metadata'

        this.audio.setAttribute('playsinline', '')

        this.audio.addEventListener(
            'playing',
            this.onPlaying,
        )

        this.audio.addEventListener(
            'pause',
            this.onPause,
        )

        this.audio.addEventListener(
            'waiting',
            this.onBuffering,
        )

        this.audio.addEventListener(
            'stalled',
            this.onBuffering,
        )

        this.audio.addEventListener(
            'canplay',
            this.onCanPlay,
        )

        this.audio.addEventListener(
            'ended',
            this.onEnded,
        )

        this.audio.addEventListener(
            'error',
            this.onError,
        )

        this.audio.addEventListener(
            'timeupdate',
            this.onTimeUpdate,
        )
    }

    private readonly onPlaying = (): void => {
        this.update('playing')
    }

    private readonly onPause = (): void => {
        if (
            this.status !== 'idle' &&
            this.status !== 'ended'
        ) {
            this.update('paused')
        }
    }

    private readonly onBuffering = (): void => {
        if (!this.audio.paused) {
            this.update('buffering')
        }
    }

    private readonly onCanPlay = (): void => {
        if (
            this.status === 'loading' ||
            this.status === 'buffering'
        ) {
            this.update(
                this.audio.paused ? 'ready' : 'playing',
            )
        }
    }

    private readonly onEnded = (): void => {
        this.update('ended')
    }

    private readonly onError = (): void => {
        const mediaError = this.audio.error

        const messages: Record<number, string> = {
            1: 'Загрузка аудио отменена.',
            2: 'Ошибка сети при загрузке музыки.',
            3: 'Не удалось декодировать аудиопоток.',
            4: 'Аудиопоток недоступен или не поддерживается.',
        }

        this.error =
            (mediaError && messages[mediaError.code]) ||
            'Не удалось воспроизвести композицию.'

        this.update('error')
    }

    private readonly onTimeUpdate = (): void => {
        this.notify()
    }

    private update(status: LocalAudioStatus): void {
        if (this.disposed) {
            return
        }

        this.status = status

        if (status !== 'error') {
            this.error = null
        }

        this.notify()
    }

    private notify(): void {
        if (this.disposed) {
            return
        }

        const state = this.getState()

        for (const listener of this.listeners) {
            listener(state)
        }
    }

    subscribe(listener: AudioStateListener): () => void {
        this.listeners.add(listener)
        listener(this.getState())

        return () => {
            this.listeners.delete(listener)
        }
    }

    getState(): LocalAudioState {
        const duration = this.audio.duration

        return {
            status: this.status,

            positionSeconds:
                Number.isFinite(this.audio.currentTime)
                    ? this.audio.currentTime
                    : 0,

            durationSeconds:
                Number.isFinite(duration) && duration > 0
                    ? duration
                    : null,

            error: this.error,
        }
    }

    getCurrentTime(): number {
        return this.audio.currentTime
    }

    getSourceUrl(): string | null {
        return this.sourceUrl
    }

    isPaused(): boolean {
        return this.audio.paused
    }

    setPlaybackRate(rate: number): void {
        if (!Number.isFinite(rate)) {
            return
        }

        this.audio.playbackRate = Math.max(
            0.95,
            Math.min(1.05, rate),
        )
    }

    async loadSourceAsync(
        sourceUrl: string,
        signal?: AbortSignal,
    ): Promise<void> {
        if (this.disposed) {
            throw new Error(
                'AudioPlayerService disposed',
            )
        }

        if (
            this.sourceUrl === sourceUrl &&
            this.audio.readyState >=
            HTMLMediaElement.HAVE_METADATA
        ) {
            return
        }

        this.cancelLoad?.()

        this.audio.pause()
        this.audio.playbackRate = 1

        this.sourceUrl = sourceUrl
        this.update('loading')

        await new Promise<void>((resolve, reject) => {
            let completed = false

            const cleanup = (): void => {
                this.audio.removeEventListener(
                    'loadedmetadata',
                    onReady,
                )

                this.audio.removeEventListener(
                    'error',
                    onFailed,
                )

                signal?.removeEventListener(
                    'abort',
                    onAborted,
                )

                clearTimeout(timeoutId)

                if (this.cancelLoad === onAborted) {
                    this.cancelLoad = null
                }
            }

            const finish = (error?: Error): void => {
                if (completed) {
                    return
                }

                completed = true
                cleanup()

                if (error) {
                    reject(error)
                } else {
                    resolve()
                }
            }

            const onReady = (): void => {
                this.update('ready')
                finish()
            }

            const onFailed = (): void => {
                finish(
                    new Error(
                        this.error ||
                        'Не удалось загрузить аудиопоток.',
                    ),
                )
            }

            const onAborted = (): void => {
                finish(
                    new DOMException(
                        'Audio loading cancelled',
                        'AbortError',
                    ),
                )
            }

            this.cancelLoad = onAborted

            this.audio.addEventListener(
                'loadedmetadata',
                onReady,
            )

            this.audio.addEventListener(
                'error',
                onFailed,
            )

            signal?.addEventListener(
                'abort',
                onAborted,
                { once: true },
            )

            const timeoutId = setTimeout(() => {
                finish(
                    new Error(
                        'Превышено время загрузки аудио.',
                    ),
                )
            }, 20000)

            if (signal?.aborted) {
                onAborted()
                return
            }

            this.audio.src = sourceUrl
            this.audio.load()
        })
    }

    async playAsync(): Promise<void> {
        if (
            this.disposed ||
            !this.sourceUrl
        ) {
            return
        }

        try {
            await this.audio.play()
        } catch (error) {
            if (
                error instanceof DOMException &&
                error.name === 'NotAllowedError'
            ) {
                throw new Error(
                    'Браузер заблокировал автозапуск. ' +
                    'Нажмите «Начать прослушивание».',
                    { cause: error },
                )
            }

            throw error
        }
    }

    pause(): void {
        this.audio.pause()
        this.audio.playbackRate = 1
    }

    seek(positionSeconds: number): void {
        if (
            !this.sourceUrl ||
            this.audio.readyState <
            HTMLMediaElement.HAVE_METADATA ||
            !Number.isFinite(positionSeconds)
        ) {
            return
        }

        const duration = this.audio.duration

        const maximum =
            Number.isFinite(duration) && duration > 0
                ? duration
                : Number.MAX_SAFE_INTEGER

        this.audio.currentTime = Math.max(
            0,
            Math.min(positionSeconds, maximum),
        )
    }

    async preloadNextAsync(
        sourceUrl: string,
    ): Promise<void> {
        if (
            this.disposed ||
            sourceUrl === this.sourceUrl ||
            sourceUrl === this.preloadedUrl
        ) {
            return
        }

        this.preloadedUrl = sourceUrl
        this.preloader.src = sourceUrl
        this.preloader.load()
    }

    stop(): void {
        this.cancelLoad?.()

        this.audio.pause()
        this.audio.playbackRate = 1

        this.audio.removeAttribute('src')
        this.audio.load()

        this.sourceUrl = null
        this.update('idle')
    }

    dispose(): void {
        if (this.disposed) {
            return
        }

        this.stop()

        this.disposed = true

        this.audio.removeEventListener(
            'playing',
            this.onPlaying,
        )

        this.audio.removeEventListener(
            'pause',
            this.onPause,
        )

        this.audio.removeEventListener(
            'waiting',
            this.onBuffering,
        )

        this.audio.removeEventListener(
            'stalled',
            this.onBuffering,
        )

        this.audio.removeEventListener(
            'canplay',
            this.onCanPlay,
        )

        this.audio.removeEventListener(
            'ended',
            this.onEnded,
        )

        this.audio.removeEventListener(
            'error',
            this.onError,
        )

        this.audio.removeEventListener(
            'timeupdate',
            this.onTimeUpdate,
        )

        this.preloader.pause()
        this.preloader.removeAttribute('src')
        this.preloader.load()

        this.listeners.clear()
    }
}