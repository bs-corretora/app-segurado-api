-- Confirmação de e-mail no cadastro (#71).
--
-- POST /auth/reenviar-codigo só gera código para conta que existe, tem perfil e ainda não
-- confirmou o e-mail: gerar o código de um e-mail sem conta CRIARIA um usuário no Auth (é o que o
-- generateLink do tipo signup faz). O e-mail mora em auth.users, que a API não lê pelo PostgREST;
-- por isso a pergunta é uma função. Devolve o nome do perfil (para a saudação do e-mail) quando a
-- conta aguarda confirmação, e NULL em qualquer outro caso.
CREATE OR REPLACE FUNCTION public.conta_aguardando_confirmacao(p_email TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p.nome::TEXT
    FROM auth.users u
    JOIN public.perfil p ON p.id = u.id
    WHERE lower(u.email) = lower(p_email)
      AND u.email_confirmed_at IS NULL
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.conta_aguardando_confirmacao(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conta_aguardando_confirmacao(TEXT) TO service_role;
