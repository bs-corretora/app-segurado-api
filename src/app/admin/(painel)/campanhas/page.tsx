'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, chamarApi, type CamposComErro } from '@/lib/admin/api';
import estilos from '../../admin.module.css';

const PRODUTOS: Record<string, string> = {
  AUTO: 'Auto',
  RESIDENCIAL: 'Residencial',
  VIDA: 'Vida',
  EMPRESARIAL: 'Empresarial',
};

export default function CampanhasAdmin() {
  const router = useRouter();
  const [titulo, setTitulo] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [produto, setProduto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [campos, setCampos] = useState<CamposComErro>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    setErro(null);
    setCampos({});
    setAviso(null);

    const publico = produto
      ? `todos os segurados com apólice ativa de ${PRODUTOS[produto]} que aceitaram receber marketing`
      : 'todos os segurados que aceitaram receber marketing';
    if (!window.confirm(`Enviar esta campanha para ${publico}? Não dá para desfazer.`)) return;

    const corpo: { titulo: string; mensagem: string; produto?: string } = { titulo, mensagem };
    if (produto) corpo.produto = produto;

    setEnviando(true);
    try {
      const r = await chamarApi<{ destinatarios: number }>('/admin/campanhas', {
        method: 'POST',
        corpo,
      });
      setAviso(
        r.destinatarios === 1
          ? 'Campanha enviada. 1 segurado foi notificado.'
          : `Campanha enviada. ${r.destinatarios} segurados foram notificados.`,
      );
      setTitulo('');
      setMensagem('');
      setProduto('');
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) {
          router.replace('/admin/login');
          return;
        }
        setCampos(e.campos ?? {});
        setErro(e.message);
      } else {
        setErro('Não foi possível enviar. Verifique a conexão e tente de novo.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section>
      <h1 className={estilos.titulo}>Campanhas</h1>

      <p className={estilos.avisoErro}>
        Atenção: a campanha é enviada como notificação para todos os segurados que aceitaram
        receber marketing. Se escolher um produto, vai só para quem tem apólice ativa dele. O
        envio não pode ser desfeito.
      </p>

      {aviso && (
        <p role="status" className={estilos.sucesso}>
          {aviso}
        </p>
      )}

      <form onSubmit={enviar} className={estilos.formStatus}>
        <label className={estilos.rotulo}>
          Título
          <input
            type="text"
            required
            maxLength={120}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            className={`${estilos.campo} ${campos.titulo ? estilos.campoErro : ''}`}
          />
          {campos.titulo && <p className={estilos.mensagemErro}>{campos.titulo}</p>}
        </label>

        <label className={estilos.rotulo}>
          Mensagem
          <textarea
            required
            maxLength={500}
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            className={`${estilos.campo} ${estilos.areaTexto} ${campos.mensagem ? estilos.campoErro : ''}`}
          />
          {campos.mensagem && <p className={estilos.mensagemErro}>{campos.mensagem}</p>}
        </label>

        <label className={estilos.rotulo}>
          Produto (opcional)
          <select
            value={produto}
            onChange={(e) => setProduto(e.target.value)}
            className={`${estilos.campo} ${campos.produto ? estilos.campoErro : ''}`}
          >
            <option value="">Todos os produtos</option>
            {Object.entries(PRODUTOS).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
          {campos.produto && <p className={estilos.mensagemErro}>{campos.produto}</p>}
        </label>

        {erro && (
          <p role="alert" className={estilos.mensagemErro} style={{ marginBottom: 12 }}>
            {erro}
          </p>
        )}

        <button type="submit" disabled={enviando} className={estilos.botao}>
          {enviando ? 'Enviando…' : 'Enviar campanha'}
        </button>
      </form>
    </section>
  );
}
