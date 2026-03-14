# NexTalk Android Wrapper

This folder contains a WebView-based Android app shell for NexTalk.

## What is already done in this repo

- Android project skeleton created in this folder.
- Runtime permissions wired for camera, microphone, and notifications.
- WebView configured for:
  - JavaScript + DOM storage
  - media autoplay for call UX
  - file chooser (chat image upload)
  - web-origin permission requests (camera/mic from page)
- Default app URL is preconfigured in [app/build.gradle.kts](app/build.gradle.kts):
  - `file:///android_asset/frontend/index.html?backend=https://durgesh-kushwaha-nextalk.hf.space`
  - Frontend files are bundled from [../frontend](../frontend) into [app/src/main/assets/frontend](app/src/main/assets/frontend)

## Your side (required)

1. Open this folder in Android Studio:
   - Open project: `android-app`
2. Let Android Studio sync and install missing Android SDK components.
3. If prompted to create/update Gradle wrapper, accept it.
4. Run app on a physical Android device (recommended for mic/camera tests).
5. If your frontend/backend URLs changed:
   - Edit `buildConfigField("String", "APP_URL", "...")` in [app/build.gradle.kts](app/build.gradle.kts)
   - Sync Gradle and rerun.
6. Ensure backend is publicly reachable over HTTPS (not localhost).

## Pre-release checklist

- Login and registration work.
- Message send/receive works in real-time.
- Image upload works.
- Audio call connect/accept/end works.
- Video call connect/accept/end works.
- Calls tested on at least 2 different networks.
- Turn on TURN server for production-grade call reliability.

## Notes

- This wrapper reuses your existing web frontend and backend APIs.
- For Play Store production, add custom app icons, signing config, privacy policy, and notification channel UX.
