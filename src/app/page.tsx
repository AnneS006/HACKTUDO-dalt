"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  DURACAO_SESSAO_MIN,
  ESTADOS,
  FERRAMENTAS,
  calcularCiclo,
  formatarTempo,
  gerarCodigo,
  type Atividade,
  type Checkins,
  type Entrega,
} from "@/lib/tipos";

export default function PainelProfessor() {
  const [pedido, setPedido] = useState("");
  const [atividade, setAtividade] = useState<Atividade | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);

  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [checkins, setCheckins] = useState<Checkins>({});
  const [iniciadaEm, setIniciadaEm] = useState<Date | null>(null);
  const [focoMin, setFocoMin] = useState(10);
  const [pausaMin, setPausaMin] = useState(3);
  const [agora, setAgora] = useState(() => new Date());

  const [sintese, setSintese] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [origem, setOrigem] = useState("");

  useEffect(() => setOrigem(window.location.origin), []);

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!codigo) return;

    const naSessao = onSnapshot(doc(db, "sessoes", codigo), (snap) => {
      const dados = snap.data();
      setCheckins((dados?.checkins as Checkins) ?? {});
      setIniciadaEm(dados?.iniciadaEm?.toDate?.() ?? null);
    });

    const nasEntregas = onSnapshot(
      query(collection(db, "sessoes", codigo, "entregas"), orderBy("criadaEm", "asc")),
      (snap) => setEntregas(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Entrega)),
    );

    return () => {
      naSessao();
      nasEntregas();
    };
  }, [codigo]);

  const ciclo = useMemo(
    () => calcularCiclo(iniciadaEm, focoMin, pausaMin, agora),
    [iniciadaEm, focoMin, pausaMin, agora],
  );

  async function gerarAtividade() {
    setOcupado(true);
    setErro("");
    try {
      const resposta = await fetch("/api/atividade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedido }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro);
      setAtividade(dados as Atividade);
      setFocoMin(dados.duracaoMin ?? 10);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falhou. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  async function abrirSala() {
    if (!atividade) return;
    setOcupado(true);
    setErro("");

    const novo = gerarCodigo();
    try {
      // O Firestore enfileira a escrita em silêncio quando não alcança o servidor.
      // Numa sala de aula isso vira o professor olhando para um botão morto.
      await Promise.race([
        setDoc(doc(db, "sessoes", novo), {
          atividade,
          checkins: {},
          focoMin,
          pausaMin,
          iniciadaEm: null,
          criadaEm: serverTimestamp(),
          expiraEm: new Date(Date.now() + DURACAO_SESSAO_MIN * 60_000),
        }),
        new Promise((_, rejeitar) =>
          setTimeout(() => rejeitar(new Error("sem resposta do Firestore")), 8000),
        ),
      ]);
      setCodigo(novo);
    } catch {
      setErro("Não consegui abrir a sala. Verifique a conexão e tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  async function iniciarAula() {
    if (!codigo) return;
    await updateDoc(doc(db, "sessoes", codigo), {
      focoMin,
      pausaMin,
      iniciadaEm: serverTimestamp(),
    });
  }

  async function gerarSintese() {
    if (!atividade) return;
    setOcupado(true);
    try {
      const respostas = entregas
        .map((e) => e.texto?.trim() || (e.imagem ? "[foto enviada pelo aluno]" : ""))
        .filter(Boolean);
      const resposta = await fetch("/api/sintese", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atividade, respostas }),
      });
      setSintese((await resposta.json()).sintese ?? "");
    } finally {
      setOcupado(false);
    }
  }

  async function encerrarEApagar() {
    if (!codigo) return;
    if (!confirm("Isso apaga a sala e todas as entregas. Confirma?")) return;

    const entregasSnap = await getDocs(collection(db, "sessoes", codigo, "entregas"));
    await Promise.all(entregasSnap.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(doc(db, "sessoes", codigo));

    setCodigo(null);
    setAtividade(null);
    setEntregas([]);
    setCheckins({});
    setSintese("");
    setPedido("");
    setIniciadaEm(null);
  }

  const totalCheckins = Object.values(checkins).reduce((a, b) => a + b, 0);
  const link = origem && codigo ? `${origem}/j/${codigo}` : "";

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-4xl font-bold tracking-tight">Modo Aula</h1>
        <p className="mt-2 text-suave">
          O celular do aluno vira a ferramenta da aula. Sem app, sem login, sem rastreio.
        </p>
      </header>

      {!codigo && (
        <section className="surgir space-y-5">
          <label className="block text-sm font-medium" htmlFor="pedido">
            O que você quer que a turma faça nesta aula?
          </label>
          <textarea
            id="pedido"
            value={pedido}
            onChange={(e) => setPedido(e.target.value)}
            rows={3}
            placeholder="Ex.: quero que o 9º ano encontre exemplos de ângulo reto na sala e explique cada um"
            className="w-full rounded-2xl border border-borda bg-superficie p-4 text-base outline-none transition focus:border-foco"
          />
          <button
            onClick={gerarAtividade}
            disabled={ocupado || pedido.trim().length < 3}
            className="rounded-2xl bg-foco px-6 py-3 font-semibold text-fundo transition disabled:opacity-30"
          >
            {ocupado ? "Gerando..." : "Gerar atividade"}
          </button>
          {erro && <p className="text-sm text-alerta">{erro}</p>}

          {atividade && (
            <div className="surgir rounded-3xl border border-borda bg-superficie p-6">
              <h2 className="text-xl font-semibold">{atividade.titulo}</h2>
              <p className="mt-2 text-texto/85">{atividade.instrucao}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.15em] text-suave">
                {atividade.duracaoMin} min · resposta em {atividade.tipoResposta}
              </p>
              <p className="mt-3 text-sm text-suave">
                <span className="text-texto">No celular do aluno:</span>{" "}
                {atividade.ferramentas?.length
                  ? FERRAMENTAS.filter((f) => atividade.ferramentas.includes(f.chave))
                      .map((f) => f.rotulo.toLowerCase())
                      .join(", ")
                  : "nenhuma ferramenta extra"}
              </p>
              <p className="mt-2 text-sm text-suave">
                <span className="text-texto">Boa resposta:</span> {atividade.criterio}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  onClick={abrirSala}
                  disabled={ocupado}
                  className="rounded-2xl bg-foco px-6 py-3 font-semibold text-fundo disabled:opacity-30"
                >
                  {ocupado ? "Abrindo..." : "Abrir sala"}
                </button>
                <button
                  onClick={gerarAtividade}
                  disabled={ocupado}
                  className="rounded-2xl border border-borda px-6 py-3"
                >
                  Gerar outra
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {codigo && atividade && (
        <section className="surgir space-y-10">
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-borda bg-superficie p-8 text-center">
            <div className="rounded-2xl bg-white p-3">
              <QRCodeSVG value={link} size={168} />
            </div>
            <p className="font-mono text-5xl font-bold tracking-[0.2em]">{codigo}</p>
            <p className="text-sm break-all text-suave">{link}</p>
          </div>

          <div className="rounded-3xl border border-borda bg-superficie p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-suave">
                  {ciclo.fase === "espera" ? "Aula não começou" : ciclo.fase}
                </p>
                <p
                  className={`mt-1 font-mono text-4xl font-bold tabular-nums ${
                    ciclo.fase === "pausa" ? "text-pausa" : "text-foco"
                  }`}
                >
                  {formatarTempo(ciclo.restanteSeg)}
                </p>
              </div>
              <button
                onClick={iniciarAula}
                className="rounded-2xl bg-foco px-6 py-3 font-semibold text-fundo"
              >
                {iniciadaEm ? "Recomeçar" : "Iniciar aula"}
              </button>
            </div>

            <div className="mt-6 flex gap-4">
              <Campo rotulo="Foco (min)" valor={focoMin} ao={setFocoMin} />
              <Campo rotulo="Pausa (min)" valor={pausaMin} ao={setPausaMin} />
            </div>
            <p className="mt-4 text-xs text-suave">
              Todos os celulares da turma seguem este relógio e entram na pausa juntos.
            </p>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-suave">
              Como a turma chegou
            </h2>
            {totalCheckins === 0 ? (
              <p className="mt-3 text-sm text-suave/70">Aguardando os primeiros check-ins.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {ESTADOS.map(({ chave, rotulo }) => {
                  const n = checkins[chave] ?? 0;
                  return (
                    <li key={chave} className="flex items-center gap-3 text-sm">
                      <span className="w-24 shrink-0 text-suave">{rotulo}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-superficie-alta">
                        <span
                          className="block h-full rounded-full bg-foco transition-[width]"
                          style={{ width: `${(n / totalCheckins) * 100}%` }}
                        />
                      </span>
                      <span className="w-8 text-right tabular-nums text-suave">{n}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-4 text-xs text-suave/70">
              Só o total da turma existe no banco. Não há registro por aluno.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-suave">
                Entregas ({entregas.length})
              </h2>
              <button
                onClick={gerarSintese}
                disabled={ocupado || entregas.length === 0}
                className="rounded-xl border border-borda px-4 py-2 text-sm disabled:opacity-30"
              >
                {ocupado ? "Lendo a turma..." : "Síntese da turma"}
              </button>
            </div>

            {sintese && (
              <p className="surgir mt-4 rounded-2xl border border-foco/30 bg-superficie p-5 leading-relaxed">
                {sintese}
              </p>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {entregas.map((e) => (
                <div
                  key={e.id}
                  className="surgir overflow-hidden rounded-2xl border border-borda bg-superficie"
                >
                  {e.imagem ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.imagem} alt="Entrega anônima" className="aspect-square w-full object-cover" />
                  ) : (
                    <p className="p-3 text-sm">{e.texto}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={encerrarEApagar}
            className="w-full rounded-2xl border border-alerta/40 px-5 py-4 font-medium text-alerta"
          >
            Encerrar aula e apagar tudo
          </button>
        </section>
      )}
    </main>
  );
}

function Campo({
  rotulo,
  valor,
  ao,
}: {
  rotulo: string;
  valor: number;
  ao: (n: number) => void;
}) {
  return (
    <label className="flex-1 text-xs text-suave">
      {rotulo}
      <input
        type="number"
        min={1}
        max={60}
        value={valor}
        onChange={(e) => ao(Math.max(1, Number(e.target.value) || 1))}
        className="mt-1 w-full rounded-xl border border-borda bg-fundo px-3 py-2 text-base text-texto outline-none focus:border-foco"
      />
    </label>
  );
}
