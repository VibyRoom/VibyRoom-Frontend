import { apiRequest } from '../../shared/api/httpClient'
import type {
    AiSessionResponse,
    RoomMusicState,
} from './types'

function path(roomId: string): string {
    return `/api/v1/rooms/${encodeURIComponent(roomId)}/ai`
}

export const aiApi = {
    getContext(
        roomId: string,
        signal?: AbortSignal,
    ): Promise<AiSessionResponse> {
        return apiRequest<AiSessionResponse>(
            path(roomId),
            { signal },
        )
    },

    generate(
        roomId: string,
        prompt: string,
    ): Promise<RoomMusicState> {
        const normalized = prompt.trim()

        if (
            normalized.length < 3 ||
            normalized.length > 500
        ) {
            throw new Error(
                'Опишите музыку: от 3 до 500 символов.',
            )
        }

        return apiRequest<RoomMusicState>(
            `${path(roomId)}/generate`,
            {
                method: 'POST',
                body: { prompt: normalized },
            },
        )
    },

    more(roomId: string): Promise<RoomMusicState> {
        return apiRequest<RoomMusicState>(
            `${path(roomId)}/more`,
            { method: 'POST' },
        )
    },

    random(roomId: string): Promise<RoomMusicState> {
        return apiRequest<RoomMusicState>(
            `${path(roomId)}/random`,
            { method: 'POST' },
        )
    },

    similar(roomId: string): Promise<RoomMusicState> {
        return apiRequest<RoomMusicState>(
            `${path(roomId)}/similar`,
            { method: 'POST' },
        )
    },
}