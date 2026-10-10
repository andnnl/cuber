const assert = require("assert");
const fs = require("fs");

const main = fs.readFileSync(
  "android/app/src/main/java/com/cuber/trainer/MainActivity.java",
  "utf8"
);
const gradle = fs.readFileSync("android/app/build.gradle.kts", "utf8");
const manifest = fs.readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
const buildScript = fs.readFileSync("android/build-apk.sh", "utf8");

assert.match(main, /index\.html\?mode=blecross/);
assert.match(main, /setWebContentsDebuggingEnabled\(BuildConfig\.DEBUG\)/);
assert.match(gradle, /versionCode\s*=\s*6/);
assert.match(gradle, /versionName\s*=\s*"1\.0\.5"/);

for (const permission of ["BLUETOOTH_SCAN", "BLUETOOTH_CONNECT", "ACCESS_FINE_LOCATION"]) {
  assert.match(manifest, new RegExp(`android\\.permission\\.${permission}`));
}

assert.match(buildScript, /java-21-openjdk-amd64/);
assert.match(buildScript, /JAVA_HOME/);

console.log("Android app configuration tests passed");
