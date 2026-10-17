import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { VibyBrand } from '../components/VibyBrand'

import {
    createOrContinueGuestSession,
} from '../features/guest-session/guestSession'

import { roomsApi } from '../features/rooms/roomsApi'
import { getErrorMessage } from '../shared/api/httpClient'

import './entryPages.css'

export function CreateRoomPage() {
    const navigate = useNavigate()

    const [name, setName] = useState('')
    const [displayName, setDisplayName] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const requestRef = useRef<AbortController | null>(null)

    useEffect(() => {
        return () => {
            requestRef.current?.abort()
        }
    }, [])

    async function createRoom(): Promise<void> {
        if (requestRef.current) {
            return
        }

        const roomName = name.trim()
        const guestName = displayName.trim()

        if (!roomName || roomName.length > 100) {
            setError(
                'Название комнаты должно содержать от 1 до 100 символов.',
            )
            return
        }

        if (!guestName || guestName.length > 40) {
            setError(
                'Имя участника должно содержать от 1 до 40 символов.',
            )
            return
        }

        const controller = new AbortController()

        requestRef.current = controller
        setBusy(true)
        setError('')

        try {
            await createOrContinueGuestSession(controller.signal)

            if (controller.signal.aborted) {
                return
            }

            const room = await roomsApi.create(
                roomName,
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
            if (requestRef.current === controller) {
                requestRef.current = null
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
                    aria-labelledby="create-title"
                >
                    <Link to="/" className="entry-back-link">
                        <span aria-hidden="true">←</span>
                        На главную
                    </Link>

                    <div className="entry-heading">
            <span className="entry-kicker">
              НОВАЯ КОМНАТА
            </span>

                        <h1 id="create-title">
                            Собери друзей вместе
                        </h1>

                        <p>
                            Придумай название комнаты и укажи,
                            как тебя будут видеть другие участники.
                        </p>
                    </div>

                    <form
                        className="entry-card"
                        onSubmit={(event) => {
                            event.preventDefault()
                            void createRoom()
                        }}
                    >
                        <div className="entry-card-heading">
                            <h2>Создание комнаты</h2>
                            <span className="entry-card-caption">
                Без регистрации
              </span>
                        </div>

                        <div className="entry-field">
                            <div className="entry-field-heading">
                                <label htmlFor="room-name">
                                    Название комнаты
                                </label>

                                <span className="entry-field-count">
                  {name.trim().length}/100
                </span>
                            </div>

                            <input
                                id="room-name"
                                name="roomName"
                                type="text"
                                autoFocus
                                autoComplete="off"
                                placeholder="Например, Вечерний вайб"
                                maxLength={100}
                                value={name}
                                disabled={busy}
                                aria-describedby="room-name-hint"
                                onChange={(event) => {
                                    setName(event.target.value)
                                    setError('')
                                }}
                                required
                            />

                            <p
                                className="entry-field-hint"
                                id="room-name-hint"
                            >
                                Название увидят все приглашённые.
                            </p>
                        </div>

                        <div className="entry-field">
                            <div className="entry-field-heading">
                                <label htmlFor="creator-name">
                                    Твоё имя
                                </label>

                                <span className="entry-field-count">
                  {displayName.trim().length}/40
                </span>
                            </div>

                            <input
                                id="creator-name"
                                name="displayName"
                                type="text"
                                autoComplete="nickname"
                                placeholder="Как к тебе обращаться?"
                                maxLength={40}
                                value={displayName}
                                disabled={busy}
                                aria-describedby="creator-name-hint"
                                onChange={(event) => {
                                    setDisplayName(event.target.value)
                                    setError('')
                                }}
                                required
                            />

                            <p
                                className="entry-field-hint"
                                id="creator-name-hint"
                            >
                                Ты автоматически станешь владельцем комнаты.
                            </p>
                        </div>

                        {error && (
                            <div className="entry-error" role="alert">
                                {error}
                            </div>
                        )}

                        <div className="entry-form-footer">
                            <button
                                type="submit"
                                className="button-primary entry-submit"
                                disabled={
                                    busy ||
                                    !name.trim() ||
                                    !displayName.trim()
                                }
                            >
                                {busy
                                    ? 'Создаём комнату…'
                                    : 'Создать комнату'}
                            </button>

                            <p className="entry-footer-hint">
                                Ссылкой на комнату можно будет
                                поделиться сразу после создания.
                            </p>
                        </div>
                    </form>
                </section>

                <aside
                    className="entry-aside"
                    aria-label="Возможности комнаты"
                >
                    <div className="entry-aside-top">
            <span className="entry-aside-label">
              VIBYROOM
            </span>

                        <span className="entry-aside-status">
              Комната для своих
            </span>
                    </div>

                    <h2>
                        Одно место
                        <span> для вашей компании</span>
                    </h2>

                    <p className="entry-aside-description">
                        Создай музыкальное пространство
                        и управляй им вместе с друзьями.
                    </p>

                    <div className="entry-aside-divider" />

                    <div className="entry-feature-list">
                        <div className="entry-feature">
                            <span className="entry-feature-number">01</span>

                            <div>
                                <strong>Приглашения по ссылке</strong>
                                <p>
                                    Отправь ссылку другу,
                                    чтобы он вошёл в комнату.
                                </p>
                            </div>
                        </div>

                        <div className="entry-feature">
                            <span className="entry-feature-number">02</span>

                            <div>
                                <strong>Участники онлайн</strong>
                                <p>
                                    Смотри, кто сейчас находится
                                    в комнате.
                                </p>
                            </div>
                        </div>

                        <div className="entry-feature">
                            <span className="entry-feature-number">03</span>

                            <div>
                                <strong>Управление комнатой</strong>
                                <p>
                                    Передавай права владельца
                                    и управляй участниками.
                                </p>
                            </div>
                        </div>
                    </div>
                </aside>
            </main>
        </div>
    )
}