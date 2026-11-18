'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ApiError, chamarApi } from '@/lib/admin/api';
import estilos from '../admin.module.css';

type Estado = 'carregando' | 'ok' | 'negado' | 'erro';

// Acrescente cada tela nova aqui quando ela existir, para não haver link para página que não há.
const MENU = [
  { href: '/admin', rotulo: 'Início' },
  { href: '/admin/sinistros', rotulo: 'Sinistros' },
  // { href: '/admin/cotacoes', rotulo: 'Cotações' },
  // { href: '/admin/segurados', rotulo: 'Segurados' },
  // { href: '/admin/indicacoes', rotulo: 'Indicações' },
  // { href: '/admin/contatos', rotulo: 'Contatos' },
];

export default function LayoutPainel({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [estado, setEstado] = useState<Estado>('carregando');

  useEffect(() => {
    chamarApi<{ papel: string }>('/me')
      .then((perfil) => setEstado(perfil.papel === 'ADMIN' ? 'ok' : 'negado'))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace('/admin/login');
        else setEstado('erro');
      });
  }, [router]);

  async function sair() {
    try {
      await chamarApi('/auth/logout', { method: 'POST' });
    } finally {
      router.replace('/admin/login');
    }
  }

  if (estado === 'carregando') return <p className={estilos.aviso}>Carregando…</p>;
  if (estado === 'negado') return <p className={estilos.avisoErro}>Sem permissão para acessar o painel.</p>;
  if (estado === 'erro') {
    return <p className={estilos.avisoErro}>Não foi possível carregar o painel. Tente de novo.</p>;
  }

  return (
    <div>
      <header className={estilos.cabecalho}>
        <nav className={estilos.menu}>
          {MENU.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${estilos.link} ${pathname === item.href ? estilos.linkAtivo : ''}`}
            >
              {item.rotulo}
            </Link>
          ))}
        </nav>
        <button type="button" onClick={sair} className={estilos.sair}>
          Sair
        </button>
      </header>
      <main className={estilos.conteudo}>{children}</main>
    </div>
  );
}