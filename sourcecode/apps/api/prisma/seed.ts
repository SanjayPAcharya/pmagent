import { PrismaClient, type TicketStatus, type Priority, type TicketType } from '@prisma/client'

// Idempotent demo data so a fresh stack isn't an empty board.
// Re-runnable: upserts on unique keys. Owned by a seed-only user.
const prisma = new PrismaClient()

const TICKETS: { title: string; status: TicketStatus; priority: Priority; type: TicketType }[] = [
  { title: 'Set up CI pipeline', status: 'TODO', priority: 'HIGH', type: 'CHORE' },
  { title: 'Design the board UI', status: 'IN_PROGRESS', priority: 'MEDIUM', type: 'FEATURE' },
  { title: 'Fix login redirect loop', status: 'DONE', priority: 'URGENT', type: 'BUG' },
]

async function main() {
  const user = await prisma.user.upsert({
    where: { idpSub: 'seed:demo' },
    update: {},
    create: { idpSub: 'seed:demo', email: 'demo@agentpm.local', name: 'Demo User' },
  })

  const org = await prisma.organization.upsert({
    where: { slug: 'demo' },
    update: {},
    create: { name: 'Demo Org', slug: 'demo' },
  })
  await prisma.orgMember.upsert({
    where: { orgId_userId: { orgId: org.id, userId: user.id } },
    update: {},
    create: { orgId: org.id, userId: user.id, role: 'OWNER' },
  })

  const project = await prisma.project.upsert({
    where: { orgId_slug: { orgId: org.id, slug: 'demo-board' } },
    update: {},
    create: { orgId: org.id, name: 'Demo Board', slug: 'demo-board', key: 'DEMO' },
  })

  const sprint =
    (await prisma.sprint.findFirst({ where: { projectId: project.id, name: 'Sprint 1' } })) ??
    (await prisma.sprint.create({ data: { projectId: project.id, name: 'Sprint 1', status: 'ACTIVE' } }))

  for (let i = 0; i < TICKETS.length; i += 1) {
    const t = TICKETS[i]
    await prisma.ticket.upsert({
      where: { projectId_number: { projectId: project.id, number: i + 1 } },
      update: {},
      create: {
        projectId: project.id,
        number: i + 1,
        title: t.title,
        status: t.status,
        priority: t.priority,
        type: t.type,
        position: (i + 1) * 1000,
        createdById: user.id,
        sprintId: t.status === 'DONE' ? sprint.id : null,
      },
    })
  }
  await prisma.project.update({
    where: { id: project.id },
    data: { ticketCounter: TICKETS.length },
  })

  console.log('Seed complete: org "demo" / project "demo-board" (DEMO) / 3 tickets')
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err)
    await prisma.$disconnect()
    process.exit(1)
  })
