import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export function AnnotationPopover({ anchor, onClose, children, className = '', ...props }) {
  const ref = useRef();
  const [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const win = anchor.ownerDocument.defaultView;
    let frame;
    const place = () => {
      const rect = anchor.getBoundingClientRect(), element = ref.current;
      const view = win.visualViewport;
      const left = view?.offsetLeft ?? 0, top = view?.offsetTop ?? 0;
      const width = view?.width ?? win.innerWidth, height = view?.height ?? win.innerHeight;
      if (!element || !anchor.isConnected || !rect.width || !rect.height || win.getComputedStyle(anchor).visibility !== 'visible' || rect.bottom < top || rect.top > top + height || rect.right < left || rect.left > left + width) { onClose(); return false; }
      const maxWidth = Math.max(0, width - 16), maxHeight = Math.max(0, Math.min(420, height - 16));
      if (element.style.maxWidth !== `${maxWidth}px`) element.style.maxWidth = `${maxWidth}px`;
      if (element.style.maxHeight !== `${maxHeight}px`) element.style.maxHeight = `${maxHeight}px`;
      const box = element.getBoundingClientRect();
      const above = rect.top - top, below = top + height - rect.bottom;
      const y = below >= box.height + 6 || below >= above ? rect.bottom + 6 : rect.top - box.height - 6;
      const next = { left: Math.max(left + 8, Math.min(rect.left, left + width - box.width - 8)), top: Math.max(top + 8, Math.min(y, top + height - box.height - 8)), maxWidth, maxHeight };
      setPosition(previous => previous && Object.keys(next).every(key => previous[key] === next[key]) ? previous : next);
      return true;
    };
    const track = () => { if (place()) frame = win.requestAnimationFrame(track); };
    place();
    // Only open popovers track position; transforms and pane animations can
    // move an anchor without emitting a resize/scroll or changing its size.
    frame = win.requestAnimationFrame(track);
    const controls = () => [...ref.current.querySelectorAll('button,input,textarea,select,a[href],[tabindex]')].filter(node => node.tabIndex >= 0 && !node.disabled);
    const fromAnchor = event => {
      const first = controls()[0];
      if (first && (event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey))) { event.preventDefault();first.focus(); }
    };
    const within = event => {
      if (event.key === 'Escape') { event.preventDefault();event.stopPropagation();anchor.focus();onClose();return; }
      if (event.key !== 'Tab') return;
      const buttons = controls();
      if (event.shiftKey && event.target === buttons[0]) { event.preventDefault();anchor.focus(); }
      else if (!event.shiftKey && event.target === buttons.at(-1)) {
        const all = [...anchor.ownerDocument.querySelectorAll('button,input,textarea,select,a[href],iframe,[tabindex]')].filter(node => !ref.current.contains(node) && node.tabIndex >= 0 && !node.disabled && !node.closest('[inert]') && node.getBoundingClientRect().width > 0 && win.getComputedStyle(node).visibility === 'visible');
        const next = all[all.indexOf(anchor) + 1];
        if (next) { event.preventDefault();next.focus(); }
      }
    };
    anchor.addEventListener('keydown', fromAnchor);ref.current.addEventListener('keydown', within);
    const popup = ref.current;
    return () => { win.cancelAnimationFrame(frame);anchor.removeEventListener('keydown', fromAnchor);popup.removeEventListener('keydown', within); };
  }, [anchor, onClose]);
  if (!anchor) return null;
  return createPortal(<div ref={ref} {...props} onMouseLeave={event => { const focused=anchor.ownerDocument.activeElement;if(focused!==anchor&&!ref.current.contains(focused))props.onMouseLeave?.(event); }} className={`amadeus-annotation-popover ${className}`} style={position ?? { left: 0, top: 0, visibility: 'hidden' }}>{children}</div>, anchor.ownerDocument.body);
}
