import {
  BASE_PRICE,
  INCIDENT_DURATION,
  RULES,
  SIGNALS,
  TEMPLATES,
  deviationAt,
  drawdownAt,
  levelFor,
  liqAt,
  wallClock,
} from './scenario'
import type { ActionItem, Actor, LogEntry, Role, SignalKey, SimState } from './types'

export type Msg =
  | { type: 'tick' }
  | { type: 'toggle' }
  | { type: 'speed'; speed: number }
  | { type: 'reset' }
  | { type: 'jump'; to: number }
  | { type: 'resolve'; id: string; optionId?: string; note?: string; actor: Actor }
  | { type: 'dismiss'; id: string; actor: Actor; note?: string }
  | { type: 'send'; templateId: string; body: string; actor: Actor }
  | { type: 'note'; text: string; actor: Actor }
  | { type: 'select-template'; id: string | null }
  | { type: 'role'; role: Role | 'ALL' }

export function initialState(): SimState {
  return {
    running: false,
    speed: 30,
    t: 0,
    metrics: { price: BASE_PRICE, drawdown: 0, liq: 35, tickets: 14, sentiment: 22, deviation: 0.06 },
    history: [{ t: 0, liq: 35, tickets: 14, sentiment: 22, deviation: 0.06 }],
    flags: {
      sev: null,
      liqPaused: false,
      oracleIndexOnly: false,
      statusPosted: false,
      bannerOn: false,
      tweetPosted: false,
      macroOn: false,
      snapshotDone: false,
      devPeaked: false,
      resumeHoldUntil: 0,
    },
    liqTotal: 0,
    abnormalLiqs: 0,
    abnormalStart: null,
    abnormalEnd: null,
    fired: [],
    actions: [],
    log: [
      {
        id: 'l0',
        t: 0,
        kind: 'system',
        actor: 'SYSTEM',
        text: `Monitoring started at ${wallClock(0)} UTC. On call: Priya (IC), Dan (Risk), Lea (Comms).`,
      },
    ],
    sent: {},
    levels: { liq: 'ok', tickets: 'ok', sentiment: 'ok', deviation: 'ok' },
    selectedTemplateId: null,
    role: 'ALL',
    seq: 1,
  }
}

function addLog(s: SimState, entry: Omit<LogEntry, 'id' | 't'>): SimState {
  return { ...s, seq: s.seq + 1, log: [...s.log, { ...entry, id: `l${s.seq}`, t: s.t }] }
}

const STEP = 5

function step(s: SimState, dt: number): SimState {
  const t = s.t + dt
  const f = s.flags
  const drawdown = drawdownAt(t)
  const deviation = deviationAt(t, f.oracleIndexOnly)
  const liq = liqAt(t, f.liqPaused, f.oracleIndexOnly)

  const inflow = 2 + liq * 0.09 * (f.statusPosted ? 0.55 : 1) * (f.bannerOn ? 0.75 : 1) + (s.metrics.sentiment < -40 ? 3 : 0)
  const outflow = 7 + (f.macroOn ? 30 : 0)
  const tickets = Math.max(4, s.metrics.tickets + ((inflow - outflow) * dt) / 60)

  const target = Math.max(
    -100,
    Math.min(
      100,
      22 - 420 * drawdown - (tickets > 300 ? 12 : 0) + (f.statusPosted ? 10 : 0) + (f.tweetPosted ? 15 : 0) + (f.liqPaused ? 4 : 0),
    ),
  )
  const sentiment = s.metrics.sentiment + (target - s.metrics.sentiment) * Math.min(1, (dt / 60) * 0.6)

  const liqDelta = (liq * dt) / 60
  const abnormal = deviation > 1.5
  const next: SimState = {
    ...s,
    t,
    metrics: { price: BASE_PRICE * (1 - drawdown), drawdown, liq, tickets, sentiment, deviation },
    liqTotal: s.liqTotal + liqDelta,
    abnormalLiqs: s.abnormalLiqs + (abnormal ? liqDelta : 0),
    abnormalStart: abnormal && s.abnormalStart === null ? t : s.abnormalStart,
    abnormalEnd: abnormal ? t : s.abnormalEnd,
    flags: { ...f, devPeaked: f.devPeaked || deviation >= 2 },
  }
  if (Math.floor(t / 10) !== Math.floor(s.t / 10)) {
    next.history = [...s.history, { t, liq, tickets, sentiment, deviation }].slice(-400)
  }
  return next
}

function evaluate(s: SimState): SimState {
  let out = s
  for (const key of Object.keys(SIGNALS) as SignalKey[]) {
    const lvl = levelFor(key, out.metrics[key])
    if (lvl !== out.levels[key]) {
      const sig = SIGNALS[key]
      const worse = (lvl === 'crit') || (lvl === 'warn' && out.levels[key] === 'ok')
      out = addLog(
        { ...out, levels: { ...out.levels, [key]: lvl } },
        {
          kind: 'signal',
          actor: 'SYSTEM',
          text: `${sig.label} ${worse ? 'rose to' : 'eased to'} ${lvl === 'crit' ? 'CRITICAL' : lvl === 'warn' ? 'WARNING' : 'NORMAL'} (${sig.format(out.metrics[key])})`,
        },
      )
    }
  }

  for (const rule of RULES) {
    const key = rule.id === 'resume' ? `resume@${out.flags.resumeHoldUntil}` : rule.id
    if (out.fired.includes(key) || !rule.when(out)) continue
    const created: ActionItem[] = rule.create(out).map(({ sla, ...a }, i) => ({
      ...a,
      id: `a${out.seq + i}`,
      ruleId: rule.id,
      createdAt: out.t,
      dueAt: out.t + sla,
      status: 'open',
    }))
    out = {
      ...out,
      seq: out.seq + created.length,
      fired: [...out.fired, key],
      actions: [...out.actions, ...created],
    }
    out = addLog(out, {
      kind: 'trigger',
      actor: 'SYSTEM',
      text: `Trigger: ${rule.trigger}`,
      detail: created.map((c) => `${c.title} (${c.owner})`).join(' · '),
    })
  }
  return out
}

function applyDecision(s: SimState, a: ActionItem, optionId: string): SimState {
  const f = { ...s.flags }
  switch (a.ruleId) {
    case 'declare':
      f.sev = optionId as 'SEV1' | 'SEV2' | 'NONE'
      break
    case 'escalate':
      if (optionId === 'yes') f.sev = 'SEV1'
      break
    case 'deviation':
      if (optionId === 'pause') f.liqPaused = true
      if (optionId === 'index') f.oracleIndexOnly = true
      break
    case 'resume':
      if (optionId === 'hold') f.resumeHoldUntil = s.t + 600
      else f.liqPaused = false
      break
  }
  return { ...s, flags: f }
}

const TEMPLATE_FLAGS: Record<string, keyof SimState['flags']> = {
  'status-investigating': 'statusPosted',
  'inapp-banner': 'bannerOn',
  social: 'tweetPosted',
  'support-macro': 'macroOn',
}

export function reducer(s: SimState, m: Msg): SimState {
  switch (m.type) {
    case 'tick': {
      if (!s.running || s.t >= INCIDENT_DURATION) return s
      let out = s
      let remaining = s.speed
      while (remaining > 0 && out.t < INCIDENT_DURATION) {
        const dt = Math.min(STEP, remaining)
        out = evaluate(step(out, dt))
        remaining -= dt
      }
      if (out.t >= INCIDENT_DURATION) {
        out = addLog({ ...out, running: false }, { kind: 'system', actor: 'SYSTEM', text: 'T+60:00 reached. Simulation complete.' })
      }
      return out
    }
    case 'jump': {
      let out = { ...s }
      while (out.t < m.to && out.t < INCIDENT_DURATION) out = evaluate(step(out, STEP))
      return out
    }
    case 'toggle':
      return { ...s, running: !s.running && s.t < INCIDENT_DURATION }
    case 'speed':
      return { ...s, speed: m.speed }
    case 'reset':
      return { ...initialState(), speed: s.speed, role: s.role }
    case 'role':
      return { ...s, role: m.role }
    case 'select-template':
      return { ...s, selectedTemplateId: m.id }
    case 'resolve': {
      const a = s.actions.find((x) => x.id === m.id)
      if (!a || a.status !== 'open') return s
      const opt = a.options?.find((o) => o.id === m.optionId)
      const resolution = opt ? opt.label : 'Done'
      let out: SimState = {
        ...s,
        actions: s.actions.map((x) =>
          x.id === a.id ? { ...x, status: 'done', resolvedAt: s.t, resolution: m.note ? `${resolution}. ${m.note}` : resolution } : x,
        ),
      }
      if (opt) out = applyDecision(out, a, opt.id)
      if (out.flags.sev === 'SEV1') {
        out = {
          ...out,
          actions: out.actions.map((x) =>
            x.ruleId === 'escalate' && x.status === 'open'
              ? { ...x, status: 'done', resolvedAt: s.t, resolution: 'Superseded: already SEV1' }
              : x,
          ),
        }
      }
      if (a.ruleId === 'snapshot') out = { ...out, flags: { ...out.flags, snapshotDone: true } }
      const late = s.t > a.dueAt ? ` · ${Math.round((s.t - a.dueAt) / 60)}m past SLA` : ''
      return addLog(out, {
        kind: a.kind === 'decision' ? 'decision' : 'task',
        actor: m.actor,
        text: a.kind === 'decision' ? `DECISION: ${a.title}: ${resolution}` : `Completed: ${a.title}${late}`,
        detail: m.note || (a.kind === 'decision' ? a.detail : undefined),
      })
    }
    case 'dismiss': {
      const a = s.actions.find((x) => x.id === m.id)
      if (!a || a.status !== 'open') return s
      const out: SimState = {
        ...s,
        actions: s.actions.map((x) => (x.id === a.id ? { ...x, status: 'dismissed', resolvedAt: s.t, resolution: m.note || 'Skipped' } : x)),
        selectedTemplateId: s.selectedTemplateId === a.templateId ? null : s.selectedTemplateId,
      }
      return addLog(out, { kind: 'decision', actor: m.actor, text: `Skipped: ${a.title}`, detail: m.note || 'No reason given' })
    }
    case 'send': {
      const tpl = TEMPLATES.find((x) => x.id === m.templateId)
      if (!tpl) return s
      const flag = TEMPLATE_FLAGS[tpl.id]
      let out: SimState = {
        ...s,
        sent: { ...s.sent, [tpl.id]: s.t },
        flags: flag ? { ...s.flags, [flag]: true } : s.flags,
        actions: s.actions.map((x) =>
          x.templateId === tpl.id && x.status === 'open' ? { ...x, status: 'done', resolvedAt: s.t, resolution: `Sent via ${tpl.channel}` } : x,
        ),
        selectedTemplateId: null,
      }
      out = addLog(out, { kind: 'comms', actor: m.actor, text: `Sent "${tpl.title}" → ${tpl.channel}`, detail: m.body })
      return out
    }
    case 'note':
      return addLog(s, { kind: 'note', actor: m.actor, text: m.text })
  }
}
