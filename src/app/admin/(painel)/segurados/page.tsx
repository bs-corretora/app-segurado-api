'use client';

import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, chamarApi } from '@/lib/admin/api';
import { formatarCpf, formatarTelefone, mascararCpf } from '@/lib/formato';
import estilos from '../../admin.module.css';

type SeguradoResumo = {
  id: string;
  nome: string;
  cpf: string;
  telefone: string | null;
  email: string | null;
  cliente_desde: string | null;
  aceita_marketing: boolean;
};

type Apolice = {
  id: string;
  numero: string;
  produto: string;
  status: string;
  inicio_vigencia: string;
  fim_vigencia: string;
  premio: number | null;
};

const STATUS_APOLICE: Record<string, string> = {
  ATIVA: 'Ativa',
  VENCIDA: 'Vencida',
  CANCELADA: 'Cancelada',
};

type SeguradoDetalhe = {
  id: string;
  nome: string;
  cpf: string;
  telefone: string | null;
  data_nascimento: string | null;
  cliente_desde: string | null;
  codigo_indicacao: string | null;
  aceita_marketing: boolean;
  criado_em: string;
  email: string | null;
  apolices: Apolice[];
};

type Pagina<T> = { itens: T[]; pagina: number; limite: number; total: number };
type Resultado = { chave: string; dados?: Pagina<SeguradoResumo>; erro?: string };
type Detalhe = { id: string; dados?: SeguradoDetalhe; erro?: string };

const LIMITE = 20;

const PRODUTOS: Record<string, string> = {
  AUTO: 'Auto',
  RESIDENCIAL: 'Residencial',
  VIDA: 'Vida',
  EMPRESARIAL: 'Empresarial',
};

function texto(valor: string | null | undefined): string {
  return valor ? valor : '—';
}

// Datas "AAAA-MM-DD" não passam por Date: o fuso deslocaria o dia.
function dataSimples(valor: string | null | undefined): string {
  if (!valor) return '—';
  const [ano, mes, dia] = valor.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function dinheiro(valor: number | null): string {
  if (valor === null || valor === undefined) return '—';
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function simNao(valor: boolean): string {
  return valor ? 'Sim' : 'Não';
}

function DetalheSegurado({ detalhe }: { detalhe: Detalhe | null }) {
  if (detalhe === null) return <p className={estilos.aviso}>Carregando…</p>;
  if (detalhe.erro) return <p className={estilos.avisoErro}>{detalhe.erro}</p>;
  const s = detalhe.dados;
  if (!s) return null;

  const dados: [string, string][] = [
    ['CPF', formatarCpf(s.cpf)],
    ['E-mail', texto(s.email)],
    ['Telefone', formatarTelefone(s.telefone)],
    ['Data de nascimento', dataSimples(s.data_nascimento)],
    ['Cliente desde', dataSimples(s.cliente_desde)],
    ['Código de indicação', texto(s.codigo_indicacao)],
    ['Aceita marketing', simNao(s.aceita_marketing)],
    ['Cadastrado em', dataHora(s.criado_em)],
  ];

  return (
    <div className={estilos.formStatus} style={{ maxWidth: 'none' }}>
      <table className={estilos.tabela}>
        <tbody>
          {dados.map(([rotulo, valor]) => (
            <tr key={rotulo}>
              <th>{rotulo}</th>
              <td>{valor}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className={estilos.subtitulo}>Apólices ({s.apolices.length})</h2>
      {s.apolices.length === 0 ? (
        <p className={estilos.vazio}>Nenhuma apólice.</p>
      ) : (
        <div className={estilos.tabelaCaixa}>
          <table className={estilos.tabela}>
            <thead>
              <tr>
                <th>Número</th>
                <th>Produto</th>
                <th>Status</th>
                <th>Vigência</th>
                <th>Prêmio</th>
              </tr>
            </thead>
            <tbody>
              {s.apolices.map((a) => (
                <tr key={a.id}>
                  <td>{a.numero}</td>
                  <td>{PRODUTOS[a.produto] ?? a.produto}</td>
                  <td>{STATUS_APOLICE[a.status] ?? a.status}</td>
                  <td>
                    {dataSimples(a.inicio_vigencia)} a {dataSimples(a.fim_vigencia)}
                  </td>
                  <td>{dinheiro(a.premio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function SeguradosAdmin() {
  const router = useRouter();
  const [digitado, setDigitado] = useState('');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);

  const chave = `${busca}|${pagina}`;

  useEffect(() => {
    let cancelado = false;
    const params = new URLSearchParams({ pagina: String(pagina), limite: String(LIMITE) });
    if (busca) params.set('busca', busca);

    chamarApi<Pagina<SeguradoResumo>>(`/admin/segurados?${params.toString()}`)
      .then((dados) => {
        if (!cancelado) setResultado({ chave, dados });
      })
      .catch((e) => {
        if (cancelado) return;
        if (e instanceof ApiError && e.status === 401) {
          router.replace('/admin/login');
          return;
        }
        const mensagem =
          e instanceof ApiError ? e.message : 'Não foi possível carregar os segurados.';
        setResultado({ chave, erro: mensagem });
      });

    return () => {
      cancelado = true;
    };
  }, [chave, busca, pagina, router]);

  // Detalhe do segurado aberto. O estado só vale se for do mesmo id; caso contrário, carregando.
  useEffect(() => {
    if (!aberto) return;
    let cancelado = false;
    chamarApi<SeguradoDetalhe>(`/admin/segurados/${aberto}`)
      .then((dados) => {
        if (!cancelado) setDetalhe({ id: aberto, dados });
      })
      .catch((e) => {
        if (cancelado) return;
        if (e instanceof ApiError && e.status === 401) {
          router.replace('/admin/login');
          return;
        }
        const mensagem =
          e instanceof ApiError ? e.message : 'Não foi possível carregar o segurado.';
        setDetalhe({ id: aberto, erro: mensagem });
      });
    return () => {
      cancelado = true;
    };
  }, [aberto, router]);

  const carregando = resultado === null || resultado.chave !== chave;
  const dados = resultado?.dados;
  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / dados.limite)) : 1;

  function buscar(evento: FormEvent) {
    evento.preventDefault();
    setBusca(digitado.trim());
    setPagina(1);
    setAberto(null);
  }

  return (
    <section>
      <h1 className={estilos.titulo}>Segurados</h1>

      <form onSubmit={buscar} className={estilos.barra}>
        <label>
          Buscar{' '}
          <input
            type="search"
            value={digitado}
            maxLength={120}
            placeholder="Nome, CPF ou e-mail"
            onChange={(e) => setDigitado(e.target.value)}
            className={estilos.selecao}
          />
        </label>
        <button type="submit" className={estilos.botaoSecundario}>
          Buscar
        </button>
        {dados && !carregando && <span className={estilos.apoio}>{dados.total} segurado(s)</span>}
      </form>

      {carregando && <p className={estilos.aviso}>Carregando…</p>}

      {!carregando && resultado?.erro && <p className={estilos.avisoErro}>{resultado.erro}</p>}

      {!carregando && dados && dados.itens.length === 0 && (
        <p className={estilos.vazio}>Nenhum segurado encontrado.</p>
      )}

      {!carregando && dados && dados.itens.length > 0 && (
        <div className={estilos.tabelaCaixa}>
          <table className={estilos.tabela}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>CPF</th>
                <th>Telefone</th>
                <th>E-mail</th>
                <th>Cliente desde</th>
                <th>Marketing</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {dados.itens.map((s) => (
                <Fragment key={s.id}>
                  <tr>
                    <td>{s.nome}</td>
                    <td>{mascararCpf(s.cpf)}</td>
                    <td>{formatarTelefone(s.telefone)}</td>
                    <td>{texto(s.email)}</td>
                    <td>{dataSimples(s.cliente_desde)}</td>
                    <td>{simNao(s.aceita_marketing)}</td>
                    <td>
                      <button
                        type="button"
                        aria-expanded={aberto === s.id}
                        onClick={() => {
                          setDetalhe(null);
                          setAberto(aberto === s.id ? null : s.id);
                        }}
                        className={estilos.botaoSecundario}
                      >
                        {aberto === s.id ? 'Fechar' : 'Ver detalhes'}
                      </button>
                    </td>
                  </tr>
                  {aberto === s.id && (
                    <tr>
                      <td colSpan={7}>
                        <DetalheSegurado
                          detalhe={detalhe && detalhe.id === s.id ? detalhe : null}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!carregando && dados && dados.total > dados.limite && (
        <div className={estilos.paginacao}>
          <button
            type="button"
            disabled={pagina <= 1}
            onClick={() => {
              setPagina(pagina - 1);
              setAberto(null);
            }}
            className={estilos.botaoSecundario}
          >
            Anterior
          </button>
          <span className={estilos.apoio}>
            Página {pagina} de {totalPaginas}
          </span>
          <button
            type="button"
            disabled={pagina >= totalPaginas}
            onClick={() => {
              setPagina(pagina + 1);
              setAberto(null);
            }}
            className={estilos.botaoSecundario}
          >
            Próxima
          </button>
        </div>
      )}
    </section>
  );
}
