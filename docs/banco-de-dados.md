# Banco de dados

Modelo do banco do App do Segurado (PostgreSQL no Supabase). Tudo aqui foi conferido contra as
migrations em `supabase/migrations/` aplicadas num `supabase db reset`: se uma migration nova
mudar tabela ou coluna, este arquivo e o `der.mmd` mudam no mesmo PR.

- Imagem para slides e documentos: [`der.png`](der.png) (alta resolução) ou [`der.svg`](der.svg).
- Fonte do diagrama: [`der.mmd`](der.mmd) (Mermaid). Para regerar as imagens:
  `npx @mermaid-js/mermaid-cli -i docs/der.mmd -o docs/der.png -s 2 -b white`.

## Diagrama entidade-relacionamento

```mermaid
erDiagram
    AUTH_USERS ||--|| PERFIL : "conta de acesso"
    PERFIL |o--o{ APOLICE : "possui (vínculo no cadastro)"
    PERFIL ||--o{ SINISTRO : abre
    APOLICE ||--o{ SINISTRO : "referente a"
    SINISTRO ||--|{ SINISTRO_EVENTO : "histórico de status"
    PERFIL |o--o{ SINISTRO_EVENTO : "autor (admin)"
    PERFIL ||--o{ COTACAO : solicita
    PERFIL ||--o{ INDICACAO : indica
    PERFIL ||--o{ NOTIFICACAO : recebe
    PERFIL ||--o{ DISPOSITIVO : "usa (push)"

    AUTH_USERS {
        uuid id PK
        varchar email UK "gerido pelo Supabase Auth"
        varchar encrypted_password "bcrypt"
    }
    PERFIL {
        uuid id PK,FK "= auth.users.id"
        varchar(11) cpf UK "dígito verificador validado"
        varchar(120) nome
        varchar(20) telefone "opcional"
        date data_nascimento
        date cliente_desde "tempo de casa (RF-07)"
        varchar(20) papel "SEGURADO | ADMIN"
        varchar(12) codigo_indicacao UK
        boolean aceita_marketing
        timestamptz termos_aceitos_em
        timestamptz criado_em
    }
    APOLICE {
        uuid id PK
        varchar(11) cpf_titular
        uuid perfil_id FK "nulo até o vínculo"
        varchar(30) numero UK "AU|RE|VI|EM-AAAA-NNNNNN"
        varchar(30) produto "AUTO | RESIDENCIAL | VIDA | EMPRESARIAL"
        varchar(20) status "ATIVA | VENCIDA | CANCELADA"
        date inicio_vigencia
        date fim_vigencia "maior que o início"
        numeric premio
        varchar(255) pdf_caminho "bucket privado apolices"
    }
    CONTATO_ASSISTENCIA {
        uuid id PK
        varchar(20) tipo "ASSISTENCIA_24H | SINISTRO"
        varchar(30) produto "nulo = todos"
        varchar(80) rotulo
        varchar(20) telefone
        varchar(20) whatsapp
        boolean ativo
    }
    SINISTRO {
        uuid id PK
        uuid perfil_id FK
        uuid apolice_id FK "do mesmo perfil"
        varchar(20) protocolo UK "SIN-AAAA-NNNNNN, gerado no banco"
        varchar(30) tipo "COLISAO | ROUBO | INCENDIO | DANO_ELETRICO | OUTROS"
        timestamptz data_ocorrencia "não futura"
        varchar(200) local
        text descricao
        varchar(20) status "ABERTO | EM_ANALISE | CONCLUIDO"
        timestamptz criado_em
        timestamptz atualizado_em
    }
    SINISTRO_EVENTO {
        uuid id PK
        uuid sinistro_id FK
        varchar(20) status "ABERTO | EM_ANALISE | CONCLUIDO"
        text comentario
        uuid autor_id FK "nulo = sistema"
        timestamptz criado_em
    }
    COTACAO {
        uuid id PK
        uuid perfil_id FK
        varchar(30) produto
        varchar(20) motivo "NOVO | RENOVACAO"
        jsonb dados "campos do formulário"
        varchar(20) status "RECEBIDA | EM_ANALISE | RESPONDIDA"
        text resposta
        numeric valor_estimado
        timestamptz respondida_em
        timestamptz criado_em
    }
    INDICACAO {
        uuid id PK
        uuid indicador_id FK
        varchar(120) nome
        varchar(20) telefone
        varchar(160) email
        varchar(20) status "NOVA | CONTATADA | CONVERTIDA"
        timestamptz criado_em
    }
    NOTIFICACAO {
        uuid id PK
        uuid perfil_id FK
        varchar(20) tipo "MARKETING | ANIVERSARIO | SISTEMA"
        varchar(120) titulo
        text mensagem
        varchar(20) destino_tipo "SINISTRO | COTACAO | APOLICE"
        uuid destino_id "registro de destino"
        timestamptz lida_em
        timestamptz push_enviado_em
        timestamptz criado_em
    }
    DISPOSITIVO {
        uuid id PK
        uuid perfil_id FK
        varchar(255) push_token UK
        varchar(10) plataforma "ANDROID | IOS"
        timestamptz atualizado_em
    }
```

Legenda: `PK` chave primária, `FK` chave estrangeira, `UK` valor único. `||` exatamente um,
`|o` zero ou um, `o{` zero ou muitos, `|{` um ou muitos.

## Relacionamentos

| De | Para | Cardinalidade | Ao apagar o pai |
|---|---|---|---|
| `perfil.id` | `auth.users.id` | 1 : 1 | apaga o perfil (CASCADE) |
| `apolice.perfil_id` | `perfil.id` | perfil 0..1 : N apólices | apólice fica sem dono (SET NULL) |
| `sinistro.perfil_id` | `perfil.id` | 1 : N | CASCADE |
| `sinistro.apolice_id` | `apolice.id` | 1 : N | bloqueia (RESTRICT): apólice com sinistro não some |
| `sinistro_evento.sinistro_id` | `sinistro.id` | 1 : N (ao menos o evento ABERTO) | CASCADE |
| `sinistro_evento.autor_id` | `perfil.id` | 0..1 : N | SET NULL (evento do sistema fica com autor nulo) |
| `cotacao.perfil_id` | `perfil.id` | 1 : N | CASCADE |
| `indicacao.indicador_id` | `perfil.id` | 1 : N | CASCADE |
| `notificacao.perfil_id` | `perfil.id` | 1 : N | CASCADE |
| `dispositivo.perfil_id` | `perfil.id` | 1 : N | CASCADE |

`contato_assistencia` não se liga a ninguém: é cadastro da corretora, filtrado por `produto`.

## Regras que o próprio banco garante

Não dependem da API: valem para qualquer cliente que escreva no banco.

- **Domínios com `CHECK`**: todo `status`, `tipo`, `produto`, `papel`, `motivo` e `plataforma`
  só aceita os valores do diagrama.
- **CPF**: `perfil.cpf` passa pela função `cpf_valido()` (dois dígitos verificadores, rejeita
  11 dígitos iguais).
- **Número da apólice**: formato `PP-AAAA-NNNNNN`, e o prefixo tem que bater com o produto
  (`AU` = AUTO, `RE` = RESIDENCIAL, `VI` = VIDA, `EM` = EMPRESARIAL).
- **Vigência**: `fim_vigencia > inicio_vigencia`.
- **Protocolo de sinistro**: gerado por trigger com sequência, `SIN-AAAA-NNNNNN`.
- **Sinistro só de apólice própria**: trigger recusa sinistro cuja apólice é de outro perfil.
- **Ocorrência não futura**: `data_ocorrencia <= now()`.
- **`atualizado_em`** do sinistro é atualizado por trigger em todo UPDATE.
- **Destino da notificação**: `destino_tipo` e `destino_id` são nulos juntos ou preenchidos juntos.

## Segurança

- **RLS ligado em todas as tabelas, sem nenhuma policy.** Com a chave `anon` ou `authenticated`
  toda consulta volta vazia; só a API, com a `service_role`, lê e escreve. O isolamento entre
  usuários é feito na API, filtrando por `perfil_id` (registro de outro usuário responde 404).
- **Senhas** ficam só em `auth.users`, com bcrypt, sob gestão do Supabase Auth. Nenhuma tabela
  da aplicação guarda senha.
- **PDFs das apólices** ficam no bucket privado `apolices` do Storage; o app recebe uma URL
  assinada que vale 60 segundos (`GET /apolices/{id}/pdf`).

## Dados de teste

`supabase/seed.sql` roda em todo `supabase db reset`: 5 segurados e 1 administrador (senha
`Senha@123`, lista no README), apólices com PDF, contatos, sinistros com histórico, cotações,
indicações e notificações. O João faz aniversário sempre na data do reset, para demonstrar o RF-08.
