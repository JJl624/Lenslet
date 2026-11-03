/* The page gets the same RPC contract as WebView, without extension privileges. */
if (window === window.top && /^\/[a-f0-9]{64}\/mobile\.html$/.test(location.pathname)) {
  const page = window.wrappedJSObject;
  const port = browser.runtime.connectNative('moyu');
  const bridge = cloneInto({engine: 'gecko', connected: true, onmessage: null}, window);
  bridge.postMessage = exportFunction(message => port.postMessage({request: String(message)}), window);
  Object.defineProperty(page, 'MoyuNative', {value: bridge, configurable: false});
  port.onMessage.addListener(message => {
    if (message.reply !== undefined) page.MoyuNative.onmessage?.(cloneInto({data: message.reply}, window));
    else if (message.event) {
      try {page.dispatchEvent(new page.CustomEvent(message.event, cloneInto({detail: message.detail}, window)));}
      finally {if (Number.isInteger(message.viewportSequence)) port.postMessage({viewportAck: message.viewportSequence});}
    }
    else if (message.blur) page.document.activeElement?.blur();
  });
  port.onDisconnect.addListener(() => {page.MoyuNative.connected=false;page.dispatchEvent(new page.Event('moyu-native-disconnected'));});
  port.postMessage({viewportReady:true});
}
