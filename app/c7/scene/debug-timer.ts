// Debug-only asynchronous GPU timing. A rAF interval is not a GPU duration.
// Spec: https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/
export function createDebugTimer(gl: WebGL2RenderingContext, enabled: boolean) {
  const extension=enabled?gl.getExtension('EXT_disjoint_timer_query_webgl2'):null
  const pending:WebGLQuery[]=[]
  let active:WebGLQuery|null=null, samples=0,disjoint=0,ms:number|null=null
  const clear=()=>{for(const query of pending)if(gl.isQuery(query))gl.deleteQuery(query);pending.length=0}
  return {
    begin() {
      if(!extension||gl.isContextLost())return
      if(gl.getParameter(extension.GPU_DISJOINT_EXT)){clear();ms=null;disjoint++;return}
      while(pending.length&&!gl.isQuery(pending[0]))pending.shift()
      while(pending.length&&gl.getQueryParameter(pending[0],gl.QUERY_RESULT_AVAILABLE)){
        const query=pending.shift()!
        ms=Number(gl.getQueryParameter(query,gl.QUERY_RESULT))/1e6;samples++
        gl.deleteQuery(query)
      }
      if(pending.length<4){active=gl.createQuery();if(active)gl.beginQuery(extension.TIME_ELAPSED_EXT,active)}
    },
    end(){if(active&&extension){gl.endQuery(extension.TIME_ELAPSED_EXT);pending.push(active);active=null}},
    read:()=>({supported:Boolean(extension),samples,ms,disjoint}),
    dispose(){if(active&&extension){gl.endQuery(extension.TIME_ELAPSED_EXT);gl.deleteQuery(active);active=null}clear()},
  }
}
