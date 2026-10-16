import type {
    MusicStateApplyResult,
    RoomMusicState,
} from './types'

export type MusicStateListener = (
    state: RoomMusicState | null,
) => void

export class RoomMusicStateStore {
    private readonly roomId: string
    private readonly listeners =
        new Set<MusicStateListener>()

    private currentState: RoomMusicState | null = null

    constructor(roomId: string) {
        this.roomId = roomId
    }

    getSnapshot(): RoomMusicState | null {
        return this.currentState
    }

    getVersion(): number | null {
        return this.currentState?.version ?? null
    }

    subscribe(listener: MusicStateListener): () => void {
        this.listeners.add(listener)

        return () => {
            this.listeners.delete(listener)
        }
    }

    applyRestSnapshot(
        state: RoomMusicState,
    ): MusicStateApplyResult {
        return this.apply(state, true)
    }

    applyRealtimeSnapshot(
        state: RoomMusicState,
    ): MusicStateApplyResult {
        return this.apply(state, false)
    }

    reset(): void {
        this.currentState = null
        this.notify()
    }

    private apply(
        state: RoomMusicState,
        fromRest: boolean,
    ): MusicStateApplyResult {
        if (
            state.roomId !== this.roomId ||
            !Number.isSafeInteger(state.version) ||
            state.version < 0 ||
            !state.playback ||
            state.playback.roomId !== this.roomId ||
            state.playback.version !== state.version ||
            !Array.isArray(state.queue)
        ) {
            throw new Error('Invalid room music state')
        }

        const previous = this.currentState

        if (previous) {
            if (state.version < previous.version) {
                return 'stale'
            }

            if (state.version === previous.version) {
                if (!fromRest) {
                    return 'unchanged'
                }

                // The same version can have a newer calculated
                // playback position and server timestamp.
                this.currentState = state
                this.notify()

                return 'applied'
            }

            if (
                !fromRest &&
                state.version > previous.version + 1
            ) {
                // A full REST snapshot is required to
                // confirm state after missed events.
                return 'gap'
            }
        }

        this.currentState = state
        this.notify()

        return 'applied'
    }

    private notify(): void {
        for (const listener of this.listeners) {
            listener(this.currentState)
        }
    }
}