package org.cortico.minecraft;

import com.google.gson.Gson;
import com.sun.jna.Platform;
import com.sun.jna.platform.win32.Crypt32Util;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.fabric.api.client.message.v1.ClientReceiveMessageEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.minecraft.class_310;
import net.minecraft.class_642;

/** Submits a scoped private credential only after the server requests login. */
public final class CorticoClientLogin implements ClientModInitializer {
    private record Account(String server, String username, String credentialFile, String command,
                           List<String> requestMarkers, List<String> successMarkers, List<String> failureMarkers) {}
    private record Config(boolean enabled, List<Account> accounts) {}
    private LoginSession session;
    private Account account;
    private class_310 client;
    private final LoginSession.ConnectionScope connection = new LoginSession.ConnectionScope();

    @Override
    public void onInitializeClient() {
        ClientPlayConnectionEvents.JOIN.register((handler, sender, current) -> {
            if (!connection.join(handler.method_48296())) return;
            client = current;
            account = null;
            session = null;
            class_642 server = current.method_1558();
            if (server == null) return;
            try {
                Path configFile = FabricLoader.getInstance().getConfigDir().resolve("cortico-client-login.json");
                if (!Files.isRegularFile(configFile)) return;
                Config config = new Gson().fromJson(Files.readString(configFile), Config.class);
                if (config == null || !config.enabled || config.accounts == null) return;
                for (Account entry : config.accounts) {
                    if (entry == null || entry.server == null || entry.username == null
                            || !LoginSession.matchesAccount(entry.server, entry.username,
                                server.field_3761, current.method_1548().method_1676())) continue;
                    if (account != null) throw new IllegalArgumentException("Duplicate matching accounts");
                    if (entry.credentialFile == null || entry.command == null || entry.requestMarkers == null
                            || entry.successMarkers == null || entry.failureMarkers == null)
                        throw new IllegalArgumentException("Incomplete account configuration");
                    account = entry;
                }
                if (account != null) {
                    session = new LoginSession(account.requestMarkers, account.successMarkers, account.failureMarkers);
                    System.out.println("[CorticoClientLogin] Armed for " + account.username + " at " + account.server);
                }
            } catch (Exception error) {
                account = null;
                session = null;
                System.out.println("[CorticoClientLogin] Configuration unavailable; no credential submitted ("
                    + error.getClass().getSimpleName() + ")");
            }
        });
        ClientPlayConnectionEvents.DISCONNECT.register((handler, current) -> {
            if (!connection.disconnect(handler.method_48296())) return;
            session = null;
            account = null;
            client = null;
        });
        ClientReceiveMessageEvents.ALLOW_GAME.register((message, overlay) -> {
            if (session == null || account == null || client == null) return true;
            LoginSession.Result result = session.observe(message.getString());
            if (result == LoginSession.Result.CONFIRMED)
                System.out.println("[CorticoClientLogin] Server confirmed login for " + account.username);
            else if (result == LoginSession.Result.BLOCKED)
                System.out.println("[CorticoClientLogin] Authentication requires intervention; no retry");
            else if (result == LoginSession.Result.SUBMIT) {
                Account selected = account;
                class_310 current = client;
                long generation = connection.generation();
                current.execute(() -> submit(selected, current, generation));
            }
            return true;
        });
        System.out.println("[CorticoClientLogin] Active; login commands and credentials are never logged");
    }

    private void submit(Account selected, class_310 current, long generation) {
        if (generation != connection.generation() || client != current || account != selected || current.method_1562() == null) return;
        byte[] plain = null;
        try {
            if (!Platform.isWindows()) throw new IllegalStateException("Windows user credential required");
            byte[] cipher = Files.readAllBytes(Path.of(selected.credentialFile));
            if (cipher.length < 1 || cipher.length > 16384) throw new IllegalArgumentException("Credential size");
            plain = Crypt32Util.cryptUnprotectData(cipher);
            String command = LoginSession.command(selected.command, new String(plain, StandardCharsets.UTF_8));
            current.method_1562().method_45730(command);
            System.out.println("[CorticoClientLogin] Submitted one login command for " + selected.username
                + "; waiting for server confirmation");
        } catch (Exception error) {
            System.out.println("[CorticoClientLogin] Login not submitted; no retry (" + error.getClass().getSimpleName() + ")");
        } finally {
            if (plain != null) Arrays.fill(plain, (byte) 0);
        }
    }
}
