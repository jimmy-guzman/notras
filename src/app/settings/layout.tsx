import { type ReactNode } from 'react'

import { MenuLink } from '@/components/menu-link'

export default function Layout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className='mt-16 px-4 md:container md:mx-auto'>
      <div className='grid-flow-col auto-rows-max gap-4 sm:grid'>
        <ul className='dsy-menu dsy-menu-horizontal sm:dsy-menu-vertical'>
          <li>
            <MenuLink to='/settings/theme'>Theme</MenuLink>
          </li>
        </ul>
        <div className='col-span-8 grid gap-8'>
          <div className='prose dsy-prose '>
            <h1>Settings</h1>
          </div>
          <div className='rounded-box border border-neutral p-4'>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
