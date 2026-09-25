'use client'

import { useState } from 'react'
import { Check, MessageSquareText, Scale, ListChecks } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ROLES, TEMPLATES, elapsed, fillTemplate } from '@/lib/incident/scenario'
import type { ActionItem, Severity } from '@/lib/incident/types'
import { useIncident } from './incident-provider'

const sevRank: Record<Severity, number> = { critical: 0, high: 1, normal: 2 }
const kindIcon = { decision: Scale, comms: MessageSquareText, task: ListChecks }
const kindLabel = { decision: 'Decision', comms: 'Send comms', task: 'Task' }

function Due({ item, now }: { item: ActionItem; now: number }) {
  const left = item.dueAt - now
  const overdue = left < 0
  return (
    <span
      className={cn(
        'font-mono text-xs tabular-nums',
        overdue ? 'font-semibold text-crit' : left < 60 ? 'text-warn' : 'text-muted-foreground',
      )}
    >
      {overdue ? `OVERDUE +${elapsed(-left)}` : `due in ${elapsed(left)}`}
    </span>
  )
}

function ActionCard({ item, isNow }: { item: ActionItem; isNow: boolean }) {
  const { state, dispatch } = useIncident()
  const [note, setNote] = useState('')
  const Icon = kindIcon[item.kind]
  const actor = state.role === 'ALL' ? item.owner : state.role
  const tpl = item.templateId ? TEMPLATES.find((t) => t.id === item.templateId) : undefined
  const selected = state.selectedTemplateId === item.templateId && !!item.templateId

  return (
    <article
      className={cn(
        'rounded-lg border bg-card p-3',
        isNow ? 'border-foreground/40 shadow-lg shadow-black/20' : 'border-border',
        item.severity === 'critical' && 'border-l-4 border-l-crit',
        item.severity === 'high' && 'border-l-4 border-l-warn',
      )}
      aria-labelledby={`${item.id}-title`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {isNow && <span className="rounded bg-foreground px-1.5 py-0.5 font-mono text-[10px] font-bold text-background">NOW</span>}
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Icon className="size-3.5" aria-hidden="true" />
          {kindLabel[item.kind]}
        </span>
        <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] font-semibold">
          {ROLES[item.owner].short} · {ROLES[item.owner].person}
        </span>
        <span className="ml-auto">
          <Due item={item} now={state.t} />
        </span>
      </div>

      <h3 id={`${item.id}-title`} className={cn('mt-2 font-semibold leading-snug', isNow ? 'text-base' : 'text-sm')}>
        {item.title}
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.detail}</p>

      {item.kind === 'decision' && item.options && (
        <div className="mt-3 flex flex-col gap-2">
          {item.options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => dispatch({ type: 'resolve', id: item.id, optionId: o.id, note: note.trim() || undefined, actor })}
              className={cn(
                'rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-2',
                o.tone === 'danger' ? 'border-crit/40' : 'border-border',
              )}
            >
              <span className="block text-sm font-medium">{o.label}</span>
              {o.hint && <span className="block text-xs text-muted-foreground">{o.hint}</span>}
            </button>
          ))}
        </div>
      )}

      {item.kind === 'comms' && tpl && (
        <div className="mt-3 rounded-md bg-muted/60 p-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{tpl.channel}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed">{fillTemplate(tpl.body, state)}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor={`${item.id}-note`} className="sr-only">
          Rationale or note
        </label>
        <input
          id={`${item.id}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={item.kind === 'decision' ? 'Rationale (logged with decision)' : 'Note (optional)'}
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm placeholder:text-muted-foreground"
        />
        {item.kind === 'task' && (
          <Button size="sm" onClick={() => dispatch({ type: 'resolve', id: item.id, note: note.trim() || undefined, actor })}>
            <Check /> Done
          </Button>
        )}
        {item.kind === 'comms' && tpl && (
          <>
            <Button
              size="sm"
              variant={selected ? 'secondary' : 'outline'}
              onClick={() => dispatch({ type: 'select-template', id: selected ? null : tpl.id })}
            >
              {selected ? 'Editing' : 'Edit'}
            </Button>
            <Button
              size="sm"
              onClick={() => dispatch({ type: 'send', templateId: tpl.id, body: fillTemplate(tpl.body, state), actor })}
            >
              Send now
            </Button>
          </>
        )}
        <button
          type="button"
          onClick={() => dispatch({ type: 'dismiss', id: item.id, note: note.trim() || undefined, actor })}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Skip
        </button>
      </div>
    </article>
  )
}

export function ActionQueue() {
  const { state } = useIncident()
  const open = state.actions
    .filter((a) => a.status === 'open')
    .sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || a.dueAt - b.dueAt)
  const mine = state.role === 'ALL' ? open : open.filter((a) => a.owner === state.role)
  const others = open.length - mine.length
  const resolved = state.actions.filter((a) => a.status !== 'open').sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0))
  const overdue = open.filter((a) => a.dueAt < state.t).length

  return (
    <section aria-labelledby="queue-title" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
        <h2 id="queue-title" className="text-sm font-semibold">
          {state.role === 'ALL' ? 'Action queue' : `${ROLES[state.role].person}’s queue`}
          <span className="ml-2 font-mono text-xs text-muted-foreground">{mine.length} open</span>
        </h2>
        <p className="font-mono text-xs">
          {overdue > 0 && <span className="text-crit">{overdue} overdue</span>}
          {others > 0 && <span className="ml-2 text-muted-foreground">+{others} for others</span>}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {mine.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm font-medium">{state.t === 0 ? 'All quiet. Press Start or Space to run the scenario.' : 'Nothing needs you right now.'}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Actions appear here automatically when a signal crosses a playbook trigger.
            </p>
          </div>
        )}
        {mine.map((a, i) => (
          <ActionCard key={a.id} item={a} isNow={i === 0} />
        ))}

        {resolved.length > 0 && (
          <details className="rounded-lg border border-border">
            <summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground">Resolved ({resolved.length})</summary>
            <ul className="divide-y divide-border">
              {resolved.map((a) => (
                <li key={a.id} className="flex items-start gap-2 px-3 py-2 text-xs">
                  <span className="font-mono text-muted-foreground">T+{elapsed(a.resolvedAt ?? 0)}</span>
                  <span className="flex-1">
                    <span className={cn(a.status === 'dismissed' && 'line-through opacity-60')}>{a.title}</span>
                    <span className="block text-muted-foreground">{a.resolution}</span>
                  </span>
                  <span className="font-mono text-muted-foreground">{ROLES[a.owner].short}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  )
}
