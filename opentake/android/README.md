# OpenTake Android preview

The APK includes the web build as local assets. It uses Android System WebView
and the system document picker. It requires Android 8.0 or newer to install.
Use a current Android System WebView for recent browser APIs. Project storage is
local to the app. Use .otake files to exchange projects with your desktop.

## Build on Linux x86-64

Install Node.js 24, npm, Java 21 with keytool, bash, curl, zip and unzip. Run
`npm ci` in the source root. The Android build script obtains the pinned
build-only tools from Maven Central and Google Maven. It bundles neither the tool JARs nor any
signing key.

Create a test-only PKCS12 keystore using keytool, with alias `opentake`:

```sh
keytool -genkeypair -keystore /absolute/path/opentake-test.p12 -storetype PKCS12 \
  -alias opentake -keyalg RSA -keysize 2048 -validity 3650 -dname 'CN=OpenTake Preview'
export OPENTAKE_APK_KEYSTORE=/absolute/path/opentake-test.p12
read -rs OPENTAKE_APK_PASSWORD
export OPENTAKE_APK_PASSWORD
./android/build.sh /absolute/path/OpenTake-Android-Preview.apk
```

The supplied preview is signed with a test key. Use a consistent signer for
future in-place upgrades. Export your projects before uninstalling a build.
The source companion for the supplied APK is OpenTake-Android-Preview-2-Source.zip.
