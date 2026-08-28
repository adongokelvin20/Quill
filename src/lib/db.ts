import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Disable query logging in production to reduce noise
const logLevel = process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['error', 'warn']

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: logLevel as never,
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
