export * from '@playwright/test';
import {test as base, expect} from '@playwright/test';

/** Every mobile browser case must finish without uncaught application errors. */
export const test = base.extend<{runtimeErrorGuard: void}>({
  runtimeErrorGuard: [async ({context}, use) => {
    const errors: string[] = [];
    await context.exposeBinding('__moyuTestApplicationError',({frame},message:string)=>{
      if(frame===frame.page().mainFrame())errors.push(message);
    });
    await context.addInitScript(()=>{
      if(window!==window.top)return;
      const report=(reason:unknown)=>{
        const message=reason instanceof Error?reason.stack||reason.message:String(reason);
        void (window as any).__moyuTestApplicationError(message).catch(()=>{});
      };
      window.addEventListener('error',event=>{if(event.error||event.message)report(event.error||event.message);});
      window.addEventListener('unhandledrejection',event=>report(event.reason));
    });
    try { await use(); }
    finally {
      expect(errors, 'Uncaught application errors during mobile regression').toEqual([]);
    }
  }, {auto: true}],
});
