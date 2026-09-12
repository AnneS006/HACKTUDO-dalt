"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Avatar } from "@/components/avatar";
import type { Escola, Papel, Pessoa, Turma } from "@/lib/tipos";

// O aparelho do aluno guarda a turma. Ele não escolhe de novo a cada aula:
// só sai dali quem tiver o código de outra turma, que a escola fornece.
const MEMORIA = "modo-aula:turma";

type Etapa = "escolha" | "codigo" | "pessoas";

export default function Entrada() {
  const router = useRouter();

  const [etapa, setEtapa] = useState<Etapa>("escolha");
  const [papel, setPapel] = useState<Papel>("aluno");
  const [codigo, setCodigo] = useState("");
  const [turma, setTurma] = useState<Turma | null>(null);
  const [escola, setEscola] = useState<Escola | null>(null);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
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
    setEtapa("pessoas");
  }, []);

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

  if (etapa === "escolha") {
    return (
      <Moldura>
        <div className="surgir">
          <h1 className="text-5xl font-bold tracking-tight">Modo Aula</h1>
          <p className="mt-4 max-w-md text-lg leading-relaxed text-suave">
            O celular deixa de disputar a aula e passa a ser a ferramenta dela. Sem instalar nada,
            sem rastrear ninguém.
          </p>

          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            <Porta
              titulo="Sou professor"
              descricao="Digite o código da sua turma para abrir a aula."
              aoClicar={() => {
                setPapel("professor");
                setEtapa("codigo");
              }}
            />
            <Porta
              titulo="Sou aluno"
              descricao="Entre uma vez e este aparelho lembra da sua turma."
              aoClicar={() => {
                setPapel("aluno");
                setEtapa("codigo");
              }}
            />
          </div>

          <ul className="mt-14 space-y-2 text-sm text-suave">
            <li>Sem senha e sem conta: seu perfil é só o seu nome e a sua foto.</li>
            <li>O que você sente no check-in vira número da turma, nunca registro seu.</li>
            <li>Funciona em qualquer celular, mesmo com internet fraca.</li>
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
  titulo,
  descricao,
  aoClicar,
}: {
  titulo: string;
  descricao: string;
  aoClicar: () => void;
}) {
  return (
    <button
      onClick={aoClicar}
      className="group rounded-3xl border border-borda bg-superficie p-7 text-left transition hover:border-foco"
    >
      <p className="text-xl font-semibold">{titulo}</p>
      <p className="mt-2 text-sm leading-relaxed text-suave">{descricao}</p>
      <span className="mt-5 inline-block text-sm text-foco opacity-0 transition group-hover:opacity-100">
        entrar →
      </span>
    </button>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center px-6 py-14">
      {children}
    </main>
  );
}
