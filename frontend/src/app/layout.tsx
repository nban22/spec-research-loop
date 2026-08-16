import type { Metadata } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { Providers } from './providers';
import './globals.css';

/**
 * `Be Vietnam Pro` nạp qua `next/font` — có sẵn trong Next.js, **không phải dependency mới**.
 * Lý do chọn: UI toàn tiếng Việt và font này vẽ dấu riêng chứ không ghép (DESIGN_SYSTEM §2).
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
    'Biến một ý tưởng nghiên cứu mơ hồ thành bản đặc tả 14 mục đã được phản biện và truy được nguồn.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="vi" className={`${beVietnamPro.variable} h-full antialiased`}>
      <body className="bg-canvas text-ink-1 flex min-h-full flex-col">
        <Providers>{children}</Providers>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
