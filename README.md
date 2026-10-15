# STACK POT – BLOCK PARTY | Multiplayer-Server V154

Cloudflare Worker + Durable Object für private 2-Spieler-Tetrisräume.

## Deployment über GitHub Actions
1. Dateien dieses Pakets in das private GitHub-Repository `stack-pot-online` hochladen (Dateistruktur erhalten).
2. In Cloudflare einen API-Token mit Berechtigung **Workers Scripts: Edit** für das eigene Konto erstellen; die **Account ID** im Cloudflare-Dashboard nachschlagen.
3. Unter GitHub → Repository → Settings → Secrets and variables → Actions zwei **Repository secrets** anlegen: `CLOUDFLARE_API_TOKEN` und `CLOUDFLARE_ACCOUNT_ID`. Token niemals in Dateien oder Chat-Nachrichten schreiben.
4. Unter GitHub → Actions → `Deploy STACK POT server` → Run workflow starten. Prüfen, dass der Job erfolgreich ist.
5. `https://stack-pot-online.eherge.workers.dev/health` im Browser öffnen; erwartet `{ "ok": true, ... }`.

**Achtung:** Das ist der Server, noch nicht die fertige Online-Version des Spiels. Der vorhandene HTML-Client benötigt eine kleine Anpassung, um `/room/CODE` anzusprechen und `hello` zu senden. Es gibt noch keine öffentliche Lobby, Benutzerkonten oder Anti-Cheat-Sicherung.

**Kosten:** Deployment nur im Cloudflare-Free-Tarif vornehmen; Limits und mögliche Gebühren vor einem Upgrade prüfen. Die kostenlose Bereitstellung ist nicht unbegrenzt.
STACK POT ONLINE V154 - First server deployment
