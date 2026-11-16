# Building the release APK on this Windows machine

Local `gradlew assembleRelease` fails here for reasons that have nothing to do with the app code. Follow these steps in
order; each one fixes one specific failure seen in practice.

## Why it fails

| Symptom | Cause |
|---|---|
| `ninja: error: mkdir(CMakeFiles/...): No such file or directory` or `Filename longer than 260 characters` | Native (C++) object paths embed the full project path. From `C:\Users\Parvesh Kumar\Desktop\Delco Chef\delco-chefs\mobile\node_modules\…` they pass Windows' 260-character limit. The SDK's ninja 1.10 ignores `LongPathsEnabled`. |
| Building from `X:` or `C:\dcb` still shows the long `C:\Users\…` path | Both are only aliases (`subst` drive / junction) of the real folder. Node and CMake resolve them back to the real path. |
| `ld.lld: error: undefined symbol: operator new(...)`, `__cxa_begin_catch`, `std::__ndk1::...` | The Windows user name contains a space, so CMake calls the compiler by its 8.3 short name `CLANG_~1.EXE` instead of `clang++.exe`. Without `++` in the name clang links as C and leaves out the C++ standard library. |
| App crashes at launch with `Failed to create an instance of class androidx.work.impl.WorkDatabase` | R8 minification breaks WorkManager's Room database. Already handled by `mobile/plugins/withNoReleaseMinify.js`. |

## One-time setup

1. **JDK 17.** Use Android Studio's JDK, not the Java 8 on `PATH`:
   `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr`
2. **SDK path without spaces.** Create a junction (no admin rights needed):
   `mklink /J C:\asdk "C:\Users\Parvesh Kumar\AppData\Local\Android\Sdk"`
3. **Short real copy of the app.** It must be a real copy, not a junction:
   `robocopy "<repo>\mobile" C:\b /E /MT:16 /XD "<repo>\mobile\android\build" "<repo>\mobile\android\app\build" "<repo>\mobile\android\app\.cxx" "<repo>\mobile\android\.gradle" "<repo>\mobile\.expo"`
   Check it with `(Get-Item C:\b).LinkType`, which must print nothing.
4. **Point the build at the space-free SDK.** Create `C:\b\android\local.properties` (machine-only, git-ignored):
   `sdk.dir=C\:/asdk`
5. `mobile/plugins/withShortNativeBuildDir.js` (registered in `app.config.js`) moves each native module's `.cxx` folder to
   `C:\rn\<module>`, which keeps the remaining paths under the limit. It runs from `settings.gradle`. Setting it in
   `build.gradle` fails with "It is too late to set buildStagingDirectory".

## Every build

```powershell
# 1. Copy the latest sources into the build copy
$src = "C:\Users\Parvesh Kumar\Desktop\Delco Chef\delco-chefs\mobile"
foreach ($d in "app","src","plugins","assets") { robocopy "$src\$d" "C:\b\$d" /MIR /NFL /NDL /NJH /NJS /NP }
foreach ($f in "app.config.js","app.json","package.json","package-lock.json",".env") { Copy-Item "$src\$f" "C:\b\$f" -Force }
# If dependencies changed: run `npm ci` in C:\b, then `npx expo prebuild --platform android --no-install`,
# then put local.properties (step 4) back.

# 2. Build (from C:\b\android)
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\asdk"; $env:ANDROID_SDK_ROOT = "C:\asdk"
cd C:\b\android
.\gradlew assembleRelease --no-daemon -PreactNativeArchitectures=armeabi-v7a,arm64-v8a,x86_64

# 3. Output
# C:\b\android\app\build\outputs\apk\release\app-release.apk
```

## If a build fails after something changed

- **Stale caches** with old paths cause the same errors again. Delete `C:\rn`, `C:\b\android\app\.cxx`,
  `C:\b\android\app\build`, `C:\b\android\build` (which includes `generated\autolinking\autolinking.json`) and
  `C:\b\android\.gradle`, then rebuild.
- **`npx expo prebuild`** rewrites `package.json`'s `android`/`ios` scripts to `expo run:*`. Revert that change.
  It also regenerates `android/`, so recreate `local.properties`.
- Read the **first** linker or compiler error, not the last one. Filters such as `tail -25` hide the cause.

## Check before handing over

```bash
adb install -r C:/b/android/app/build/outputs/apk/release/app-release.apk
adb logcat -c
adb shell monkey -p com.delcochefs.app -c android.intent.category.LAUNCHER 1
sleep 12; adb shell pidof com.delcochefs.app   # must print a process id
adb logcat -d -b crash                          # must be empty
```

An emulator is available: `emulator -avd Pixel_6`.
