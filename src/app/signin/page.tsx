import { redirect, RedirectType } from 'next/navigation'

import { auth, signIn } from '@/server/auth'

export default async function Page() {
  const session = await auth()

  if (session?.user) {
    redirect('/', RedirectType.replace)
  }

  return (
    <div className='dsy-hero min-h-screen'>
      <div className='dsy-hero-content flex-col lg:flex-row-reverse'>
        <div className='text-center lg:text-left'>
          <h1 className='text-5xl font-bold'>Sign In</h1>
          <p className='py-6'>
            Authentication is powered by{' '}
            <a className='dsy-link' href='https://authjs.dev' target='_blank'>
              Auth.js
            </a>
            . Please reference their{' '}
            <a
              className='dsy-link'
              href='https://authjs.dev/guides'
              target='_blank'
            >
              documentation
            </a>{' '}
            to learn more.
          </p>
        </div>
        <div className='dsy-card w-full max-w-sm shrink-0 bg-base-100 '>
          <form
            className='dsy-card-body'
            action={async () => {
              'use server'
              await signIn('github')
            }}
          >
            <div className='dsy-form-control mt-6'>
              <button type='submit' className='dsy-btn dsy-btn-accent'>
                Continue with GitHub{' '}
                <span className='icon-[simple-icons--github] h-4 w-4' />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
