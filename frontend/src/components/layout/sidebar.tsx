'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Clapperboard,
  Download,
  LayoutDashboard,
  Settings,
  Shield,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projetos', icon: Clapperboard },
  { href: '/exports', label: 'Exportações', icon: Download },
] as const;

const FOOTER_NAV = [
  { href: '/settings', label: 'Configurações', icon: Settings },
  { href: '/admin', label: 'Admin', icon: Shield },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] flex-col border-r border-border bg-surface/60 lg:flex">
      <div className="flex h-14 items-center gap-2.5 px-5">
        <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet to-cyan">
          <Sparkles className="size-4 text-white" />
        </div>
        <span className="text-base font-medium tracking-tight">ClipForge</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2">
        {NAV.map((item) => (
          <NavItem key={item.href} {...item} active={pathname.startsWith(item.href)} />
        ))}
      </nav>

      <div className="flex flex-col gap-0.5 px-3 pb-3">
        <div className="hairline mx-2 mb-2 h-px" />
        {FOOTER_NAV.map((item) => (
          <NavItem key={item.href} {...item} active={pathname.startsWith(item.href)} />
        ))}
      </div>
    </aside>
  );
}

interface NavItemProps {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
}

function NavItem({ href, label, icon: Icon, active }: NavItemProps) {
  return (
    <Link
      href={href}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm',
        'transition-colors duration-[120ms] ease-smooth',
        active ? 'text-fg' : 'text-fg-muted hover:text-fg',
      )}
    >
      {active ? (
        // layoutId faz o realce deslizar entre itens em vez de piscar.
        <motion.span
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-md border border-border bg-surface-2"
          transition={{ type: 'spring', stiffness: 400, damping: 40 }}
        />
      ) : null}
      <Icon
        className={cn(
          'relative size-4 transition-colors',
          active ? 'text-violet' : 'text-fg-subtle group-hover:text-fg-muted',
        )}
      />
      <span className="relative">{label}</span>
    </Link>
  );
}
