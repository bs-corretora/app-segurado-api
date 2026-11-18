'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, chamarApi } from '@/lib/admin/api';
import estilos from '../admin.module.css';

type Resumo = {
  segurados: number;
  apolices_ativas: number;
  sinistros: { ABERTO: number; EM_ANALISE: number; CONCLUIDO: number };
  cotacoes: { RECEBIDA: number; EM_ANALISE: number; RESPONDIDA: number };
  indicacoes: { NOVA: number; CONTATADA: number; CONVERTIDA: number };
  pendencias: { sinistros_abertos: number; cotacoes_sem_resposta: number; indicacoes_novas: number };
};

type Linha = { rotulo: string; valor: number };

function Bloco({ titulo, href, linhas }: { titulo: string; href: string; linhas: Linha[] }) {
  return (
    <Link href={href} className={estilos.bloco}>
      <span className={estilos.blocoTitulo}>{titulo}</span>
      <dl className={estilos.blocoLista}>
        {linhas.map((l) => (
          <div key={l.rotulo}>
            <dt>{l.rotulo}</dt>
            <dd>{l.valor}</dd>
          </div>
        ))}
      </dl>
    </Link>
  );
}

export default function InicioAdmin() {
  const router = useRouter();
  const [dados, setDados] = useState<Resumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    chamarApi<Resumo>('/admin/resumo')
      .then((r) => {
        if (!cancelado) setDados(r);
      })
      .catch((e) => {
        if (cancelado) return;
        if (e instanceof ApiError && e.status === 401) {
          router.replace('/admin/login');
          return;
        }
        setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar o resumo.');
      });
    return () => {
      cancelado = true;
    };
  }, [router]);

  if (erro) {
    return (
      <section>
        <h1 className={estilos.titulo}>Painel administrativo</h1>
        <p className={estilos.avisoErro}>{erro}</p>
      </section>
    );
  }

  if (!dados) {
    return (
      <section>
        <h1 className={estilos.titulo}>Painel administrativo</h1>
        <p className={estilos.aviso}>Carregando…</p>
      </section>
    );
  }

  const p = dados.pendencias;
  const pendencias = [
    { href: '/admin/sinistros', n: p.sinistros_abertos, texto: ['sinistro aberto', 'sinistros abertos'] },
    { href: '/admin/cotacoes', n: p.cotacoes_sem_resposta, texto: ['cotação sem resposta', 'cotações sem resposta'] },
    { href: '/admin/indicacoes', n: p.indicacoes_novas, texto: ['indicação nova', 'indicações novas'] },
  ].filter((x) => x.n > 0);

  return (
    <section>
      <h1 className={estilos.titulo}>Painel administrativo</h1>

      <h2 className={estilos.subtitulo}>Precisa de atenção</h2>
      {pendencias.length === 0 ? (
        <p className={estilos.vazio}>Nada pendente agora.</p>
      ) : (
        <ul className={estilos.pendencias}>
          {pendencias.map((x) => (
            <li key={x.href}>
              <Link href={x.href} className={estilos.pendencia}>
                <span className={estilos.numero}>{x.n}</span>
                {x.n === 1 ? x.texto[0] : x.texto[1]}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2 className={estilos.subtitulo}>Visão geral</h2>
      <div className={estilos.grade}>
        <Bloco
          titulo="Carteira"
          href="/admin/segurados"
          linhas={[
            { rotulo: 'Segurados', valor: dados.segurados },
            { rotulo: 'Apólices ativas', valor: dados.apolices_ativas },
          ]}
        />
        <Bloco
          titulo="Sinistros"
          href="/admin/sinistros"
          linhas={[
            { rotulo: 'Abertos', valor: dados.sinistros.ABERTO },
            { rotulo: 'Em análise', valor: dados.sinistros.EM_ANALISE },
            { rotulo: 'Concluídos', valor: dados.sinistros.CONCLUIDO },
          ]}
        />
        <Bloco
          titulo="Cotações"
          href="/admin/cotacoes"
          linhas={[
            { rotulo: 'Recebidas', valor: dados.cotacoes.RECEBIDA },
            { rotulo: 'Em análise', valor: dados.cotacoes.EM_ANALISE },
            { rotulo: 'Respondidas', valor: dados.cotacoes.RESPONDIDA },
          ]}
        />
        <Bloco
          titulo="Indicações"
          href="/admin/indicacoes"
          linhas={[
            { rotulo: 'Novas', valor: dados.indicacoes.NOVA },
            { rotulo: 'Contatadas', valor: dados.indicacoes.CONTATADA },
            { rotulo: 'Convertidas', valor: dados.indicacoes.CONVERTIDA },
          ]}
        />
      </div>
    </section>
  );
}
