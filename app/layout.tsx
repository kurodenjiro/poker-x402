import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Poker X402 - AI Model Evaluation',
  description: 'Competitive poker game where AI models face off against each other',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  )
}

