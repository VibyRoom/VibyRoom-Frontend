import { apiRequest } from '../../shared/api/httpClient'
import type { RoomDetails, RoomPreview } from './types'

const roomPath = (roomId: string): string =>
    `/api/v1/rooms/${encodeURIComponent(roomId)}`

const invitationPath = (code: string): string =>
    `/api/v1/invitations/${encodeURIComponent(code)}`

export const roomsApi = {
    create(
        name: string,
        displayName: string,
        signal?: AbortSignal,
    ): Promise<RoomDetails> {
        return apiRequest<RoomDetails>('/api/v1/rooms', {
            method: 'POST',
            body: { name, displayName },
            signal,
        })
    },

    get(
        roomId: string,
        signal?: AbortSignal,
    ): Promise<RoomDetails> {
        return apiRequest<RoomDetails>(
            roomPath(roomId),
            { signal },
        )
    },

    preview(
        code: string,
        signal?: AbortSignal,
    ): Promise<RoomPreview> {
        return apiRequest<RoomPreview>(
            invitationPath(code),
            { signal },
        )
    },

    join(
        code: string,
        displayName: string,
        signal?: AbortSignal,
    ): Promise<RoomDetails> {
        return apiRequest<RoomDetails>(
            `${invitationPath(code)}/join`,
            {
                method: 'POST',
                body: { displayName },
                signal,
            },
        )
    },

    leave(roomId: string): Promise<void> {
        return apiRequest<void>(
            `${roomPath(roomId)}/members/me`,
            { method: 'DELETE' },
        )
    },

    removeMember(
        roomId: string,
        guestId: string,
    ): Promise<void> {
        return apiRequest<void>(
            `${roomPath(roomId)}/members/${encodeURIComponent(guestId)}`,
            { method: 'DELETE' },
        )
    },

    transferOwnership(
        roomId: string,
        newOwnerGuestId: string,
    ): Promise<void> {
        return apiRequest<void>(
            `${roomPath(roomId)}/owner`,
            {
                method: 'PUT',
                body: { newOwnerGuestId },
            },
        )
    },

    close(roomId: string): Promise<void> {
        return apiRequest<void>(
            `${roomPath(roomId)}/close`,
            { method: 'POST' },
        )
    },
}