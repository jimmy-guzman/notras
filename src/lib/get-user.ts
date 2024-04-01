import { sql } from 'drizzle-orm'

import { db } from '@/server/db'

const prepared = db.query.users
  .findFirst({
    where: (users, { eq }) => eq(users.id, sql.placeholder('id')),
  })
  .prepare()

export const getUser = async (id: string) => {
  const user = await prepared.execute({ id })

  if (!user) {
    throw new Error('No User Found')
  }

  return user
}
