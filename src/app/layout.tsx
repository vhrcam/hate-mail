import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Hate Mail',
  description: 'See every mailing list you are on and unsubscribe from the ones you hate.',
}

export const viewport: Viewport = {
  themeColor: '#0f1f47',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  )
}
