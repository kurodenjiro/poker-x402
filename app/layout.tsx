import type { Metadata } from 'next'
import './globals.css'
import { WalletContextProvider } from '@/components/WalletProvider'

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
      <body className="antialiased">
        <WalletContextProvider>
          {children}
        </WalletContextProvider>
      </body>
    </html>
  )
}

