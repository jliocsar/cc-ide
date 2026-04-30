// Dev-only playground for trying styles on components in isolation.
// Only rendered when `import.meta.env.DEV` — see board-view.tsx.

export function DevSandbox(): JSX.Element {
  return (
    <div className="h-full w-full overflow-auto bg-background p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-10">
        <header className="flex flex-col gap-1">
          <h2 className="font-mono text-sm uppercase tracking-wider text-muted-foreground">
            Session status — variants
          </h2>
          <p className="text-xs text-muted-foreground/70">
            Pick the live look and the matching dormant/exited treatment. Replace the badge in{' '}
            <code>sessions-section.tsx</code> with the chosen variant.
          </p>
        </header>

        <section className="flex flex-col gap-3">
          <SectionHeader title="Live — pill chrome" />
          <PillCard label="Baseline (current)">
            <BaselinePill />
          </PillCard>
          <PillCard label="Pulsing dot">
            <PulsingDotPill />
          </PillCard>
          <PillCard label="Conic gradient border">
            <ConicBorderPill />
          </PillCard>
          <PillCard label="Breathing opacity">
            <BreathingPill />
          </PillCard>
          <PillCard label="Radiating ring">
            <RingPill />
          </PillCard>
          <PillCard label="Bouncing dots">
            <BouncingDotsPill />
          </PillCard>
          <PillCard label="Glow halo">
            <GlowHaloPill />
          </PillCard>
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeader title="Live — bare (no pill chrome)" />
          <PillCard label="Naked pulsing dot">
            <Naked.PulsingDot />
          </PillCard>
          <PillCard label="Glowing dot">
            <Naked.GlowDot />
          </PillCard>
          <PillCard label="Concentric rings">
            <Naked.ConcentricRings />
          </PillCard>
          <PillCard label="Activity wave (3 bars)">
            <Naked.ActivityWave />
          </PillCard>
          <PillCard label="Radar sweep">
            <Naked.RadarSweep />
          </PillCard>
          <PillCard label="Dot + label, no chrome">
            <Naked.DotWithLabel />
          </PillCard>
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeader title="Dormant" />
          <PillCard label="Dormant pill (muted)">
            <Dormant.Pill />
          </PillCard>
          <PillCard label="Dormant slow-blink dot">
            <Dormant.BlinkDot />
          </PillCard>
          <PillCard label="Dormant zzz icon">
            <Dormant.ZzzIcon />
          </PillCard>
          <PillCard label="Dormant hollow ring">
            <Dormant.HollowRing />
          </PillCard>
        </section>

        <section className="flex flex-col gap-3">
          <SectionHeader title="Exited" />
          <PillCard label="Exited pill (red)">
            <Exited.PillRed />
          </PillCard>
          <PillCard label="Exited pill (muted)">
            <Exited.PillMuted />
          </PillCard>
          <PillCard label="Exited × icon">
            <Exited.XIcon />
          </PillCard>
          <PillCard label="Exited dot strikethrough">
            <Exited.StruckDot />
          </PillCard>
        </section>

        <section className="flex flex-col gap-2 border-t border-border pt-6">
          <SectionHeader title="All states, side by side" />
          <p className="text-[11px] text-muted-foreground/70">
            Three rows show how a chosen design language reads across states.
          </p>
          <StateRow label="Pill + dot">
            <PulsingDotPill />
            <Dormant.Pill />
            <Exited.PillRed />
          </StateRow>
          <StateRow label="Bare dot">
            <Naked.PulsingDot />
            <Dormant.BlinkDot />
            <Exited.StruckDot />
          </StateRow>
          <StateRow label="Iconographic">
            <Naked.GlowDot />
            <Dormant.ZzzIcon />
            <Exited.XIcon />
          </StateRow>
        </section>
      </div>
    </div>
  )
}

function SectionHeader({ title }: { title: string }): JSX.Element {
  return (
    <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{title}</h3>
  )
}

function PillCard({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-card p-3">
      <span className="font-mono text-[11px] text-muted-foreground">{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  )
}

function StateRow({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center gap-4 rounded-md border border-border bg-card p-3">
      <span className="w-32 shrink-0 font-mono text-[11px] text-muted-foreground">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}

/* ---------- LIVE: pill chrome ---------- */

function BaselinePill(): JSX.Element {
  return (
    <span className="shrink-0 rounded-sm border border-green-500/30 bg-green-500/15 px-1 py-px font-mono text-[9px] uppercase leading-none tracking-wider text-green-500">
      live
    </span>
  )
}

function PulsingDotPill(): JSX.Element {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-green-500/30 bg-green-500/10 px-1.5 py-px font-mono text-[9px] uppercase leading-none tracking-wider text-green-500">
      <span
        className="size-1.5 rounded-full bg-green-500"
        style={{ animation: 'cc-pill-pulse-dot 1.5s ease-in-out infinite' }}
      />
      live
    </span>
  )
}

function ConicBorderPill(): JSX.Element {
  return (
    <span
      className="relative inline-flex shrink-0 items-center gap-1 overflow-hidden rounded-sm px-1.5 py-px font-mono text-[9px] uppercase leading-none tracking-wider text-green-500"
      style={{ backgroundColor: 'color-mix(in oklab, var(--background) 92%, transparent)' }}
    >
      <span
        aria-hidden
        className="absolute -inset-3"
        style={{
          background:
            'conic-gradient(from 0deg, transparent 0%, oklch(0.74 0.18 152) 25%, transparent 50%, oklch(0.74 0.18 152) 75%, transparent 100%)',
          animation: 'cc-pill-conic-spin 3s linear infinite',
        }}
      />
      <span
        aria-hidden
        className="absolute inset-px rounded-sm"
        style={{ background: 'var(--card)' }}
      />
      <span className="relative">live</span>
    </span>
  )
}

function BreathingPill(): JSX.Element {
  return (
    <span
      className="shrink-0 rounded-sm border border-green-500/40 bg-green-500/15 px-1 py-px font-mono text-[9px] uppercase leading-none tracking-wider text-green-500"
      style={{ animation: 'cc-pill-breathe 2.4s ease-in-out infinite' }}
    >
      live
    </span>
  )
}

function RingPill(): JSX.Element {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-green-500/30 bg-green-500/10 px-1.5 py-px font-mono text-[9px] uppercase leading-none tracking-wider text-green-500">
      <span className="relative inline-flex size-1.5 items-center justify-center">
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border border-green-500"
          style={{ animation: 'cc-pill-ring 1.6s ease-out infinite' }}
        />
        <span className="relative size-1.5 rounded-full bg-green-500" />
      </span>
      live
    </span>
  )
}

function BouncingDotsPill(): JSX.Element {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-green-500/30 bg-green-500/10 px-1.5 py-px font-mono text-[9px] uppercase leading-none tracking-wider text-green-500">
      <span className="inline-flex items-end gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1 rounded-full bg-green-500"
            style={{
              animation: 'cc-pill-dot-bounce 1.2s ease-in-out infinite',
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </span>
      live
    </span>
  )
}

function GlowHaloPill(): JSX.Element {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-green-500/30 bg-green-500/10 px-1.5 py-px font-mono text-[9px] uppercase leading-none tracking-wider text-green-500">
      <span
        className="size-1.5 rounded-full bg-green-500"
        style={{ animation: 'cc-pill-glow 1.8s ease-out infinite' }}
      />
      live
    </span>
  )
}

/* ---------- LIVE: bare (no pill chrome) ---------- */

const Naked = {
  PulsingDot(): JSX.Element {
    return (
      <span
        role="img"
        aria-label="live"
        className="inline-block size-2 rounded-full bg-green-500"
        style={{ animation: 'cc-pill-pulse-dot 1.5s ease-in-out infinite' }}
      />
    )
  },

  GlowDot(): JSX.Element {
    return (
      <span
        role="img"
        aria-label="live"
        className="inline-block size-2 rounded-full bg-green-500"
        style={{ animation: 'cc-pill-glow 1.8s ease-out infinite' }}
      />
    )
  },

  ConcentricRings(): JSX.Element {
    return (
      <span
        role="img"
        aria-label="live"
        className="relative inline-flex size-3 items-center justify-center"
      >
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border border-green-500/70"
          style={{ animation: 'cc-pill-ring 1.6s ease-out infinite' }}
        />
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border border-green-500/70"
          style={{ animation: 'cc-pill-ring 1.6s ease-out 0.6s infinite' }}
        />
        <span className="relative size-1.5 rounded-full bg-green-500" />
      </span>
    )
  },

  ActivityWave(): JSX.Element {
    return (
      <span role="img" aria-label="live" className="inline-flex h-3 items-end gap-0.5" title="live">
        {(['cc-pill-wave-1', 'cc-pill-wave-2', 'cc-pill-wave-3'] as const).map((kf, i) => (
          <span
            key={kf}
            className="w-0.5 rounded-sm bg-green-500"
            style={{
              animation: `${kf} 0.9s ease-in-out infinite`,
              animationDelay: `${i * 0.12}s`,
            }}
          />
        ))}
      </span>
    )
  },

  RadarSweep(): JSX.Element {
    return (
      <span
        role="img"
        aria-label="live"
        className="relative inline-block size-3 overflow-hidden rounded-full border border-green-500/40"
      >
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'conic-gradient(from 0deg, oklch(0.74 0.18 152 / 0) 0deg, oklch(0.74 0.18 152 / 0.85) 60deg, oklch(0.74 0.18 152 / 0) 80deg, transparent 360deg)',
            animation: 'cc-pill-conic-spin 1.6s linear infinite',
          }}
        />
        <span className="absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-green-500" />
      </span>
    )
  },

  DotWithLabel(): JSX.Element {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[10px] text-green-500">
        <span
          className="size-1.5 rounded-full bg-green-500"
          style={{ animation: 'cc-pill-pulse-dot 1.5s ease-in-out infinite' }}
        />
        live
      </span>
    )
  },
}

/* ---------- DORMANT ---------- */

const Dormant = {
  Pill(): JSX.Element {
    return (
      <span className="shrink-0 rounded-sm border border-border bg-muted/40 px-1 py-px font-mono text-[9px] uppercase leading-none tracking-wider text-muted-foreground">
        dormant
      </span>
    )
  },

  BlinkDot(): JSX.Element {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground/70">
        <span
          className="size-1.5 rounded-full bg-muted-foreground/50"
          style={{ animation: 'cc-pill-dormant-blink 4s ease-in-out infinite' }}
        />
        dormant
      </span>
    )
  },

  ZzzIcon(): JSX.Element {
    return (
      <span
        className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground/70"
        title="dormant"
      >
        <svg viewBox="0 0 12 12" className="size-3 text-muted-foreground/60" aria-hidden>
          <path
            d="M2 3 L6 3 L2 8 L6 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d="M6 6 L9 6 L6 9 L9 9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
        dormant
      </span>
    )
  },

  HollowRing(): JSX.Element {
    return (
      <span
        role="img"
        aria-label="dormant"
        className="inline-block size-2 rounded-full border border-muted-foreground/50"
      />
    )
  },
}

/* ---------- EXITED ---------- */

const Exited = {
  PillRed(): JSX.Element {
    return (
      <span className="shrink-0 rounded-sm border border-red-500/30 bg-red-500/10 px-1 py-px font-mono text-[9px] uppercase leading-none tracking-wider text-red-500">
        exited
      </span>
    )
  },

  PillMuted(): JSX.Element {
    return (
      <span className="shrink-0 rounded-sm border border-border bg-muted/30 px-1 py-px font-mono text-[9px] uppercase leading-none tracking-wider text-muted-foreground/70">
        exited
      </span>
    )
  },

  XIcon(): JSX.Element {
    return (
      <span
        className="inline-flex items-center gap-1 font-mono text-[10px] text-red-500/80"
        title="exited"
      >
        <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
          <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1" />
          <path d="M4 4 L8 8 M8 4 L4 8" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        exited
      </span>
    )
  },

  StruckDot(): JSX.Element {
    return (
      <span
        role="img"
        aria-label="exited"
        className="relative inline-flex size-2 items-center justify-center"
      >
        <span className="size-2 rounded-full bg-muted-foreground/50" />
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-red-500/70"
        />
      </span>
    )
  },
}
