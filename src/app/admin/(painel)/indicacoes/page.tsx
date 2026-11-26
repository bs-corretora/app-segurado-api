'use client';

import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, chamarApi, type CamposComErro } from '@/lib/admin/api';
import { formatarTelefone } from '@/lib/formato';
import estilos from '../../admin.module.css';

type StatusIndicacao = 'NOVA' | 'CONTATADA' | 'CONVERTIDA';
type ProximoStatus = 'CONTATADA' | 'CONVERTIDA';

type Indicacao = {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  status: StatusIndicacao;
  criado_em: string;
  indicador: { id: string; nome: string } | null;
};

type Pagina<T> = { itens: T[]; pagina: number; limite: number; total: number };
type Resultado = { chave: string; dados?: Pagina<Indicacao>; erro?: string };

const LIMITE = 20;

const ROTULO_STATUS: Record<StatusIndicacao, string> = {
  NOVA: 'Nova',
  CONTATADA: 'Contatada',
  CONVERTIDA: 'Convertida',
};

const CLASSE_STATUS: Record<StatusIndicacao, string> = {
  NOVA: estilos.seloAberto,
  CONTATADA: estilos.seloAnalise,
  CONVERTIDA: estilos.seloConcluido,
};

// A indicação só anda para a frente (admin_alterar_status_indicacao): NOVA pode pular direto
// para CONVERTIDA; repetir ou voltar é 409.
const PROXIMOS: Record<StatusIndicacao, ProximoStatus[]> = {
  NOVA: ['CONTATADA', 'CONVERTIDA'],
  CONTATADA: ['CONVERTIDA'],
  CONVERTIDA: [],
};

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function FormStatus({ indicacao, aoSalvar }: { indicacao: Indicacao; aoSalvar: () => void }) {
  const opcoes = PROXIMOS[indicacao.status];
  const [status, setStatus] = useState<ProximoStatus>(opcoes[0]);
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
      await chamarApi(`/admin/indicacoes/${indicacao.id}/status`, {
        method: 'PATCH',
        corpo: { status },
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
          onChange={(e) => setStatus(e.target.value as ProximoStatus)}
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

export default function IndicacoesAdmin() {
  const router = useRouter();
  const [filtro, setFiltro] = useState<'' | StatusIndicacao>('');
  const [pagina, setPagina] = useState(1);
  const [versao, setVersao] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const chave = `${filtro}|${pagina}|${versao}`;

  useEffect(() => {
    let cancelado = false;
    const params = new URLSearchParams({ pagina: String(pagina), limite: String(LIMITE) });
    if (filtro) params.set('status', filtro);

    chamarApi<Pagina<Indicacao>>(`/admin/indicacoes?${params.toString()}`)
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
          e instanceof ApiError ? e.message : 'Não foi possível carregar as indicações.';
        setResultado({ chave, erro: mensagem });
      });

    return () => {
      cancelado = true;
    };
  }, [chave, filtro, pagina, router]);

  const carregando = resultado === null || resultado.chave !== chave;
  const dados = resultado?.dados;
  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / dados.limite)) : 1;

  function aoSalvar(nome: string) {
    setAberto(null);
    setAviso(`Status da indicação de ${nome} atualizado.`);
    setVersao((v) => v + 1);
  }

  return (
    <section>
      <h1 className={estilos.titulo}>Indicações</h1>

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
              setFiltro(e.target.value as '' | StatusIndicacao);
              setPagina(1);
              setAberto(null);
              setAviso(null);
            }}
            className={estilos.selecao}
          >
            <option value="">Todas</option>
            <option value="NOVA">Nova</option>
            <option value="CONTATADA">Contatada</option>
            <option value="CONVERTIDA">Convertida</option>
          </select>
        </label>
        {dados && !carregando && <span className={estilos.apoio}>{dados.total} indicação(ões)</span>}
      </div>

      {carregando && <p className={estilos.aviso}>Carregando…</p>}

      {!carregando && resultado?.erro && <p className={estilos.avisoErro}>{resultado.erro}</p>}

      {!carregando && dados && dados.itens.length === 0 && (
        <p className={estilos.vazio}>Nenhuma indicação encontrada.</p>
      )}

      {!carregando && dados && dados.itens.length > 0 && (
        <div className={estilos.tabelaCaixa}>
          <table className={estilos.tabela}>
            <thead>
              <tr>
                <th>Indicado</th>
                <th>Contato</th>
                <th>Indicado por</th>
                <th>Status</th>
                <th>Recebida em</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {dados.itens.map((i) => (
                <Fragment key={i.id}>
                  <tr>
                    <td>{i.nome}</td>
                    <td>
                      {formatarTelefone(i.telefone)}
                      <br />
                      <span className={estilos.apoio}>{i.email ?? '—'}</span>
                    </td>
                    <td>{i.indicador?.nome ?? '—'}</td>
                    <td>
                      <span className={`${estilos.selo} ${CLASSE_STATUS[i.status]}`}>
                        {ROTULO_STATUS[i.status]}
                      </span>
                    </td>
                    <td>{dataHora(i.criado_em)}</td>
                    <td>
                      {PROXIMOS[i.status].length > 0 ? (
                        <button
                          type="button"
                          aria-expanded={aberto === i.id}
                          onClick={() => {
                            setAviso(null);
                            setAberto(aberto === i.id ? null : i.id);
                          }}
                          className={estilos.botaoSecundario}
                        >
                          {aberto === i.id ? 'Cancelar' : 'Alterar status'}
                        </button>
                      ) : (
                        <span className={estilos.apoio}>—</span>
                      )}
                    </td>
                  </tr>
                  {aberto === i.id && (
                    <tr>
                      <td colSpan={6}>
                        <FormStatus indicacao={i} aoSalvar={() => aoSalvar(i.nome)} />
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
