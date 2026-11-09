'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { GlossaryEntry, ProjectMember } from '@/lib/types'

/** Chargement glossaire + équipe du projet (extraits de Workspace). */
export function useWorkspaceData(projectId: string) {
  const [glossaryEntries, setGlossaryEntries] = useState<GlossaryEntry[]>([])
  const [teamMembers, setTeamMembers] = useState<ProjectMember[]>([])

  async function loadGlossary() {
    try {
      const data = await api.listGlossary(projectId)
      setGlossaryEntries(data)
    } catch {}
  }

  async function loadTeam() {
    try {
      const members = await api.listMembers(projectId)
      setTeamMembers(members)
    } catch {}
  }

  useEffect(() => {
    loadTeam()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  return { glossaryEntries, teamMembers, loadGlossary, loadTeam }
}
