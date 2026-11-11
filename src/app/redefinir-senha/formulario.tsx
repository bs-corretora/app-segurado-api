'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import css from '../indicacao/[codigo]/indicacao.module.css';

type Estado =
  | { tipo: 'lendo' }
  | { tipo: 'sem-link'; mensagem: string }
  | { tipo: 'editando'; erro?: string; campos?: Record<string, string> }
  | { tipo: 'enviando' }
  | { tipo: 'pronto' };

const LINK_RUIM = 'Este link expirou ou já foi usado. Peça um novo em "Esqueci minha senha" no app.';

export default function Formulario() {
  const token = useRef<string | null>(null);
  const [estado, setEstado] = useState<Estado>({ tipo: 'lendo' });

  useEffect(() => {
    const fragmento = new URLSearchParams(window.location.hash.slice(1));
    // Tira o token da barra de endereço (histórico, print de tela).
    if (window.location.hash) history.replaceState(null, '', window.location.pathname);
    const recebido = fragmento.get('access_token');
    const valido = !fragmento.get('error') && recebido && fragmento.get('type') === 'recovery';
    token.current = valido ? recebido : null;
    // O fragmento só existe no navegador: ler no primeiro efeito é o jeito de não divergir do
    // HTML do servidor (que mostra o cartão vazio).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEstado(valido ? { tipo: 'editando' } : { tipo: 'sem-link', mensagem: LINK_RUIM });
  }, []);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    const nova = String(dados.get('nova_senha') ?? '');
    if (nova !== String(dados.get('confirmacao') ?? '')) {
      return setEstado({ tipo: 'editando', campos: { confirmacao: 'as senhas não são iguais' } });
    }
    setEstado({ tipo: 'enviando' });
    try {
      const r = await fetch('/api/v1/auth/redefinir-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.current}` },
        body: JSON.stringify({ nova_senha: nova }),
      });
      if (r.ok) return setEstado({ tipo: 'pronto' });
      const corpo = await r.json().catch(() => ({}));
      if (r.status === 401 || r.status === 403) return setEstado({ tipo: 'sem-link', mensagem: LINK_RUIM });
      if (r.status === 400) return setEstado({ tipo: 'editando', campos: corpo.campos ?? {} });
      if (r.status === 429) {
        return setEstado({ tipo: 'editando', erro: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.' });
      }
      setEstado({ tipo: 'editando', erro: 'Não foi possível salvar agora. Tente de novo em instantes.' });
    } catch {
      setEstado({ tipo: 'editando', erro: 'Sem conexão. Confira a internet e tente de novo.' });
    }
  }

  if (estado.tipo === 'lendo') return null;
  if (estado.tipo === 'sem-link') {
    return (
      <p className={css.erroGeral} role="alert">
        {estado.mensagem}
      </p>
    );
  }
  if (estado.tipo === 'pronto') {
    return (
      <p className={css.sucesso} role="status">
        Senha alterada. Entre no app com a senha nova.
      </p>
    );
  }

  const campos = estado.tipo === 'editando' ? (estado.campos ?? {}) : {};
  const enviando = estado.tipo === 'enviando';

  return (
    <form className={css.formulario} onSubmit={enviar} noValidate>
      <Campo nome="nova_senha" rotulo="Nova senha" erro={campos.nova_senha} />
      <Campo nome="confirmacao" rotulo="Repita a nova senha" erro={campos.confirmacao} />
      {estado.tipo === 'editando' && estado.erro && (
        <p className={css.erroGeral} role="alert">
          {estado.erro}
        </p>
      )}
      <button className={css.botao} type="submit" disabled={enviando}>
        {enviando ? 'Enviando…' : 'Salvar nova senha'}
      </button>
    </form>
  );
}

function Campo(props: { nome: string; rotulo: string; erro?: string }) {
  const idErro = `${props.nome}-erro`;
  return (
    <label className={css.campo}>
      <span className={css.rotulo}>{props.rotulo}</span>
      <input
        className={props.erro ? `${css.entrada} ${css.entradaErro}` : css.entrada}
        name={props.nome}
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        aria-invalid={props.erro ? true : undefined}
        aria-describedby={props.erro ? idErro : undefined}
      />
      {props.erro && (
        <span id={idErro} className={css.erroCampo}>
          {props.erro}
        </span>
      )}
    </label>
  );
}
