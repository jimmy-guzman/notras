import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { parse } from 'valibot'

import { links } from '@/constants/links'
import { themes } from '@/constants/themes'
import { getUser } from '@/lib/get-user'
import { auth } from '@/server/auth'
import { db } from '@/server/db'
import { updateUserSchema, users } from '@/server/db/schemas/users'

export default async function Page() {
  const session = await auth()

  const userId = session?.user?.id

  const user = userId ? await getUser(userId) : null

  return userId ? (
    <div className='mt-16 md:container md:mx-auto'>
      <div className='prose dsy-prose mb-8'>
        <h1>Theme</h1>
        <p>
          Themes are powered by{' '}
          <a href={links.daisyUIThemes} target='_blank'>
            DaisyUI&apos;s themes
          </a>
          .
        </p>
      </div>

      <form
        className='flex flex-col gap-4'
        action={async (formData) => {
          'use server'

          const validatedFields = parse(updateUserSchema, {
            theme: formData.get('theme'),
          })

          await db
            .update(users)
            .set(validatedFields)
            .where(eq(users.id, userId))

          revalidatePath('/', 'layout')
        }}
      >
        {themes.map((theme) => {
          return (
            <div key={theme} className='dsy-form-control'>
              <label className='dsy-label cursor-pointer gap-4'>
                <span className='dsy-label-text capitalize'>{theme}</span>
                <input
                  type='radio'
                  name='theme'
                  className='theme-controller dsy-radio'
                  value={theme}
                  defaultChecked={user?.theme === theme}
                />
              </label>
            </div>
          )
        })}
        <div className='flex justify-end'>
          <button type='submit' className='dsy-btn'>
            Save
          </button>
        </div>
      </form>
    </div>
  ) : null
}
