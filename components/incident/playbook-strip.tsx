'use client'

import { Check, Circle, CircleDot, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PLAYBOOK, RULES } from '@/lib/incident/scenario'
import type { SimState } from '@/lib/incident/types'
import { useIncident } from './incident-provider'

type StepState = 'waiting' | 'open' | 'done' | 'skipped'

function stepState(s: SimState, key: string): StepState {
  const [ruleId, kind] = key.split(':')
  let items = s.actions.filter((a) => a.ruleId === ruleId)
  if (kind) items = items.filter((a) => a.kind === kind)
  else if (items.length > 1) items = items.filter((a) => a.kind !== 'comms')
  if (items.length === 0) return 'waiting'
  const latest = items[items.length - 1]
  return latest.status === 'open' ? 'open' : latest.status === 'done' ? 'done' : 'skipped'
}

export function PlaybookStrip() {
  const { state } = useIncident()

  return (
    <nav aria-label="Response plan progress" className="grid grid-cols-2 gap-px border-b border-border bg-border md:grid-cols-5">
      {PLAYBOOK.map((phase) => {
        const states = phase.steps.map((st) => stepState(state, st.ruleId))
        const doneCount = states.filter((x) => x === 'done' || x === 'skipped').length
        const active = states.includes('open')
        const complete = doneCount === phase.steps.length
        return (
          <div key={phase.id} className={cn('bg-card px-4 py-2', active && 'bg-accent')}>
            <div className="flex items-baseline justify-between">
              <h3 className={cn('text-xs font-semibold', complete && 'text-ok')}>{phase.label}</h3>
              <span className="font-mono text-[10px] text-muted-foreground">
                {phase.window} · {doneCount}/{phase.steps.length}
              </span>
            </div>
            <ul className="mt-1 flex flex-col gap-0.5">
              {phase.steps.map((st, i) => {
                const ss = states[i]
                const rule = RULES.find((r) => r.id === st.ruleId.split(':')[0])
                return (
                  <li
                    key={st.ruleId}
                    className={cn(
                      'flex items-center gap-1.5 text-xs',
                      ss === 'waiting' && 'text-muted-foreground/70',
                      ss === 'open' && 'font-medium text-warn',
                      ss === 'skipped' && 'text-muted-foreground line-through',
                    )}
                    title={ss === 'waiting' && rule ? `Waiting on trigger: ${rule.trigger}` : undefined}
                  >
                    {ss === 'done' ? (
                      <Check className="size-3 text-ok" aria-hidden="true" />
                    ) : ss === 'open' ? (
                      <CircleDot className="size-3" aria-hidden="true" />
                    ) : ss === 'skipped' ? (
                      <Minus className="size-3" aria-hidden="true" />
                    ) : (
                      <Circle className="size-3" aria-hidden="true" />
                    )}
                    <span className="truncate">{st.label}</span>
                    <span className="sr-only">({ss})</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}
