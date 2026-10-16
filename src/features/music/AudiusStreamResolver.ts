import type { TrackReference } from './types'

export class AudiusStreamResolver {
    resolve(reference: TrackReference): string {
        if (reference.provider.toLowerCase() !== 'audius') {
            throw new Error(
                `Неподдерживаемый музыкальный провайдер: ${reference.provider}`,
            )
        }

        if (!/^[a-zA-Z0-9]{1,128}$/.test(reference.trackId)) {
            throw new Error('Некорректный идентификатор трека Audius')
        }

        return (
            'https://api.audius.co/v1/tracks/' +
            encodeURIComponent(reference.trackId) +
            '/stream'
        )
    }
}