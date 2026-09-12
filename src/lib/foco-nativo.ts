// Ponte para a casca Android. No navegador nada disto existe, e as funções
// avisam que não travaram — aí o app cai no caminho de tela cheia.
// Só a tela do aluno usa este módulo.

type Resultado = { travado: boolean; silenciado: boolean; motivo?: string };

interface PluginModoFoco {
  entrar(): Promise<Resultado>;
  sair(): Promise<void>;
  estado(): Promise<{ podeSilenciar: boolean }>;
  pedirPermissaoDeSilencio(): Promise<void>;
}

function plugin(): PluginModoFoco | null {
  if (typeof window === "undefined") return null;

  const capacitor = (window as unknown as {
    Capacitor?: { Plugins?: Record<string, unknown> };
  }).Capacitor;

  return (capacitor?.Plugins?.ModoFoco as PluginModoFoco | undefined) ?? null;
}

export function temCascaNativa(): boolean {
  return plugin() !== null;
}

export async function travarNativo(): Promise<Resultado | null> {
  const ponte = plugin();
  if (!ponte) return null;

  try {
    return await ponte.entrar();
  } catch {
    return null;
  }
}

export async function destravarNativo(): Promise<void> {
  const ponte = plugin();
  if (!ponte) return;

  try {
    await ponte.sair();
  } catch {
    // Destravar o que não travou não é erro.
  }
}

export async function pedirSilencio(): Promise<void> {
  await plugin()?.pedirPermissaoDeSilencio();
}
