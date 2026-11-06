# Lenslet Android

Android 10 及以上，默认内置 GeckoView，包名为 `com.lrj.moyu.gecko`。系统 WebView 版不内置内核，包名为 `com.lrj.moyu.webview`。两者可同时安装，笔记编辑器、Markdown、保存、WebDAV 和手机界面使用同一份源码，数据各自独立。安卓版不包含代码运行环境和终端。

本机启动：双击仓库根目录的 `start-android.cmd`，或运行 `npm run start:android`。脚本打开模拟器窗口，安装最新 Release APK 并启动应用；已运行的同名模拟器会复用，更新安装保留笔记。可用 `--apk` 指定安装包、`--avd` 指定模拟器。

启动前检查虚拟化加速；不可用时会显示配置要求，避免启动后立即退出。Windows 可启用“Windows 虚拟机监控程序平台”并重启以使用加速。`--accel auto|on|off` 分别表示自动选择、要求加速或显式尝试软件模拟，本机配置的 `acceleration` 也可设置这些值。软件模式不保证兼容所有系统镜像，运行较慢，等待上限为 10 分钟。Windows 管理员可运行 `scripts/enable-android-acceleration.ps1` 启用该组件；脚本不自动重启，也不改动模拟器数据。

模拟器配置位于不提交到 Git 的 `android/emulator.local.json`：`sdk` 为 SDK 目录，`emulator` 为模拟器可执行文件，`avdHome` 为 AVD 所在目录，`userHome` 为 Android 用户目录，`avd` 为模拟器名称。不填写本机配置时，使用 Android 环境变量和标准安装位置。

安装 JDK 17 及以上、Android SDK Platform 37.2 和 Build Tools 36.0.0，设置 `JAVA_HOME`、`ANDROID_HOME`，在仓库根目录运行：

```sh
npm ci
npm run test:mobile
npm run dist:android
# 不内置内核的系统 WebView 版
npm run dist:android:webview
```

APK 输出到 `release/android/v<版本号>`，版本号与桌面端一致；`shared/mobile-build.json` 同时记录递增的 Android versionCode，构建时会校验版本一致。第一次构建生成 `android/signing/moyu-release.jks` 和对应的 `.properties`；请备份这两个文件，后续覆盖更新必须使用同一签名。签名文件不提交到 Git。

两种安装包分别为 `Lenslet-Android-<版本号>.apk` 和 `Lenslet-Android-<版本号>-WebView.apk`，更新检查只选择当前内核的安装包。`start-android.mjs --engine webview` 启动 WebView 版。更换包名会安装为另一应用；旧包 `app.moyu.notes` 的本地数据不会自动迁移，可使用文件导出、知识库目录或 WebDAV 转移。

`node scripts/build-android.mjs --debug` 同时构建设备测试包和运行 Java 单元测试。调试包为 `com.lrj.moyu.gecko.debug`，添加 `--system-webview` 则为 `com.lrj.moyu.webview.debug`。设备测试使用 `androidx.test.runner.AndroidJUnitRunner`；手机界面回归使用 Playwright，只有原生存储边界被替换。

在测试模拟器中安装调试 APK 后，运行 `node tests/mobile-device-gecko.mjs` 检查编辑、图片、代码块、键盘和手动保存。`node tests/mobile-device-gecko-ime.mjs` 检查键盘遮挡修正与可见光标位置，添加 `--system-webview` 对 WebView 版执行相同检查。CDP 设备脚本仅适用于使用 `--system-webview --debug` 构建的调试包。

GeckoView 的构建与验证见 [gecko.md](gecko.md)。
