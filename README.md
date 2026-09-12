# Modo Aula

O celular do aluno vira a ferramenta da aula. Sem app para instalar, sem login, sem rastreamento.

Feito para o desafio HACKTUDO: uso consciente do smartphone na escola, integrando tecnologia,
metodologia educacional e promoção de saúde mental — sem ampliar vigilância, desigualdade
ou sobrecarga da escola.

## Como funciona

**Professor** descreve em uma frase o que quer que a turma faça. O Gemini transforma isso em uma
micro-atividade de 5 a 10 minutos com entrega por texto ou foto. A sala abre com um código de 4
caracteres e um QR.

**Aluno** abre o link no navegador do próprio celular. Faz um check-in anônimo de como está
chegando, trava a tela no Modo Aula, vê só a atividade em tela cheia, entrega, recebe um retorno
imediato do Gemini, vê o mural do que a turma construiu e recebe a orientação de guardar o celular.

**Professor** aperta "Iniciar aula" e todos os celulares da turma entram no mesmo relógio: blocos
de foco e de pausa definidos por ele. Na pausa, cada aparelho manda o aluno sair da tela — levantar,
olhar longe, respirar, conversar com quem está do lado. Ele acompanha ao vivo o termômetro agregado
da turma e as entregas chegando, e pode gerar uma síntese coletiva para puxar a discussão.

Durante o foco, o aluno que travar pode pedir uma dica à IA dentro do próprio app. Ela devolve
pista e pergunta, nunca a resposta pronta — inclusive quando o aluno insiste.

## Por que não bloqueamos apps

A resposta óbvia ao desafio é um app que bloqueia os outros apps do aluno. Descartamos isso por
três motivos concretos, não por preferência:

1. **No iOS é inviável no prazo.** Bloquear apps de terceiros exige a Screen Time API
   (`FamilyControls` + `ManagedSettings`), e publicar exige uma entitlement que a Apple aprova em
   dias ou semanas, caso a caso.
2. **No Android o caminho é hostil.** `AccessibilityService` é reprovado na revisão da Play Store
   para essa finalidade, e o Advanced Protection Mode passou a revogar essa permissão
   automaticamente em 2026.
3. **Um app que decide o que o aluno pode abrir no aparelho dele é exatamente a vigilância que o
   desafio manda não ampliar.**

A saída é inverter o problema: **a atividade declara as ferramentas de que precisa, e elas vivem
dentro do Modo Aula**. Se a conta exige calculadora, a calculadora está ali. O aluno não sai atrás
de outro app porque não falta nada — não há o que bloquear. Para travar o aparelho, usamos o
recurso nativo que já existe em todo celular e que **o próprio aluno ativa**: fixação de tela no
Android, Acesso Guiado no iOS.

Não é bloqueio, é preparar a mesa de trabalho. Um laboratório não tranca o aluno: coloca na
bancada exatamente os instrumentos do experimento de hoje. E sair é sempre livre — ninguém é
notificado se o aluno sair.

### O que ficaria de fora sem um app nativo

Duas coisas não existem em navegador nenhum: **colocar o aparelho no silencioso** e **acionar a
fixação de tela por um botão** em vez do gesto manual. As duas exigem um empacotamento nativo
(Capacitor + um plugin Kotlin chamando `startLockTask()` e `NotificationManager`), o que traz junto
JDK, SDK do Android e um aparelho para instalar. É o próximo passo natural do projeto, não um
impedimento do conceito.

## As três restrições do desafio, resolvidas no código

**Sem vigilância.** Não existe login, identificador de aluno ou telemetria de uso do aparelho.
O check-in de estado emocional é gravado como contador agregado dentro da própria sessão
(`checkins: { cansado: 7 }`), nunca como documento por aluno — atribuir uma resposta a uma pessoa
é impossível pelo formato do dado, não por promessa de privacidade. O botão "Encerrar aula e
apagar tudo" remove as entregas e a sessão.

**Sem desigualdade.** Roda em qualquer navegador de celular, sem instalar nada. A foto é
comprimida no próprio aparelho antes de subir, e o aluno com internet ruim marca "estou com pouca
internet" para responder só por texto.

**Sem sobrecarga.** O professor não configura turma, não cadastra aluno e não aprende ferramenta:
digita uma frase, projeta o QR e acabou.

## Rodando localmente

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

### 1. Chave do Gemini

Pegue em https://aistudio.google.com/apikey e coloque em `GEMINI_API_KEY`.

### 2. Projeto no Firebase

1. Crie um projeto em https://console.firebase.google.com
2. Crie um **Firestore Database** (modo produção).
3. Em *Configurações do projeto → Seus apps*, registre um app **Web** e copie os valores do
   `firebaseConfig` para as variáveis `NEXT_PUBLIC_FIREBASE_*` do `.env.local`.
4. Em *Firestore → Regras*, cole o conteúdo de `firestore.rules` e publique.

As regras deste repositório são de demonstração: qualquer pessoa com o código entra na sala.
Em produção entrariam App Check e autenticação do professor.

## Deploy

O aluno precisa abrir o link pelo celular, então a demo precisa estar publicada:

```bash
npx vercel
```

Configure as mesmas variáveis de ambiente no painel da Vercel.
