import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal, FolderKanban, Rocket, Users, Star, Copy, Settings } from 'lucide-react'
import { type Project } from '@/lib/api'
import { useIsFavorite, toggleFavorite } from '@/lib/favorites'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

// Overflow (⋯) menu for a project card/row — non-destructive quick actions.
export function ProjectMenu({ orgSlug, project }: { orgSlug: string; project: Project }) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const fav = useIsFavorite(project.id)
  const base = `/orgs/${orgSlug}/projects/${project.slug}`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative z-10 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={t('projects.menu')}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => navigate(base)}>
          <FolderKanban className="mr-2 h-4 w-4" />
          {t('nav.board')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate(`${base}/sprints`)}>
          <Rocket className="mr-2 h-4 w-4" />
          {t('nav.sprints')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate(`/orgs/${orgSlug}/members`)}>
          <Users className="mr-2 h-4 w-4" />
          {t('nav.members')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate(`${base}/settings`)}>
          <Settings className="mr-2 h-4 w-4" />
          {t('projects.settingsLink')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => toggleFavorite(project.id)}>
          <Star className="mr-2 h-4 w-4" />
          {fav ? t('tree.unfavorite') : t('tree.favorite')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigator.clipboard?.writeText(project.key)}>
          <Copy className="mr-2 h-4 w-4" />
          {t('projects.copyKey')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
