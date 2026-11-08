// Yield between deterministic construction batches; never change geometry or RNG.
export function finishBuild(iterator) {
  let result;
  do { result = iterator.next(); } while (!result.done);
  return result.value;
}
export async function finishBuildAsync(iterator, { signal, budgetMs = 8, timerYieldMs = 48 } = {}) {
  let completed = false, started = performance.now(), lastTimerYield = started;
  let channel;
  const yieldMessage = () => new Promise(resolve => {
    channel ??= new MessageChannel();
    channel.port1.onmessage = resolve;
    channel.port2.postMessage(null);
  });
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException('C7 construction aborted', 'AbortError');
      const result = iterator.next();
      if (result.done) { completed = true; return result.value; }
      if (performance.now() - started >= budgetMs) {
        // Native continuations reduce timer overhead, but can outrank timers.
        // Periodically use the timer queue so abort timers and equal-priority
        // application work are not starved by a long sequence of continuations.
        if (typeof globalThis.scheduler?.yield === 'function' && performance.now() - lastTimerYield < timerYieldMs) {
          await globalThis.scheduler.yield();
        } else if (typeof MessageChannel === 'function' && performance.now() - lastTimerYield < timerYieldMs) {
          // WebKit lacks scheduler.yield. A message yields to another task
          // without accumulating the nested setTimeout minimum delay.
          await yieldMessage();
        } else {
          await new Promise(resolve => setTimeout(resolve, 0));
          lastTimerYield = performance.now();
        }
        started = performance.now();
      }
    }
  } finally {
    if (channel) { channel.port1.onmessage = null; channel.port1.close(); channel.port2.close(); }
    // Generator finally releases partially constructed geometry on cancellation.
    if (!completed) iterator.return();
  }
}
