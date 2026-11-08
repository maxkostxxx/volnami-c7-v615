// Disk-constrained local preview only. Next still compiles and exports routes;
// public asset copies become relative file links to immutable local originals.
// Opt in with C7_LOCAL_ASSET_LINKS=1 when running c7-build-local.mjs.
import fs from 'node:fs'
import path from 'node:path'
const originalCopy=fs.promises.copyFile.bind(fs.promises)
const root=process.cwd(),publicRoot=path.join(root,'public')+path.sep,outRoot=path.join(root,'out')+path.sep
fs.promises.copyFile=async(source,destination,mode)=>{
  const src=path.resolve(String(source)),dst=path.resolve(String(destination))
  if(src.startsWith(publicRoot)&&dst.startsWith(outRoot)){
    const expected=path.join(outRoot,path.relative(publicRoot,src))
    if(dst!==expected)throw new Error('Unexpected local asset destination: '+dst)
    // The exporter has already made the parent. Never replace an existing file.
    try{await fs.promises.symlink(path.relative(path.dirname(dst),src),dst)}
    catch(error){if(error.code!=='EEXIST')throw error}
    return
  }
  return originalCopy(source,destination,mode)
}
