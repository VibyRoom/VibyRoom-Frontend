
export interface TrackReference {
    provider: string
    trackId: string
}

export interface MusicTrack {
    reference: TrackReference
    title: string
    artists: string[]
    album: string | null
    durationMs: number | null
    artworkUrl: string | null
    externalUrl: string | null
}

export interface TrackSearchResponse {
    tracks: MusicTrack[]
}

export interface QueuedTrack {
    reference: TrackReference
    title: string
    artists: string[]
    durationMs: number
    artworkUrl: string | null
    externalUrl: string | null
}

export interface QueueItem {
    id: string
    position: number
    track: QueuedTrack
    addedByGuestId: string
    addedAtUtc: string
}

export interface RoomQueueResponse {
    roomId: string
    version: number
    maxPendingItems: number
    items: QueueItem[]
}

export interface CurrentPlaybackItem {
    id: string
    track: QueuedTrack
    addedByGuestId: string
    addedAtUtc: string
}

export type PlaybackStatus =
    | 'stopped'
    | 'playing'
    | 'paused'

export interface PlaybackState {
    roomId: string
    version: number
    status: PlaybackStatus
    currentItem: CurrentPlaybackItem | null
    positionMs: number
    serverTimeUtc: string
    anchorAtUtc: string | null
    positionAnchorMs: number
}

export interface RoomMusicState {
    roomId: string
    version: number
    queue: QueueItem[]
    playback: PlaybackState
    serverTimeUtc: string
}

export interface QueueChangedEvent {
    roomId: string
    version: number
    items: QueueItem[]
}

export type MusicStateApplyResult =
    | 'applied'
    | 'unchanged'
    | 'stale'
    | 'gap'
