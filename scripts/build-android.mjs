import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import variants from '../shared/android-variants.json' with {type:'json'};
const root=path.resolve(import.meta.dirname,'..'),android=path.join(root,'android');
const gecko=!process.argv.includes('--system-webview'),abi=process.argv.find(arg=>arg.startsWith('--abi='))?.slice(6)||'arm64-v8a';
const engine=gecko?'gecko':'webview',variant=variants[engine];
if(gecko&&!['arm64-v8a','x86_64'].includes(abi))throw Error('GeckoView ABI must be arm64-v8a or x86_64.');
const mobileBuild=JSON.parse(await fs.readFile(path.join(root,'shared/mobile-build.json'),'utf8'));
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
if(mobileBuild.version!==pkg.version)throw Error('Android and desktop versions must match.');
const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java'):'java';
async function run(command,args,options={}) {
  const child=spawn(command,args,{cwd:root,stdio:'inherit',windowsHide:true,...options});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  if(code!==0)throw Error(command+' exited with '+code);
}
if(!process.env.ANDROID_HOME&&!process.env.ANDROID_SDK_ROOT)throw Error('Set ANDROID_HOME to an installed Android SDK (platform 37.2, build-tools 36.0.0).');
await run(process.execPath,['node_modules/typescript/bin/tsc','--noEmit']);
await run(process.execPath,['node_modules/vite/bin/vite.js','build','--config','vite.mobile.config.ts','--logLevel','warn']);
await fs.cp(path.join(root,'public/excalidraw'),path.join(android,'app/src/main/assets/web/excalidraw'),{recursive:true});
await fs.cp(path.join(root,'public/file-icons'),path.join(android,'app/src/main/assets/web/file-icons'),{recursive:true});
await fs.mkdir(path.join(android,'app/src/main/assets/guides'),{recursive:true});
await fs.copyFile(path.join(android,'guide.md'),path.join(android,'app/src/main/assets/guides/开始使用.md'));
const examples=path.resolve(android,'app/src/main/assets/examples');
if(!examples.startsWith(android+path.sep))throw Error('Example output must stay inside the Android project.');
await fs.rm(examples,{recursive:true,force:true});
await fs.mkdir(examples,{recursive:true});
await fs.cp(path.join(root,'resources/workspace-guide/数据结构'),path.join(examples,'数据结构'),{recursive:true});
if(gecko){
  const licenses=path.join(android,'app/src/main/assets/web/licenses');await fs.mkdir(licenses,{recursive:true});
  await fs.copyFile(path.join(root,'resources/licenses/Mozilla-MPL-2.0.txt'),path.join(licenses,'Mozilla-MPL-2.0.txt'));
  await fs.copyFile(path.join(root,'THIRD_PARTY_NOTICES.md'),path.join(licenses,'THIRD_PARTY_NOTICES.md'));
}
const signing=path.join(android,'signing'),properties=path.join(signing,'moyu-release.properties');
try{await fs.access(properties);}catch{
  await fs.mkdir(signing,{recursive:true});
  const keyFile=path.join(signing,'moyu-release.jks');
  try{await fs.access(keyFile);throw Error('The Android signing key exists but its properties are missing. Restore the matching properties before building.');}catch(error){if(error.code!=='ENOENT')throw error;}
  const secret=crypto.randomBytes(32).toString('hex'),keytool=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'keytool.exe':'keytool'):'keytool';
  await run(keytool,['-genkeypair','-alias','moyu','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Lenslet Android','-keystore',keyFile,'-storepass:env','MOYU_KEY_PASSWORD','-keypass:env','MOYU_KEY_PASSWORD'],{env:{...process.env,MOYU_KEY_PASSWORD:secret}});
  await fs.writeFile(properties,`storePassword=${secret}\nkeyPassword=${secret}\n`,{mode:0o600});
}
const tasks=process.argv.includes('--debug')?[':app:assembleDebug',':app:assembleDebugAndroidTest',':app:testDebugUnitTest']:[':app:assembleRelease',':app:testReleaseUnitTest'];
await run(java,['-classpath',path.join(android,'gradle/wrapper/gradle-wrapper.jar'),'org.gradle.wrapper.GradleWrapperMain','--no-daemon','--console=plain','-PmoyuEngine='+engine,...(gecko?['-PmoyuAbi='+abi]:[]),...(process.argv.includes('--offline')?['--offline']:[]),...tasks],{cwd:android});
if(!process.argv.includes('--debug')){
  const output=path.join(root,'release/android/v'+mobileBuild.version),name='Lenslet-Android-'+mobileBuild.version+variant.assetSuffix+(gecko&&abi==='x86_64'?'-x86_64':'')+'.apk';await fs.mkdir(output,{recursive:true});
  const target=path.join(output,name);await fs.copyFile(path.join(android,'app',gecko?'build-gecko-main-'+abi:'build-webview','outputs/apk/release/app-release.apk'),target);
  const hash=crypto.createHash('sha256').update(await fs.readFile(target)).digest('hex');await fs.writeFile(path.join(output,name+'.sha256'),hash+'  '+name+'\n');
  const checksums=[];for(const file of (await fs.readdir(output)).filter(file=>file.endsWith('.apk.sha256')).sort())checksums.push(await fs.readFile(path.join(output,file),'utf8'));
  await fs.writeFile(path.join(output,'SHA256SUMS.txt'),checksums.join(''));
  console.log('Android APK:',target);
}
