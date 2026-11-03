# Android / GeckoView

Android 默认内置 GeckoView 158.0.20261021001945，正式应用 ID 为 `com.lrj.moyu.gecko`，与 WebView 版使用不同的应用 ID。编辑器、Markdown、保存和 WebDAV 复用桌面端源码。PDF 导出使用 Android 系统打印视图。

构建要求：JDK 17 以上、Android SDK Platform 37.2、Build Tools 36.0.0。最低运行系统为 Android 10。

```sh
# ARM64 手机发行包
node scripts/build-android.mjs
# x86_64 模拟器调试包
node scripts/build-android.mjs --abi=x86_64 --debug
```

调试包为 `com.lrj.moyu.gecko.debug`。设备测试前安装 `android/app/build-gecko-main-x86_64/outputs/apk/debug/app-debug.apk`，设置 `ANDROID_HOME` 后运行 `node tests/mobile-device-gecko.mjs` 或 `node tests/mobile-device-gecko-ime.mjs`；可用 `ANDROID_SERIAL` 指定测试模拟器。

GeckoView 通过内置扩展连接原生接口；接口只接受当前主页面的消息。应用资源和附件使用每次启动随机的只读回环地址加载，不监听外网。发行包不包含测试脚本。

两版共用 `ImeViewport` 与页面输入策略，按 Android 原生 IME 动画进度调整可见区域。光标需要避让时多留两行距离，距离随当前文字行高变化；已在可见区域的光标保持原位。两种适配器只负责内核加载、原生消息传输和浏览器资源访问。

刷新率由系统和用户的应用设置决定，不提交固定的窗口 Hz、显示模式 ID 或 Surface 帧率，也不修改系统的刷新率、省电或温控设置。小米 14 Ultra / HyperOS 3 真机对照中，仅更换应用 ID 后，系统上限和实际显示模式从 60Hz 恢复为 120Hz；窗口 ARR 省电开关无法解除旧包名的系统限制。

系统 WebView 版使用 `--system-webview` 构建，包名为 `com.lrj.moyu.webview`，不包含 Gecko 库，更新安装包带 `-WebView` 后缀。原有 CDP 设备脚本用于该版本的调试构建。两种内核共享界面、输入、存储与同步实现，构建输出目录和应用数据分别隔离。该版在小米真机初次启动曾为 120Hz，页面加载后系统上限回到 60Hz；不能将启动时的采样视为持续高刷结果。
