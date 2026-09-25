'use client'

import { Pause, Play, RotateCcw, FastForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { INCIDENT_DURATION, ROLES, elapsed, wallClock } from '@/lib/incident/scenario'
import type { Role } from '@/lib/incident/types'
import { useIncident } from './incident-provider'

const SPEEDS = [10, 30, 60]

export function TopBar() {
  const { state, dispatch } = useIncident()
  const { flags, metrics } = state
  const progress = (state.t / INCIDENT_DURATION) * 100
  const sev = flags.sev

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex size-8 items-center justify-center rounded-md bg-foreground font-mono text-sm font-bold text-background">
          M
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">MochaTrade Incident Console</p>
          <p className="text-xs text-muted-foreground">BTC flash crash · first 60 minutes</p>
        </div>
      </div>

      <div
        className={cn(
          'rounded-md px-2.5 py-1 font-mono text-xs font-bold tracking-wider',
          sev === 'SEV1' && 'bg-crit text-background',
          sev === 'SEV2' && 'bg-warn text-background',
          (sev === null || sev === 'NONE') && 'border border-border text-muted-foreground',
        )}
        aria-label="Incident severity"
      >
        {sev === null ? 'UNDECLARED' : sev === 'NONE' ? 'MONITORING' : sev}
      </div>

      <div className="flex min-w-40 flex-1 items-center gap-3">
        <div className="font-mono">
          <span className="text-2xl font-semibold tabular-nums">T+{elapsed(state.t)}</span>
          <span className="ml-2 text-xs text-muted-foreground">{wallClock(state.t)} UTC</span>
        </div>
        <div
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progress through the first 60 minutes"
        >
          <div className="h-full bg-foreground/70 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="font-mono text-sm">
        <span className="text-muted-foreground">BTC </span>
        <span className="tabular-nums">${Math.round(metrics.price).toLocaleString('en-US')}</span>
        <span className={cn('ml-2 tabular-nums', metrics.drawdown > 0.05 ? 'text-crit' : 'text-muted-foreground')}>
          -{(metrics.drawdown * 100).toFixed(1)}%
        </span>
        {flags.liqPaused && (
          <span className="ml-3 rounded bg-warn/15 px-1.5 py-0.5 text-xs text-warn">LIQ ENGINE PAUSED</span>
        )}
        {flags.oracleIndexOnly && (
          <span className="ml-3 rounded bg-ok/15 px-1.5 py-0.5 text-xs text-ok">INDEX-ONLY MARK</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="role-select">
          Viewing as
        </label>
        <select
          id="role-select"
          value={state.role}
          onChange={(e) => dispatch({ type: 'role', role: e.target.value as Role | 'ALL' })}
          className="h-8 w-36 rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="ALL">All roles (0)</option>
          {(Object.keys(ROLES) as Role[]).map((r, i) => (
            <option key={r} value={r}>
              {ROLES[r].person} · {ROLES[r].label} ({i + 1})
            </option>
          ))}
        </select>

        <div className="flex rounded-md border border-border" role="group" aria-label="Simulation speed">
          {SPEEDS.map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => dispatch({ type: 'speed', speed: sp })}
              aria-pressed={state.speed === sp}
              className={cn(
                'px-2 py-1 font-mono text-xs',
                state.speed === sp ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {sp}x
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => dispatch({ type: 'jump', to: Math.min(INCIDENT_DURATION, state.t + 300) })}
          aria-label="Skip ahead 5 minutes"
        >
          <FastForward /> 5m
        </Button>
        <Button size="sm" onClick={() => dispatch({ type: 'toggle' })} aria-label={state.running ? 'Pause' : 'Start'}>
          {state.running ? <Pause /> : <Play />}
          {state.running ? 'Pause' : state.t === 0 ? 'Start scenario' : 'Resume'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => dispatch({ type: 'reset' })} aria-label="Reset simulation">
          <RotateCcw />
        </Button>
      </div>
    </header>
  )
}
