import { useEffect, useRef } from 'react'

interface ConfirmDialogProps {
    title: string
    description: string
    confirmLabel: string
    destructive?: boolean
    busy: boolean
    error?: string
    onCancel: () => void
    onConfirm: () => void
}

export function ConfirmDialog({
                                  title,
                                  description,
                                  confirmLabel,
                                  destructive = false,
                                  busy,
                                  error,
                                  onCancel,
                                  onConfirm,
                              }: ConfirmDialogProps) {
    const dialogRef = useRef<HTMLDivElement>(null)
    const cancelButtonRef = useRef<HTMLButtonElement>(null)

    const cancelHandlerRef = useRef(onCancel)
    const busyRef = useRef(busy)

    useEffect(() => {
        cancelHandlerRef.current = onCancel
        busyRef.current = busy
    }, [onCancel, busy])

    useEffect(() => {
        const previousFocus =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null

        cancelButtonRef.current?.focus()

        function onKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                event.preventDefault()

                if (!busyRef.current) {
                    cancelHandlerRef.current()
                }

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

        document.addEventListener('keydown', onKeyDown)

        return () => {
            document.removeEventListener('keydown', onKeyDown)
            previousFocus?.focus()
        }
    }, [])

    return (
        <div
            className="dialog-backdrop"
            onMouseDown={(event) => {
                if (
                    event.target === event.currentTarget &&
                    !busy
                ) {
                    onCancel()
                }
            }}
        >
            <div
                ref={dialogRef}
                className="confirm-dialog"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-title"
                aria-describedby="confirm-description"
            >
                <h2 id="confirm-title">{title}</h2>

                <p id="confirm-description">
                    {description}
                </p>

                {error && (
                    <p className="form-error" role="alert">
                        {error}
                    </p>
                )}

                <div className="dialog-actions">
                    <button
                        ref={cancelButtonRef}
                        type="button"
                        className="button-secondary"
                        disabled={busy}
                        onClick={onCancel}
                    >
                        Отмена
                    </button>

                    <button
                        type="button"
                        className={
                            destructive
                                ? 'button-danger-solid'
                                : 'button-primary'
                        }
                        disabled={busy}
                        onClick={onConfirm}
                    >
                        {busy ? 'Выполняется…' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}