import { defineConfig } from '@playwright/test';
const port=Number(process.env.MOYU_MOBILE_TEST_PORT||5184),baseURL='http://127.0.0.1:'+port;
export default defineConfig({
  testDir:'./tests',testMatch:'mobile-*.spec.ts',outputDir:'test-results/mobile',workers:1,timeout:60000,expect:{timeout:10000},
  reporter:'list',use:{baseURL,trace:'retain-on-failure',viewport:{width:393,height:851},isMobile:true,hasTouch:true,deviceScaleFactor:1},
  webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port '+port+' --strictPort',url:baseURL+'/mobile.html',reuseExistingServer:!process.env.CI,timeout:60000},
});
