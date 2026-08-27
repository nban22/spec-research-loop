'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Menu, Workflow } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { api, qk } from '@/lib/api';
import { cn } from '@/lib/utils';
import { CommandPaletteTrigger } from './command-palette';

type Me = { user: { id: string; email: string; display_name: string } };

/** Bốn mục nav của mockup 5, **bỏ chuông** — không có tính năng thông báo trong 16 chức năng (§8 #3). */
const NAV = [
  { href: '/', label: 'Trang chủ' },
  { href: '/projects', label: 'Dự án' },
  { href: '/versions', label: 'Lịch sử phiên bản' },
  { href: '/help', label: 'Trợ giúp' },
];

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: qk.me,
    queryFn: () => api.get<Me>('/auth/me'),
    retry: false,
  });

  const logout = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      queryClient.clear();
      router.push('/login');
    },
  });

  const user = data?.user;
  const initials = (user?.display_name ?? '?').slice(0, 1).toUpperCase();
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header className="border-hairline bg-surface sticky top-0 z-30 border-b">
      <div className="mx-auto flex h-12 max-w-[1400px] items-center gap-2 px-3 md:h-14 md:px-4">
        {/* Mobile: nút ☰ mở drawer. Tần suất thấp nên không đáng chiếm đáy màn hình (§6.6). */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Mở menu">
              <Menu className="size-5" aria-hidden />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72">
            <SheetHeader>
              <SheetTitle>SpecResearch Loop</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-0.5 px-2">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'rounded-md px-3 py-2.5 text-sm',
                    'ease-out-quart transition-colors duration-150',
                    isActive(item.href)
                      ? 'bg-brand-soft text-brand-strong font-medium'
                      : 'text-ink-2 hover:bg-sunken hover:text-ink-1',
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="border-hairline mt-auto space-y-2 border-t px-4 py-3">
              <p className="text-ink-1 text-sm font-medium">{user?.display_name}</p>
              <p className="text-ink-3 text-xs">{user?.email}</p>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => logout.mutate()}
              >
                Đăng xuất
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <Link href="/" className="group flex items-center gap-2">
          <span className="bg-brand-ink ease-out-quart rounded-md p-1.5 text-white transition-transform duration-150 group-hover:scale-105">
            <Workflow className="size-4" aria-hidden />
          </span>
          <span className="text-ink-1 text-sm font-semibold">SpecResearch Loop</span>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm',
                'ease-out-quart transition-[color,background-color] duration-150',
                isActive(item.href)
                  ? 'text-brand-strong border-brand-ink border-b-2 font-medium'
                  : 'text-ink-2 hover:bg-sunken hover:text-ink-1',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <CommandPaletteTrigger />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="ease-out-quart hover:bg-sunken flex cursor-pointer items-center gap-2 rounded-full p-0.5 pr-2 transition-colors duration-150"
                aria-label="Tài khoản"
              >
                <Avatar className="size-8">
                  <AvatarFallback className="bg-brand-soft text-brand-strong text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="text-ink-2 hidden text-sm md:inline">
                  {user?.display_name}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs font-normal">
                {user?.email ?? 'Chưa đăng nhập'}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logout.mutate()}>Đăng xuất</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
