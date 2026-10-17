import {
    useEffect,
    useRef,
    useState,
    type FormEvent,
} from 'react'

import {
    ApiError,
    getErrorMessage,
} from '../../shared/api/httpClient'

import { aiApi } from './aiApi'
import { musicApi } from './musicApi'

import type {
    AiSessionResponse,
    QueueItem,
    RoomMusicState,
} from './types'

import type { useRoomMusic } from './useRoomMusic'

import './aiDj.css'

type AiAction =
    | 'generate'
    | 'more'
    | 'random'
    | 'similar'

interface AiDjPanelProps {
    roomId: string
    music: ReturnType<typeof useRoomMusic>
}

interface GenerationResult {
    tracks: QueueItem[]
}

const batchSize = 15

function errorForAction(error: unknown): string {
    if (
        error instanceof ApiError &&
        error.status === 400
    ) {
        return 'Проверьте описание музыки: от 3 до 500 символов.'
    }

    if (error instanceof TypeError) {
        return (
            'Соединение прервалось. Генерация могла завершиться ' +
            'на сервере. Проверьте очередь перед новой попыткой.'
        )
    }

    return getErrorMessage(error)
}

export function AiDjPanel({
                              roomId,
                              music,
                          }: AiDjPanelProps) {
    const [prompt, setPrompt] = useState('')

    const [context, setContext] =
        useState<AiSessionResponse | null>(null)

    const [contextLoading, setContextLoading] =
        useState(true)

    const [contextError, setContextError] =
        useState('')

    const [maxPendingItems, setMaxPendingItems] =
        useState<number | null>(null)

    const [reloadVersion, setReloadVersion] =
        useState(0)

    const [activeAction, setActiveAction] =
        useState<AiAction | null>(null)

    const [error, setError] = useState('')

    const [result, setResult] =
        useState<GenerationResult | null>(null)

    const requestInProgress = useRef(false)
    const mounted = useRef(true)

    useEffect(() => {
        mounted.current = true

        return () => {
            mounted.current = false
        }
    }, [])

    useEffect(() => {
        let active = true
        const controller = new AbortController()

        async function loadContextAndCapacity(): Promise<void> {
            const [aiResult, queueResult] =
                await Promise.allSettled([
                    aiApi.getContext(
                        roomId,
                        controller.signal,
                    ),
                    musicApi.getQueue(
                        roomId,
                        controller.signal,
                    ),
                ])

            if (!active) {
                return
            }

            if (aiResult.status === 'fulfilled') {
                setContext(aiResult.value)
                setContextError('')

                setPrompt((current) =>
                    current.trim()
                        ? current
                        : (aiResult.value.prompt ?? ''),
                )
            } else {
                setContextError(
                    getErrorMessage(aiResult.reason),
                )
            }

            if (queueResult.status === 'fulfilled') {
                setMaxPendingItems(
                    queueResult.value.maxPendingItems,
                )
            }

            setContextLoading(false)
        }

        void loadContextAndCapacity()

        return () => {
            active = false
            controller.abort()
        }
    }, [roomId, reloadVersion])

    const currentCount =
        music.musicState?.queue.length ?? 0

    const availableSlots =
        maxPendingItems === null
            ? null
            : Math.max(
                0,
                maxPendingItems - currentCount,
            )

    const queueHasRoom =
        availableSlots === null ||
        availableSlots >= batchSize

    const hasReferenceTracks = Boolean(
        music.musicState?.playback.currentItem ||
        currentCount > 0,
    )

    const locked =
        activeAction !== null ||
        music.musicBusy

    const promptLength = prompt.trim().length

    const promptIsValid =
        promptLength >= 3 &&
        promptLength <= 500

    async function run(action: AiAction): Promise<void> {
        if (
            requestInProgress.current ||
            locked ||
            !queueHasRoom
        ) {
            return
        }

        if (
            action === 'generate' &&
            !promptIsValid
        ) {
            setError(
                'Опишите музыку: от 3 до 500 символов.',
            )
            return
        }

        if (
            action === 'more' &&
            !context?.canGenerateMore
        ) {
            return
        }

        if (
            action === 'similar' &&
            !hasReferenceTracks
        ) {
            return
        }

        // Защита срабатывает синхронно,
        // до следующего React render.
        requestInProgress.current = true

        setActiveAction(action)
        setError('')
        setResult(null)

        const previousIds = new Set(
            music.musicState?.queue.map(
                (item) => item.id,
            ) ?? [],
        )

        try {
            let response: RoomMusicState

            switch (action) {
                case 'generate':
                    response = await aiApi.generate(
                        roomId,
                        prompt,
                    )
                    break

                case 'more':
                    response = await aiApi.more(roomId)
                    break

                case 'random':
                    response = await aiApi.random(roomId)
                    break

                case 'similar':
                    response = await aiApi.similar(roomId)
                    break
            }

            if (!mounted.current) {
                return
            }

            // Существующая версия-aware синхронизация:
            // snapshot + REST, без изменений плеера.
            music.onMusicStateChanged(response)
            void music.refreshMusic()

            const additions = response.queue.filter(
                (item) => !previousIds.has(item.id),
            )

            const tracks =
                additions.length === batchSize
                    ? additions
                    : [...response.queue]
                        .sort(
                            (a, b) =>
                                a.position - b.position,
                        )
                        .slice(-batchSize)

            setResult({ tracks })

            // Эти два режима сохраняют AI-контекст.
            if (
                action === 'generate' ||
                action === 'random'
            ) {
                setContext({
                    prompt:
                        action === 'generate'
                            ? prompt.trim()
                            : null,
                    canGenerateMore: true,
                })
            }

            // Для любого режима перечитываем
            // реальный контекст с сервера.
            try {
                const updatedContext =
                    await aiApi.getContext(roomId)

                if (mounted.current) {
                    setContext(updatedContext)
                    setContextError('')

                    if (updatedContext.prompt) {
                        setPrompt(updatedContext.prompt)
                    }
                }
            } catch (contextFailure) {
                if (mounted.current) {
                    setContextError(
                        getErrorMessage(contextFailure),
                    )
                }
            }
        } catch (cause) {
            if (!mounted.current) {
                return
            }

            setError(errorForAction(cause))

            if (cause instanceof ApiError) {
                if (
                    cause.code === 'AiNotInitialized'
                ) {
                    setContext({
                        prompt: null,
                        canGenerateMore: false,
                    })
                }

                if (
                    cause.code === 'ConcurrencyConflict' ||
                    cause.code === 'QueueFull' ||
                    cause.code === 'QueueEmpty'
                ) {
                    void music.refreshMusic()
                }
            } else {
                // Только GET для проверки состояния.
                // Никакого автоматического повтора POST.
                void music.refreshMusic()
            }
        } finally {
            requestInProgress.current = false

            if (mounted.current) {
                setActiveAction(null)
            }
        }
    }

    function generate(
        event: FormEvent<HTMLFormElement>,
    ): void {
        event.preventDefault()
        void run('generate')
    }

    function reloadContext(): void {
        setContextLoading(true)
        setContextError('')
        setReloadVersion((value) => value + 1)
    }

    return (
        <section
            className="panel ai-dj"
            aria-labelledby="ai-dj-title"
            aria-busy={activeAction !== null}
        >
            <div className="ai-dj-heading">
                <div>
                    <span className="section-kicker">
                        GIGACHAT × AUDIUS
                    </span>

                    <h2 id="ai-dj-title">AI DJ</h2>
                </div>

                <span className="ai-dj-owner">
                    Управление владельца
                </span>
            </div>

            <p className="ai-dj-description">
                Опиши настроение или жанр — ИИ-диджей
                добавит в общую очередь 15 подходящих
                композиций. Новые подборки не заменяют старые.
            </p>

            <form
                onSubmit={generate}
                className="ai-dj-form"
            >
                <div className="ai-dj-label-row">
                    <label htmlFor="ai-dj-prompt">
                        Какая музыка нужна?
                    </label>

                    <span className="ai-dj-counter">
                        {prompt.length}/500
                    </span>
                </div>

                <textarea
                    id="ai-dj-prompt"
                    value={prompt}
                    maxLength={500}
                    rows={3}
                    placeholder={
                        'Например: энергичный synthwave ' +
                        'для ночной поездки'
                    }
                    aria-invalid={
                        Boolean(error && !promptIsValid)
                    }
                    disabled={locked}
                    onChange={(event) => {
                        setPrompt(event.target.value)
                        setError('')
                    }}
                />

                <div className="ai-dj-actions">
                    <button
                        className="button-primary"
                        type="submit"
                        disabled={
                            locked ||
                            !queueHasRoom ||
                            !promptIsValid
                        }
                    >
                        Создать плейлист
                    </button>

                    <button
                        className="button-secondary"
                        type="button"
                        disabled={
                            locked ||
                            !queueHasRoom ||
                            contextLoading ||
                            !context?.canGenerateMore
                        }
                        onClick={() => void run('more')}
                    >
                        Ещё 15
                    </button>

                    <button
                        className="button-secondary"
                        type="button"
                        disabled={locked || !queueHasRoom}
                        onClick={() => void run('random')}
                    >
                        Фулл рандом
                    </button>

                    <button
                        className="button-secondary"
                        type="button"
                        disabled={
                            locked ||
                            !queueHasRoom ||
                            !hasReferenceTracks
                        }
                        onClick={() => void run('similar')}
                    >
                        Похожие треки
                    </button>
                </div>
            </form>

            {context?.canGenerateMore && (
                <p className="ai-dj-context">
                    Контекст сохранён
                    {context.prompt
                        ? `: ${context.prompt}`
                        : '. Можно запросить ещё 15.'}
                </p>
            )}

            {maxPendingItems !== null && (
                <p className="ai-dj-capacity">
                    В очереди: {currentCount} из {maxPendingItems}.
                    {availableSlots !== null &&
                    availableSlots < batchSize
                        ? ' Для новой подборки нужно минимум 15 свободных мест.'
                        : ''}
                </p>
            )}

            {contextError && (
                <div className="ai-dj-context-error">
                    <span>
                        Не удалось обновить AI-контекст:
                        {' '}
                        {contextError}
                    </span>

                    <button
                        type="button"
                        className="text-action"
                        disabled={contextLoading || locked}
                        onClick={reloadContext}
                    >
                        Повторить
                    </button>
                </div>
            )}

            {activeAction && (
                <div
                    className="ai-dj-progress"
                    role="status"
                    aria-live="polite"
                >
                    <span
                        className="ai-dj-spinner"
                        aria-hidden="true"
                    />

                    ИИ-диджей подбирает музыку…
                </div>
            )}

            {error && (
                <p
                    className="room-error"
                    role="alert"
                >
                    {error}
                </p>
            )}

            {result && (
                <div
                    className="ai-dj-result"
                    role="status"
                >
                    <h3>
                        Подборка добавлена в очередь
                    </h3>

                    <p>
                        Новые композиции уже доступны
                        всем участникам комнаты.
                    </p>

                    <ol>
                        {result.tracks.map((item) => (
                            <li key={item.id}>
                                <span>
                                    {item.track.title}
                                </span>

                                <small>
                                    {item.track.artists.join(', ')}
                                </small>
                            </li>
                        ))}
                    </ol>
                </div>
            )}
        </section>
    )
}