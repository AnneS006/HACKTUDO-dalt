import { contarPalavras, type Atividade, type Resposta } from "@/lib/tipos";

const CORES = ["#5fd3a0", "#f0b05d", "#5db8f0", "#9d8cf5", "#f08fb8", "#f2766b"];

export function VistaColetiva({
  atividade,
  respostas,
}: {
  atividade: Atividade;
  respostas: Resposta[];
}) {
  if (respostas.length === 0) {
    return <p className="text-sm text-suave">Ninguém respondeu ainda.</p>;
  }

  if (atividade.tipo === "enquete") return <Histograma atividade={atividade} respostas={respostas} />;
  if (atividade.tipo === "nuvem") return <NuvemDePalavras respostas={respostas} />;
  return <Painel respostas={respostas} />;
}

function Histograma({ atividade, respostas }: { atividade: Atividade; respostas: Resposta[] }) {
  const opcoes = atividade.opcoes ?? [];
  const total = respostas.length;

  return (
    <ul className="space-y-4">
      {opcoes.map((opcao, i) => {
        const votos = respostas.filter((r) => r.opcao === i).length;
        const parte = total ? Math.round((votos / total) * 100) : 0;
        return (
          <li key={i}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>{opcao}</span>
              <span className="shrink-0 tabular-nums text-suave">{parte}%</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-superficie-alta">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${parte}%`, backgroundColor: CORES[i % CORES.length] }}
              />
            </div>
          </li>
        );
      })}
      <li className="pt-1 text-xs text-suave">{total} respostas</li>
    </ul>
  );
}

function NuvemDePalavras({ respostas }: { respostas: Resposta[] }) {
  const nuvem = contarPalavras(respostas.map((r) => r.palavras ?? []));
  const maior = nuvem[0]?.peso ?? 1;

  return (
    <div className="flex flex-wrap items-baseline justify-center gap-x-4 gap-y-2">
      {nuvem.map(({ palavra, peso }, i) => (
        <span
          key={palavra}
          className="font-semibold leading-tight transition-all duration-500"
          style={{
            fontSize: `${1 + (peso / maior) * 1.8}rem`,
            color: CORES[i % CORES.length],
            opacity: 0.55 + (peso / maior) * 0.45,
          }}
        >
          {palavra}
        </span>
      ))}
    </div>
  );
}

function Painel({ respostas }: { respostas: Resposta[] }) {
  return (
    <ul className="space-y-3">
      {respostas.map((r, i) => (
        <li
          key={r.id}
          className="surgir rounded-2xl border-l-2 border-borda bg-superficie p-4"
          style={{ borderLeftColor: CORES[i % CORES.length] }}
        >
          <p className="leading-relaxed">{r.peca}</p>
          <p className="mt-2 text-xs text-suave">{r.nome.split(" ")[0]}</p>
        </li>
      ))}
    </ul>
  );
}
