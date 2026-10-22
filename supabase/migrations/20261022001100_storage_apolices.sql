-- Criação de bucket privado para armazenar apólices em PDF.
-- Sem policy em storage.objects: o acesso é só pela API, com service_role e URL assinada.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('apolices', 'apolices', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;
