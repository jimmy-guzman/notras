type Link = `https://${string}.${string}`

export const links = {
  typescript: 'https://www.typescriptlang.org',
  tailwindcss: 'https://tailwindcss.com',
  drizzle: 'https://orm.drizzle.team',
  turso: 'https://turso.tech',
} satisfies Record<string, Link>
