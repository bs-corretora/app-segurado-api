'use client';

import { useState, type FormEvent } from 'react';
import css from './indicacao.module.css';

type Estado =
  | { tipo: 'editando'; erro?: string; campos?: Record<string, string> }
  | { tipo: 'enviando' }
  | { tipo: 'enviado'; mensagem: string };

export default function Formulario({ codigo }: { codigo: string }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'editando' });

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = Object.fromEntries(new FormData(e.currentTarget));
    setEstado({ tipo: 'enviando' });
    try {
      const r = await fetch(`/api/v1/public/indicacoes/${encodeURIComponent(codigo)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      });
      const corpo = await r.json().catch(() => ({}));
      if (r.ok) return setEstado({ tipo: 'enviado', mensagem: corpo.mensagem });
      if (r.status === 404) {
        return setEstado({ tipo: 'editando', erro: 'Este link de indicação não é válido. Peça um novo a quem indicou.' });
      }
      if (r.status === 429) {
        return setEstado({ tipo: 'editando', erro: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.' });
      }
      if (r.status === 400) return setEstado({ tipo: 'editando', campos: corpo.campos ?? {} });
      setEstado({ tipo: 'editando', erro: 'Não foi possível enviar agora. Tente de novo em instantes.' });
    } catch {
      setEstado({ tipo: 'editando', erro: 'Sem conexão. Confira a internet e tente de novo.' });
    }
  }

  if (estado.tipo === 'enviado') {
    return (
      <p className={css.sucesso} role="status">
        {estado.mensagem}
      </p>
    );
  }

  const campos = estado.tipo === 'editando' ? (estado.campos ?? {}) : {};
  const enviando = estado.tipo === 'enviando';

  return (
    <form className={css.formulario} onSubmit={enviar} noValidate>
      <Campo nome="nome" rotulo="Nome" erro={campos.nome} autoComplete="name" obrigatorio />
      <Campo
        nome="telefone"
        rotulo="Telefone com DDD"
        erro={campos.telefone}
        autoComplete="tel"
        tipo="tel"
        obrigatorio
      />
      <Campo nome="email" rotulo="E-mail (opcional)" erro={campos.email} autoComplete="email" tipo="email" />
      {estado.tipo === 'editando' && estado.erro && (
        <p className={css.erroGeral} role="alert">
          {estado.erro}
        </p>
      )}
      <button className={css.botao} type="submit" disabled={enviando}>
        {enviando ? 'Enviando…' : 'Quero ser contatado'}
      </button>
    </form>
  );
}

function Campo(props: {
  nome: string;
  rotulo: string;
  erro?: string;
  autoComplete: string;
  tipo?: string;
  obrigatorio?: boolean;
}) {
  const idErro = `${props.nome}-erro`;
  return (
    <label className={css.campo}>
      <span className={css.rotulo}>{props.rotulo}</span>
      <input
        className={props.erro ? `${css.entrada} ${css.entradaErro}` : css.entrada}
        name={props.nome}
        type={props.tipo ?? 'text'}
        autoComplete={props.autoComplete}
        required={props.obrigatorio}
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
