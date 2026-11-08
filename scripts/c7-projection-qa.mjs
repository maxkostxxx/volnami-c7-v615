import {chromium} from 'playwright'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
if(!process.env.QA_OUTPUT)throw new Error('QA_OUTPUT required')
const output=process.env.QA_OUTPUT,base=process.env.QA_BASE_URL??'http://127.0.0.1:3007'
await mkdir(output,{recursive:false})
const build=await(await fetch(base+'/c7-build.json')).json()
for(const [file,hash]of Object.entries(build.sources))if(createHash('sha256').update(await readFile(file)).digest('hex')!==hash)throw new Error('Stale export '+file)
const browser=await chromium.launch({headless:true,args:['--use-angle=metal']}),results=[]
try {
 for(const variant of ['off','terrain','cover','both']) {
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1,reducedMotion:'reduce'}),errors=[]
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
  await page.goto(base+'/c7/?c7-debug&c7-projection='+variant)
  await page.locator('.c7-landscape.is-ready').waitFor({timeout:25000})
  await page.addStyleTag({content:'.c7 > :not(.c7-landscape){visibility:hidden!important}.c7-landscape-fallback,.c7-landscape::after{display:none!important}'})
  await page.evaluate(()=>dispatchEvent(new Event('scroll')));await page.waitForTimeout(200)
  await page.screenshot({path:output+'/'+variant+'.png'})
  results.push({variant,errors});await page.close()
 }
}finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify({build,results},null,2))}
if(results.some(r=>r.errors.length))process.exitCode=1
