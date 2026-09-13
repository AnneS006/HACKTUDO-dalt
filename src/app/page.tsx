"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ChevronRight, GraduationCap, UserSquare2, Users, type LucideIcon } from "lucide-react";
import { Avatar } from "@/components/avatar";
import type { Escola, Papel, Pessoa, Turma } from "@/lib/tipos";

// O aparelho do aluno guarda a turma. Ele não escolhe de novo a cada aula:
// só sai dali quem tiver o código de outra turma, que a escola fornece.
const MEMORIA = "modo-aula:turma";

// Quem abre o link pela primeira vez não tem código de turma nenhum.
const DEMONSTRACAO = [
  { codigo: "9AML", turma: "9º ano A" },
  { codigo: "9BML", turma: "9º ano B" },
  { codigo: "8ACA", turma: "8º ano A" },
];

type Etapa = "escolha" | "codigo" | "pin" | "pessoas";

export default function Entrada() {
  const router = useRouter();

  const [etapa, setEtapa] = useState<Etapa>("escolha");
  const [papel, setPapel] = useState<Papel>("aluno");
  const [codigo, setCodigo] = useState("");
  const [turma, setTurma] = useState<Turma | null>(null);
  const [escola, setEscola] = useState<Escola | null>(null);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const abrirTurma = useCallback(async (alvo: Turma) => {
    setTurma(alvo);

    const [escolaSnap, pessoasSnap] = await Promise.all([
      getDocs(query(collection(db, "escolas"))),
      getDocs(collection(db, "turmas", alvo.id, "pessoas")),
    ]);

    setEscola(
      escolaSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Escola)
        .find((e) => e.id === alvo.escolaId) ?? null,
    );
    setPessoas(pessoasSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as Pessoa));
    setEtapa(papel === "aluno" ? "pin" : "pessoas");
  }, [papel]);

  const buscarTurma = useCallback(async (procurado: string) => {
    const snap = await getDocs(
      query(collection(db, "turmas"), where("codigo", "==", procurado.toUpperCase()), limit(1)),
    );
    const achada = snap.docs[0];
    return achada ? ({ id: achada.id, ...achada.data() } as Turma) : null;
  }, []);

  // Aluno que já usou este aparelho entra direto na turma dele.
  useEffect(() => {
    const guardado = localStorage.getItem(MEMORIA);
    if (!guardado) return;

    buscarTurma(guardado).then((achada) => {
      if (!achada) return localStorage.removeItem(MEMORIA);
      setPapel("aluno");
      abrirTurma(achada);
    });
  }, [buscarTurma, abrirTurma]);

  async function confirmarCodigo() {
    setOcupado(true);
    setErro("");
    try {
      const achada = await buscarTurma(codigo);
      if (!achada) return setErro("Não achei nenhuma turma com esse código.");
      if (papel === "aluno") localStorage.setItem(MEMORIA, achada.codigo);
      await abrirTurma(achada);
    } finally {
      setOcupado(false);
    }
  }

  function trocarTurma() {
    localStorage.removeItem(MEMORIA);
    setTurma(null);
    setPessoas([]);
    setCodigo("");
    setEtapa("codigo");
  }

  function voltarAoInicio() {
    setTurma(null);
    setPessoas([]);
    setCodigo("");
    setErro("");
    setEtapa("escolha");
  }

  function entrar(pessoa: Pessoa) {
    router.push(`/t/${turma!.id}/${pessoa.papel === "professor" ? "p" : "a"}/${pessoa.id}`);
  }

  function confirmarPin() {
    const aluno = pessoas.find((p) => p.papel === "aluno" && p.pin === pin.trim());
    if (!aluno) return setErro("PIN não confere. Confirme com quem dá a aula.");
    entrar(aluno);
  }

  if (etapa === "escolha") {
    return (
      <Moldura>
        <div className="surgir text-center">
          <span className="inline-flex rounded-3xl border border-foco/20 bg-foco/10 p-5 text-foco">
            <GraduationCap size={36} strokeWidth={1.75} aria-hidden="true" />
          </span>

          <h1 className="mt-7 text-4xl font-extrabold sm:text-5xl">Modo Aula DALT</h1>
          <p className="mt-3 text-lg text-suave">Ambiente interativo e gamificado</p>

          <div className="mt-12 grid gap-4 text-left">
            <Porta
              icone={UserSquare2}
              titulo="Sou professor(a)"
              descricao="Acessar com o código da turma"
              aoClicar={() => {
                setPapel("professor");
                setEtapa("codigo");
              }}
            />
            <Porta
              icone={Users}
              titulo="Sou aluno(a)"
              descricao="Entrar com o código da turma e o seu PIN"
              aoClicar={() => {
                setPapel("aluno");
                setEtapa("codigo");
              }}
            />
          </div>

          <ul className="mt-14 space-y-3 text-left text-sm leading-relaxed text-suave">
            {[
              "Sem cadastro e sem e-mail: seu acesso é um PIN que a escola entrega.",
              "O que você sente no check-in vira número da turma, nunca registro seu.",
              "Funciona em qualquer celular, mesmo com internet fraca.",
            ].map((fato) => (
              <li key={fato} className="flex gap-3">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-foco" />
                {fato}
              </li>
            ))}
          </ul>
        </div>
      </Moldura>
    );
  }

  if (etapa === "codigo") {
    return (
      <Moldura>
        <div className="surgir w-full max-w-sm">
          <button onClick={voltarAoInicio} className="text-sm text-suave hover:text-texto">
            voltar
          </button>

          <h1 className="mt-6 text-3xl font-bold">Código da turma</h1>
          <p className="mt-3 text-suave">
            {papel === "professor"
              ? "A escola entrega este código junto com a turma."
              : "Você digita uma vez só. Depois este aparelho já sabe qual é a sua turma."}
          </p>

          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase().slice(0, 6))}
            onKeyDown={(e) => e.key === "Enter" && codigo.length >= 4 && confirmarCodigo()}
            placeholder="9AML"
            autoFocus
            className="mt-8 w-full rounded-2xl border border-borda bg-superficie px-6 py-5 text-center font-mono text-3xl tracking-[0.35em] outline-none transition focus:border-foco"
          />

          {erro && <p className="mt-4 text-sm text-alerta">{erro}</p>}

          <button
            onClick={confirmarCodigo}
            disabled={ocupado || codigo.trim().length < 4}
            className="mt-5 w-full rounded-2xl bg-foco px-6 py-4 text-lg font-semibold text-fundo transition disabled:opacity-30"
          >
            {ocupado ? "Procurando..." : "Entrar"}
          </button>

          <div className="mt-10 border-t border-borda pt-5">
            <p className="text-xs uppercase tracking-[0.15em] text-suave">Turmas de demonstração</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {DEMONSTRACAO.map((demo) => (
                <button
                  key={demo.codigo}
                  onClick={() => setCodigo(demo.codigo)}
                  className="rounded-xl border border-borda bg-superficie px-4 py-2 text-left transition hover:border-foco"
                >
                  <span className="font-mono text-sm tracking-[0.15em] text-foco">{demo.codigo}</span>
                  <span className="ml-2 text-xs text-suave">{demo.turma}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Moldura>
    );
  }

  if (etapa === "pin") {
    return (
      <Moldura>
        <div className="surgir w-full max-w-sm">
          <button
            onClick={() => {
              setEtapa("codigo");
              setPin("");
              setErro("");
            }}
            className="text-sm text-suave hover:text-texto"
          >
            voltar
          </button>

          <p className="mt-6 text-sm text-suave">{escola?.nome}</p>
          <h1 className="mt-1 text-3xl font-bold">{turma?.nome}</h1>
          <p className="mt-3 text-suave">
            Digite o seu PIN pessoal, o de quatro dígitos que a escola te entregou.
          </p>

          <input
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
              setErro("");
            }}
            onKeyDown={(e) => e.key === "Enter" && pin.length === 4 && confirmarPin()}
            inputMode="numeric"
            placeholder="0000"
            autoFocus
            className="mt-8 w-full rounded-2xl border border-borda bg-superficie px-6 py-5 text-center font-mono text-3xl tracking-[0.5em] outline-none transition focus:border-foco"
          />

          {erro && <p className="mt-4 text-sm text-alerta">{erro}</p>}

          <button
            onClick={confirmarPin}
            disabled={pin.length < 4}
            className="mt-5 w-full rounded-2xl bg-foco px-6 py-4 text-lg font-semibold text-fundo transition disabled:opacity-30"
          >
            Entrar
          </button>

          <p className="mt-8 border-t border-borda pt-5 text-xs leading-relaxed text-suave">
            Turma de demonstração: os PINs são <span className="font-mono text-foco">0101</span>,{" "}
            <span className="font-mono text-foco">0202</span>,{" "}
            <span className="font-mono text-foco">0303</span> e assim por diante.
          </p>
        </div>
      </Moldura>
    );
  }

  const professores = pessoas.filter((p) => p.papel === "professor");
  const alunos = pessoas.filter((p) => p.papel === "aluno");
  const visiveis = papel === "professor" ? professores : alunos;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-14">
      <header className="surgir mb-10">
        <p className="text-sm text-suave">{escola?.nome}</p>
        <h1 className="mt-1 text-3xl font-bold">{turma?.nome}</h1>
        <p className="mt-2 font-mono text-sm tracking-[0.25em] text-foco">{turma?.codigo}</p>
      </header>

      <h2 className="mb-5 text-sm font-semibold uppercase tracking-[0.15em] text-suave">
        {papel === "professor" ? "Quem está dando esta aula?" : "Quem é você?"}
      </h2>

      <ul className="surgir grid grid-cols-2 gap-3 sm:grid-cols-3">
        {visiveis.map((p) => (
          <li key={p.id}>
            <button
              onClick={() => entrar(p)}
              className="flex w-full flex-col items-center gap-3 rounded-2xl border border-borda bg-superficie p-5 text-center transition hover:border-foco"
            >
              <Avatar pessoa={p} tamanho="g" />
              <span className="text-sm leading-tight">{p.nome}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-12 flex flex-wrap gap-4 text-sm text-suave">
        <button onClick={voltarAoInicio} className="hover:text-texto">
          Não é você?
        </button>
        {papel === "aluno" && (
          <button onClick={trocarTurma} className="hover:text-texto">
            Trocar de turma (precisa do código da nova)
          </button>
        )}
      </div>
    </main>
  );
}

function Porta({
  icone: Icone,
  titulo,
  descricao,
  aoClicar,
}: {
  icone: LucideIcon;
  titulo: string;
  descricao: string;
  aoClicar: () => void;
}) {
  return (
    <button
      onClick={aoClicar}
      className="group flex items-center gap-4 rounded-2xl border border-borda bg-superficie p-5 text-left transition hover:border-foco/50 hover:bg-superficie-alta"
    >
      <span className="rounded-xl bg-foco/10 p-3 text-foco">
        <Icone size={24} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-titulo text-lg font-semibold transition group-hover:text-foco">
          {titulo}
        </span>
        <span className="block text-sm text-suave">{descricao}</span>
      </span>
      <ChevronRight
        size={20}
        className="shrink-0 text-suave/60 transition group-hover:text-foco"
        aria-hidden="true"
      />
    </button>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="ambiente mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-6 py-14">
      {children}
    </main>
  );
}
