import type { ActionItem, Level, Role, SignalKey, SimState } from './types'

export const INCIDENT_DURATION = 3600
export const BASE_PRICE = 64200
const WALL_START_UTC = 14 * 3600 + 2 * 60

export const ROLES: Record<Role, { label: string; short: string; person: string }> = {
  IC: { label: 'Incident Lead', short: 'IC', person: 'Priya' },
  RISK: { label: 'Risk & Trading', short: 'RISK', person: 'Dan' },
  COMMS: { label: 'Comms & Support', short: 'COMMS', person: 'Lea' },
}

export function wallClock(t: number) {
  const s = Math.floor(WALL_START_UTC + t)
  const h = Math.floor(s / 3600) % 24
  const m = Math.floor((s % 3600) / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function elapsed(t: number) {
  const s = Math.max(0, Math.floor(t))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const gauss = (x: number, mu: number, sigma: number) => Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma))
const ease = (x: number) => {
  const c = Math.min(1, Math.max(0, x))
  return c * c * (3 - 2 * c)
}
export const noise = (t: number, seed = 1) =>
  Math.sin(t * 0.013 + seed) * 0.5 + Math.sin(t * 0.071 + seed * 2.3) * 0.3 + Math.sin(t * 0.17 + seed * 4.1) * 0.2

export function drawdownAt(t: number) {
  const m = t / 60
  if (m < 3) return Math.max(0, 0.003 * noise(t, 3))
  if (m < 8) return 0.16 * ease((m - 3) / 5)
  if (m < 9) return 0.16 + 0.03 * Math.sin(Math.PI * (m - 8))
  if (m < 20) return 0.16 - 0.06 * ease((m - 9) / 11)
  return 0.1 - 0.025 * ease((m - 20) / 30) + 0.004 * noise(t, 5)
}

export function deviationAt(t: number, indexOnly: boolean) {
  const m = t / 60
  const raw = 0.06 + 3.6 * gauss(m, 8.3, 1.1) + 0.9 * gauss(m, 14, 1.5) + 0.03 * Math.abs(noise(t, 7))
  return indexOnly ? Math.max(0.06, raw * 0.35) : raw
}

export function liqAt(t: number, paused: boolean, indexOnly: boolean) {
  const m = t / 60
  let raw = 35 + 1900 * gauss(m, 8.5, 1.6) + 350 * gauss(m, 14, 2.5) + 60 * gauss(m, 27, 2)
  raw *= 1 + 0.15 * noise(t, 11)
  if (indexOnly) raw *= 0.6
  if (paused) raw *= 0.1
  return Math.max(0, raw)
}

export const SIGNALS: Record<
  SignalKey,
  { label: string; unit: string; warn: number; crit: number; lowerIsWorse?: boolean; owner: Role; format: (v: number) => string }
> = {
  liq: { label: 'Liquidations / min', unit: '/min', warn: 300, crit: 1000, owner: 'RISK', format: (v) => Math.round(v).toLocaleString('en-US') },
  deviation: { label: 'Mark vs index deviation', unit: '%', warn: 1, crit: 2, owner: 'RISK', format: (v) => `${v.toFixed(2)}%` },
  tickets: { label: 'Open support tickets', unit: '', warn: 120, crit: 350, owner: 'COMMS', format: (v) => Math.round(v).toLocaleString('en-US') },
  sentiment: { label: 'Social sentiment', unit: '', warn: -20, crit: -45, lowerIsWorse: true, owner: 'COMMS', format: (v) => `${v > 0 ? '+' : ''}${Math.round(v)}` },
}

export function levelFor(key: SignalKey, v: number): Level {
  const s = SIGNALS[key]
  if (s.lowerIsWorse) return v <= s.crit ? 'crit' : v <= s.warn ? 'warn' : 'ok'
  return v >= s.crit ? 'crit' : v >= s.warn ? 'warn' : 'ok'
}

type NewAction = Omit<ActionItem, 'id' | 'ruleId' | 'createdAt' | 'status' | 'dueAt'> & { sla: number }

export interface Rule {
  id: string
  trigger: string
  when: (s: SimState) => boolean
  create: (s: SimState) => NewAction[]
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`

export const RULES: Rule[] = [
  {
    id: 'declare',
    trigger: 'Liquidations > 300/min',
    when: (s) => s.metrics.liq >= 300,
    create: (s) => [
      {
        kind: 'decision',
        title: 'Declare incident severity',
        detail: `Liquidations at ${Math.round(s.metrics.liq)}/min (baseline ~35). BTC down ${pct(s.metrics.drawdown)}.`,
        owner: 'IC',
        severity: 'critical',
        sla: 120,
        options: [
          { id: 'SEV1', label: 'Declare SEV1', hint: 'Customer funds or core trading at risk', tone: 'danger' },
          { id: 'SEV2', label: 'Declare SEV2', hint: 'Degraded, contained impact' },
          { id: 'NONE', label: 'Not an incident', hint: 'Normal volatility, monitor only' },
        ],
      },
      {
        kind: 'comms',
        title: 'Page team & open war room',
        detail: 'Post the declaration in #incident-war-room so all three roles are on the bridge.',
        owner: 'IC',
        severity: 'high',
        sla: 180,
        templateId: 'internal-declare',
      },
    ],
  },
  {
    id: 'escalate',
    trigger: 'BTC drawdown > 10% while not SEV1',
    when: (s) => s.metrics.drawdown >= 0.1 && s.flags.sev !== null && s.flags.sev !== 'SEV1',
    create: (s) => [
      {
        kind: 'decision',
        title: 'Escalate to SEV1 and notify execs?',
        detail: `BTC down ${pct(s.metrics.drawdown)} and falling. Current: ${s.flags.sev ?? 'undeclared'}.`,
        owner: 'IC',
        severity: 'high',
        sla: 180,
        options: [
          { id: 'yes', label: 'Escalate to SEV1', tone: 'danger' },
          { id: 'no', label: 'Hold current severity' },
        ],
      },
    ],
  },
  {
    id: 'deviation',
    trigger: 'Mark/index deviation > 2%',
    when: (s) => s.metrics.deviation >= 2,
    create: (s) => [
      {
        kind: 'decision',
        title: 'Abnormal liquidations: mark price diverging from index',
        detail: `Mark price is ${s.metrics.deviation.toFixed(2)}% off the index. Liquidations are firing on a price the wider market is not seeing.`,
        owner: 'RISK',
        severity: 'critical',
        sla: 180,
        options: [
          { id: 'pause', label: 'Pause auto-liquidations on BTC-PERP', hint: 'Queue liquidations, stop cascade. Rising exposure risk.', tone: 'danger' },
          { id: 'index', label: 'Switch mark price to index-only', hint: 'Removes wick impact; liquidations continue at fair price' },
          { id: 'continue', label: 'Continue - deviation is genuine', hint: 'No intervention' },
        ],
      },
    ],
  },
  {
    id: 'status-investigating',
    trigger: 'Open tickets > 120',
    when: (s) => s.metrics.tickets >= 120,
    create: () => [
      {
        kind: 'comms',
        title: 'Post status page: Investigating',
        detail: 'Tickets are climbing fast. A public acknowledgement is the fastest way to slow inbound volume.',
        owner: 'COMMS',
        severity: 'high',
        sla: 300,
        templateId: 'status-investigating',
      },
    ],
  },
  {
    id: 'banner',
    trigger: 'Open tickets > 200',
    when: (s) => s.metrics.tickets >= 200,
    create: () => [
      {
        kind: 'comms',
        title: 'Turn on in-app volatility banner',
        detail: 'Show users it’s a known issue before they open a ticket.',
        owner: 'COMMS',
        severity: 'normal',
        sla: 300,
        templateId: 'inapp-banner',
      },
    ],
  },
  {
    id: 'social',
    trigger: 'Sentiment < -35',
    when: (s) => s.metrics.sentiment <= -35,
    create: (s) => [
      {
        kind: 'comms',
        title: 'Post holding statement on X',
        detail: `Sentiment at ${Math.round(s.metrics.sentiment)}. Top themes: "funds safe?", "liquidated unfairly".`,
        owner: 'COMMS',
        severity: 'high',
        sla: 480,
        templateId: 'social',
      },
    ],
  },
  {
    id: 'macro',
    trigger: 'Open tickets > 350',
    when: (s) => s.metrics.tickets >= 350,
    create: (s) => [
      {
        kind: 'comms',
        title: 'Enable support auto-reply macro',
        detail: `${Math.round(s.metrics.tickets)} tickets open, the agents can’t keep up. Auto-reply + tag "flash-crash".`,
        owner: 'COMMS',
        severity: 'high',
        sla: 300,
        templateId: 'support-macro',
      },
    ],
  },
  {
    id: 'snapshot',
    trigger: 'Deviation peaked and back under 1%',
    when: (s) => s.flags.devPeaked && s.metrics.deviation < 1,
    create: (s) => [
      {
        kind: 'task',
        title: 'Snapshot abnormal liquidation set',
        detail: `Export liquidation IDs, mark and index prices for ${s.abnormalStart !== null ? wallClock(s.abnormalStart) : '--'} to ${s.abnormalEnd !== null ? wallClock(s.abnormalEnd) : 'now'} UTC. ${Math.round(s.abnormalLiqs)} liquidations flagged.`,
        owner: 'RISK',
        severity: 'high',
        sla: 600,
      },
    ],
  },
  {
    id: 'resume',
    trigger: 'Liquidations paused and deviation < 0.5%',
    when: (s) => s.flags.liqPaused && s.metrics.deviation < 0.5 && s.t >= s.flags.resumeHoldUntil,
    create: (s) => [
      {
        kind: 'decision',
        title: 'Deviation normalized. Resume liquidations?',
        detail: `Deviation ${s.metrics.deviation.toFixed(2)}%. Paused positions are building exposure while liquidations stay held.`,
        owner: 'RISK',
        severity: 'critical',
        sla: 180,
        options: [
          { id: 'resume', label: 'Resume now' },
          { id: 'buffer', label: 'Resume with +2% maintenance buffer', hint: 'Gradual, fewer cascades' },
          { id: 'hold', label: 'Hold 10 more minutes', tone: 'danger' },
        ],
      },
    ],
  },
  {
    id: 'status-monitoring',
    trigger: 'T+20m, status posted and liquidations < 400/min',
    when: (s) => s.t >= 1200 && s.flags.statusPosted && s.metrics.liq < 400,
    create: () => [
      {
        kind: 'comms',
        title: 'Update status page: Monitoring',
        detail: 'The market has stabilized. Tell users about the abnormal-liquidation review so they don’t each open tickets about it.',
        owner: 'COMMS',
        severity: 'normal',
        sla: 600,
        templateId: 'status-monitoring',
      },
    ],
  },
  {
    id: 'compensation',
    trigger: 'Liquidation snapshot complete',
    when: (s) => s.flags.snapshotDone,
    create: (s) => [
      {
        kind: 'decision',
        title: 'Policy for abnormal liquidations',
        detail: `${Math.round(s.abnormalLiqs)} liquidations executed while mark deviated > 1.5% from index.`,
        owner: 'IC',
        severity: 'high',
        sla: 900,
        options: [
          { id: 'reverse', label: 'Credit losses beyond index band', hint: 'Automatic, cost borne by insurance fund' },
          { id: 'review', label: 'Case-by-case review within 48h' },
          { id: 'none', label: 'No action, liquidations stand', tone: 'danger' },
        ],
      },
      {
        kind: 'comms',
        title: 'Email affected users',
        detail: 'Tell affected accounts they are under review before they find out on social media.',
        owner: 'COMMS',
        severity: 'normal',
        sla: 900,
        templateId: 'affected-email',
      },
    ],
  },
  {
    id: 'handoff',
    trigger: 'T+50m',
    when: (s) => s.t >= 3000,
    create: () => [
      {
        kind: 'comms',
        title: 'Prepare 60-minute handoff',
        detail: 'Summarize state, decisions and open items for the next shift / exec update.',
        owner: 'IC',
        severity: 'normal',
        sla: 600,
        templateId: 'handoff',
      },
    ],
  },
]

export interface PlaybookPhase {
  id: string
  label: string
  window: string
  steps: { ruleId: string; label: string; manual?: boolean }[]
}

export const PLAYBOOK: PlaybookPhase[] = [
  {
    id: 'detect',
    label: 'Detect & declare',
    window: '0–5m',
    steps: [
      { ruleId: 'declare', label: 'Severity declared' },
      { ruleId: 'declare:comms', label: 'War room opened' },
    ],
  },
  {
    id: 'contain',
    label: 'Contain',
    window: '5–15m',
    steps: [
      { ruleId: 'deviation', label: 'Abnormal liquidation call' },
      { ruleId: 'escalate', label: 'Severity re-assessed' },
    ],
  },
  {
    id: 'communicate',
    label: 'Communicate',
    window: '≤15m',
    steps: [
      { ruleId: 'status-investigating', label: 'Status page' },
      { ruleId: 'banner', label: 'In-app banner' },
      { ruleId: 'social', label: 'Social statement' },
      { ruleId: 'macro', label: 'Support macro' },
    ],
  },
  {
    id: 'stabilize',
    label: 'Stabilize',
    window: '15–45m',
    steps: [
      { ruleId: 'snapshot', label: 'Liquidation snapshot' },
      { ruleId: 'resume', label: 'Liquidations resumed' },
      { ruleId: 'status-monitoring', label: 'Status: monitoring' },
    ],
  },
  {
    id: 'review',
    label: 'Review & hand off',
    window: '45–60m',
    steps: [
      { ruleId: 'compensation', label: 'Compensation policy' },
      { ruleId: 'compensation:comms', label: 'Affected users emailed' },
      { ruleId: 'handoff', label: 'Handoff sent' },
    ],
  },
]

export interface Template {
  id: string
  channel: string
  title: string
  audience: 'internal' | 'public' | 'customers'
  owner: Role
  body: string
}

export const TEMPLATES: Template[] = [
  {
    id: 'internal-declare',
    channel: 'Slack #incident-war-room',
    title: 'Incident declaration',
    audience: 'internal',
    owner: 'IC',
    body: `INCIDENT DECLARED: {sev} | {now} UTC
BTC -{drop} from pre-crash, liquidations {liq}/min.
IC: @priya   Risk: @dan   Comms: @lea
Bridge: meet.mochatrade.io/war-room
Next internal update in 15 min ({next15} UTC).`,
  },
  {
    id: 'status-investigating',
    channel: 'status.mochatrade.io',
    title: 'Status: Investigating',
    audience: 'public',
    owner: 'COMMS',
    body: `Investigating: Extreme volatility in BTC markets
Starting {crashStart} UTC, BTC markets are experiencing extreme volatility. Some users may see delayed order updates and higher-than-usual liquidations. Deposits and withdrawals are operating normally and all funds are secure. Our team is actively investigating. Next update by {next30} UTC.`,
  },
  {
    id: 'inapp-banner',
    channel: 'In-app banner',
    title: 'Volatility banner',
    audience: 'customers',
    owner: 'COMMS',
    body: `Markets are experiencing extreme volatility. Our systems are online and your funds are secure. Live updates: status.mochatrade.io`,
  },
  {
    id: 'social',
    channel: 'X / @MochaTrade',
    title: 'Holding statement',
    audience: 'public',
    owner: 'COMMS',
    body: `We're aware of extreme volatility across crypto markets. MochaTrade is online and all funds are safe. We're reviewing liquidations from the last hour and will share an update by {next30} UTC. Live status: status.mochatrade.io`,
  },
  {
    id: 'support-macro',
    channel: 'Zendesk auto-reply',
    title: 'Volatility auto-reply',
    audience: 'customers',
    owner: 'COMMS',
    body: `Thanks for reaching out. We're currently experiencing extreme market volatility and very high ticket volume. If your question is about a liquidation between {crashStart} and {now} UTC, you don't need to do anything: every liquidation in this window is being reviewed and we'll contact you directly. Live updates: status.mochatrade.io`,
  },
  {
    id: 'status-monitoring',
    channel: 'status.mochatrade.io',
    title: 'Status: Monitoring',
    audience: 'public',
    owner: 'COMMS',
    body: `Monitoring: Market volatility
Order processing is operating normally as of {now} UTC. Between {abStart} and {abEnd} UTC, our mark price diverged from the market index and some liquidations executed during this window. These are under review and affected users will be contacted directly within 24 hours.`,
  },
  {
    id: 'affected-email',
    channel: 'Email: affected accounts ({abnormal})',
    title: 'Liquidation review notice',
    audience: 'customers',
    owner: 'COMMS',
    body: `Subject: We're reviewing your liquidation

Hi %FIRST_NAME%,

Between {abStart} and {abEnd} UTC today, BTC markets experienced an abnormal price deviation, and your position was liquidated during this window. We are reviewing all {abnormal} affected liquidations and will contact you within 48 hours with the outcome. No action is needed from you.

MochaTrade Risk Team`,
  },
  {
    id: 'handoff',
    channel: 'Slack #incident-war-room + exec email',
    title: '60-minute handoff',
    audience: 'internal',
    owner: 'IC',
    body: `60-MIN HANDOFF: {sev} | T+{elapsed}
Market: BTC -{drop} from pre-crash.
Liquidations: {liqTotal} total, {abnormal} flagged abnormal ({abStart} to {abEnd} UTC).
Support: {tickets} tickets open.
Liquidation engine: {liqState}.
Open items: {openCount}. Full decision log attached.
Next IC: @oncall-secondary`,
  },
]

export function fillTemplate(body: string, s: SimState) {
  const vars: Record<string, string> = {
    sev: s.flags.sev ?? 'SEV2',
    now: wallClock(s.t),
    next15: wallClock(s.t + 900),
    next30: wallClock(s.t + 1800),
    crashStart: wallClock(180),
    drop: pct(s.metrics.drawdown),
    liq: Math.round(s.metrics.liq).toLocaleString('en-US'),
    liqTotal: Math.round(s.liqTotal).toLocaleString('en-US'),
    tickets: Math.round(s.metrics.tickets).toLocaleString('en-US'),
    abnormal: Math.round(s.abnormalLiqs).toLocaleString('en-US'),
    abStart: s.abnormalStart !== null ? wallClock(s.abnormalStart) : '--:--',
    abEnd: s.abnormalEnd !== null ? wallClock(s.abnormalEnd) : wallClock(s.t),
    elapsed: elapsed(s.t),
    liqState: s.flags.liqPaused ? 'PAUSED' : s.flags.oracleIndexOnly ? 'running on index-only mark' : 'running normally',
    openCount: String(s.actions.filter((a) => a.status === 'open').length),
  }
  return body.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`)
}
