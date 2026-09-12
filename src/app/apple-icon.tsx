import { ImageResponse } from "next/og";

// O iOS não aceita SVG como ícone da tela de início, então este PNG é gerado
// no build. Sem ele, o iPhone usa uma miniatura da página e fica feio.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#080d12",
        }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: "50%",
            border: "14px solid #5fd3a0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#5fd3a0" }} />
        </div>
      </div>
    ),
    size,
  );
}
