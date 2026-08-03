import { Sidebar } from '@/components/layout/sidebar';
import { CommandMenuProvider } from '@/components/layout/command-menu';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <CommandMenuProvider>
      <div className="min-h-screen bg-bg">
        <Sidebar />
        <div className="lg:pl-[236px]">{children}</div>
      </div>
    </CommandMenuProvider>
  );
}
