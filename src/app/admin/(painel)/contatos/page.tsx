'use client';

import { Fragment, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, chamarApi, type CamposComErro } from '@/lib/admin/api';
import estilos from '../../admin.module.css';

type TipoContato = 'ASSISTENCIA_24H' | 'SINISTRO';
type ProdutoContato = 'AUTO' | 'RESIDENCIAL' | 'VIDA' | 'EMPRESARIAL';

type Contato = {
  id: string;
  tipo: TipoContato;
  produto: ProdutoContato | null;
  rotulo: string;
  telefone: string | null;
  whatsapp: string | null;
  ativo: boolean;
};

type Resultado = { chave: string; dados?: Contato[]; erro?: string };

type Valores = {
  tipo: TipoContato;
  produto: ProdutoContato | '';
  rotulo: string;
  telefone: string;
  whatsapp: string;
};

const TIPOS: Record<TipoContato, string> = {
  ASSISTENCIA_24H: 'Assistência 24h',
  SINISTRO: 'Sinistro',
};

const PRODUTOS: Record<ProdutoContato, string> = {
  AUTO: 'Auto',
  RESIDENCIAL: 'Residencial',
  VIDA: 'Vida',
  EMPRESARIAL: 'Empresarial',
};

const MENSAGEM_REDE = 'Não foi possível salvar. Verifique a conexão e tente de novo.';

function vazioParaNulo(valor: string): string | null {
  const limpo = valor.trim();
  return limpo === '' ? null : limpo;
}

function FormContato({
  inicial,
  contato,
  aoSalvar,
  aoCancelar,
}: {
  inicial: Valores;
  contato: Contato | null; // null = criar
  aoSalvar: () => void;
  aoCancelar: () => void;
}) {
  const [valores, setValores] = useState<Valores>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [campos, setCampos] = useState<CamposComErro>({});
  const [enviando, setEnviando] = useState(false);

  function mudar<K extends keyof Valores>(campo: K, valor: Valores[K]) {
    setValores((v) => ({ ...v, [campo]: valor }));
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    setErro(null);
    setCampos({});

    const novo = {
      tipo: valores.tipo,
      produto: valores.produto === '' ? null : valores.produto,
      rotulo: valores.rotulo.trim(),
      telefone: vazioParaNulo(valores.telefone),
      whatsapp: vazioParaNulo(valores.whatsapp),
    };

    setEnviando(true);
    try {
      if (contato === null) {
        await chamarApi('/admin/contatos', { method: 'POST', corpo: { ...novo, ativo: true } });
      } else {
        // PATCH parcial: só o que mudou.
        const mudancas: Partial<typeof novo> = {};
        if (novo.tipo !== contato.tipo) mudancas.tipo = novo.tipo;
        if (novo.produto !== contato.produto) mudancas.produto = novo.produto;
        if (novo.rotulo !== contato.rotulo) mudancas.rotulo = novo.rotulo;
        if (novo.telefone !== contato.telefone) mudancas.telefone = novo.telefone;
        if (novo.whatsapp !== contato.whatsapp) mudancas.whatsapp = novo.whatsapp;
        if (Object.keys(mudancas).length === 0) {
          setErro('Nenhuma alteração para salvar.');
          return;
        }
        await chamarApi(`/admin/contatos/${contato.id}`, { method: 'PATCH', corpo: mudancas });
      }
      aoSalvar();
    } catch (e) {
      if (e instanceof ApiError) {
        setCampos(e.campos ?? {});
        setErro(e.message);
      } else {
        setErro(MENSAGEM_REDE);
      }
    } finally {
      setEnviando(false);
    }
  }

  const classe = (campo: string) => `${estilos.campo} ${campos[campo] ? estilos.campoErro : ''}`;

  return (
    <form onSubmit={enviar} className={estilos.formStatus}>
      <label className={estilos.rotulo}>
        Tipo
        <select
          value={valores.tipo}
          onChange={(e) => mudar('tipo', e.target.value as TipoContato)}
          className={classe('tipo')}
        >
          <option value="ASSISTENCIA_24H">{TIPOS.ASSISTENCIA_24H}</option>
          <option value="SINISTRO">{TIPOS.SINISTRO}</option>
        </select>
        {campos.tipo && <p className={estilos.mensagemErro}>{campos.tipo}</p>}
      </label>

      <label className={estilos.rotulo}>
        Produto
        <select
          value={valores.produto}
          onChange={(e) => mudar('produto', e.target.value as ProdutoContato | '')}
          className={classe('produto')}
        >
          <option value="">Todos os produtos</option>
          {(Object.keys(PRODUTOS) as ProdutoContato[]).map((p) => (
            <option key={p} value={p}>
              {PRODUTOS[p]}
            </option>
          ))}
        </select>
        {campos.produto && <p className={estilos.mensagemErro}>{campos.produto}</p>}
      </label>

      <label className={estilos.rotulo}>
        Rótulo
        <input
          type="text"
          required
          maxLength={80}
          value={valores.rotulo}
          onChange={(e) => mudar('rotulo', e.target.value)}
          className={classe('rotulo')}
        />
        {campos.rotulo && <p className={estilos.mensagemErro}>{campos.rotulo}</p>}
      </label>

      <label className={estilos.rotulo}>
        Telefone (só dígitos, de 8 a 20)
        <input
          type="text"
          inputMode="numeric"
          maxLength={20}
          value={valores.telefone}
          onChange={(e) => mudar('telefone', e.target.value)}
          className={classe('telefone')}
        />
        {campos.telefone && <p className={estilos.mensagemErro}>{campos.telefone}</p>}
      </label>

      <label className={estilos.rotulo}>
        WhatsApp (só dígitos, de 8 a 20)
        <input
          type="text"
          inputMode="numeric"
          maxLength={20}
          value={valores.whatsapp}
          onChange={(e) => mudar('whatsapp', e.target.value)}
          className={classe('whatsapp')}
        />
        {campos.whatsapp && <p className={estilos.mensagemErro}>{campos.whatsapp}</p>}
      </label>

      {erro && (
        <p role="alert" className={estilos.mensagemErro} style={{ marginBottom: 12 }}>
          {erro}
        </p>
      )}

      <div className={estilos.barra}>
        <button type="submit" disabled={enviando} className={estilos.botao} style={{ width: 'auto' }}>
          {enviando ? 'Salvando…' : contato === null ? 'Criar contato' : 'Salvar'}
        </button>
        <button type="button" onClick={aoCancelar} className={estilos.botaoSecundario}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

const NOVO: Valores = { tipo: 'ASSISTENCIA_24H', produto: '', rotulo: '', telefone: '', whatsapp: '' };

function valoresDe(c: Contato): Valores {
  return {
    tipo: c.tipo,
    produto: c.produto ?? '',
    rotulo: c.rotulo,
    telefone: c.telefone ?? '',
    whatsapp: c.whatsapp ?? '',
  };
}

export default function ContatosAdmin() {
  const router = useRouter();
  const [filtro, setFiltro] = useState<'' | TipoContato>('');
  const [versao, setVersao] = useState(0);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [alterando, setAlterando] = useState<string | null>(null);

  const chave = `${filtro}|${versao}`;

  useEffect(() => {
    let cancelado = false;
    const params = new URLSearchParams();
    if (filtro) params.set('tipo', filtro);
    const consulta = params.toString();

    chamarApi<{ itens: Contato[] }>(`/admin/contatos${consulta ? `?${consulta}` : ''}`)
      .then((dados) => {
        if (!cancelado) setResultado({ chave, dados: dados.itens });
      })
      .catch((e) => {
        if (cancelado) return;
        if (e instanceof ApiError && e.status === 401) {
          router.replace('/admin/login');
          return;
        }
        const mensagem =
          e instanceof ApiError ? e.message : 'Não foi possível carregar os contatos.';
        setResultado({ chave, erro: mensagem });
      });

    return () => {
      cancelado = true;
    };
  }, [chave, filtro, router]);

  const carregando = resultado === null || resultado.chave !== chave;
  const itens = resultado?.dados;

  function salvou(mensagem: string) {
    setCriando(false);
    setEditando(null);
    setAviso(mensagem);
    setVersao((v) => v + 1);
  }

  async function alternarAtivo(c: Contato) {
    if (alterando) return;
    setAviso(null);
    setErroAcao(null);
    setAlterando(c.id);
    try {
      await chamarApi(`/admin/contatos/${c.id}`, { method: 'PATCH', corpo: { ativo: !c.ativo } });
      salvou(`Contato "${c.rotulo}" ${c.ativo ? 'desativado' : 'ativado'}.`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        router.replace('/admin/login');
        return;
      }
      setErroAcao(e instanceof ApiError ? e.message : MENSAGEM_REDE);
    } finally {
      setAlterando(null);
    }
  }

  return (
    <section>
      <h1 className={estilos.titulo}>Contatos</h1>

      {aviso && (
        <p role="status" className={estilos.sucesso}>
          {aviso}
        </p>
      )}
      {erroAcao && (
        <p role="alert" className={estilos.mensagemErro} style={{ marginBottom: 12 }}>
          {erroAcao}
        </p>
      )}

      <div className={estilos.barra}>
        <label>
          Tipo{' '}
          <select
            value={filtro}
            onChange={(e) => {
              setFiltro(e.target.value as '' | TipoContato);
              setEditando(null);
              setAviso(null);
              setErroAcao(null);
            }}
            className={estilos.selecao}
          >
            <option value="">Todos</option>
            <option value="ASSISTENCIA_24H">{TIPOS.ASSISTENCIA_24H}</option>
            <option value="SINISTRO">{TIPOS.SINISTRO}</option>
          </select>
        </label>
        <button
          type="button"
          aria-expanded={criando}
          onClick={() => {
            setAviso(null);
            setErroAcao(null);
            setEditando(null);
            setCriando(!criando);
          }}
          className={estilos.botaoSecundario}
        >
          {criando ? 'Cancelar' : 'Novo contato'}
        </button>
        {itens && !carregando && <span className={estilos.apoio}>{itens.length} contato(s)</span>}
      </div>

      {criando && (
        <div style={{ marginBottom: 16 }}>
          <FormContato
            inicial={{ ...NOVO, tipo: filtro || NOVO.tipo }}
            contato={null}
            aoSalvar={() => salvou('Contato criado.')}
            aoCancelar={() => setCriando(false)}
          />
        </div>
      )}

      {carregando && <p className={estilos.aviso}>Carregando…</p>}

      {!carregando && resultado?.erro && <p className={estilos.avisoErro}>{resultado.erro}</p>}

      {!carregando && itens && itens.length === 0 && (
        <p className={estilos.vazio}>Nenhum contato encontrado.</p>
      )}

      {!carregando && itens && itens.length > 0 && (
        <div className={estilos.tabelaCaixa}>
          <table className={estilos.tabela}>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Rótulo</th>
                <th>Produto</th>
                <th>Telefone</th>
                <th>WhatsApp</th>
                <th>Situação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((c) => (
                <Fragment key={c.id}>
                  <tr>
                    <td>{TIPOS[c.tipo] ?? c.tipo}</td>
                    <td>{c.rotulo}</td>
                    <td>{c.produto ? (PRODUTOS[c.produto] ?? c.produto) : 'Todos'}</td>
                    <td>{c.telefone ?? '—'}</td>
                    <td>{c.whatsapp ?? '—'}</td>
                    <td>
                      <span
                        className={`${estilos.selo} ${c.ativo ? estilos.seloConcluido : estilos.seloAberto}`}
                      >
                        {c.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td>
                      <div className={estilos.barra} style={{ marginBottom: 0 }}>
                        <button
                          type="button"
                          aria-expanded={editando === c.id}
                          onClick={() => {
                            setAviso(null);
                            setErroAcao(null);
                            setCriando(false);
                            setEditando(editando === c.id ? null : c.id);
                          }}
                          className={estilos.botaoSecundario}
                        >
                          {editando === c.id ? 'Cancelar' : 'Editar'}
                        </button>
                        <button
                          type="button"
                          disabled={alterando !== null}
                          onClick={() => alternarAtivo(c)}
                          className={estilos.botaoSecundario}
                        >
                          {alterando === c.id ? 'Salvando…' : c.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editando === c.id && (
                    <tr>
                      <td colSpan={7}>
                        <FormContato
                          inicial={valoresDe(c)}
                          contato={c}
                          aoSalvar={() => salvou(`Contato "${c.rotulo}" atualizado.`)}
                          aoCancelar={() => setEditando(null)}
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
    </section>
  );
}
