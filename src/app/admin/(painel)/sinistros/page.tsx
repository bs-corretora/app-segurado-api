'use client';

import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, chamarApi, type CamposComErro } from '@/lib/admin/api';
import estilos from '../../admin.module.css';

type StatusSinistro = 'ABERTO' | 'EM_ANALISE' | 'CONCLUIDO';

type Sinistro = {
  id: string;
  protocolo: string;
  tipo: string;
  status: StatusSinistro;
  criado_em: string;
  segurado: { id: string; nome: string } | null;
  apolice: { id: string; numero: string; produto: string } | null;
};

type Pagina<T> = { itens: T[]; pagina: number; limite: number; total: number };
type Resultado = { chave: string; dados?: Pagina<Sinistro>; erro?: string };

const LIMITE = 20;

const ROTULO_STATUS: Record<StatusSinistro, string> = {
  ABERTO: 'Aberto',
  EM_ANALISE: 'Em análise',
  CONCLUIDO: 'Concluído',
};

const CLASSE_STATUS: Record<StatusSinistro, string> = {
  ABERTO: estilos.seloAberto,
  EM_ANALISE: estilos.seloAnalise,
  CONCLUIDO: estilos.seloConcluido,
};

// O sinistro só anda para a frente (PR #27): estes são os status permitidos a partir de cada um.
const PROXIMOS: Record<StatusSinistro, ('EM_ANALISE' | 'CONCLUIDO')[]> = {
  ABERTO: ['EM_ANALISE', 'CONCLUIDO'],
  EM_ANALISE: ['CONCLUIDO'],
  CONCLUIDO: [],
};

const TIPOS: Record<string, string> = {
  COLISAO: 'Colisão',
  ROUBO: 'Roubo',
  INCENDIO: 'Incêndio',
  DANO_ELETRICO: 'Dano elétrico',
};

const PRODUTOS: Record<string, string> = {
  AUTO: 'Auto',
  RESIDENCIAL: 'Residencial',
  VIDA: 'Vida',
  EMPRESARIAL: 'Empresarial',
};

function rotuloTipo(tipo: string): string {
  return TIPOS[tipo] ?? tipo.charAt(0) + tipo.slice(1).toLowerCase().replaceAll('_', ' ');
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function FormStatus({ sinistro, aoSalvar }: { sinistro: Sinistro; aoSalvar: () => void }) {
  const opcoes = PROXIMOS[sinistro.status];
  const [status, setStatus] = useState(opcoes[0]);
  const [comentario, setComentario] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [campos, setCampos] = useState<CamposComErro>({});
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    setErro(null);
    setCampos({});
    setEnviando(true);
    try {
      await chamarApi(`/admin/sinistros/${sinistro.id}/status`, {
        method: 'PATCH',
        corpo: { status, comentario },
      });
      aoSalvar();
    } catch (e) {
      if (e instanceof ApiError) {
        setCampos(e.campos ?? {});
        setErro(e.message);
      } else {
        setErro('Não foi possível salvar. Verifique a conexão e tente de novo.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className={estilos.formStatus}>
      <label className={estilos.rotulo}>
        Novo status
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as 'EM_ANALISE' | 'CONCLUIDO')}
          className={`${estilos.campo} ${campos.status ? estilos.campoErro : ''}`}
        >
          {opcoes.map((op) => (
            <option key={op} value={op}>
              {ROTULO_STATUS[op]}
            </option>
          ))}
        </select>
        {campos.status && <p className={estilos.mensagemErro}>{campos.status}</p>}
      </label>

      <label className={estilos.rotulo}>
        Mensagem para o segurado (aparece na linha do tempo)
        <textarea
          required
          maxLength={1000}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          className={`${estilos.campo} ${estilos.areaTexto} ${campos.comentario ? estilos.campoErro : ''}`}
        />
        {campos.comentario && <p className={estilos.mensagemErro}>{campos.comentario}</p>}
      </label>

      {erro && (
        <p role="alert" className={estilos.mensagemErro} style={{ marginBottom: 12 }}>
          {erro}
        </p>
      )}

      <button type="submit" disabled={enviando} className={estilos.botao}>
        {enviando ? 'Salvando…' : 'Salvar'}
      </button>
    </form>
  );
}

export default function SinistrosAdmin() {
  const router = useRouter();
  const [filtro, setFiltro] = useState<'' | StatusSinistro>('');
  const [pagina, setPagina] = useState(1);
  const [versao, setVersao] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // A "chave" identifica o pedido atual; enquanto o resultado guardado for de outra chave, está carregando.
  const chave = `${filtro}|${pagina}|${versao}`;

  useEffect(() => {
    let cancelado = false;
    const params = new URLSearchParams({ pagina: String(pagina), limite: String(LIMITE) });
    if (filtro) params.set('status', filtro);

    chamarApi<Pagina<Sinistro>>(`/admin/sinistros?${params.toString()}`)
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
          e instanceof ApiError ? e.message : 'Não foi possível carregar os sinistros.';
        setResultado({ chave, erro: mensagem });
      });

    return () => {
      cancelado = true;
    };
  }, [chave, filtro, pagina, router]);

  const carregando = resultado === null || resultado.chave !== chave;
  const dados = resultado?.dados;
  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / dados.limite)) : 1;

  function aoSalvar(protocolo: string) {
    setAberto(null);
    setAviso(`Status do sinistro ${protocolo} atualizado. O segurado foi notificado.`);
    setVersao((v) => v + 1);
  }

  return (
    <section>
      <h1 className={estilos.titulo}>Sinistros</h1>

      {aviso && (
        <p role="status" className={estilos.sucesso}>
          {aviso}
        </p>
      )}

      <div className={estilos.barra}>
        <label>
          Status{' '}
          <select
            value={filtro}
            onChange={(e) => {
              setFiltro(e.target.value as '' | StatusSinistro);
              setPagina(1);
              setAberto(null);
              setAviso(null);
            }}
            className={estilos.selecao}
          >
            <option value="">Todos</option>
            <option value="ABERTO">Aberto</option>
            <option value="EM_ANALISE">Em análise</option>
            <option value="CONCLUIDO">Concluído</option>
          </select>
        </label>
        {dados && !carregando && <span className={estilos.apoio}>{dados.total} sinistro(s)</span>}
      </div>

      {carregando && <p className={estilos.aviso}>Carregando…</p>}

      {!carregando && resultado?.erro && <p className={estilos.avisoErro}>{resultado.erro}</p>}

      {!carregando && dados && dados.itens.length === 0 && (
        <p className={estilos.vazio}>Nenhum sinistro encontrado.</p>
      )}

      {!carregando && dados && dados.itens.length > 0 && (
        <div className={estilos.tabelaCaixa}>
          <table className={estilos.tabela}>
            <thead>
              <tr>
                <th>Protocolo</th>
                <th>Segurado</th>
                <th>Apólice</th>
                <th>Tipo</th>
                <th>Status</th>
                <th>Aberto em</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {dados.itens.map((s) => (
                <Fragment key={s.id}>
                  <tr>
                    <td>{s.protocolo}</td>
                    <td>{s.segurado?.nome ?? '—'}</td>
                    <td>
                      {s.apolice ? (
                        <>
                          {s.apolice.numero}
                          <br />
                          <span className={estilos.apoio}>
                            {PRODUTOS[s.apolice.produto] ?? s.apolice.produto}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{rotuloTipo(s.tipo)}</td>
                    <td>
                      <span className={`${estilos.selo} ${CLASSE_STATUS[s.status]}`}>
                        {ROTULO_STATUS[s.status]}
                      </span>
                    </td>
                    <td>{dataHora(s.criado_em)}</td>
                    <td>
                      {PROXIMOS[s.status].length > 0 ? (
                        <button
                          type="button"
                          aria-expanded={aberto === s.id}
                          onClick={() => {
                            setAviso(null);
                            setAberto(aberto === s.id ? null : s.id);
                          }}
                          className={estilos.botaoSecundario}
                        >
                          {aberto === s.id ? 'Cancelar' : 'Alterar status'}
                        </button>
                      ) : (
                        <span className={estilos.apoio}>—</span>
                      )}
                    </td>
                  </tr>
                  {aberto === s.id && (
                    <tr>
                      <td colSpan={7}>
                        <FormStatus sinistro={s} aoSalvar={() => aoSalvar(s.protocolo)} />
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