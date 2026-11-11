import type { Metadata } from 'next';
import Formulario from './formulario';
import css from '../indicacao/[codigo]/indicacao.module.css';

export const metadata: Metadata = {
  title: 'Nova senha — BS Seguros',
  robots: { index: false },
};

// Página do link "esqueci a senha" (seção 6.3). O Supabase Auth confere o link e manda para cá com
// o token no fragmento (#access_token=…); o formulário lê o fragmento no navegador e chama
// POST /api/v1/auth/redefinir-senha. O fragmento nunca chega ao servidor nem aos logs.
export default function PaginaRedefinirSenha() {
  return (
    <main className={css.pagina}>
      <section className={css.cartao}>
        <p className={css.marca}>BS Seguros</p>
        <h1 className={css.titulo}>Crie uma nova senha</h1>
        <p className={css.apoio}>Use no mínimo 8 caracteres. Depois, entre no app com a senha nova.</p>
        <Formulario />
      </section>
    </main>
  );
}
