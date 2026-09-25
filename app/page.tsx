import { IncidentProvider } from '@/components/incident/incident-provider'
import { TopBar } from '@/components/incident/top-bar'
import { SignalStrip } from '@/components/incident/signal-strip'
import { PlaybookStrip } from '@/components/incident/playbook-strip'
import { ActionQueue } from '@/components/incident/action-queue'
import { CommsPanel } from '@/components/incident/comms-panel'
import { IncidentLog } from '@/components/incident/incident-log'

export default function Page() {
  return (
    <IncidentProvider>
      <div className="flex min-h-dvh flex-col lg:h-dvh">
        <TopBar />
        <SignalStrip />
        <PlaybookStrip />
        <main className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-border lg:grid-cols-12 lg:divide-x lg:divide-y-0">
          <div className="flex min-h-[28rem] flex-col lg:col-span-5 lg:min-h-0">
            <ActionQueue />
          </div>
          <div className="flex min-h-[24rem] flex-col lg:col-span-3 lg:min-h-0">
            <CommsPanel />
          </div>
          <div className="flex min-h-[24rem] flex-col lg:col-span-4 lg:min-h-0">
            <IncidentLog />
          </div>
        </main>
        <footer className="border-t border-border px-4 py-1.5 font-mono text-[10px] text-muted-foreground">
          Simulated scenario · Space start/pause · 0-3 switch role · N log a note
        </footer>
      </div>
    </IncidentProvider>
  )
}
