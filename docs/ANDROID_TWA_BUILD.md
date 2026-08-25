# Building the Android app (TWA)

Turns a deployed app into a signed Android package for the Play Store. Do this
**once per app** — the Field Agent app and the Customer app are separate Play
listings with separate package names.

Background and the iOS question: `docs/NATIVE_APP_HANDOVER.md`.

> ⏱ About half a day for the first one, most of it waiting on downloads.
> The second takes minutes.

---

## 0. Prerequisites

**The app must already be deployed to HTTPS.** Android verifies the app against
the live domain, so this cannot be done against `localhost`. Batch 9 first.

Then check the deployed app is actually installable — if Chrome won't offer to
install it, Bubblewrap has nothing to wrap:

```bash
# On the deployed URL, all of these must be 200 and NOT redirect to /login.
for f in manifest.webmanifest sw.js offline.html icon-192.png icon-512.png apple-touch-icon.png; do
  curl -s -o /dev/null -w "$f -> %{http_code}\n" https://<your-domain>/$f
done
```

> 🔴 If any of those 307s, stop — that is the bug fixed on 2026-08-24 (the auth
> guard was swallowing the icons and silently made the app un-installable).
> Anything served from an app's `public/` root must be excluded in that app's
> `src/proxy.ts` matcher.

**Java:** Bubblewrap needs **JDK 17+**. The Macs on this project have Java 8,
which is too old — let Bubblewrap install its own rather than fighting the
system JDK. `bubblewrap doctor` will tell you and offer to fix it.

---

## 1. Pick the package name

Reverse-domain, permanent, and **unique per app**. Once published it can never
be changed without creating a new listing.

| App | Suggested package |
|---|---|
| Field Agent | `in.clbipp.agent` |
| Customer / Vendor | `in.clbipp.vendor` |

---

## 2. Generate the project

```bash
npx @bubblewrap/cli doctor          # installs/points at a JDK 17+ and the Android SDK
mkdir -p ~/clbipp-twa/agent && cd ~/clbipp-twa/agent

npx @bubblewrap/cli init \
  --manifest=https://<agent-domain>/manifest.webmanifest
```

It reads the manifest for the name, icons, colours and `start_url`, then asks a
series of questions. The ones that matter:

- **Application ID** → the package name from §1.
- **Signing key** → let it create one. It writes `android.keystore` beside the
  project.
- **Display mode** → `standalone`.

> 🔴 **`android.keystore` and its passwords are secrets and must never be
> committed.** They live outside this repo on purpose (`~/clbipp-twa/`). If the
> company will publish, prefer **Play App Signing** (§5) so Google holds the
> real signing key and losing this file is recoverable. Losing a non-Play-signed
> key means you can never update the app again.

---

## 3. Build

```bash
npx @bubblewrap/cli build
```

Produces:

- `app-release-bundle.aab` — upload this to the Play Store
- `app-release-signed.apk` — sideload this to test on a handset

---

## 4. Wire up Digital Asset Links

This is what removes the browser address bar. Get the fingerprint of the key
that signed the build:

```bash
npx @bubblewrap/cli fingerprint list
# or:
keytool -list -v -keystore android.keystore -alias android | grep "SHA256:"
```

Set these on the app's Vercel project (Settings → Environment Variables) and
redeploy:

```
ANDROID_PACKAGE_NAME=in.clbipp.agent
ANDROID_CERT_FINGERPRINTS=<the SHA-256, colon-delimited, exactly as printed>
```

Verify it is live and anonymous:

```bash
curl https://<agent-domain>/.well-known/assetlinks.json
```

You should see your package name and fingerprint. `[]` means the env vars
aren't set on that deployment.

**Test it:** install the APK on a phone and open it. **No address bar = success.**
An address bar means the fingerprint doesn't match — the app still works, it
just looks like a browser, which defeats the point.

---

## 5. Play Store upload

Upload `app-release-bundle.aab` to the Play Console.

⚠ **With Play App Signing enabled (the default and the right choice), Google
re-signs the app with their own key — so the fingerprint changes.** After the
first upload, get Google's fingerprint from **Play Console → Setup → App
integrity → App signing key certificate**, and add it to
`ANDROID_CERT_FINGERPRINTS` **alongside** the upload key's:

```
ANDROID_CERT_FINGERPRINTS=<upload-key-sha256>,<play-app-signing-sha256>
```

Both must be listed — the upload key signs your local test builds, Google's key
signs what users install. This is the single most common reason a TWA ships with
a visible address bar.

> **Publishing note:** new *personal* Play developer accounts must run a closed
> test (~12 testers, ~2 weeks) before production. **Organisation accounts are
> exempt.** Publish under the company's organisation account if possible.

---

## 6. Afterwards

**Web changes do not need a new Android release.** The TWA loads the live site,
so a push to `main` reaches Android users on next open, exactly like the PWA.

Rebuild and re-upload only when the app's *shell* changes — name, icon, package
name, target SDK, or a Play policy bump.
