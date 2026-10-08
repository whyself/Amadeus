// Animate through the native viewport writer, retaining its semantic anchor.
export function animateQuoteNavigation({ viewport, reading, range, row, turn }) {
  viewport.annotationAnimation?.();
  const elements = viewport.elements, win = row.ownerDocument.defaultView;
  let frame, started, previous;
  const cancel = () => { win.cancelAnimationFrame(frame);if(viewport.annotationAnimation===cancel)viewport.annotationAnimation=null; };
  viewport.annotationAnimation=cancel;
  elements.scroller.setAttribute('data-amadeus-quote-navigation','');
  const step = time => {
    if(viewport.elements!==elements||!row.isConnected||!elements.scroller.hasAttribute('data-amadeus-quote-navigation'))return cancel();
    started ??= time;previous ??= time-16;
    const rect=range.getBoundingClientRect(),bounds=elements.scroller.getBoundingClientRect();
    const height=Math.max(0,Math.min(bounds.bottom,elements.composer?.getBoundingClientRect().top??bounds.bottom)-bounds.top);
    const metrics=viewport.metrics();if(!metrics||!rect.height||!height)return cancel();
    const target=Math.max(0,Math.min(metrics.floor,metrics.top+rect.top-bounds.top-height/2+Math.min(rect.height,height)/2));
    const done=Math.abs(target-metrics.top)<1||time-started>=650;
    const progress=1-Math.exp(-Math.min(64,time-previous)/85);previous=time;
    const next=done?target:metrics.top+(target-metrics.top)*progress;
    const landing=viewport.write(next,metrics,turn,{key:row.dataset.chatAnchorKey,top:row.getBoundingClientRect().top-bounds.top});
    if(!landing)return cancel();
    reading.acceptNavigation(landing);viewport.beginPreserving(landing.position);
    elements.scroller.setAttribute('data-amadeus-quote-navigation','');
    if(done)return cancel();frame=win.requestAnimationFrame(step);
  };
  frame=win.requestAnimationFrame(step);
}
