import {
    apiRequest,
} from '../../shared/api/httpClient'

import type {
    MusicTrack,
    RoomMusicState,
    RoomQueueResponse,
    TrackReference,
    TrackSearchResponse,
} from './types'

function musicPath(roomId: string): string {
    return `/api/v1/rooms/${encodeURIComponent(roomId)}`
}

function queuePath(roomId: string): string {
    return `${musicPath(roomId)}/queue`
}

function versionHeaders(version: number): HeadersInit {
    if (!Number.isSafeInteger(version) || version < 0) {
        throw new Error('Invalid music state version')
    }

    return {
        'If-Match': `"q-${version}"`,
    }
}

export const musicApi = {
    search(
        query: string,
        signal?: AbortSignal,
        limit = 20,
    ): Promise<TrackSearchResponse> {
        const value = query.trim()

        if (
            value.length < 2 ||
            value.length > 100
        ) {
            throw new Error(
                'Поисковый запрос должен содержать от 2 до 100 символов.',
            )
        }

        if (
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 50
        ) {
            throw new Error('Invalid search limit')
        }

        const params = new URLSearchParams({
            query: value,
            limit: String(limit),
        })

        return apiRequest<TrackSearchResponse>(
            `/api/v1/music/tracks/search?${params}`,
            { signal },
        )
    },

    trackDetails(
        reference: TrackReference,
        signal?: AbortSignal,
    ): Promise<MusicTrack> {
        const params = new URLSearchParams({
            provider: reference.provider,
            trackId: reference.trackId,
        })

        return apiRequest<MusicTrack>(
            `/api/v1/music/tracks/details?${params}`,
            { signal },
        )
    },

    getQueue(
        roomId: string,
        signal?: AbortSignal,
    ): Promise<RoomQueueResponse> {
        return apiRequest<RoomQueueResponse>(
            queuePath(roomId),
            { signal },
        )
    },

    addTrack(
        roomId: string,
        reference: TrackReference,
        signal?: AbortSignal,
    ): Promise<RoomQueueResponse> {
        return apiRequest<RoomQueueResponse>(
            `${queuePath(roomId)}/items`,
            {
                method: 'POST',
                body: {
                    provider: reference.provider,
                    trackId: reference.trackId,
                },
                signal,
            },
        )
    },

    removeTrack(
        roomId: string,
        itemId: string,
        version: number,
        signal?: AbortSignal,
    ): Promise<void> {
        return apiRequest<void>(
            `${queuePath(roomId)}/items/${encodeURIComponent(itemId)}`,
            {
                method: 'DELETE',
                headers: versionHeaders(version),
                signal,
            },
        )
    },

    moveTrack(
        roomId: string,
        itemId: string,
        position: number,
        version: number,
        signal?: AbortSignal,
    ): Promise<RoomQueueResponse> {
        return apiRequest<RoomQueueResponse>(
            `${queuePath(roomId)}/items/${encodeURIComponent(itemId)}/position`,
            {
                method: 'PATCH',
                body: { position },
                headers: versionHeaders(version),
                signal,
            },
        )
    },

    getState(
        roomId: string,
        signal?: AbortSignal,
    ): Promise<RoomMusicState> {
        return apiRequest<RoomMusicState>(
            `${musicPath(roomId)}/music-state`,
            { signal },
        )
    },

    play(
        roomId: string,
        version: number,
        signal?: AbortSignal,
    ): Promise<RoomMusicState> {
        return apiRequest<RoomMusicState>(
            `${musicPath(roomId)}/playback/play`,
            {
                method: 'POST',
                headers: versionHeaders(version),
                signal,
            },
        )
    },

    pause(
        roomId: string,
        version: number,
        signal?: AbortSignal,
    ): Promise<RoomMusicState> {
        return apiRequest<RoomMusicState>(
            `${musicPath(roomId)}/playback/pause`,
            {
                method: 'POST',
                headers: versionHeaders(version),
                signal,
            },
        )
    },

    resume(
        roomId: string,
        version: number,
        signal?: AbortSignal,
    ): Promise<RoomMusicState> {
        return apiRequest<RoomMusicState>(
            `${musicPath(roomId)}/playback/resume`,
            {
                method: 'POST',
                headers: versionHeaders(version),
                signal,
            },
        )
    },

    seek(
        roomId: string,
        version: number,
        positionMs: number,
        signal?: AbortSignal,
    ): Promise<RoomMusicState> {
        if (
            !Number.isSafeInteger(positionMs) ||
            positionMs < 0
        ) {
            throw new Error('Invalid playback position')
        }

        return apiRequest<RoomMusicState>(
            `${musicPath(roomId)}/playback/position`,
            {
                method: 'PUT',
                body: { positionMs },
                headers: versionHeaders(version),
                signal,
            },
        )
    },

    skip(
        roomId: string,
        version: number,
        signal?: AbortSignal,
    ): Promise<RoomMusicState> {
        return apiRequest<RoomMusicState>(
            `${musicPath(roomId)}/playback/skip`,
            {
                method: 'POST',
                headers: versionHeaders(version),
                signal,
            },
        )
    },
}