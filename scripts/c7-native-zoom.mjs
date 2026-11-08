import {chromium} from 'playwright'
import {mkdir,writeFile,readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const output=process.env.QA_OUTPUT;if(!output)throw new Error('QA_OUTPUT required');await mkdir(output,{recursive:true})
const build=JSON.parse(await readFile('out/c7-build.json','utf8'));for(const[f,h]of Object.entries(build.sources))if(createHash('sha256').update(await readFile(f)).digest('hex')!==h)throw new Error('Stale export')
const browser=await chromium.launch({headless:false,args:['--use-angle=metal','--window-size=1480,1000']}),states=[]
try{const context=await browser.newContext({viewport:null,reducedMotion:'reduce'}),page=await context.newPage();await page.goto('http://127.0.0.1:3007/c7/?c7-debug');await page.locator('.c7-landscape.is-ready').waitFor({timeout:25000})
 const read=()=>page.evaluate(()=>({inner:[innerWidth,innerHeight],outer:[outerWidth,outerHeight],dpr:devicePixelRatio,visualScale:visualViewport.scale,overflow:document.documentElement.scrollWidth-innerWidth}))
 states.push(await read());for(let i=0;i<5;i++){await page.keyboard.press('Meta+Equal');await page.waitForTimeout(150);states.push(await read())}
 const before=states[0],after=states.at(-1),native200=Math.abs(after.dpr/before.dpr-2)<.02&&Math.abs(after.inner[0]/before.inner[0]-.5)<.02&&after.outer[0]===before.outer[0]
 if(native200){await page.screenshot({path:output+'/native-200-hero.jpg',type:'jpeg',quality:78});for(const id of['process','testimonials','contacts']){await page.locator('#'+id).scrollIntoViewIfNeeded();await page.waitForTimeout(150);states.push({id,...await read()});await page.screenshot({path:output+'/native-200-'+id+'.jpg',type:'jpeg',quality:78})}}
 await page.keyboard.press('Meta+0');await page.waitForTimeout(150);const restored=await read();await writeFile(output+'/results.json',JSON.stringify({build,states,native200,restored,note:'Visible Chromium with viewport:null; attempted browser keyboard zoom. PASS only if unchanged outer width, halved CSS width and doubled native DPR; no CSS viewport/pageScale emulation used.'},null,2));console.log(native200?'Native browser200% verified':'Keyboard shortcut did not produce verified native200%; unverified')
}finally{await browser.close()}
