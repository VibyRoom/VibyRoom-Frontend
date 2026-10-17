import * as signalR from '@microsoft/signalr'

import type {
    QueueChangedEvent,
    RoomMusicState,
} from '../music/types'

export interface PresenceSnapshot {
    roomId: string
    onlineGuestIds: string[]
}

export interface RoomSubscriptionRevoked {
    roomId: string
    reason: 'membershipEnded' | 'roomClosed'
}

export type RealtimeConnectionState =
    | 'connected'
    | 'reconnecting'
    | 'disconnected'

export interface RoomRealtimeHandlers {
    onPresence(snapshot: PresenceSnapshot): void
    onChanged(): void
    onClosed(): void
    onRevoked(
        reason: RoomSubscriptionRevoked['reason'],
    ): void
    onConnectionState(
        state: RealtimeConnectionState,
    ): void

    onMusicStateChanged?(
        state: RoomMusicState,
    ): void

    onQueueChanged?(
        event: QueueChangedEvent,
    ): void
}

interface RoomEvent {
    roomId: string
}

const reconnectPolicy: signalR.IRetryPolicy = {
    nextRetryDelayInMilliseconds(context) {
        const exponent = Math.min(
            context.previousRetryCount,
            5,
        )

        return Math.min(
            1000 * 2 ** exponent,
            30000,
        )
    },
}

export class RoomRealtime {
    private readonly roomId: string
    private readonly handlers: RoomRealtimeHandlers
    private readonly connection: signalR.HubConnection

    private stopped = false
    private subscribed = false

    private startTask: Promise<void> | null = null
    private stopTask: Promise<void> | null = null

    constructor(
        roomId: string,
        handlers: RoomRealtimeHandlers,
    ) {
        this.roomId = roomId
        this.handlers = handlers

        this.connection = new signalR.HubConnectionBuilder()
            .withUrl('/hubs/rooms', {
                withCredentials: true,
            })
            .withAutomaticReconnect(reconnectPolicy)
            .build()

        this.registerHandlers()
    }

    private isInactive(event: RoomEvent): boolean {
        return (
            this.stopped ||
            event.roomId !== this.roomId
        )
    }

    private registerHandlers(): void {
        this.connection.on(
            'PresenceChanged',
            (snapshot: PresenceSnapshot) => {
                if (
                    this.isInactive(snapshot) ||
                    !Array.isArray(snapshot.onlineGuestIds)
                ) {
                    return
                }

                this.handlers.onPresence(snapshot)
            },
        )

        for (const eventName of [
            'RoomMemberJoined',
            'RoomMemberLeft',
            'RoomMemberRemoved',
            'RoomOwnerChanged',
        ]) {
            this.connection.on(
                eventName,
                (event: RoomEvent) => {
                    if (!this.isInactive(event)) {
                        this.handlers.onChanged()
                    }
                },
            )
        }

        this.connection.on(
            'QueueChanged',
            (event: QueueChangedEvent) => {
                if (!this.isInactive(event)) {
                    this.handlers.onQueueChanged?.(event)
                }
            },
        )

        this.connection.on(
            'MusicStateChanged',
            (state: RoomMusicState) => {
                if (!this.isInactive(state)) {
                    this.handlers.onMusicStateChanged?.(state)
                }
            },
        )

        this.connection.on(
            'RoomClosed',
            (event: RoomEvent) => {
                if (this.isInactive(event)) {
                    return
                }

                this.handlers.onClosed()
                void this.stop().catch(() => {})
            },
        )

        this.connection.on(
            'RoomSubscriptionRevoked',
            (event: RoomSubscriptionRevoked) => {
                if (this.isInactive(event)) {
                    return
                }

                this.handlers.onRevoked(event.reason)
                void this.stop().catch(() => {})
            },
        )

        this.connection.onreconnecting(() => {
            if (this.stopped) {
                return
            }

            this.subscribed = false

            this.handlers.onConnectionState(
                'reconnecting',
            )
        })

        this.connection.onreconnected(() => {
            if (this.stopped) {
                return
            }

            void this.subscribe()
                .then(() => {
                    if (!this.stopped) {
                        this.handlers.onChanged()
                    }
                })
                .catch((error: unknown) => {
                    this.reportSubscriptionFailure(error)
                    void this.stop().catch(() => {})
                })
        })

        this.connection.onclose(() => {
            if (this.stopped) {
                return
            }

            this.subscribed = false

            this.handlers.onConnectionState(
                'disconnected',
            )
        })
    }

    private async subscribe(): Promise<void> {
        const snapshot =
            await this.connection.invoke<PresenceSnapshot>(
                'SubscribeToRoom',
                this.roomId,
            )

        if (this.stopped) {
            return
        }

        if (
            !snapshot ||
            snapshot.roomId !== this.roomId ||
            !Array.isArray(snapshot.onlineGuestIds) ||
            !snapshot.onlineGuestIds.every(
                (guestId) => typeof guestId === 'string',
            )
        ) {
            throw new Error(
                'Invalid room presence snapshot',
            )
        }

        this.subscribed = true

        this.handlers.onPresence(snapshot)
        this.handlers.onConnectionState('connected')
    }

    private reportSubscriptionFailure(
        error: unknown,
    ): void {
        if (this.stopped) {
            return
        }

        const message =
            error instanceof Error
                ? error.message
                : String(error)

        if (message.includes('roomAccessDenied')) {
            this.handlers.onRevoked('membershipEnded')
            return
        }

        this.handlers.onConnectionState(
            'disconnected',
        )
    }

    private async connect(): Promise<void> {
        await this.connection.start()

        if (this.stopped) {
            return
        }

        await this.subscribe()
    }

    start(): Promise<void> {
        if (this.stopped) {
            return Promise.reject(
                new Error(
                    'Realtime connection already stopped',
                ),
            )
        }

        if (!this.startTask) {
            this.startTask = this.connect().catch(
                (error: unknown) => {
                    if (!this.stopped) {
                        this.reportSubscriptionFailure(error)
                        void this.stop().catch(() => {})
                    }

                    throw error
                },
            )
        }

        return this.startTask
    }

    private async cleanup(): Promise<void> {
        try {
            await this.startTask
        } catch {
            // Initial connection could have failed.
        }

        if (
            this.subscribed &&
            this.connection.state ===
            signalR.HubConnectionState.Connected
        ) {
            try {
                await this.connection.invoke(
                    'UnsubscribeFromRoom',
                    this.roomId,
                )
            } catch {
                // The server may have revoked access.
            }
        }

        this.subscribed = false

        await this.connection.stop()
    }

    stop(): Promise<void> {
        if (this.stopTask) {
            return this.stopTask
        }

        this.stopped = true
        this.stopTask = this.cleanup()

        return this.stopTask
    }
}