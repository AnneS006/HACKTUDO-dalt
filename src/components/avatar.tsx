import { iniciais, type Pessoa } from "@/lib/tipos";

const TAMANHOS = {
  p: "h-10 w-10 text-xs",
  m: "h-14 w-14 text-sm",
  g: "h-20 w-20 text-lg",
};

export function Avatar({
  pessoa,
  tamanho = "m",
  apagado = false,
}: {
  pessoa: Pick<Pessoa, "nome" | "cor" | "foto">;
  tamanho?: keyof typeof TAMANHOS;
  apagado?: boolean;
}) {
  return (
    <span
      className={`${TAMANHOS[tamanho]} flex shrink-0 items-center justify-center rounded-full font-bold transition ${
        apagado ? "opacity-35" : ""
      }`}
      style={{ backgroundColor: `${pessoa.cor}22`, color: pessoa.cor }}
    >
      {pessoa.foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pessoa.foto} alt={pessoa.nome} className="h-full w-full rounded-full object-cover" />
      ) : (
        iniciais(pessoa.nome)
      )}
    </span>
  );
}
