import { useEffect, useId, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'

import './inviteQr.css'

interface InviteQrButtonProps {
    invitationUrl: string
    roomName: string
}

export function InviteQrButton({
                                   invitationUrl,
                                   roomName,
                               }: InviteQrButtonProps) {
    const [open, setOpen] = useState(false)
    const [message, setMessage] = useState('')

    const titleId = useId()
    const descriptionId = useId()

    const triggerRef = useRef<HTMLButtonElement>(null)
    const closeRef = useRef<HTMLButtonElement>(null)
    const dialogRef = useRef<HTMLDivElement>(null)
    const qrRef = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        if (!open) {
            return
        }

        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        closeRef.current?.focus()

        function handleKeyDown(event: KeyboardEvent): void {
            if (event.key === 'Escape') {
                event.preventDefault()
                setOpen(false)
                return
            }

            if (event.key !== 'Tab') {
                return
            }

            const buttons = Array.from(
                dialogRef.current?.querySelectorAll<HTMLButtonElement>(
                    'button:not(:disabled)',
                ) ?? [],
            )

            if (buttons.length === 0) {
                event.preventDefault()
                return
            }

            const first = buttons[0]
            const last = buttons[buttons.length - 1]

            if (
                event.shiftKey &&
                document.activeElement === first
            ) {
                event.preventDefault()
                last.focus()
            } else if (
                !event.shiftKey &&
                document.activeElement === last
            ) {
                event.preventDefault()
                first.focus()
            }
        }

        document.addEventListener('keydown', handleKeyDown)

        return () => {
            document.body.style.overflow = previousOverflow
            document.removeEventListener(
                'keydown',
                handleKeyDown,
            )

            triggerRef.current?.focus()
        }
    }, [open])

    function openDialog(): void {
        setMessage('')
        setOpen(true)
    }

    function closeDialog(): void {
        setOpen(false)
    }

    async function copyInvitation(): Promise<void> {
        try {
            await navigator.clipboard.writeText(invitationUrl)

            setMessage('Ссылка скопирована.')
        } catch {
            setMessage('Не удалось скопировать ссылку.')
        }
    }

    function downloadQrCode(): void {
        const canvas = qrRef.current

        if (!canvas) {
            setMessage('QR-код ещё не готов.')
            return
        }

        try {
            const imageUrl = canvas.toDataURL('image/png')

            const link = document.createElement('a')
            link.href = imageUrl
            link.download = 'vibyroom-invite.png'

            link.click()

            setMessage('QR-код готов к сохранению.')
        } catch {
            setMessage('Не удалось сохранить QR-код.')
        }
    }

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                className="button-secondary invite-qr-trigger"
                onClick={openDialog}
            >
                <span aria-hidden="true">▦</span>
                Показать QR-код
            </button>

            {open && (
                <div
                    className="invite-qr-backdrop"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                            closeDialog()
                        }
                    }}
                >
                    <div
                        ref={dialogRef}
                        className="invite-qr-dialog"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        aria-describedby={descriptionId}
                    >
                        <div className="invite-qr-header">
                            <div>
                                <span className="section-kicker">
                                    VIBYROOM
                                </span>

                                <h2 id={titleId}>
                                    Пригласить в комнату
                                </h2>
                            </div>

                            <button
                                ref={closeRef}
                                type="button"
                                className="invite-qr-close"
                                aria-label="Закрыть QR-код"
                                onClick={closeDialog}
                            >
                                ×
                            </button>
                        </div>

                        <p
                            id={descriptionId}
                            className="invite-qr-description"
                        >
                            Покажи этот QR-код другу.
                            После сканирования откроется
                            приглашение в комнату.
                        </p>

                        <div className="invite-qr-code">
                            <QRCodeCanvas
                                ref={qrRef}
                                value={invitationUrl}
                                size={300}
                                level="M"
                                marginSize={4}
                                bgColor="#ffffff"
                                fgColor="#101421"
                                title={`Приглашение в комнату ${roomName}`}
                            />
                        </div>

                        <div className="invite-qr-room">
                            <span>Музыкальная комната</span>
                            <strong>{roomName}</strong>
                        </div>

                        <div className="invite-qr-link">
                            <span>Ссылка приглашения</span>
                            <code>{invitationUrl}</code>
                        </div>

                        {message && (
                            <p
                                className="invite-qr-message"
                                role="status"
                            >
                                {message}
                            </p>
                        )}

                        <div className="invite-qr-actions">
                            <button
                                type="button"
                                className="button-secondary"
                                onClick={() => {
                                    void copyInvitation()
                                }}
                            >
                                Скопировать ссылку
                            </button>

                            <button
                                type="button"
                                className="button-primary"
                                onClick={downloadQrCode}
                            >
                                Скачать PNG
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}