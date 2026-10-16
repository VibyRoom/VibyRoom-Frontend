import { apiRequest } from '../../shared/api/httpClient'

export interface GuestSession {
    guestId: string
    expiresAtUtc: string
}

export function createOrContinueGuestSession(
    signal?: AbortSignal,
): Promise<GuestSession> {
    return apiRequest<GuestSession>(
        '/api/v1/guest-sessions',
        {
            method: 'POST',
            signal,
        },
    )
}