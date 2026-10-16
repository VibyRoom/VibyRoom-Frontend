import { AudioPlayerService } from './AudioPlayerService'
import { AudiusStreamResolver } from './AudiusStreamResolver'
import { ServerClockService } from './ServerClockService'

import type {
    PlaybackState,
    TrackReference,
} from './types'

export class PlaybackSyncService {
    private readonly player: AudioPlayerService
    private readonly clock: ServerClockService
    private readonly resolver: AudiusStreamResolver

    private playback: PlaybackState | null = null
    private currentItemId: string | null = null

    private enabledByUser = false
    private disposed = false

    private generation = 0
    private loadController: AbortController | null = null
    private loadTask: Promise<void> | null = null

    constructor(
        player: AudioPlayerService,
        clock: ServerClockService,
        resolver: AudiusStreamResolver,
    ) {
        this.player = player
        this.clock = clock
        this.resolver = resolver
    }

    isListeningEnabled(): boolean {
        return this.enabledByUser
    }

    getTargetPositionSeconds(): number {
        const playback = this.playback

        if (
            !playback ||
            !playback.currentItem ||
            playback.status === 'stopped'
        ) {
            return 0
        }

        let positionMs = playback.positionAnchorMs

        if (
            playback.status === 'playing' &&
            playback.anchorAtUtc
        ) {
            const anchorTime = Date.parse(playback.anchorAtUtc)

            if (Number.isFinite(anchorTime)) {
                positionMs += Math.max(
                    0,
                    this.clock.getServerTimeMs() - anchorTime,
                )
            } else {
                positionMs = playback.positionMs
            }
        }

        return Math.max(
            0,
            Math.min(
                playback.currentItem.track.durationMs,
                positionMs,
            ),
        ) / 1000
    }

    async applyState(
        playback: PlaybackState,
    ): Promise<void> {
        if (this.disposed) {
            return
        }

        this.playback = playback

        const item = playback.currentItem

        if (!item || playback.status === 'stopped') {
            this.generation++
            this.loadController?.abort()

            this.loadController = null
            this.loadTask = null
            this.currentItemId = null

            this.player.stop()
            return
        }

        const changedTrack =
            this.currentItemId !== item.id

        if (changedTrack) {
            const sourceUrl = this.resolver.resolve(
                item.track.reference,
            )

            this.generation++
            this.loadController?.abort()

            const controller = new AbortController()

            this.loadController = controller
            this.currentItemId = item.id

            this.loadTask = this.player.loadSourceAsync(
                sourceUrl,
                controller.signal,
            )
        }

        const expectedGeneration = this.generation
        const task = this.loadTask

        if (task) {
            try {
                await task
            } catch (error) {
                if (
                    this.disposed ||
                    expectedGeneration !== this.generation ||
                    this.loadController?.signal.aborted
                ) {
                    return
                }

                this.currentItemId = null
                this.loadTask = null
                this.player.stop()

                throw error
            }

            if (this.loadTask === task) {
                this.loadTask = null
            }
        }

        if (
            this.disposed ||
            expectedGeneration !== this.generation ||
            this.currentItemId !== item.id
        ) {
            return
        }

        this.correctDrift(changedTrack)

        if (
            this.playback?.status !== 'playing' ||
            !this.enabledByUser
        ) {
            this.player.pause()
            return
        }

        if (this.player.isPaused()) {
            await this.player.playAsync()
        }
    }

    async startListening(): Promise<void> {
        if (this.disposed) {
            return
        }

        this.enabledByUser = true

        if (
            !this.playback?.currentItem ||
            this.playback.status !== 'playing'
        ) {
            return
        }

        this.correctDrift(true)
        await this.player.playAsync()
    }

    stopListening(): void {
        this.enabledByUser = false
        this.player.pause()
    }

    correctDrift(forceSeek = false): void {
        const playback = this.playback

        if (
            this.disposed ||
            !playback?.currentItem ||
            playback.status === 'stopped' ||
            this.currentItemId !== playback.currentItem.id
        ) {
            return
        }

        const target = this.getTargetPositionSeconds()
        const actual = this.player.getCurrentTime()

        if (
            !Number.isFinite(target) ||
            !Number.isFinite(actual)
        ) {
            return
        }

        const drift = target - actual

        if (playback.status === 'paused') {
            if (forceSeek || Math.abs(drift) >= 0.25) {
                this.player.seek(target)
            }

            this.player.setPlaybackRate(1)
            return
        }

        if (!this.enabledByUser && !forceSeek) {
            return
        }

        if (forceSeek || Math.abs(drift) >= 1.2) {
            this.player.seek(target)
            this.player.setPlaybackRate(1)
            return
        }

        if (
            !this.enabledByUser ||
            Math.abs(drift) <= 0.25
        ) {
            this.player.setPlaybackRate(1)
            return
        }

        const correction = Math.max(
            -0.04,
            Math.min(0.04, drift * 0.04),
        )

        this.player.setPlaybackRate(1 + correction)
    }

    async retryCurrentTrack(): Promise<void> {
        if (
            this.disposed ||
            !this.playback?.currentItem
        ) {
            return
        }

        const currentPlayback = this.playback

        this.generation++
        this.loadController?.abort()

        this.loadController = null
        this.loadTask = null
        this.currentItemId = null

        this.player.stop()

        await this.applyState(currentPlayback)
    }

    async preloadNext(
        reference: TrackReference | null,
    ): Promise<void> {
        if (!reference || this.disposed) {
            return
        }

        const url = this.resolver.resolve(reference)
        await this.player.preloadNextAsync(url)
    }

    dispose(): void {
        if (this.disposed) {
            return
        }

        this.disposed = true
        this.generation++
        this.loadController?.abort()

        this.loadController = null
        this.loadTask = null
        this.currentItemId = null
        this.playback = null
        this.enabledByUser = false

        this.player.stop()
    }
}