// Packaged exclusively in the debuggable test application.
if (window === window.top && /^\/[a-f0-9]{64}\/mobile\.html$/.test(location.pathname)) {
  const port = browser.runtime.connectNative('moyu_test');
  port.onMessage.addListener(async ({id, expression}) => {
    try { const value = await window.wrappedJSObject.eval(expression); port.postMessage({id, ok: true, payload: JSON.stringify(value ?? null)}); }
    catch (error) { port.postMessage({id, ok: false, error: String(error), stack: String(error?.stack)}); }
  });
}
