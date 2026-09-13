// Popula o Firestore com dados fictícios para demonstração.
// Rodar com: node --env-file=.env.local seed.mjs
import { initializeApp } from "firebase/app";
import { doc, getFirestore, writeBatch } from "firebase/firestore";

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});

const db = getFirestore(app);

const CORES = ["#5fd3a0", "#f0b05d", "#f2766b", "#9d8cf5", "#5db8f0", "#f08fb8"];

const escolas = [
  { id: "emef-monteiro-lobato", nome: "EMEF Monteiro Lobato", cidade: "Gravataí, RS" },
  { id: "ee-castro-alves", nome: "EE Castro Alves", cidade: "Porto Alegre, RS" },
];

const turmas = [
  {
    id: "ml-9a",
    escolaId: "emef-monteiro-lobato",
    nome: "9º ano A",
    codigo: "9AML",
    periodoMin: 50,
    focoMin: 12,
    pausaMin: 3,
    professores: [
      { nome: "Marina Duarte", materia: "Matemática" },
      { nome: "Rafael Nogueira", materia: "História" },
    ],
    alunos: [
      "Ana Beatriz Rocha",
      "Caio Fernandes",
      "Daniela Souza",
      "Eduardo Lima",
      "Gabriela Martins",
      "Heitor Cardoso",
      "Isabela Nunes",
      "João Pedro Alves",
      "Larissa Campos",
      "Murilo Teixeira",
    ],
  },
  {
    id: "ml-9b",
    escolaId: "emef-monteiro-lobato",
    nome: "9º ano B",
    codigo: "9BML",
    periodoMin: 50,
    focoMin: 10,
    pausaMin: 4,
    professores: [{ nome: "Marina Duarte", materia: "Matemática" }],
    alunos: [
      "Bruno Salgado",
      "Carolina Prado",
      "Felipe Andrade",
      "Juliana Moraes",
      "Lucas Barbosa",
      "Mariana Freitas",
      "Otávio Ramos",
      "Sofia Carvalho",
    ],
  },
  {
    id: "ca-8a",
    escolaId: "ee-castro-alves",
    nome: "8º ano A",
    codigo: "8ACA",
    periodoMin: 45,
    focoMin: 10,
    pausaMin: 3,
    professores: [{ nome: "Patrícia Verissimo", materia: "Ciências" }],
    alunos: [
      "Alice Tavares",
      "Diego Moreira",
      "Elisa Fontana",
      "Gustavo Pires",
      "Helena Braga",
      "Vinícius Lopes",
    ],
  },
];

function identificador(nome) {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const lote = writeBatch(db);

for (const escola of escolas) {
  lote.set(doc(db, "escolas", escola.id), { nome: escola.nome, cidade: escola.cidade });
}

let totalPessoas = 0;

for (const turma of turmas) {
  const { id, professores, alunos, ...dados } = turma;
  lote.set(doc(db, "turmas", id), dados);

  lote.set(doc(db, "turmas", id, "sessao", "atual"), {
    atividade: null,
    focoAtivo: false,
    iniciadaEm: null,
    publicadaEm: null,
    focoMin: turma.focoMin,
    pausaMin: turma.pausaMin,
    liberados: [],
    checkins: {},
  });

  const gente = [
    ...professores.map((p) => ({ ...p, papel: "professor" })),
    ...alunos.map((nome) => ({ nome, papel: "aluno" })),
  ];

  // Alguns alunos já chegam com percurso, senão medalhas e enfeites de avatar
  // ficam invisíveis em uma demonstração curta. Varia de propósito: tem quem
  // ainda não entregou nada, e isso também precisa aparecer bem na tela.
  const percursos = [
    { entregas: 7, xp: 350, medalhas: ["proativo", "cuidado"], porMateria: { Matemática: 4, História: 3 } },
    { entregas: 4, xp: 200, medalhas: ["evolucao"], porMateria: { Matemática: 3, História: 1 } },
    { entregas: 2, xp: 100, medalhas: [], porMateria: { Matemática: 2 } },
    { entregas: 6, xp: 300, medalhas: ["perguntas"], porMateria: { História: 4, Matemática: 2 } },
    { entregas: 0, xp: 0, medalhas: [], porMateria: {} },
    { entregas: 3, xp: 150, medalhas: ["cuidado"], porMateria: { Matemática: 2, História: 1 } },
  ];

  let alunoIndice = 0;

  gente.forEach((pessoa, indice) => {
    let extra = {};

    if (pessoa.papel === "aluno") {
      const posicao = alunoIndice++;
      extra = {
        ...percursos[posicao % percursos.length],
        // Distintos e fáceis de ditar em sala: 0101, 0202, 0303...
        pin: String(posicao + 1).padStart(2, "0").repeat(2),
      };
    }

    lote.set(doc(db, "turmas", id, "pessoas", identificador(pessoa.nome)), {
      ...pessoa,
      ...extra,
      cor: CORES[indice % CORES.length],
    });
    totalPessoas += 1;
  });
}

await lote.commit();

console.log(`${escolas.length} escolas, ${turmas.length} turmas e ${totalPessoas} pessoas gravadas.`);
console.log("Códigos de turma:", turmas.map((t) => `${t.nome} = ${t.codigo}`).join(" · "));
process.exit(0);
