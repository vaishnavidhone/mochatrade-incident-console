export type Role = 'IC' | 'RISK' | 'COMMS'
export type Actor = Role | 'SYSTEM'
export type Level = 'ok' | 'warn' | 'crit'
export type SignalKey = 'liq' | 'tickets' | 'sentiment' | 'deviation'
export type Severity = 'critical' | 'high' | 'normal'

export interface DecisionOption {
  id: string
  label: string
  hint?: string
  tone?: 'danger' | 'default'
}

export interface ActionItem {
  id: string
  ruleId: string
  kind: 'task' | 'comms' | 'decision'
  title: string
  detail: string
  owner: Role
  severity: Severity
  createdAt: number
  dueAt: number
  status: 'open' | 'done' | 'dismissed'
  resolvedAt?: number
  resolution?: string
  templateId?: string
  options?: DecisionOption[]
}

export interface LogEntry {
  id: string
  t: number
  kind: 'signal' | 'decision' | 'comms' | 'task' | 'note' | 'system' | 'trigger'
  actor: Actor
  text: string
  detail?: string
}

export interface Sample {
  t: number
  liq: number
  tickets: number
  sentiment: number
  deviation: number
}

export interface Metrics {
  price: number
  drawdown: number
  liq: number
  tickets: number
  sentiment: number
  deviation: number
}

export interface Flags {
  sev: 'SEV1' | 'SEV2' | 'NONE' | null
  liqPaused: boolean
  oracleIndexOnly: boolean
  statusPosted: boolean
  bannerOn: boolean
  tweetPosted: boolean
  macroOn: boolean
  snapshotDone: boolean
  devPeaked: boolean
  resumeHoldUntil: number
}

export interface SimState {
  running: boolean
  speed: number
  t: number
  metrics: Metrics
  history: Sample[]
  flags: Flags
  liqTotal: number
  abnormalLiqs: number
  abnormalStart: number | null
  abnormalEnd: number | null
  fired: string[]
  actions: ActionItem[]
  log: LogEntry[]
  sent: Record<string, number>
  levels: Record<SignalKey, Level>
  selectedTemplateId: string | null
  role: Role | 'ALL'
  seq: number
}
