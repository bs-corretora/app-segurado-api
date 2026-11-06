import { Suspense } from 'react';
import type { Metadata } from 'next';
import Formulario from './formulario';
import css from './indicacao.module.css';

export const metadata: Metadata = {
  title: 'Indicação — BS Seguros',
  robots: { index: false },
};

// Página pública de indicação (seção 6.8): quem recebeu o link deixa nome e telefone, e o
// pedido chega ao painel como indicação NOVA do segurado dono do código.
export default function PaginaIndicacao({ params }: { params: Promise<{ codigo: string }> }) {
  return (
    <main className={css.pagina}>
      <section className={css.cartao}>
        <p className={css.marca}>BS Seguros</p>
        <h1 className={css.titulo}>Você foi indicado para a BS Seguros</h1>
        <p className={css.apoio}>
          Deixe seu nome e telefone. Um corretor entra em contato para entender o que você precisa,
          sem compromisso.
        </p>
        <Suspense>
          <CodigoDaUrl params={params} />
        </Suspense>
      </section>
    </main>
  );
}

async function CodigoDaUrl({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  return <Formulario codigo={codigo} />;
}
