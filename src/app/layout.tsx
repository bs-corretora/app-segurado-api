import type { ReactNode } from 'react';
import './globais.css';

// Layout das páginas renderizadas por este projeto (página pública de indicação; depois o painel).
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
