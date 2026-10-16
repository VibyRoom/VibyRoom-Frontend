import { Link } from 'react-router-dom'

export function VibyBrand() {
    return (
        <Link
            to="/"
            className="brand"
            aria-label="VibyRoom — главная страница"
        >
      <span className="brand-mark" aria-hidden="true">
        <img src="/vibyroom-logo.png" alt="" />
      </span>

            <span className="brand-name">VibyRoom</span>
        </Link>
    )
}