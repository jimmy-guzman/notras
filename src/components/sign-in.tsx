import { signIn } from '@/server/auth'

export function SignIn() {
  return (
    <form
      action={async () => {
        'use server'
        await signIn()
      }}
    >
      <button type='submit' className='dsy-btn dsy-btn-ghost'>
        Sign In
      </button>
    </form>
  )
}
