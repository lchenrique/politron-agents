import "@testing-library/jest-dom";
import { TestDOMRect } from './dom-rect'

// jsdom 20 não fornece DOMRect; painéis usam geometria real para hit targets.
if (typeof globalThis.DOMRect !== 'function') {
  Object.defineProperty(globalThis, 'DOMRect', { configurable: true, writable: true, value: TestDOMRect })
  if (typeof window !== 'undefined') Object.defineProperty(window, 'DOMRect', { configurable: true, writable: true, value: TestDOMRect })
}

// APIs de layout não existem no jsdom, mas são utilizadas pelo Radix/shadcn.
if (typeof ResizeObserver === 'undefined') {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  })
}
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

if (typeof window !== "undefined") {
 // Motion mede transições usando scrollTo, que não existe no jsdom.
 window.scrollTo = () => {}

 Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
   matches: false,
   media: query,
   onchange: null,
   addListener: () => {},
   removeListener: () => {},
   addEventListener: () => {},
   removeEventListener: () => {},
   dispatchEvent: () => {},
  }),
 })
}
