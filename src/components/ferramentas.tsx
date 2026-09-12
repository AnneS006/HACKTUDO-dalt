"use client";

import { useEffect, useRef, useState } from "react";
import { FERRAMENTAS, type Ferramenta } from "@/lib/tipos";

export function GavetaFerramentas({
  disponiveis,
  duracaoMin,
}: {
  disponiveis: Ferramenta[];
  duracaoMin: number;
}) {
  const [aberta, setAberta] = useState<Ferramenta | null>(null);

  if (disponiveis.length === 0) return null;

  return (
    <>
      <div className="flex gap-2">
        {FERRAMENTAS.filter((f) => disponiveis.includes(f.chave)).map((f) => (
          <button
            key={f.chave}
            onClick={() => setAberta(aberta === f.chave ? null : f.chave)}
            className={`flex-1 rounded-xl border px-3 py-3 text-sm transition ${
              aberta === f.chave
                ? "border-transparent bg-foco font-medium text-fundo"
                : "border-borda bg-superficie text-suave"
            }`}
          >
            {f.rotulo}
          </button>
        ))}
      </div>

      {aberta && (
        <div className="surgir mt-3 rounded-2xl border border-borda bg-superficie p-4">
          {aberta === "calculadora" && <Calculadora />}
          {aberta === "notas" && <Notas />}
          {aberta === "cronometro" && <Cronometro minutos={duracaoMin} />}
        </div>
      )}
    </>
  );
}

const TECLAS = [
  ["7", "8", "9", "÷"],
  ["4", "5", "6", "×"],
  ["1", "2", "3", "−"],
  ["0", ",", "=", "+"],
];

function Calculadora() {
  const [visor, setVisor] = useState("0");
  const [acumulado, setAcumulado] = useState<number | null>(null);
  const [operacao, setOperacao] = useState<string | null>(null);
  const [recomecar, setRecomecar] = useState(true);

  function resolver(ate: number) {
    if (acumulado === null || !operacao) return ate;
    if (operacao === "+") return acumulado + ate;
    if (operacao === "−") return acumulado - ate;
    if (operacao === "×") return acumulado * ate;
    return ate === 0 ? NaN : acumulado / ate;
  }

  function apertar(tecla: string) {
    if (/[0-9]/.test(tecla)) {
      setVisor(recomecar || visor === "0" ? tecla : visor + tecla);
      setRecomecar(false);
      return;
    }

    if (tecla === ",") {
      if (recomecar) {
        setVisor("0,");
        setRecomecar(false);
      } else if (!visor.includes(",")) {
        setVisor(visor + ",");
      }
      return;
    }

    const atual = Number(visor.replace(",", "."));

    if (tecla === "=") {
      const resultado = resolver(atual);
      setVisor(Number.isFinite(resultado) ? String(resultado).replace(".", ",") : "erro");
      setAcumulado(null);
      setOperacao(null);
      setRecomecar(true);
      return;
    }

    const resultado = operacao && !recomecar ? resolver(atual) : atual;
    setAcumulado(resultado);
    setVisor(Number.isFinite(resultado) ? String(resultado).replace(".", ",") : "erro");
    setOperacao(tecla);
    setRecomecar(true);
  }

  function limpar() {
    setVisor("0");
    setAcumulado(null);
    setOperacao(null);
    setRecomecar(true);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="flex-1 truncate text-right font-mono text-3xl tabular-nums">{visor}</p>
        <button onClick={limpar} className="rounded-lg border border-borda px-3 py-2 text-sm text-suave">
          C
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {TECLAS.flat().map((tecla) => (
          <button
            key={tecla}
            onClick={() => apertar(tecla)}
            className="rounded-xl border border-borda bg-fundo py-3 text-lg transition active:bg-superficie-alta"
          >
            {tecla}
          </button>
        ))}
      </div>
    </div>
  );
}

function Notas() {
  const [texto, setTexto] = useState("");
  return (
    <div>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={5}
        placeholder="Rascunhe aqui antes de responder"
        className="w-full rounded-xl border border-borda bg-fundo p-3 outline-none focus:border-foco"
      />
      <p className="mt-2 text-xs text-suave">
        O rascunho fica só neste aparelho. Não é enviado a ninguém.
      </p>
    </div>
  );
}

function Cronometro({ minutos }: { minutos: number }) {
  const [restante, setRestante] = useState(minutos * 60);
  const [rodando, setRodando] = useState(false);
  const intervalo = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!rodando) return;
    intervalo.current = setInterval(
      () => setRestante((r) => (r <= 1 ? (setRodando(false), 0) : r - 1)),
      1000,
    );
    return () => {
      if (intervalo.current) clearInterval(intervalo.current);
    };
  }, [rodando]);

  const mm = String(Math.floor(restante / 60)).padStart(2, "0");
  const ss = String(restante % 60).padStart(2, "0");

  return (
    <div className="text-center">
      <p className="font-mono text-5xl font-bold tabular-nums text-foco">
        {mm}:{ss}
      </p>
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setRodando(!rodando)}
          className="flex-1 rounded-xl bg-foco py-3 font-semibold text-fundo"
        >
          {rodando ? "Pausar" : "Começar"}
        </button>
        <button
          onClick={() => {
            setRodando(false);
            setRestante(minutos * 60);
          }}
          className="rounded-xl border border-borda px-5 py-3 text-suave"
        >
          Zerar
        </button>
      </div>
    </div>
  );
}
