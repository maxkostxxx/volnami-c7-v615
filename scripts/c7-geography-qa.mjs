#!/usr/bin/env node
import assert from 'node:assert/strict'
import {writeFile} from 'node:fs/promises'
import {basinGeometry,shore,shoreDistance,WATER_LEVEL} from '../app/c7/scene/geography.ts'

const results=[]
for(const low of [true,false]) {
  const land=basinGeometry('land',low),water=basinGeometry('water',low)
  const l=land.attributes.position,w=water.attributes.position,n=shore.length+1
  let maxBankError=0
  for(let i=0;i<n;i++)for(let axis=0;axis<3;axis++)maxBankError=Math.max(maxBankError,Math.abs(l.array[i*3+axis]-w.array[(w.count-n+i)*3+axis]))
  assert(maxBankError<1e-6,'Land and water must use identical boundary vertices')
  for(const [name,g] of [['land',land],['water',water]]) {
    const p=g.attributes.position,normal=g.attributes.normal,idx=g.index.array
    let inverted=0,degenerate=0,outsideDomain=0,maxNormalError=0
    for(let i=0;i<idx.length;i+=3){const [a,b,c]=[idx[i],idx[i+1],idx[i+2]]
      const y=(p.getZ(b)-p.getZ(a))*(p.getX(c)-p.getX(a))-(p.getX(b)-p.getX(a))*(p.getZ(c)-p.getZ(a))
      if(y<-.0001)inverted++;if(Math.abs(y)<.0001)degenerate++
    }
    for(let i=0;i<p.count;i++) {
      assert(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)))
      const distance=shoreDistance(p.getX(i),p.getZ(i))
      if(name==='water'&&distance>.001)outsideDomain++
      if(name==='land'&&distance<-.001)outsideDomain++
      if(name==='water')assert(Math.abs(p.getY(i)-WATER_LEVEL)<1e-6)
      maxNormalError=Math.max(maxNormalError,Math.abs(Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i))-1))
    }
    assert.equal(inverted,0);assert.equal(degenerate,0);assert.equal(outsideDomain,0)
    assert(maxNormalError<1e-5)
    results.push({name,low,vertices:p.count,triangles:idx.length/3,inverted,degenerate,outsideDomain,maxBankError,maxNormalError})
    g.dispose()
  }
}
console.log(JSON.stringify(results,null,2))
if(process.env.QA_OUTPUT)await writeFile(process.env.QA_OUTPUT,JSON.stringify(results,null,2))
