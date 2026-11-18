import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globais.css';

// Sem título, a aba mostra o endereço e o leitor de tela não anuncia a página (WCAG 2.4.2).
export const metadata: Metadata = {
  title: { default: 'BS Seguros', template: '%s | BS Seguros' },
};

// Layout das páginas renderizadas por este projeto (página pública de indicação e painel).
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
