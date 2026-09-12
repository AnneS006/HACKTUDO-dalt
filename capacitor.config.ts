import type { CapacitorConfig } from "@capacitor/cli";

// A casca nativa não carrega uma cópia do app: ela abre o site que já está no
// ar. Assim o aluno recebe toda correção publicada na Vercel sem instalar APK
// novo, e existe um só código para as duas plataformas.
const config: CapacitorConfig = {
  appId: "app.modoaula",
  appName: "Modo Aula",
  webDir: "public",
  server: {
    url: "https://modo-aula-five.vercel.app",
    cleartext: false,
  },
  android: {
    // Mesmo fundo do app, para não piscar branco enquanto a página carrega.
    backgroundColor: "#0a0f14",
  },
};

export default config;
