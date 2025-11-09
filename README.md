# Abono Extra

Aplicação web (React + TypeScript) para gerenciamento de missões de serviço extras e inscrição de voluntários militares.

## Stack

- Frontend: React + Vite + TypeScript, TailwindCSS, React Router, Zustand
- Firebase: Authentication, Realtime Database, Cloud Functions, Cloud Messaging, Hosting
- Testes: Jest + React Testing Library, Playwright (e2e)
- CI/CD: GitHub Actions (testes e deploy)

## Pré-requisitos

- Node.js 18+
- Conta Firebase e projeto criado
- Firebase CLI (`npm i -g firebase-tools`) ou use o `firebase-tools` local via `npx`

## Configuração

1. Copie `.env.example` para `.env` e preencha os valores `VITE_*` do seu projeto Firebase.
2. Atualize `.firebaserc` com o ID do seu projeto.
3. Habilite Authentication (Email/Senha e Google) e Realtime Database no Firebase Console.
4. Faça deploy das regras do Realtime Database (`database.rules.json`) quando pronto.

## Scripts

- `npm run dev` — servidor de desenvolvimento (Vite)
- `npm test` — testes unitários (Jest)
- `npm run test:e2e` — testes end-to-end (Playwright)
- `npm run build` — build de produção
- `npm run preview` — pré-visualização do build
- `npm run deploy` — deploy de Hosting e Functions (requer login/credenciais)

## Cloud Functions

As funções estão em `functions/`:

- `onInscricaoRequest` — processa inscrição com validação de conflitos e transação para decrementar vagas.
- `onCancelamento` — valida janela de cancelamento e restaura vagas.
- `cronCleanup` — tarefa agendada para arquivar missões passadas.

Para desenvolver/deploy das funções:

```bash
cd functions
npm install
npm run build
npx firebase-tools deploy --only functions
```

## Testes

- Jest + RTL cobre componentes e páginas; Playwright cobre fluxos críticos (login, ver missões, navegar).

## Figma

Layout de referência: `https://www.figma.com/design/AssMajbkQ1M58C4Cwf1xDs/AbonoExtra?node-id=1-364&p=f&t=uGhjEiZaSDoA9p9N-0`

Você pode extrair tokens de cores/tipografia e adaptar no `tailwind.config.js`. Este scaffold mantém estrutura e semântica para evoluir o layout com fidelidade.

## Acessibilidade

- Navegação por teclado, papelaria ARIA em componentes principais e contraste padrão do Tailwind.

## CI/CD

O pipeline em `.github/workflows/ci.yml` executa testes e, no push para `main`, realiza deploy.

Defina os segredos:

- `FIREBASE_PROJECT_ID` — ID do projeto Firebase.
- `FIREBASE_TOKEN` — token do Firebase CLI (gerar com `firebase login:ci`).

## Modelagem Realtime Database

Sugestão (ajuste conforme necessidade):

```
/missoes/{missaoId}
/inscricoes/{missaoId}/{turnoId}/{userId}
/usuarios/{userId}
/logs/{logId}
/config/cancelamentoHorasAntes
```

Regras em `database.rules.json` com permissões para `admin` e usuários autenticados.

## Observações

- Notificações push (FCM) e email (SendGrid) estão com placeholders; substitua as chaves/integrações no ambiente e no código conforme sua necessidade.