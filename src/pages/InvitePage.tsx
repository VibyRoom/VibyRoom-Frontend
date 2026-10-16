import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { VibyBrand } from '../components/VibyBrand'

import {
    createOrContinueGuestSession,
} from '../features/guest-session/guestSession'

import { roomsApi } from '../features/rooms/roomsApi'
import type { RoomPreview } from '../features/rooms/types'
import { getErrorMessage } from '../shared/api/httpClient'

import './entryPages.css'

interface InvitationContentProps {
    code: string
}

function InvitationContent({ code }: InvitationContentProps) {
    const navigate = useNavigate()

    const [preview, setPreview] = useState<RoomPreview | null>(null)
    const [loading, setLoading] = useState(true)
    const [displayName, setDisplayName] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [previewVersion, setPreviewVersion] = useState(0)

    const joinRequestRef = useRef<AbortController | null>(null)

    useEffect(() => {
        const controller = new AbortController()

        void roomsApi.preview(code, controller.signal)
            .then((result) => {
                if (!controller.signal.aborted) {
                    setPreview(result)
                }
            })
            .catch((cause: unknown) => {
                if (!controller.signal.aborted) {
                    setError(getErrorMessage(cause))
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoading(false)
                }
            })

        return () => {
            controller.abort()
        }
    }, [code, previewVersion])

    useEffect(() => {
        return () => {
            joinRequestRef.current?.abort()
        }
    }, [])

    function retryPreview(): void {
        setPreview(null)
        setLoading(true)
        setError('')
        setPreviewVersion((version) => version + 1)
    }

    async function joinRoom(): Promise<void> {
        if (joinRequestRef.current || !preview) {
            return
        }

        const guestName = displayName.trim()

        if (!guestName || guestName.length > 40) {
            setError(
                'Имя должно содержать от 1 до 40 символов.',
            )
            return
        }

        const controller = new AbortController()

        joinRequestRef.current = controller
        setBusy(true)
        setError('')

        try {
            await createOrContinueGuestSession(controller.signal)

            if (controller.signal.aborted) {
                return
            }

            const room = await roomsApi.join(
                code,
                guestName,
                controller.signal,
            )

            if (!controller.signal.aborted) {
                navigate(`/rooms/${room.id}`, {
                    replace: true,
                })
            }
        } catch (cause) {
            if (!controller.signal.aborted) {
                setError(getErrorMessage(cause))
            }
        } finally {
            if (joinRequestRef.current === controller) {
                joinRequestRef.current = null
            }

            if (!controller.signal.aborted) {
                setBusy(false)
            }
        }
    }

    return (
        <div className="entry-page">
            <header className="site-header">
                <VibyBrand />

                <span className="site-header-caption">
          Музыка объединяет
        </span>
            </header>

            <main className="entry-layout">
                <section
                    className="entry-main"
                    aria-labelledby="invitation-title"
                >
                    <Link to="/" className="entry-back-link">
                        <span aria-hidden="true">←</span>
                        На главную
                    </Link>

                    <div className="entry-heading">
            <span className="entry-kicker">
              ПРИГЛАШЕНИЕ
            </span>

                        <h1 id="invitation-title">
                            Тебя пригласили
                        </h1>

                        <p>
                            Присоединяйся к комнате и проводи
                            время вместе с друзьями.
                        </p>
                    </div>

                    <div className="entry-card">
                        {loading && (
                            <div className="entry-loading" role="status">
                                <span className="entry-loading-indicator" />

                                <div>
                                    <strong>Загружаем приглашение</strong>
                                    <p>
                                        Получаем информацию о комнате…
                                    </p>
                                </div>
                            </div>
                        )}

                        {!loading && preview && (
                            <>
                                <div className="entry-card-heading">
                                    <h2>Информация о комнате</h2>
                                    <span className="entry-card-caption">
                    Приглашение
                  </span>
                                </div>

                                <div className="entry-room-preview">
                                    <div
                                        className="entry-room-symbol"
                                        aria-hidden="true"
                                    >
                                        ♫
                                    </div>

                                    <div className="entry-room-info">
                    <span className="entry-room-label">
                      Музыкальная комната
                    </span>

                                        <strong>{preview.name}</strong>
                                    </div>
                                </div>

                                <form
                                    className="entry-join-form"
                                    onSubmit={(event) => {
                                        event.preventDefault()
                                        void joinRoom()
                                    }}
                                >
                                    <div className="entry-field">
                                        <div className="entry-field-heading">
                                            <label htmlFor="invite-guest-name">
                                                Твоё имя
                                            </label>

                                            <span className="entry-field-count">
                        {displayName.trim().length}/40
                      </span>
                                        </div>

                                        <input
                                            id="invite-guest-name"
                                            name="displayName"
                                            type="text"
                                            placeholder="Как тебя представить друзьям?"
                                            autoComplete="nickname"
                                            maxLength={40}
                                            value={displayName}
                                            disabled={busy}
                                            aria-describedby="invite-guest-hint"
                                            onChange={(event) => {
                                                setDisplayName(event.target.value)
                                                setError('')
                                            }}
                                            required
                                        />

                                        <p
                                            className="entry-field-hint"
                                            id="invite-guest-hint"
                                        >
                                            Это имя будет видно другим участникам.
                                        </p>
                                    </div>

                                    {error && (
                                        <div
                                            className="entry-error"
                                            role="alert"
                                        >
                                            {error}
                                        </div>
                                    )}

                                    <div className="entry-form-footer">
                                        <button
                                            className="button-primary entry-submit"
                                            type="submit"
                                            disabled={busy || !displayName.trim()}
                                        >
                                            {busy
                                                ? 'Присоединяемся…'
                                                : 'Присоединиться к комнате'}
                                        </button>

                                        <p className="entry-footer-hint">
                                            Для входа не требуется регистрация.
                                        </p>
                                    </div>
                                </form>
                            </>
                        )}

                        {!loading && !preview && (
                            <div className="entry-unavailable">
                <span
                    className="entry-unavailable-symbol"
                    aria-hidden="true"
                >
                  !
                </span>

                                <h2>Не удалось открыть приглашение</h2>

                                <p>
                                    {error ||
                                        'Комната недоступна или приглашение устарело.'}
                                </p>

                                <button
                                    type="button"
                                    className="button-secondary"
                                    onClick={retryPreview}
                                >
                                    Повторить
                                </button>

                                <Link to="/" className="entry-secondary-link">
                                    На главную
                                </Link>
                            </div>
                        )}
                    </div>
                </section>

                <aside
                    className="entry-aside"
                    aria-label="Информация о входе"
                >
                    <div className="entry-aside-top">
            <span className="entry-aside-label">
              VIBYROOM
            </span>

                        <span className="entry-aside-status">
              По приглашению
            </span>
                    </div>

                    <h2>
                        Приятнее,
                        <span> когда вместе</span>
                    </h2>

                    <p className="entry-aside-description">
                        В VibyRoom можно собраться с друзьями
                        в одной музыкальной комнате.
                    </p>

                    <div className="entry-aside-divider" />

                    <div className="entry-feature-list">
                        <div className="entry-feature">
                            <span className="entry-feature-number">01</span>

                            <div>
                                <strong>Без регистрации</strong>
                                <p>
                                    Достаточно указать имя,
                                    чтобы присоединиться.
                                </p>
                            </div>
                        </div>

                        <div className="entry-feature">
                            <span className="entry-feature-number">02</span>

                            <div>
                                <strong>Общая комната</strong>
                                <p>
                                    Все участники видят друг друга
                                    и свои роли.
                                </p>
                            </div>
                        </div>

                        <div className="entry-feature">
                            <span className="entry-feature-number">03</span>

                            <div>
                                <strong>Живое присутствие</strong>
                                <p>
                                    Онлайн-статусы обновляются
                                    в реальном времени.
                                </p>
                            </div>
                        </div>
                    </div>
                </aside>
            </main>
        </div>
    )
}

export function InvitePage() {
    const { code = '' } = useParams()

    return (
        <InvitationContent
            key={code}
            code={code}
        />
    )
}