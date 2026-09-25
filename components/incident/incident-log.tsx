'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ROLES, elapsed, wallClock } from '@/lib/incident/scenario'
import type { LogEntry } from '@/lib/incident/types'
import { useIncident } from './incident-provider'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'decision', label: 'Decisions' },
  { id: 'comms', label: 'Comms' },
  { id: 'signal', label: 'Signals' },
] as const

type Filter = (typeof FILTERS)[number]['id']

const kindStyle: Record<LogEntry['kind'], string> = {
  decision: 'text-foreground font-medium',
  comms: 'text-foreground',
  task: 'text-foreground',
  note: 'text-foreground italic',
  signal: 'text-muted-foreground',
  trigger: 'text-warn',
  system: 'text-muted-foreground',
}

const kindTag: Record<LogEntry['kind'], string> = {
  decision: 'DEC',
  comms: 'COM',
  task: 'TSK',
  note: 'NOTE',
  signal: 'SIG',
  trigger: 'TRG',
  system: 'SYS',
}

function matches(e: LogEntry, f: Filter) {
  if (f === 'all') return true
  if (f === 'decision') return e.kind === 'decision' || e.kind === 'note' || e.kind === 'task'
  if (f === 'signal') return e.kind === 'signal' || e.kind === 'trigger'
  return e.kind === f
}

export function IncidentLog() {
  const { state, dispatch } = useIncident()
  const [filter, setFilter] = useState<Filter>('all')
  const [text, setText] = useState('')
  const [copied, setCopied] = useState(false)
  const actor = state.role === 'ALL' ? 'IC' : state.role
  const entries = state.log.filter((e) => matches(e, filter)).slice().reverse()

  const submit = () => {
    const v = text.trim()
    if (!v) return
    dispatch({ type: 'note', text: v, actor })
    setText('')
  }

  const exportLog = async () => {
    const lines = [
      `# MochaTrade incident log: ${state.flags.sev ?? 'undeclared'}`,
      `Exported at T+${elapsed(state.t)} (${wallClock(state.t)} UTC)`,
      '',
      ...state.log.map(
        (e) =>
          `- **T+${elapsed(e.t)}** [${e.actor === 'SYSTEM' ? 'SYSTEM' : ROLES[e.actor].short}] ${e.text}${e.detail ? `\n  > ${e.detail.replace(/\n/g, '\n  > ')}` : ''}`,
      ),
    ]
    await navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section aria-labelledby="log-title" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 id="log-title" className="text-sm font-semibold">
          Incident log
        </h2>
        <Button size="sm" variant="ghost" onClick={exportLog} aria-label="Copy log as Markdown for post-mortem">
          {copied ? <Check /> : <Copy />}
          {copied ? 'Copied' : 'Export'}
        </Button>
      </div>

      <form
        className="border-b border-border p-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label htmlFor="log-note" className="sr-only">
          Log a decision or note
        </label>
        <input
          id="log-note"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault()
          }}
          placeholder={`Log a decision as ${ROLES[actor].person} (press N, then Enter)`}
          className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm placeholder:text-muted-foreground"
        />
        <div className="mt-2 flex gap-1" role="group" aria-label="Filter log">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'rounded px-2 py-0.5 text-xs',
                filter === f.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </form>

      <ol className="min-h-0 flex-1 overflow-y-auto px-4 py-2" aria-live="polite" aria-relevant="additions">
        {entries.map((e) => (
          <li key={e.id} className="flex gap-2 border-b border-border/50 py-1.5 last:border-0">
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{elapsed(e.t)}</span>
            <span className="shrink-0 font-mono text-[10px] leading-5 text-muted-foreground">{kindTag[e.kind]}</span>
            <div className="min-w-0 flex-1">
              <p className={cn('text-xs leading-5', kindStyle[e.kind])}>
                {e.actor !== 'SYSTEM' && <span className="mr-1 font-mono text-[10px] font-semibold">{ROLES[e.actor].short}</span>}
                {e.text}
              </p>
              {e.detail && (
                <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-[11px] leading-relaxed text-muted-foreground">{e.detail}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
