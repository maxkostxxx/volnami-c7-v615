import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

// One browser ESM, using the pinned tools already supplied by Next. The
// authoring modules remain separate; no cache/config/environment mutation.
// URLs are authored relative to the runtime root and stay relative to this
// bundle. terrain.js remains a payload-validation source file beside it.
export async function bundleWorld(runtimeRoot,entry='world.js') {
 const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
 const {minify}=require('next/dist/compiled/terser');
 const compiler=webpackModule.webpack({
  mode:'production',target:['web','es2022'],entry:path.resolve(runtimeRoot,entry),
  cache:false,devtool:false,experiments:{outputModule:true},
  output:{path:path.resolve(runtimeRoot),filename:entry,module:true,library:{type:'module'}},
  module:{parser:{javascript:{url:false,importMeta:false}}},
  optimization:{minimize:false,usedExports:true,sideEffects:true,concatenateModules:true},performance:{hints:false},
 });
 // Capture the compilation in memory. The caller owns all output writes and
 // its SHA manifest; webpack never overwrites its input entry or writes cache.
 compiler.hooks.shouldEmit.tap('C7InMemoryBundle',()=>false);
 let stats;
 try{
  stats=await new Promise((resolve,reject)=>compiler.run((error,value)=>error?reject(error):resolve(value)));
  if(stats.hasErrors()||stats.hasWarnings())throw Error(stats.toString({all:false,errors:true,warnings:true}));
  const source=String(stats.compilation.getAsset(entry).source.source());
  const {code}=await minify(source,{module:true,compress:{passes:2},mangle:true,format:{comments:/@license|^!/}});
  if(!code||code.includes('file:///'))throw Error('Invalid world bundle');
  return{code:code+'\n',webpack:webpackModule.webpack.version};
 }finally{await new Promise((resolve,reject)=>compiler.close(error=>error?reject(error):resolve()));}
}
