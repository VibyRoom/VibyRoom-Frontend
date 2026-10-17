import './homeSoundVisual.css'

const waveHeights = [
    18, 26, 38, 31, 52, 68, 43,
    74, 57, 88, 70, 96, 70,
    88, 57, 74, 43, 68, 52,
    31, 38, 26, 18,
]

export function HomeSoundVisual() {
    return (
        <div className="home-soundstage">
            <div className="home-soundstage-header">
                <span className="home-soundstage-label">
                    <span
                        className="home-soundstage-live-dot"
                        aria-hidden="true"
                    />

                    В ОДНОМ РИТМЕ
                </span>

                <span className="home-soundstage-index">
                    VR / 01
                </span>
            </div>

            <div
                className="home-soundstage-scene"
                aria-hidden="true"
            >
                <span className="home-soundstage-ring ring-a" />
                <span className="home-soundstage-ring ring-b" />

                <span className="home-soundstage-line line-a" />
                <span className="home-soundstage-line line-b" />

                <div className="home-soundstage-wave">
                    {waveHeights.map((height, index) => (
                        <span
                            key={index}
                            style={{
                                height: `${height}%`,
                                animationDelay:
                                    `${index * -0.12}s`,
                            }}
                        />
                    ))}
                </div>

                <span className="home-soundstage-spark spark-a" />
                <span className="home-soundstage-spark spark-b" />
                <span className="home-soundstage-spark spark-c" />
                <span className="home-soundstage-spark spark-d" />
            </div>

            <div className="home-soundstage-footer">
                <span>♫</span>

                <strong>
                    Один ритм на всех
                </strong>

                <span className="home-soundstage-dashes">
                    <i />
                    <i />
                    <i />
                </span>
            </div>
        </div>
    )
}