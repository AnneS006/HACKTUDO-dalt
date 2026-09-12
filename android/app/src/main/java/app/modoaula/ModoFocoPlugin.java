package app.modoaula;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * A parte que o navegador não alcança: prender o aparelho no Modo Aula e
 * silenciar as notificações enquanto a aula durar.
 *
 * Só a tela do aluno chama isto. A do professor roda no navegador.
 */
@CapacitorPlugin(name = "ModoFoco")
public class ModoFocoPlugin extends Plugin {

    @PluginMethod
    public void entrar(PluginCall call) {
        JSObject resposta = new JSObject();

        // Fora de foreground, ou em aparelho que não permite, isto lança.
        // Melhor devolver que não travou do que derrubar a aula.
        try {
            getActivity().runOnUiThread(() -> getActivity().startLockTask());
            resposta.put("travado", true);
        } catch (Exception erro) {
            resposta.put("travado", false);
            resposta.put("motivo", String.valueOf(erro.getMessage()));
        }

        resposta.put("silenciado", silenciar(true));
        call.resolve(resposta);
    }

    @PluginMethod
    public void sair(PluginCall call) {
        try {
            getActivity().runOnUiThread(() -> getActivity().stopLockTask());
        } catch (Exception ignorado) {
            // Sair de um estado em que não entramos não é erro.
        }
        silenciar(false);
        call.resolve();
    }

    @PluginMethod
    public void estado(PluginCall call) {
        JSObject resposta = new JSObject();
        resposta.put("podeSilenciar", gerenciador().isNotificationPolicyAccessGranted());
        call.resolve(resposta);
    }

    /** Abre os ajustes do sistema: só o dono do aparelho concede isto. */
    @PluginMethod
    public void pedirPermissaoDeSilencio(PluginCall call) {
        Intent ajustes = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
        ajustes.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(ajustes);
        call.resolve();
    }

    private NotificationManager gerenciador() {
        return (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private boolean silenciar(boolean ligado) {
        NotificationManager nm = gerenciador();
        if (!nm.isNotificationPolicyAccessGranted()) return false;

        nm.setInterruptionFilter(
            ligado
                ? NotificationManager.INTERRUPTION_FILTER_NONE
                : NotificationManager.INTERRUPTION_FILTER_ALL
        );
        return true;
    }
}
