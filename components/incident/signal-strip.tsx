'use client'

import { cn } from '@/lib/utils'
import { ROLES, SIGNALS } from '@/lib/incident/scenario'
import type { Level, Sample, SignalKey } from '@/lib/incident/types'
import { useIncident } from './incident-provider'

const ORDER: SignalKey[] = ['liq', 'deviation', 'tickets', 'sentiment']

const levelText: Record<Level, string> = { ok: 'Normal', warn: 'Warning', crit: 'Critical' }

function Sparkline({ data, k, level }: { data: Sample[]; k: SignalKey; level: Level }) {
  const sig = SIGNALS[k]
  const w = 240
  const h = 44
  const window = data.slice(-180)
  const vals = window.map((d) => d[k])
  let min = Math.min(...vals, sig.lowerIsWorse ? sig.crit - 10 : 0)
  let max = Math.max(...vals, sig.lowerIsWorse ? 40 : sig.crit * 1.1)
  if (max === min) {
    max += 1
    min -= 1
  }
  const y = (v: number) => h - ((v - min) / (max - min)) * h
  const x = (i: number) => (window.length <= 1 ? w : (i / (window.length - 1)) * w)
  const points = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const stroke = level === 'crit' ? 'var(--crit)' : level === 'warn' ? 'var(--warn)' : 'var(--muted-foreground)'

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-11 w-full" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2={w} y1={y(sig.warn)} y2={y(sig.warn)} stroke="var(--warn)" strokeOpacity="0.4" strokeDasharray="3 3" />
      <line x1="0" x2={w} y1={y(sig.crit)} y2={y(sig.crit)} stroke="var(--crit)" strokeOpacity="0.5" strokeDasharray="3 3" />
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.75" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function SignalStrip() {
  const { state } = useIncident()

  return (
    <section aria-label="Live signals" className="grid grid-cols-2 gap-px border-b border-border bg-border lg:grid-cols-4">
      {ORDER.map((k) => {
        const sig = SIGNALS[k]
        const level = state.levels[k]
        const value = state.metrics[k]
        return (
          <div key={k} className={cn('relative bg-card px-4 pb-2 pt-3', level === 'crit' && 'bg-crit/[0.07]')}>
            {level !== 'ok' && (
              <span className={cn('absolute inset-x-0 top-0 h-0.5', level === 'crit' ? 'bg-crit' : 'bg-warn')} aria-hidden="true" />
            )}
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-xs font-medium text-muted-foreground">{sig.label}</h2>
              <span
                className={cn(
                  'font-mono text-[10px] font-semibold uppercase tracking-wider',
                  level === 'crit' ? 'text-crit' : level === 'warn' ? 'text-warn' : 'text-ok',
                )}
              >
                {levelText[level]}
              </span>
            </div>
            <p
              className={cn(
                'mt-1 font-mono text-3xl font-semibold tabular-nums',
                level === 'crit' ? 'text-crit' : level === 'warn' ? 'text-warn' : 'text-foreground',
              )}
            >
              {sig.format(value)}
            </p>
            <Sparkline data={state.history} k={k} level={level} />
            <p className="flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>
                warn {sig.format(sig.warn)} · crit {sig.format(sig.crit)}
              </span>
              <span>owner {ROLES[sig.owner].short}</span>
            </p>
            {k === 'deviation' && state.abnormalLiqs > 0 && (
              <p className="mt-1 font-mono text-[11px] text-crit">
                {Math.round(state.abnormalLiqs).toLocaleString('en-US')} liquidations flagged (deviation over 1.5%)
              </p>
            )}
          </div>
        )
      })}
    </section>
  )
}
