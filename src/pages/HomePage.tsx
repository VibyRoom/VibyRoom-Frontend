import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { VibyBrand } from '../components/VibyBrand'
import { HomeSoundVisual } from '../components/HomeSoundVisual'

function getInvitationCode(value: string): string | null {
    const input = value.trim()

    if (!input) {
        return null
    }

    if (
        /^https?:\/\//i.test(input) ||
        input.startsWith('/invite/') ||
        input.startsWith('/join/')
    ) {
        try {
            const url = new URL(input, window.location.origin)
            const parts = url.pathname.split('/').filter(Boolean)

            if (
                parts.length !== 2 ||
                !['invite', 'join'].includes(parts[0])
            ) {
                return null
            }

            const code = decodeURIComponent(parts[1])

            return /^[a-zA-Z0-9_-]+$/.test(code)
                ? code
                : null
        } catch {
            return null
        }
    }

    return /^[a-zA-Z0-9_-]+$/.test(input)
        ? input
        : null
}

export function HomePage() {
    const navigate = useNavigate()

    const [invitation, setInvitation] = useState('')
    const [error, setError] = useState('')

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        const code = getInvitationCode(invitation)

        if (!code) {
            setError('Введите корректный код или ссылку.')
            return
        }

        navigate(`/invite/${encodeURIComponent(code)}`)
    }

    return (
        <div className="site-shell">
            <header className="site-header">
                <VibyBrand />

                <span className="site-header-caption">
                    Музыка объединяет
                </span>
            </header>

            <main className="home-layout">
                <section className="home-hero">
                    <div className="eyebrow">
                        Твоя музыка. Твоя компания.
                    </div>

                    <h1>
                        Слушать музыку
                        <span> вместе.</span>
                    </h1>

                    <p className="home-description">
                        Создай комнату, пригласи друзей и проводи
                        время под любимую музыку. Все участники
                        находятся в одном музыкальном пространстве.
                    </p>

                    <Link
                        to="/rooms/create"
                        className="button button-primary home-create-button"
                    >
                        <span aria-hidden="true">＋</span>
                        Создать комнату
                    </Link>
                </section>

                <aside className="home-side">
                    <HomeSoundVisual />

                    <form
                        className="home-join-panel"
                        onSubmit={submit}
                    >
                        <h2>Уже пригласили?</h2>

                        <p>
                            Вставь код комнаты или ссылку приглашения.
                        </p>

                        <label htmlFor="invitation-input">
                            Приглашение
                        </label>

                        <input
                            id="invitation-input"
                            type="text"
                            placeholder="Код или ссылка"
                            value={invitation}
                            onChange={(event) => {
                                setInvitation(event.target.value)
                                setError('')
                            }}
                            required
                        />

                        {error && (
                            <p className="form-error" role="alert">
                                {error}
                            </p>
                        )}

                        <button
                            className="button-primary"
                            type="submit"
                            disabled={!invitation.trim()}
                        >
                            Присоединиться
                        </button>
                    </form>
                </aside>
            </main>
        </div>
    )
}