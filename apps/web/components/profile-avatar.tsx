'use client'

import { useEffect, useState } from 'react'
import { UserRound } from 'lucide-react'
import { api } from '@/lib/api'
import type { User } from '@/lib/types'
import { cn } from '@/lib/utils'

export function ProfileAvatar({
  user,
  className,
}: {
  user: User
  className?: string
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null

    if (!user.avatar_content_type) {
      setImageUrl(null)
      return
    }

    api.profileImage('avatar')
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        if (active) setImageUrl(objectUrl)
        else URL.revokeObjectURL(objectUrl)
      })
      .catch((error) => {
        console.error('Cannot load the profile picture.', error)
        if (active) setImageUrl(null)
      })

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [user.id, user.avatar_content_type])

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-hairline bg-sheet text-ink-soft',
        className,
      )}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="size-full object-cover" />
      ) : (
        <UserRound aria-hidden="true" className="size-1/2" />
      )}
    </span>
  )
}
