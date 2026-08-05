# MAPA — Conteúdo em movimento

Aplicativo para organizar ideias, calendário editorial, roteiros, produção e
desempenho de conteúdo.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
npm run build:vercel
```

## Supabase

O ambiente publicado na Vercel usa Supabase Auth com e-mail/senha e a tabela
`content_items`. Cada registro pertence a um `user_id`, com Row Level Security
(RLS) para impedir que um usuário acesse os conteúdos de outro.

1. Copie `.env.example` para `.env.local`.
2. Preencha `NEXT_PUBLIC_SUPABASE_URL` e
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` com a chave publicável do projeto.
3. Aplique a migração em `supabase/migrations/`.

Nunca use uma chave `service_role` ou `sb_secret_...` no navegador ou em uma
variável com prefixo `NEXT_PUBLIC_`.

Sem essas variáveis, o aplicativo mantém um fallback local. Com as variáveis,
a tela de login é obrigatória e os dados são sincronizados no Supabase.

## Instagram profissional

O botão “Entrar com Instagram” usa a Instagram API with Instagram Login. A
integração aceita contas profissionais do tipo Empresa ou Criador; contas
pessoais não disponibilizam insights pela API.

O fluxo usa apenas as permissões instagram_business_basic e
instagram_business_manage_insights.

Configuração:

1. Crie um aplicativo Business em Meta for Developers e adicione o produto
   Instagram com Instagram Login.
2. Cadastre como OAuth Redirect URI:
   https://pfiikrpsrcvfofikbloy.supabase.co/functions/v1/instagram-integration/callback
   Cadastre também os endpoints oficiais de privacidade e remoção:
   - desautorização: https://pfiikrpsrcvfofikbloy.supabase.co/functions/v1/instagram-integration/deauthorize
   - exclusão: https://pfiikrpsrcvfofikbloy.supabase.co/functions/v1/instagram-integration/data-deletion
   - política: https://pfiikrpsrcvfofikbloy.supabase.co/functions/v1/instagram-integration/privacy
   - termos: https://pfiikrpsrcvfofikbloy.supabase.co/functions/v1/instagram-integration/terms
3. No Supabase, configure os segredos listados em .env.example. Esses valores
   pertencem à Edge Function e nunca devem usar o prefixo NEXT_PUBLIC_.
4. Aplique as migrações de Instagram e publique a
   função instagram-integration com verificação JWT da plataforma desativada. A
   função valida o usuário explicitamente porque o callback OAuth é público.
5. Durante o desenvolvimento, adicione a conta profissional como tester do
   aplicativo Meta. Para atender contas externas, solicite Advanced Access/App
   Review.

O estado OAuth expira em 10 minutos. O token fica criptografado no banco e as
tabelas de integração não concedem acesso a anon nem authenticated. Insights de
conta têm disponibilidade histórica limitada pela própria Meta; por isso o
painel real oferece períodos de 30 e 90 dias.

## Google Drive por usuário

Na fase “Edição”, o botão “Subir vídeo” conecta o Google Drive da própria
pessoa autenticada. O login e o consentimento acontecem no Google; a senha
nunca passa pelo MAPA. A integração solicita `drive.file`, cria a pasta “MAPA
Conteúdos” e só gerencia arquivos criados por este aplicativo.

Configuração:

1. Crie um projeto Google Cloud exclusivo para o MAPA e ative a Google Drive
   API.
2. Crie um cliente OAuth 2.0 do tipo Aplicativo da Web e cadastre exatamente:
   `https://pfiikrpsrcvfofikbloy.supabase.co/functions/v1/google-drive-integration/callback`
3. Configure no Supabase os segredos `GOOGLE_DRIVE_CLIENT_ID`,
   `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY` e
   `MAPA_CANONICAL_APP_URL` listados em `.env.example`.
4. Aplique a migração `google_drive_integration` e publique a função
   `google-drive-integration` com a verificação JWT da plataforma desativada. A
   função valida explicitamente a sessão nas rotas privadas porque o callback
   OAuth precisa ser público.

Tokens são criptografados com AES-GCM no servidor. O navegador recebe apenas
uma sessão temporária de upload resumível e envia o vídeo diretamente para o
Google Drive do usuário, com indicação de progresso.

## Vercel

O arquivo `vercel.json` seleciona o framework Next.js e executa
`npm run build:vercel`. Configure as duas variáveis públicas do Supabase nos
ambientes Production e Preview antes da implantação. Os segredos da Meta ficam
no Supabase Edge Functions, não na Vercel.

O domínio de produção é `https://mapa.nutroschool.com.br`. A hospedagem não
adiciona autenticação própria: todos os visitantes chegam diretamente à tela
do MAPA e o acesso aos dados é controlado pelo Supabase Auth e pelas políticas
RLS do banco.

## Estrutura principal

- interface em `app/`
- cliente do Supabase em `lib/supabase.ts`
- banco e RLS em `supabase/migrations/`
- integração do Instagram em `supabase/functions/instagram-integration/`
- integração do Google Drive em `supabase/functions/google-drive-integration/`
- configuração de implantação em `vercel.json`

## Useful Commands

- `npm run dev`: inicia o Next.js localmente
- `npm run build`: gera a compilação de produção do Next.js
- `npm test`: compila e valida autenticação, persistência e integração

## Learn More

- [Next.js](https://nextjs.org/docs)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Vercel](https://vercel.com/docs)
