import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge conditional class lists, resolving Tailwind conflicts (shadcn convention). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** Up to two initials for an avatar fallback; derived from name, else email (mirrors the API's initialsOf). */
export function initialsOf(name: string, email = ''): string {
  const source = name.trim() || email
  const parts = source.split(/[\s@.]+/).filter(Boolean)
  return ((parts.length >= 2 ? parts[0][0] + parts[1][0] : source.slice(0, 2)) || '?').toUpperCase()
}
