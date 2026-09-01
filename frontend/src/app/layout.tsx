import type { Metadata } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { Providers } from './providers';
import './globals.css';

/**
 * `Be Vietnam Pro` loaded through `next/font` — built into Next.js, **not a new dependency**.
 * Kept as the type family of the design system (DESIGN_SYSTEM §2); the `vietnamese` subset stays
 * because paper titles and abstracts are rendered verbatim and some of them are Vietnamese.
 */
const beVietnamPro = Be_Vietnam_Pro({
  variable: '--font-be-vietnam-pro',
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SpecResearch Loop',
  description:
    'Turn a vague research idea into a 14-section specification that has been critiqued and traced back to real sources.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${beVietnamPro.variable} h-full antialiased`}>
      <body className="bg-canvas text-ink-1 flex min-h-full flex-col">
        <Providers>{children}</Providers>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
