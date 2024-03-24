import './globals.css'

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

import { Nav } from '@/components/nav'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'NextJS Starter',
  description: 'Another opinionated NextJS Starter.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang='en'>
      <body className={inter.className}>
        <div className='max-w-[100vw] px-6 pb-16 xl:pr-2'>
          <Nav />
          {children}
        </div>
      </body>
    </html>
  )
}
