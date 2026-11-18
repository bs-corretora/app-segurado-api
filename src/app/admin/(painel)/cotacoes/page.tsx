'use client';

import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, chamarApi, type CamposComErro } from '@/lib/admin/api';
import estilos from '../../admin.module.css';

type StatusCotacao = 'RECEBIDA' | 'EM_ANALISE' | 'RESPONDIDA';

type Cotacao = {
  id: string;
  produto: string;
  motivo: string;
  dados: Record<string, unknown> | null;
  status: StatusCotacao;
  resposta: string | null;
  valor_estimado: number | string | null;
  respondida_em: string | null;
  criado_em: string;
  segurado: { id: string; nome: string } | null;
};

type Pagina<T> = { itens: T[]; pagina: number; limite: number; total: number };
type Resultado = { chave: string; dados?: Pagina<Cotacao>; erro?: string };

const LIMITE = 20;

const ROTULO_STATUS: Record<StatusCotacao, string> = {
  RECEBIDA: 'Recebida',
  EM_ANALISE: 'Em análise',
  RESPONDIDA: 'Respondida',
};

const CLASSE_STATUS: Record<StatusCotacao, string> = {
  RECEBIDA: estilos.seloAberto,
  EM_ANALISE: estilos.seloAnalise,
  RESPONDIDA: estilos.seloConcluido,
};

const PRODUTOS: Record<string, string> = {
  AUTO: 'Auto',
  RESIDENCIAL: 'Residencial',
  VIDA: 'Vida',
  EMPRESARIAL: 'Empresarial',
};

const MOTIVOS: Record<string, string> = {
  NOVO: 'Novo seguro',
  RENOVACAO: 'Renovação',
};

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function rotuloChave(chave: string): string {
  const texto = chave.replaceAll('_', ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function textoValor(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

function moeda(valor: number | string): string {
  const n = Number(valor);
  if (Number.isNaN(n)) return String(valor);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Aceita "2150", "2150,50" e "2.150,50". Retorna undefined se vazio e NaN se inválido.
function lerValor(texto: string): number | undefined {
  const limpo = texto.trim();
  if (!limpo) return undefined;
  const normal = limpo.includes(',') ? limpo.replaceAll('.', '').replace(',', '.') : limpo;
  return /^\d+(\.\d+)?$/.test(normal) ? Number(normal) : Number.NaN;
}

function Dados({ dados }: { dados: Record<string, unknown> | null }) {
  const pares = dados ? Object.entries(dados) : [];
  if (pares.length === 0) return <span className={estilos.apoio}>—</span>;
  return (
    <>
      {pares.map(([chave, valor]) => (
        <div key={chave}>
          <span className={estilos.apoio}>{rotuloChave(chave)}:</span> {textoValor(valor)}
        </div>
      ))}
    </>
  );
}

function FormResposta({ cotacao, aoSalvar }: { cotacao: Cotacao; aoSalvar: () => void }) {
  const [resposta, setResposta] = useState('');
  const [valor, setValor] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [campos, setCampos] = useState<CamposComErro>({});
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    setErro(null);
    setCampos({});

    const valorNumero = lerValor(valor);
    if (valorNumero !== undefined && Number.isNaN(valorNumero)) {
      setCampos({ valor_estimado: 'Informe um valor numérico, como 2150,00.' });
      return;
    }

    const corpo: { resposta: string; valor_estimado?: number } = { resposta };
    if (valorNumero !== undefined) corpo.valor_estimado = valorNumero;

    setEnviando(true);
    try {
      await chamarApi(`/admin/cotacoes/${cotacao.id}/resposta`, { method: 'PATCH', corpo });
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
        Resposta para o segurado
        <textarea
          required
          maxLength={2000}
          value={resposta}
          onChange={(e) => setResposta(e.target.value)}
          className={`${estilos.campo} ${estilos.areaTexto} ${campos.resposta ? estilos.campoErro : ''}`}
        />
        {campos.resposta && <p className={estilos.mensagemErro}>{campos.resposta}</p>}
      </label>

      <label className={estilos.rotulo}>
        Valor estimado em reais (opcional)
        <input
          type="text"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="Ex.: 2150,00"
          className={`${estilos.campo} ${campos.valor_estimado ? estilos.campoErro : ''}`}
        />
        {campos.valor_estimado && <p className={estilos.mensagemErro}>{campos.valor_estimado}</p>}
      </label>

      {erro && (
        <p role="alert" className={estilos.mensagemErro} style={{ marginBottom: 12 }}>
          {erro}
        </p>
      )}

      <button type="submit" disabled={enviando} className={estilos.botao}>
        {enviando ? 'Enviando…' : 'Enviar resposta'}
      </button>
    </form>
  );
}

export default function CotacoesAdmin() {
  const router = useRouter();
  const [filtro, setFiltro] = useState<'' | StatusCotacao>('');
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

    chamarApi<Pagina<Cotacao>>(`/admin/cotacoes?${params.toString()}`)
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
          e instanceof ApiError ? e.message : 'Não foi possível carregar as cotações.';
        setResultado({ chave, erro: mensagem });
      });

    return () => {
      cancelado = true;
    };
  }, [chave, filtro, pagina, router]);

  const carregando = resultado === null || resultado.chave !== chave;
  const dados = resultado?.dados;
  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / dados.limite)) : 1;

  function aoSalvar() {
    setAberto(null);
    setAviso('Cotação respondida. O segurado foi notificado.');
    setVersao((v) => v + 1);
  }

  return (
    <section>
      <h1 className={estilos.titulo}>Cotações</h1>

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
              setFiltro(e.target.value as '' | StatusCotacao);
              setPagina(1);
              setAberto(null);
              setAviso(null);
            }}
            className={estilos.selecao}
          >
            <option value="">Todas</option>
            <option value="RECEBIDA">Recebida</option>
            <option value="EM_ANALISE">Em análise</option>
            <option value="RESPONDIDA">Respondida</option>
          </select>
        </label>
        {dados && !carregando && <span className={estilos.apoio}>{dados.total} cotação(ões)</span>}
      </div>

      {carregando && <p className={estilos.aviso}>Carregando…</p>}

      {!carregando && resultado?.erro && <p className={estilos.avisoErro}>{resultado.erro}</p>}

      {!carregando && dados && dados.itens.length === 0 && (
        <p className={estilos.vazio}>Nenhuma cotação encontrada.</p>
      )}

      {!carregando && dados && dados.itens.length > 0 && (
        <div className={estilos.tabelaCaixa}>
          <table className={estilos.tabela}>
            <thead>
              <tr>
                <th>Segurado</th>
                <th>Produto</th>
                <th>Motivo</th>
                <th>Dados enviados</th>
                <th>Status</th>
                <th>Recebida em</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {dados.itens.map((c) => (
                <Fragment key={c.id}>
                  <tr>
                    <td>{c.segurado?.nome ?? '—'}</td>
                    <td>{PRODUTOS[c.produto] ?? c.produto}</td>
                    <td>{MOTIVOS[c.motivo] ?? c.motivo}</td>
                    <td>
                      <Dados dados={c.dados} />
                    </td>
                    <td>
                      <span className={`${estilos.selo} ${CLASSE_STATUS[c.status]}`}>
                        {ROTULO_STATUS[c.status]}
                      </span>
                    </td>
                    <td>{dataHora(c.criado_em)}</td>
                    <td>
                      {c.status === 'RESPONDIDA' ? (
                        <>
                          {c.resposta ?? '—'}
                          {c.valor_estimado !== null && (
                            <>
                              <br />
                              <span className={estilos.apoio}>
                                Valor estimado: {moeda(c.valor_estimado)}
                              </span>
                            </>
                          )}
                          {c.respondida_em && (
                            <>
                              <br />
                              <span className={estilos.apoio}>
                                Respondida em {dataHora(c.respondida_em)}
                              </span>
                            </>
                          )}
                        </>
                      ) : (
                        <button
                          type="button"
                          aria-expanded={aberto === c.id}
                          onClick={() => {
                            setAviso(null);
                            setAberto(aberto === c.id ? null : c.id);
                          }}
                          className={estilos.botaoSecundario}
                        >
                          {aberto === c.id ? 'Cancelar' : 'Responder'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {aberto === c.id && (
                    <tr>
                      <td colSpan={7}>
                        <FormResposta cotacao={c} aoSalvar={aoSalvar} />
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
