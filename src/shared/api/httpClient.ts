export interface ApiProblemDetails {
    type?: string
    title?: string
    status?: number
    detail?: string
    code?: string
    traceId?: string
    errors?: Record<string, string[]>
}

export class ApiError extends Error {
    readonly status: number
    readonly problem: ApiProblemDetails | null

    constructor(
        status: number,
        problem: ApiProblemDetails | null,
    ) {
        super(
            problem?.detail ??
            problem?.title ??
            `HTTP request failed: ${status}`,
        )

        this.name = 'ApiError'
        this.status = status
        this.problem = problem
    }

    get code(): string | undefined {
        return this.problem?.code
    }

    get traceId(): string | undefined {
        return this.problem?.traceId
    }
}

export interface ApiRequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    body?: unknown
    headers?: HeadersInit
    signal?: AbortSignal
}

interface AntiforgeryToken {
    requestToken: string
    headerName: string
}

function isRecord(
    value: unknown,
): value is Record<string, unknown> {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
    )
}

async function toApiError(
    response: Response,
): Promise<ApiError> {
    let problem: ApiProblemDetails | null = null

    try {
        const value: unknown = await response.json()

        if (isRecord(value)) {
            const errors: Record<string, string[]> = {}

            if (isRecord(value.errors)) {
                for (const [field, messages] of Object.entries(value.errors)) {
                    if (
                        Array.isArray(messages) &&
                        messages.every(
                            (message) => typeof message === 'string',
                        )
                    ) {
                        errors[field] = messages
                    }
                }
            }

            problem = {
                type:
                    typeof value.type === 'string'
                        ? value.type
                        : undefined,

                title:
                    typeof value.title === 'string'
                        ? value.title
                        : undefined,

                status:
                    typeof value.status === 'number'
                        ? value.status
                        : undefined,

                detail:
                    typeof value.detail === 'string'
                        ? value.detail
                        : undefined,

                code:
                    typeof value.code === 'string'
                        ? value.code
                        : undefined,

                traceId:
                    typeof value.traceId === 'string'
                        ? value.traceId
                        : undefined,

                errors:
                    Object.keys(errors).length > 0
                        ? errors
                        : undefined,
            }
        }
    } catch {
        // Some backend failures return no JSON body.
    }

    return new ApiError(response.status, problem)
}

async function getAntiforgeryToken(
    signal?: AbortSignal,
): Promise<AntiforgeryToken> {
    const response = await fetch(
        '/api/v1/security/antiforgery',
        {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            signal,
            headers: {
                Accept: 'application/json',
            },
        },
    )

    if (!response.ok) {
        throw await toApiError(response)
    }

    const value: unknown = await response.json()

    if (
        !isRecord(value) ||
        typeof value.requestToken !== 'string' ||
        !value.requestToken ||
        typeof value.headerName !== 'string' ||
        !value.headerName
    ) {
        throw new Error('Invalid antiforgery response')
    }

    return {
        requestToken: value.requestToken,
        headerName: value.headerName,
    }
}

export async function apiRequest<T>(
    path: string,
    options: ApiRequestOptions = {},
): Promise<T> {
    if (!path.startsWith('/api/v1/')) {
        throw new Error('Недопустимый путь API')
    }

    const method = options.method ?? 'GET'
    const headers = new Headers(options.headers)

    if (!headers.has('Accept')) {
        headers.set('Accept', 'application/json')
    }

    if (options.body !== undefined) {
        headers.set('Content-Type', 'application/json')
    }

    if (method !== 'GET') {
        const csrf = await getAntiforgeryToken(
            options.signal,
        )

        headers.set(
            csrf.headerName,
            csrf.requestToken,
        )
    }

    const response = await fetch(path, {
        method,
        credentials: 'include',
        cache: 'no-store',
        signal: options.signal,
        headers,
        body:
            options.body === undefined
                ? undefined
                : JSON.stringify(options.body),
    })

    if (!response.ok) {
        throw await toApiError(response)
    }

    if (
        response.status === 204 ||
        response.status === 205
    ) {
        return undefined as T
    }

    const contentType =
        response.headers.get('Content-Type') ?? ''

    if (!contentType.toLowerCase().includes('json')) {
        throw new Error(
            'Backend вернул неожиданный формат ответа.',
        )
    }

    return (await response.json()) as T
}

export function getErrorMessage(
    error: unknown,
): string {
    if (error instanceof ApiError) {
        const knownErrors: Record<string, string> = {
            GuestSessionRequired:
                'Необходима гостевая сессия.',

            InvalidInvitation:
                'Приглашение недействительно.',

            RoomNotFound:
                'Комната не найдена.',

            RoomClosed:
                'Комната закрыта.',

            RoomFull:
                'В комнате больше нет мест.',

            OwnerTransferRequired:
                'Перед выходом передайте владение другому участнику.',

            AccessDenied:
                'Недостаточно прав для действия.',

            ConcurrencyConflict:
                'Состояние изменилось. Обновите данные и повторите действие.',

            QueuePreconditionRequired:
                'Необходимо обновить музыкальное состояние.',

            QueueEmpty:
                'Музыкальная очередь пуста.',

            QueueFull:
                'В музыкальной очереди недостаточно свободного места. Удалите несколько треков.',

            PlaybackNotActive:
                'Воспроизведение не запущено.',

            AiNotInitialized:
                'Сначала создайте музыкальную подборку с помощью AI DJ.',

            AiInsufficientTracks:
                'ИИ-диджей не смог подобрать 15 подходящих композиций. Попробуйте другое описание.',
        }

        if (
            error.code &&
            knownErrors[error.code]
        ) {
            return knownErrors[error.code]
        }

        if (error.status === 412) {
            return 'Музыкальное состояние изменилось. Обновите данные.'
        }

        if (error.status === 428) {
            return 'Необходимо получить актуальную версию состояния.'
        }

        if (error.status === 429) {
            return 'Достигнут лимит генераций или запросов. Подождите около минуты перед следующей попыткой.'
        }

        if (error.status === 422) {
            return 'Недостаточно подходящих треков. Попробуйте другое настроение или жанр.'
        }

        if (error.status === 503) {
            return 'ИИ-диджей или музыкальный провайдер временно недоступен. Попробуйте позже.'
        }

        if (error.status === 401) {
            return 'Гостевая сессия отсутствует или истекла.'
        }

        if (error.status === 403) {
            return 'Доступ запрещён.'
        }

        if (error.status === 400 && !error.problem) {
            return 'Сервер отклонил запрос. Проверьте данные и состояние сессии.'
        }

        return (
            error.problem?.detail ??
            error.problem?.title ??
            `Ошибка сервера (${error.status}).`
        )
    }

    if (
        error instanceof Error &&
        error.name === 'AbortError'
    ) {
        return 'Запрос отменён.'
    }

    if (
        error instanceof Error &&
        error.message === 'Failed to fetch'
    ) {
        return 'Не удалось подключиться к серверу.'
    }

    return error instanceof Error
        ? error.message
        : 'Произошла неизвестная ошибка.'
}