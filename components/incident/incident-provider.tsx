'use client'

import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react'
import { initialState, reducer, type Msg } from '@/lib/incident/reducer'
import type { SimState } from '@/lib/incident/types'

const Ctx = createContext<{ state: SimState; dispatch: Dispatch<Msg> } | null>(null)

export function IncidentProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)

  useEffect(() => {
    if (!state.running) return
    const id = setInterval(() => dispatch({ type: 'tick' }), 1000)
    return () => clearInterval(id)
  }, [state.running])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.code === 'Space') {
        e.preventDefault()
        dispatch({ type: 'toggle' })
      } else if (e.key === '0') dispatch({ type: 'role', role: 'ALL' })
      else if (e.key === '1') dispatch({ type: 'role', role: 'IC' })
      else if (e.key === '2') dispatch({ type: 'role', role: 'RISK' })
      else if (e.key === '3') dispatch({ type: 'role', role: 'COMMS' })
      else if (e.key.toLowerCase() === 'n') {
        e.preventDefault()
        document.getElementById('log-note')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const openCount = state.actions.filter((a) => a.status === 'open').length
  useEffect(() => {
    document.title = openCount > 0 ? `(${openCount}) MochaTrade Incident Console` : 'MochaTrade Incident Console'
  }, [openCount])

  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>
}

export function useIncident() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useIncident must be used within IncidentProvider')
  return ctx
}
