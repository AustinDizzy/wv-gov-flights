import './globals.css'
import { Inter } from 'next/font/google'
import { ThemeProvider } from '@/components/ui/theme-provider'
import { cn } from '@/lib/utils'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import Script from 'next/script'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  metadataBase: new URL('https://wv-gov-flights.pages.dev'),
  title: 'Golden Dome Airways - WV State Aircraft Flight Logs',
  description: 'An unofficial public flight log for aircraft operated by the State of West Virginia.',
  twitter: {
    card: 'summary',
  },
  openGraph: {
    type: 'website',
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn(inter.className, 'min-h-screen bg-background flex flex-col')}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Navbar aircraft={['N1WV', 'N2WV', 'N3WV', 'N5WV', 'N6WV', 'N890SP', 'N895SP']} />
          <main className="container mx-auto py-4 flex-grow">
            {children}
          </main>
          <Footer />
        </ThemeProvider>
      </body>
      <Script
        src="https://tr.absec.org/script.js"
        data-website-id="a8b46f33-07d5-45c5-bb74-66152ef73b6c"
        strategy="afterInteractive"
      />
    </html>
  )
}