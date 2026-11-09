'use client'

import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

export type JobProgress = { percent: number; message: string; current: number; total: number }
export type Notice = { tone: 'ok' | 'error'; text: string }

type Options = {
  mutate: () => Promise<unknown>
  setBusy: (v: string | null) => void
  setNotice: (n: Notice | null) => void
}

/** Polling d'un job d'arrière-plan (extraction / batch), extrait de Workspace. */
export function useJobPolling({ mutate, setBusy, setNotice }: Options) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [jobProgress, setJobProgress] = useState<JobProgress | null>(null)
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!activeJobId) return
    // Au-delà de 10 échecs d'affilée (~40 s), le serveur est très
    // probablement mort (crash/redémarrage) : on arrête de boucler
    // au lieu d'afficher « Retrying… » indéfiniment. Au redémarrage,
    // le backend marque de toute façon ces jobs comme échoués.
    let consecutiveFailures = 0

    async function checkStatus() {
      try {
        const job = await api.getJobStatus(activeJobId!)
        consecutiveFailures = 0
        setJobProgress({
          percent: job.progress_percent,
          message: job.message,
          current: job.current_page,
          total: job.total_pages,
        })
        if (job.status === 'completed') {
          setActiveJobId(null)
          setJobProgress(null)
          setBusy(null)
          setNotice({ tone: 'ok', text: job.message })
          await mutate()
        } else if (job.status === 'failed' || job.status === 'cancelled') {
          setActiveJobId(null)
          setJobProgress(null)
          setBusy(null)
          setNotice({ tone: 'error', text: job.message })
          await mutate()
        } else {
          pollTimerRef.current = setTimeout(checkStatus, 1500)
        }
      } catch {
        consecutiveFailures += 1
        if (consecutiveFailures >= 10) {
          setActiveJobId(null)
          setJobProgress(null)
          setBusy(null)
          setNotice({
            tone: 'error',
            text: 'Connection lost while tracking. The server may have restarted — check the project, then retry.',
          })
          return
        }
        setNotice({ tone: 'error', text: 'Connection lost while tracking. Retrying…' })
        pollTimerRef.current = setTimeout(checkStatus, 4000)
      }
    }

    checkStatus()
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJobId, mutate])

  async function handleCancelJob() {
    if (!activeJobId) return
    try {
      await api.cancelJob(activeJobId)
      setActiveJobId(null)
      setJobProgress(null)
      setNotice({ tone: 'ok', text: 'Job stopped successfully.' })
      await mutate()
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Error while cancelling.' })
    }
  }

  function startJob(jobId: string, message: string, total: number) {
    setActiveJobId(jobId)
    setJobProgress({ percent: 0, message, current: 0, total })
  }

  return { activeJobId, setActiveJobId, jobProgress, setJobProgress, handleCancelJob, startJob }
}
