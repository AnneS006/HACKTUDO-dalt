"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { comprimirImagem } from "@/lib/imagem";
import { GavetaFerramentas } from "@/components/ferramentas";
import {
  CONVITES_DE_PAUSA,
  ESTADOS,
  calcularCiclo,
  formatarTempo,
  type Atividade,
  type Entrega,
  type Estado,
} from "@/lib/tipos";

type Etapa =
  | "carregando"
  | "inexistente"
  | "checkin"
  | "travar"
  | "aula"
  | "feedback"
  | "mural"
  | "fim";

export default function SalaDoAluno() {
  const codigo = String(useParams().codigo ?? "").toUpperCase();

  const [etapa, setEtapa] = useState<Etapa>("carregando");
  const [atividade, setAtividade] = useState<Atividade | null>(null);
  const [iniciadaEm, setIniciadaEm] = useState<Date | null>(null);
  const [focoMin, setFocoMin] = useState(10);
  const [pausaMin, setPausaMin] = useState(3);
  const [agora, setAgora] = useState(() => new Date());

  const [texto, setTexto] = useState("");
  const [imagem, setImagem] = useState("");
  const [feedback, setFeedback] = useState("");
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [dadosBaixos, setDadosBaixos] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    return onSnapshot(doc(db, "sessoes", codigo), (snap) => {
      const dados = snap.data();
      if (!dados || dados.expiraEm?.toDate?.() < new Date()) return setEtapa("inexistente");

      setAtividade(dados.atividade as Atividade);
      setIniciadaEm(dados.iniciadaEm?.toDate?.() ?? null);
      setFocoMin(dados.focoMin ?? 10);
      setPausaMin(dados.pausaMin ?? 3);
      setEtapa((atual) => (atual === "carregando" ? "checkin" : atual));
    });
  }, [codigo]);

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (etapa !== "mural") return;
    return onSnapshot(
      query(collection(db, "sessoes", codigo, "entregas"), orderBy("criadaEm", "asc")),
      (snap) => setEntregas(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Entrega)),
    );
  }, [etapa, codigo]);

  const ciclo = useMemo(
    () => calcularCiclo(iniciadaEm, focoMin, pausaMin, agora),
    [iniciadaEm, focoMin, pausaMin, agora],
  );

  const convite = useMemo(
    () => CONVITES_DE_PAUSA[Math.floor(agora.getTime() / 60000) % CONVITES_DE_PAUSA.length],
    [agora],
  );

  async function registrarCheckin(estado: Estado | null) {
    if (estado) {
      await updateDoc(doc(db, "sessoes", codigo), { [`checkins.${estado}`]: increment(1) });
    }
    setEtapa("travar");
  }

  async function enviar() {
    if (!atividade) return;
    setOcupado(true);

    const usaFoto = atividade.tipoResposta === "foto" && !dadosBaixos && imagem;

    // Sem await de propósito: o Firestore guarda a entrega no aparelho e sincroniza
    // quando a conexão voltar. O aluno com internet ruim não fica preso na tela.
    addDoc(collection(db, "sessoes", codigo, "entregas"), {
      tipo: usaFoto ? "foto" : "texto",
      ...(usaFoto ? { imagem } : {}),
      ...(texto.trim() ? { texto: texto.trim() } : {}),
      criadaEm: serverTimestamp(),
    }).catch((erro) => console.error("entrega pendente de sincronização", erro));

    try {
      const resposta = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atividade, texto, imagem: dadosBaixos ? undefined : imagem }),
      });
      setFeedback((await resposta.json()).feedback ?? "");
    } catch {
      setFeedback("");
    }

    setOcupado(false);
    setEtapa("feedback");
  }

  if (etapa === "carregando") {
    return (
      <Centro>
        <p className="text-suave">Abrindo a aula...</p>
      </Centro>
    );
  }

  if (etapa === "inexistente") {
    return (
      <Centro>
        <h1 className="text-3xl font-bold">Esta aula não está aberta</h1>
        <p className="mt-3 text-suave">
          O código {codigo} não existe ou a aula já foi encerrada pelo professor.
        </p>
      </Centro>
    );
  }

  if (etapa === "checkin") {
    return (
      <Centro>
        <h1 className="text-3xl font-bold">Como você chega para esta aula?</h1>
        <p className="mt-3 text-sm text-suave">
          Ninguém vê a sua resposta. O professor só enxerga o total da turma.
        </p>
        <div className="mt-8 grid w-full gap-3">
          {ESTADOS.map(({ chave, rotulo }) => (
            <button
              key={chave}
              onClick={() => registrarCheckin(chave)}
              className="rounded-2xl border border-borda bg-superficie px-5 py-4 text-lg transition hover:border-foco"
            >
              {rotulo}
            </button>
          ))}
          <button onClick={() => registrarCheckin(null)} className="py-2 text-sm text-suave">
            Prefiro não responder
          </button>
        </div>
      </Centro>
    );
  }

  if (etapa === "travar") {
    return (
      <Centro>
        <h1 className="text-3xl font-bold">Deixa o celular só nesta aula</h1>
        <p className="mt-4 leading-relaxed text-suave">{instrucaoDeTravar()}</p>
        <p className="mt-5 text-sm text-suave/70">
          Tudo que a atividade pede já está aqui dentro. Você sai quando quiser, e ninguém é
          avisado se sair.
        </p>
        <button
          onClick={() => setEtapa("aula")}
          className="mt-10 w-full rounded-2xl bg-foco px-5 py-4 text-lg font-semibold text-fundo"
        >
          Pronto
        </button>
      </Centro>
    );
  }

  if (etapa === "aula" && atividade) {
    if (ciclo.fase === "espera") {
      return (
        <Centro>
          <p className="text-sm uppercase tracking-[0.2em] text-suave">Sala {codigo}</p>
          <h1 className="mt-4 text-3xl font-bold">Esperando o professor começar</h1>
          <p className="mt-3 text-suave">A turma inteira entra junto.</p>
        </Centro>
      );
    }

    if (ciclo.fase === "pausa") {
      return (
        <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
          <p className="text-sm uppercase tracking-[0.2em] text-pausa">Pausa</p>
          <p className="mt-6 font-mono text-7xl font-bold tabular-nums text-pausa">
            {formatarTempo(ciclo.restanteSeg)}
          </p>
          <p className="mt-8 max-w-xs text-2xl leading-snug">{convite}</p>
          <p className="mt-8 text-sm text-suave">Guarda o celular até a aula voltar.</p>
        </main>
      );
    }

    const pedeFoto = atividade.tipoResposta === "foto" && !dadosBaixos;
    const progresso = 1 - ciclo.restanteSeg / Math.max(1, focoMin * 60);

    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pb-8 pt-6">
        <div className="surgir">
          <div className="flex items-baseline justify-between">
            <span className="text-xs uppercase tracking-[0.2em] text-foco">Foco</span>
            <span className="font-mono text-lg tabular-nums text-suave">
              {formatarTempo(ciclo.restanteSeg)}
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-superficie-alta">
            <div
              className="h-full rounded-full bg-foco transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.min(100, progresso * 100)}%` }}
            />
          </div>
        </div>

        <h1 className="mt-8 text-2xl font-bold">{atividade.titulo}</h1>
        <p className="mt-3 text-lg leading-relaxed text-texto/85">{atividade.instrucao}</p>

        <div className="mt-8 flex-1 space-y-4">
          {pedeFoto && (
            <>
              <label className="flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-borda bg-superficie px-4 py-6 text-suave">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={async (e) => {
                    const arquivo = e.target.files?.[0];
                    if (arquivo) setImagem(await comprimirImagem(arquivo));
                  }}
                  className="hidden"
                />
                {imagem ? "Trocar foto" : "Tirar foto"}
              </label>
              {imagem && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagem} alt="Sua resposta" className="w-full rounded-2xl" />
              )}
            </>
          )}

          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={pedeFoto ? 3 : 6}
            placeholder={pedeFoto ? "Explique em uma frase" : "Escreva sua resposta"}
            className="w-full rounded-2xl border border-borda bg-superficie p-4 text-base outline-none transition focus:border-foco"
          />

          <Tutor atividade={atividade} rascunho={texto} />

          <GavetaFerramentas
            disponiveis={atividade.ferramentas ?? []}
            duracaoMin={atividade.duracaoMin}
          />
        </div>

        <label className="mt-6 flex items-center gap-2 text-sm text-suave">
          <input
            type="checkbox"
            checked={dadosBaixos}
            onChange={(e) => setDadosBaixos(e.target.checked)}
            className="accent-foco"
          />
          Estou com pouca internet (responder só por texto)
        </label>

        <button
          onClick={enviar}
          disabled={ocupado || (!texto.trim() && !imagem)}
          className="mt-3 rounded-2xl bg-foco px-5 py-4 text-lg font-semibold text-fundo transition disabled:opacity-30"
        >
          {ocupado ? "Enviando..." : "Enviar"}
        </button>
      </main>
    );
  }

  if (etapa === "feedback") {
    return (
      <Centro>
        <p className="text-sm uppercase tracking-[0.2em] text-foco">Recebido</p>
        {feedback && <p className="mt-6 text-xl leading-relaxed">{feedback}</p>}
        <button
          onClick={() => setEtapa("mural")}
          className="mt-10 w-full rounded-2xl bg-foco px-5 py-4 text-lg font-semibold text-fundo"
        >
          Ver o que a turma construiu
        </button>
      </Centro>
    );
  }

  if (etapa === "mural") {
    return (
      <main className="mx-auto w-full max-w-lg px-5 py-8">
        <h1 className="text-2xl font-bold">A turma construiu isto</h1>
        <p className="mt-1 text-sm text-suave">
          {entregas.length === 1 ? "1 entrega" : `${entregas.length} entregas`}, todas anônimas.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          {entregas.map((e) => (
            <div key={e.id} className="overflow-hidden rounded-2xl border border-borda bg-superficie">
              {e.imagem && !dadosBaixos ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.imagem} alt="Entrega de colega" className="aspect-square w-full object-cover" />
              ) : (
                <p className="p-3 text-sm">{e.texto ?? "[foto]"}</p>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={() => setEtapa("fim")}
          className="mt-8 w-full rounded-2xl bg-foco px-5 py-4 text-lg font-semibold text-fundo"
        >
          Terminei
        </button>
      </main>
    );
  }

  return (
    <Centro>
      <h1 className="text-3xl font-bold">Pode guardar o celular</h1>
      <p className="mt-4 text-lg leading-relaxed text-suave">
        A aula continua fora da tela. Nada do que você fez aqui fica guardado com o seu nome.
      </p>
    </Centro>
  );
}

function Tutor({ atividade, rascunho }: { atividade: Atividade; rascunho: string }) {
  const [aberto, setAberto] = useState(false);
  const [duvida, setDuvida] = useState("");
  const [dica, setDica] = useState("");
  const [pensando, setPensando] = useState(false);

  async function perguntar() {
    setPensando(true);
    setDica("");
    try {
      const resposta = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atividade, duvida, rascunho }),
      });
      const dados = await resposta.json();
      setDica(dados.dica ?? dados.erro ?? "");
    } finally {
      setPensando(false);
    }
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="w-full rounded-2xl border border-borda bg-superficie px-4 py-3 text-sm text-suave transition hover:border-foco"
      >
        Travei nessa atividade
      </button>
    );
  }

  return (
    <div className="surgir rounded-2xl border border-borda bg-superficie p-4">
      <p className="text-sm text-suave">
        Conta onde travou. A dica vem, a resposta não — ela é sua.
      </p>
      <textarea
        value={duvida}
        onChange={(e) => setDuvida(e.target.value)}
        rows={2}
        placeholder="Não entendi o que é para medir"
        className="mt-3 w-full rounded-xl border border-borda bg-fundo p-3 text-sm outline-none focus:border-foco"
      />
      <button
        onClick={perguntar}
        disabled={pensando || !duvida.trim()}
        className="mt-2 w-full rounded-xl bg-superficie-alta py-3 text-sm font-medium disabled:opacity-40"
      >
        {pensando ? "Pensando..." : "Pedir uma dica"}
      </button>
      {dica && <p className="mt-3 leading-relaxed text-foco">{dica}</p>}
    </div>
  );
}

// Travar a tela usa o recurso nativo do próprio sistema, ativado pelo aluno.
// Nada aqui controla o aparelho dele: o passo a passo muda só conforme o sistema.
function instrucaoDeTravar() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;

  if (/android/i.test(ua)) {
    return "Abra os apps recentes, toque no ícone do Modo Aula e escolha Fixar. Se não aparecer, ligue antes em Configurações, Segurança, Fixar tela.";
  }
  if (/iphone|ipad|ipod/i.test(ua)) {
    return "Clique três vezes no botão lateral para ligar o Acesso Guiado. Se não acontecer nada, ative antes em Ajustes, Acessibilidade, Acesso Guiado.";
  }
  return "Feche as outras abas e deixe só esta aula aberta.";
}

function Centro({ children }: { children: React.ReactNode }) {
  return (
    <main className="surgir mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6 py-8 text-center">
      {children}
    </main>
  );
}
