---
name: android-emulator-e2e
description: Set up an API 34 emulator and safely exercise the native Devin Android client with real API credentials.
---

# Android emulator E2E

Repo project: `app/devin-mobile-android`. Preserve configured Aliyun Maven mirrors.

## Devin Secrets Needed

- `DEVIN_API_KEY`: enter via environment reference; never print it or write it to test artifacts. `cog_` uses v3 and blank org auto-detection. Non-cog v1 coverage needs a separately authorized appropriate key.

## Setup

1. Export `ANDROID_HOME=$HOME/toolchains/android-sdk`; JDK 17 is sufficient.
2. Install SDK packages if missing:
   `"$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" "emulator" "system-images;android-34;google_apis;x86_64"`.
3. Check `/dev/kvm` access. On this Ubuntu host `acl` was needed; `sudo -n apt-get install -y acl` and `sudo -n setfacl -m u:ubuntu:rw /dev/kvm` granted scoped access. If `acl` has no installation candidate (stale apt lists), `sudo -n chmod 666 /dev/kvm` achieves the same for the session. Do not retry sudo when it requires a password.
4. Create an AVD:
   `echo no | "$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" create avd -n devin_api34 -k "system-images;android-34;google_apis;x86_64" -d pixel_5`.
5. Start emulator with `-avd devin_api34 -gpu swiftshader_indirect -no-snapshot -no-boot-anim -no-audio`. Wait for `adb shell getprop sys.boot_completed` = `1`.
6. Install `app/build/outputs/apk/debug/app-debug.apk`; package is `com.nancy.devinmobile`.

## Reliable UI interaction and evidence

- Maximize/fit emulator on desktop before recording. Its constrained aspect ratio may require fitting rather than ordinary maximize.
- If desktop-coordinate clicks do not agree with visible screens, check native bounds with `adb shell wm size` and `adb shell uiautomator dump`, then use native `adb shell input tap` or `input swipe x y x y 1200` for long-press. Capture a screenshot after each action. Do not immediately attribute coordinate mismatches to app logic.
- `adb shell input keycombination 113 29` selects all text (Ctrl+A); `input keyevent 67` deletes. `input keyevent 4` hides keyboard/backs out.
- Pass secret references to `adb shell input text`, with `adb shell settings put system show_password 0` to prevent transient password-character disclosure.
- ADB text uses `%s` for spaces and remote-shell metacharacters require escaping. Prefer punctuation without shell metacharacters for labelled test messages.
- Use `adb exec-out screencap -p` immediately after a toast-triggering tap; the short-lived validation toast can disappear before an ordinary screenshot.
- Record native UI actions on the desktop; screenshots via screencap can supplement with full-resolution evidence.
- After sending a steer, leave and reopen the exact session to verify persistence. The Web button's intent URL can verify the session ID when titles are duplicated.
- List order can change as real sessions update. Re-read it before every tap or long-press. Do not infer exact polling cadence from unchanged screens.
- Query `adb logcat -b crash -d` for crash evidence. Filter activity logs instead of attaching full logs with potentially sensitive text.
- Short toasts evade both `dumpsys window | grep -i toast` polling and screencaps; `adb shell logcat -d | grep "Toast already killed.*<pkg>"` afterwards proves the app did post one.

## Diagnosing silent ACP send failures (v2.8)

- The app writes no Logcat output for ACP traffic. To localize a silent send drop, inject `android.util.Log.d` into `SessionActivity.send()` (which branch: `acpMode`/`acp!=null`/`store.state`) and `AcpClient.rpc`/`connect`/`sendRaw`/ws callbacks, rebuild `./gradlew assembleDebug`, `adb install -r` (debug signature preserves prefs), and read `adb logcat -d -s SENDDBG:V`.
- v2.8 root cause found: `AcpClient.connect()` holds `connectLock` across `deferred.await()` whose completion needs `rpc("initialize")` — which must acquire the same lock (and would self-deadlock on `connecting.await()` anyway). Any ws (re)connect can wedge permanently; every later rpc (`prompt`, `listSessions`, heartbeat) then hangs at `connectLock` forever. The 30s rpc timeout only wraps the response await *after* `sendRaw`, so `send()` clears the input, never errors, and the button stays grey — the exact "消息还发不过来" symptom. The first connect often escapes only because the awaiting coroutine gets cancelled (`JobCancellationException`), orphaning the init rpc which then completes the ws by accident.
- `store.state` stayed `''` in all observed sessions, so the `working` → `queuedMessages/update` branch never fired; every send took `acp.prompt` (which also means no queuebox UI feedback even when it should).
- Cross-check paths independently: clear `pat` in prefs via UI (PAT dialog → Ctrl+A → DEL → save empty) to force REST `sendMessage` (delivers fine), and replay `session/prompt` directly over `wss://app.devin.ai/api/acp/live?token=PAT&org_id=ORG` with python `websocket-client` (delivers fine) — both prove the bug is in the app's ACP client, not the server or the payload shape.
- Bottom-sheet dialog buttons are occluded by the IME: `uiautomator` bounds lie when the keyboard is up — taps in the keyboard band hit keyboard keys. `keyevent 4` hides the IME but keeps the sheet open (buttons then sit ~y2104-2230); `keyevent 111` dismisses the whole dialog.
- Session-list rows have invisible action buttons `act_tags/act_rename/act_archive/act_delete` covering x≥288; tap x≈140 to open a session.
- `wc -m` on `sed`-extracted values counts the trailing newline — verify credential char counts with `${#VAR}` in shell instead.
- `run-as` can read `shared_prefs/devin-mobile.xml` but cannot write it (SELinux); clear/change prefs through the app's own dialogs.

## Testing the in-app updater locally

- `Updater.VERSION_URL` can be pointed at `http://10.0.2.2:<port>/version.json` (10.0.2.2 = host from guest), but a test APK that fetches cleartext HTTP must also temporarily set `android:usesCleartextTraffic="true"` on `<application>` — without it the request throws `Cleartext HTTP traffic not permitted` and the silent catch makes "no dialog" look like a pass when it is really a blocked request.
- Serve the APK throttled (~700KB/s) so the `下载中… N%` dialog is on screen long enough to capture; plain `http.server` finishes too fast for evidence.
- The update check only runs in `SessionListActivity.onCreate`. After the unknown-sources settings detour, `am start` on the singleTask activity only delivers `onNewIntent` — `am force-stop com.nancy.devinmobile` then relaunch to re-trigger the dialog.
- Verify overlay install results objectively: `adb shell dumpsys package com.nancy.devinmobile | grep versionCode` for the installed version, `adb shell run-as com.nancy.devinmobile cat shared_prefs/devin-mobile.xml` (debug build) for preserved key/org (redact before attaching).
- When testing a retry-after-permission flow, `am force-stop` first: a prior cancelled download can leave in-memory pendingInstall state plus a truncated `update-*.apk` in cacheDir that would poison the retry with a parse failure instead of the intended path.

## Streaming-session list behaviour (live event cards)

- Credentials: `prefs.configured` requires `apiKey.isNotEmpty()` — a PAT alone leaves the app unconfigured and the "修改 Devin API key" sheet re-prompts on every return to the session list. Enter BOTH the API key and the PAT (Devin 凭证 → 编辑 API key / 编辑 PAT); org auto-detects on save.
- The session list auto-pins to bottom while the session streams (~1 event/s): upward swipes snap back within ~1s even mid-drag, so older items are unreachable while "Devin is working…" is live. New cards land at the bottom where they are auto-visible; to inspect older items wait for the stream to go quiet or leave/re-enter the session.
- Card/button positions shift as events stream — always resolve `input tap` coordinates from a uiautomator dump taken in the SAME shell command as the tap, and prefer the LAST matching button when several identical cards stack. Verify the tap landed by re-dumping; a collapsible `▸` row toggling to `▾` is a reliable control tap.
- If an in-place UI state change (e.g. a card flipping pending→done) doesn't render but should have, leave and re-enter the session — a full rebind replays history events; comparing the two is a quick way to distinguish a rebind bug from a missing event.
- `uiautomator dump` intermittently crashes with "UiAutomationService … already registered" (visible in `logcat -b crash`) — that is the dump tool itself, not the app; retry and don't report it as an app crash.

## Safety

Use read-only API-key GET requests only as supplementary live-data checks; perform user operations through UI. Never create sessions or confirm deletion unless explicitly authorized. Use a user-approved session ID for the single labelled steer. Restore valid credentials after invalid-key testing.
