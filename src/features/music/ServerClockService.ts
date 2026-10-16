interface ClockSample {
    offsetMs: number
    roundTripMs: number
}

export class ServerClockService {
    private readonly samples: ClockSample[] = []
    private readonly maxSamples = 8

    private offsetMs = 0
    private synchronized = false

    observe(
        serverTimeUtc: string,
        requestStartedAtMs: number,
        responseReceivedAtMs: number,
    ): void {
        const serverTimeMs = Date.parse(serverTimeUtc)

        if (
            !Number.isFinite(serverTimeMs) ||
            !Number.isFinite(requestStartedAtMs) ||
            !Number.isFinite(responseReceivedAtMs)
        ) {
            return
        }

        const roundTripMs =
            responseReceivedAtMs - requestStartedAtMs

        if (
            roundTripMs < 0 ||
            roundTripMs > 15000
        ) {
            return
        }

        const estimatedClientMidpoint =
            requestStartedAtMs + roundTripMs / 2

        const offsetMs =
            serverTimeMs - estimatedClientMidpoint

        this.samples.push({
            offsetMs,
            roundTripMs,
        })

        if (this.samples.length > this.maxSamples) {
            this.samples.shift()
        }

        // Lower RTT usually gives a better clock estimate.
        const ordered = [...this.samples].sort(
            (left, right) =>
                left.roundTripMs - right.roundTripMs,
        )

        const bestSamples = ordered.slice(
            0,
            Math.min(3, ordered.length),
        )

        this.offsetMs =
            bestSamples.reduce(
                (sum, sample) => sum + sample.offsetMs,
                0,
            ) / bestSamples.length

        this.synchronized = true
    }

    getServerTimeMs(): number {
        return Date.now() + this.offsetMs
    }

    getOffsetMs(): number {
        return this.offsetMs
    }

    isSynchronized(): boolean {
        return this.synchronized
    }

    reset(): void {
        this.samples.length = 0
        this.offsetMs = 0
        this.synchronized = false
    }
}