import { Vector3, MathUtils } from 'three'

// A single world-space ephemeris owns disc, key, sky, fill and water. Values
// are an authored day, not astronomical time. z places the disc beyond all land.
const stops = [
  [0, -1160, 28], [0.08, -1030, 260], [0.16, -820, 500],
  [0.30, -340, 820], [0.47, 240, 1030], [0.66, 700, 660],
  [0.79, 860, 350], [0.835, 930, 240],
  [0.93, 1020, 135], [1, 1100, -60],
]
const smooth=(a:number,b:number,x:number)=>{const t=MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)}
export function solarState(progress:number,position:Vector3,portrait=0,horizontalLimit=1) {
  const p=MathUtils.clamp(progress,0,1)
  let i=0
  while(i<stops.length-2 && p>stops[i+1][0])i++
  const a=stops[i],b=stops[i+1],before=stops[Math.max(0,i-1)],after=stops[Math.min(stops.length-1,i+2)]
  const span=b[0]-a[0],t=(p-a[0])/span,t2=t*t,t3=t2*t
  const sample=(axis:number)=>{
    const m0=(b[axis]-before[axis])/(b[0]-before[0]),m1=(after[axis]-a[axis])/(after[0]-a[0])
    return (2*t3-3*t2+1)*a[axis]+(t3-2*t2+t)*span*m0+(-2*t3+3*t2)*b[axis]+(t3-t2)*span*m1
  }
  // The intermediate tablet framing crosses a lower distant crest. Keep a
  // visible emergence there; endpoint phone/desktop paths stay unchanged.
  const dawnOffset=29*portrait-150*portrait*(1-portrait)
  position.set(sample(1)*Math.min(MathUtils.lerp(1,0.345,portrait),horizontalLimit),
    sample(2)+dawnOffset*(1-smooth(0,.16,p)),-2000)
  const day=smooth(70,760,position.y)
  const dusk=smooth(.5,.7,p)*(1-day)
  return {day,dusk,altitude:Math.atan2(position.y,Math.hypot(position.x,1950))}
}
