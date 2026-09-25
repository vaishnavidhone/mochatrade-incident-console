'use client'

import { useState } from 'react'
import { RefreshCw, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ROLES, TEMPLATES, elapsed, fillTemplate, type Template } from '@/lib/incident/scenario'
import { useIncident } from './incident-provider'

const audienceStyle: Record<Template['audience'], string> = {
  internal: 'text-muted-foreground border-border',
  public: 'text-crit border-crit/40',
  customers: 'text-warn border-warn/40',
}

function Composer({ tpl }: { tpl: Template }) {
  const { state, dispatch } = useIncident()
  const [body, setBody] = useState(() => fillTemplate(tpl.body, state))
  const actor = state.role === 'ALL' ? tpl.owner : state.role

  return (
    <div className="border-b border-border bg-accent/50 p-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold">{tpl.title}</p>
        <span className={cn('rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase', audienceStyle[tpl.audience])}>
          {tpl.audience}
        </span>
        <button
          type="button"
          className="ml-auto text-muted-foreground hover:text-foreground"
          onClick={() => dispatch({ type: 'select-template', id: null })}
          aria-label="Close composer"
        >
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">→ {fillTemplate(tpl.channel, state)}</p>
      <label htmlFor="composer-body" className="sr-only">
        Message body
      </label>
      <textarea
        id="composer-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={7}
        className="mt-2 w-full resize-y rounded-md border border-border bg-background p-2 font-mono text-xs leading-relaxed"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => setBody(fillTemplate(tpl.body, state))}>
          <RefreshCw /> Refresh live values
        </Button>
        <Button
          size="sm"
          className="ml-auto"
          onClick={() => dispatch({ type: 'send', templateId: tpl.id, body, actor })}
          disabled={!body.trim()}
        >
          <Send /> Send as {ROLES[actor].person}
        </Button>
      </div>
    </div>
  )
}

export function CommsPanel() {
  const { state, dispatch } = useIncident()
  const selected = TEMPLATES.find((t) => t.id === state.selectedTemplateId)
  const suggested = new Set(state.actions.filter((a) => a.status === 'open' && a.templateId).map((a) => a.templateId))

  return (
    <section aria-labelledby="comms-title" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
        <h2 id="comms-title" className="text-sm font-semibold">
          Comms templates
        </h2>
        <span className="font-mono text-xs text-muted-foreground">
          {Object.keys(state.sent).length}/{TEMPLATES.length} sent
        </span>
      </div>

      {selected && <Composer key={selected.id} tpl={selected} />}

      <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
        {TEMPLATES.map((t) => {
          const sentAt = state.sent[t.id]
          const isSuggested = suggested.has(t.id)
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => dispatch({ type: 'select-template', id: state.selectedTemplateId === t.id ? null : t.id })}
                className={cn(
                  'flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-accent',
                  state.selectedTemplateId === t.id && 'bg-accent',
                )}
                aria-current={state.selectedTemplateId === t.id}
              >
                <span
                  className={cn(
                    'mt-1.5 size-2 shrink-0 rounded-full',
                    sentAt !== undefined ? 'bg-ok' : isSuggested ? 'bg-warn animate-pulse' : 'bg-muted-foreground/30',
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{t.title}</span>
                    <span className={cn('rounded border px-1 font-mono text-[9px] uppercase', audienceStyle[t.audience])}>
                      {t.audience}
                    </span>
                  </span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">{fillTemplate(t.channel, state)}</span>
                </span>
                <span className="shrink-0 font-mono text-[11px]">
                  {sentAt !== undefined ? (
                    <span className="text-ok">sent T+{elapsed(sentAt)}</span>
                  ) : isSuggested ? (
                    <span className="text-warn">send now</span>
                  ) : (
                    <span className="text-muted-foreground">{ROLES[t.owner].short}</span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
