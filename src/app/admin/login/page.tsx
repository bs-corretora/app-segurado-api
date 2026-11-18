'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, chamarApi, type CamposComErro } from '@/lib/admin/api';
import estilos from '../admin.module.css';

export default function LoginAdmin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [campos, setCampos] = useState<CamposComErro>({});
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    setErro(null);
    setCampos({});
    setEnviando(true);
    try {
      await chamarApi('/auth/login', { method: 'POST', corpo: { email, senha } });
      const perfil = await chamarApi<{ papel: string }>('/me');
      if (perfil.papel !== 'ADMIN') {
        await chamarApi('/auth/logout', { method: 'POST' });
        setErro('Esta conta não tem acesso ao painel.');
        return;
      }
      router.replace('/admin');
    } catch (e) {
      if (e instanceof ApiError) {
        setCampos(e.campos ?? {});
        setErro(e.message);
      } else {
        setErro('Não foi possível entrar. Verifique a conexão e tente de novo.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className={estilos.pagina}>
      <form onSubmit={entrar} className={estilos.cartao}>
        <h1 className={estilos.titulo}>Painel administrativo</h1>

        <label className={estilos.rotulo}>
          E-mail
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${estilos.campo} ${campos.email ? estilos.campoErro : ''}`}
          />
          {campos.email && <p className={estilos.mensagemErro}>{campos.email}</p>}
        </label>

        <label className={estilos.rotulo}>
          Senha
          <input
            type="password"
            required
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className={`${estilos.campo} ${campos.senha ? estilos.campoErro : ''}`}
          />
          {campos.senha && <p className={estilos.mensagemErro}>{campos.senha}</p>}
        </label>

        {erro && (
          <p role="alert" className={estilos.mensagemErro} style={{ marginBottom: 12 }}>
            {erro}
          </p>
        )}

        <button type="submit" disabled={enviando} className={estilos.botao}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}