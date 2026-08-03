'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import {
  Clapperboard,
  Download,
  LayoutDashboard,
  Plus,
  Settings,
  Shield,
  Sparkles,
} from 'lucide-react';

interface CommandMenuContext {
  open: () => void;
}

const Context = React.createContext<CommandMenuContext>({ open: () => {} });
export const useCommandMenu = () => React.useContext(Context);

const COMMANDS = [
  { icon: Plus, label: 'Novo projeto', hint: 'Criar cortes de um vídeo', href: '/projects/new' },
  { icon: LayoutDashboard, label: 'Dashboard', hint: 'Visão geral', href: '/dashboard' },
  { icon: Clapperboard, label: 'Projetos', hint: 'Todos os projetos', href: '/projects' },
  { icon: Download, label: 'Exportações', hint: 'Histórico de renders', href: '/exports' },
  { icon: Settings, label: 'Configurações', hint: 'Conta e preferências', href: '/settings' },
  { icon: Shield, label: 'Admin', hint: 'Filas, métricas e usuários', href: '/admin' },
] as const;

/**
 * Command menu no padrão Linear/Raycast: ⌘K abre, digitar filtra, Enter navega.
 * É o atalho que faz a aplicação parecer rápida mesmo em telas profundas.
 */
export function CommandMenuProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setIsOpen((current) => !current);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const value = React.useMemo(() => ({ open: () => setIsOpen(true) }), []);

  const run = (href: string) => {
    setIsOpen(false);
    router.push(href);
  };

  return (
    <Context.Provider value={value}>
      {children}

      <Command.Dialog
        open={isOpen}
        onOpenChange={setIsOpen}
        label="Menu de comandos"
        className="fixed inset-0 z-50"
      >
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in-0"
          onClick={() => setIsOpen(false)}
        />
        <div className="glass animate-in fade-in-0 zoom-in-95 duration-200 absolute left-1/2 top-[18%] w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border border-border shadow-overlay">
          <div className="flex items-center gap-2.5 border-b border-border px-4">
            <Sparkles className="size-4 text-violet" />
            <Command.Input
              placeholder="Digite um comando ou busque…"
              className="h-12 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle"
            />
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="px-3 py-8 text-center text-sm text-fg-subtle">
              Nada encontrado.
            </Command.Empty>

            <Command.Group heading="Navegação" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle">
              {COMMANDS.map((command) => (
                <Command.Item
                  key={command.href}
                  value={`${command.label} ${command.hint}`}
                  onSelect={() => run(command.href)}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm text-fg-muted data-[selected=true]:bg-surface-3 data-[selected=true]:text-fg"
                >
                  <command.icon className="size-4 text-fg-subtle" />
                  <span>{command.label}</span>
                  <span className="ml-auto text-xs text-fg-subtle">{command.hint}</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </div>
      </Command.Dialog>
    </Context.Provider>
  );
}
