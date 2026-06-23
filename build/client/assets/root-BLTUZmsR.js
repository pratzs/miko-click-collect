import{c as f,d as j,e as y,f as w,r as i,_ as S,g as a,j as e,M as g,L as M,O as k,S as c,h as v}from"./components-BoDeMTOT.js";/**
 * @remix-run/react v2.17.5
 *
 * Copyright (c) Remix Software Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.md file in the root directory of this source tree.
 *
 * @license MIT
 */let l="positions";function R({getKey:t,...d}){let{isSpaMode:h}=f(),n=j(),u=y();w({getKey:t,storageKey:l});let m=i.useMemo(()=>{if(!t)return null;let s=t(n,u);return s!==n.key?s:null},[]);if(h)return null;let x=((s,p)=>{if(!window.history.state||!window.history.state.key){let r=Math.random().toString(32).slice(2);window.history.replaceState({key:r},"")}try{let o=JSON.parse(sessionStorage.getItem(s)||"{}")[p||window.history.state.key];typeof o=="number"&&window.scrollTo(0,o)}catch(r){console.error(r),sessionStorage.removeItem(s)}}).toString();return i.createElement("script",S({},d,{suppressHydrationWarning:!0,dangerouslySetInnerHTML:{__html:`(${x})(${a(JSON.stringify(l))}, ${a(JSON.stringify(m))})`}}))}function O(){return e.jsxs("html",{lang:"en",children:[e.jsxs("head",{children:[e.jsx("meta",{charSet:"utf-8"}),e.jsx("meta",{name:"viewport",content:"width=device-width,initial-scale=1"}),e.jsx(g,{}),e.jsx(M,{})]}),e.jsxs("body",{children:[e.jsx(k,{}),e.jsx(R,{}),e.jsx(c,{})]})]})}function L(){const t=v();return t instanceof Response&&(t.status===401||t.status===302)?null:e.jsxs("html",{lang:"en",children:[e.jsxs("head",{children:[e.jsx("meta",{charSet:"utf-8"}),e.jsx("meta",{name:"viewport",content:"width=device-width,initial-scale=1"}),e.jsx("title",{children:"Something went wrong"})]}),e.jsxs("body",{children:[e.jsxs("div",{style:{padding:"2rem",fontFamily:"sans-serif",textAlign:"center"},children:[e.jsx("h1",{children:"Something went wrong"}),e.jsx("p",{children:"Please refresh or return to the app from your Shopify admin."})]}),e.jsx(c,{})]})]})}export{L as ErrorBoundary,O as default};
