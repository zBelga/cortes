import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <span className="font-mono text-5xl font-medium tracking-tight text-fg-subtle">404</span>
      <h1 className="mt-4 text-xl font-medium tracking-tight">Página não encontrada</h1>
      <p className="mt-2 max-w-sm text-sm text-fg-muted">
        O endereço que você abriu não existe ou foi movido.
      </p>
      <Button asChild variant="secondary" className="mt-6">
        <Link href="/dashboard">Voltar ao dashboard</Link>
      </Button>
    </main>
  );
}
