import Image from 'next/image'

import { auth, signOut } from '@/server/auth'

import { SignIn } from './sign-in'

export const User = async () => {
  const session = await auth()

  if (!session?.user) return <SignIn />

  return (
    <div className='dsy-dropdown dsy-dropdown-end'>
      <div
        tabIndex={0}
        role='button'
        className='dsy-avatar dsy-btn dsy-btn-circle dsy-btn-ghost'
      >
        <div className='w-10 rounded-full'>
          {session.user.image && (
            <Image
              alt='avatar'
              src={session.user.image}
              width={40}
              height={40}
            />
          )}
        </div>
      </div>
      <ul
        tabIndex={0}
        className='dsy-menu dsy-dropdown-content dsy-menu-sm z-[1] mt-3 w-52 rounded-box border border-neutral bg-base-100 p-2 shadow'
      >
        <li>
          <form
            className='grid-cols-1'
            action={async () => {
              'use server'
              await signOut()
            }}
          >
            <button className='flex items-center justify-between' type='submit'>
              <span>Sign Out</span> <span className='icon-[lucide--log-out]' />
            </button>
          </form>
        </li>
      </ul>
    </div>
  )
}
