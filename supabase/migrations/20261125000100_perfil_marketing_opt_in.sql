-- Consentimento de marketing é opt-in (LGPD): quem não marcou a caixa não aceitou.
-- O cadastro grava o valor explicitamente; o default só protege inserts que esquecerem o campo.
-- Perfis existentes não mudam.
ALTER TABLE public.perfil ALTER COLUMN aceita_marketing SET DEFAULT false;
