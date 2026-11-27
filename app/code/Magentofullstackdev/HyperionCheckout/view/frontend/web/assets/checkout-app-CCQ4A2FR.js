const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./captcha-field-DxJ7AJVP.js","./checkout-C9dXtvMq.js","./checkout-KfC37MRE.css","./slot-binding-IGMIbl4z.js","./slots-J5OiDHE0.js","./slot-render-CgZVirTT.js","./context-BmzCCr7W.js","./load-script-DNHf_Ah2.js","./shipping-extension-host-BqBFpBF3.js","./call-D1bdsmlj.js","./request-filters-CXELcw_A.js","./payment-host-BPAzmFj7.js","./loading-overlay-CBtZ3XFV.js","./checkout-gift-message-Bw_Qs4MC.js","./checkout-agreements-CgpjYbqb.js","./hyperion-recaptcha-rN8ndbQB.js","./address-fields-Dlk3um_U.js","./runtime-DMZ9AsYC.js","./login-action-sh0Uq97N.js"])))=>i.map(i=>d[i]);
import{S as B,g,d as As,t as d,p as D,s as Ss,a as et,c as Es,b as ke,r as Ps,e as Hs,u as Os,_ as E,o as Ts,m as Rs,f as Fs,h as ue,i as Ns,j as Is,k as S,l as qs,n as Ls,q as Ms,v as ft,w as Bs,x as Us,y as Ye,z as Ds,A as js,B as Vs,C as K,D as C,E as Ws,F as Yt,G as zs,H as G,I as $t,J as yt,K as Gs,L as Ks,M as Ys,N as Js,O as Zs,P as Xs,Q as Qs,R as ei,T as ti,U as si,V as ii,W as ni,X as W,Y as ri,Z as oi,$ as ai,a0 as li,a1 as ci,a2 as di,a3 as hi,a4 as ui,a5 as pi,a6 as _i,a7 as mi,a8 as gi,a9 as fi,aa as $i}from"./checkout-C9dXtvMq.js";/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const pe=globalThis,tt=pe.ShadowRoot&&(pe.ShadyCSS===void 0||pe.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,Jt=Symbol(),bt=new WeakMap;let yi=class{constructor(e,t,n){if(this._$cssResult$=!0,n!==Jt)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=t}get styleSheet(){let e=this.o;const t=this.t;if(tt&&e===void 0){const n=t!==void 0&&t.length===1;n&&(e=bt.get(t)),e===void 0&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),n&&bt.set(t,e))}return e}toString(){return this.cssText}};const bi=i=>new yi(typeof i=="string"?i:i+"",void 0,Jt),vi=(i,e)=>{if(tt)i.adoptedStyleSheets=e.map(t=>t instanceof CSSStyleSheet?t:t.styleSheet);else for(const t of e){const n=document.createElement("style"),s=pe.litNonce;s!==void 0&&n.setAttribute("nonce",s),n.textContent=t.cssText,i.appendChild(n)}},vt=tt?i=>i:i=>i instanceof CSSStyleSheet?(e=>{let t="";for(const n of e.cssRules)t+=n.cssText;return bi(t)})(i):i;/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const{is:xi,defineProperty:ki,getOwnPropertyDescriptor:wi,getOwnPropertyNames:Ci,getOwnPropertySymbols:Ai,getPrototypeOf:Si}=Object,Pe=globalThis,xt=Pe.trustedTypes,Ei=xt?xt.emptyScript:"",Pi=Pe.reactiveElementPolyfillSupport,ne=(i,e)=>i,we={toAttribute(i,e){switch(e){case Boolean:i=i?Ei:null;break;case Object:case Array:i=i==null?i:JSON.stringify(i)}return i},fromAttribute(i,e){let t=i;switch(e){case Boolean:t=i!==null;break;case Number:t=i===null?null:Number(i);break;case Object:case Array:try{t=JSON.parse(i)}catch{t=null}}return t}},st=(i,e)=>!xi(i,e),kt={attribute:!0,type:String,converter:we,reflect:!1,useDefault:!1,hasChanged:st};Symbol.metadata??=Symbol("metadata"),Pe.litPropertyMetadata??=new WeakMap;let z=class extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??=[]).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,t=kt){if(t.state&&(t.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((t=Object.create(t)).wrapped=!0),this.elementProperties.set(e,t),!t.noAccessor){const n=Symbol(),s=this.getPropertyDescriptor(e,n,t);s!==void 0&&ki(this.prototype,e,s)}}static getPropertyDescriptor(e,t,n){const{get:s,set:r}=wi(this.prototype,e)??{get(){return this[t]},set(o){this[t]=o}};return{get:s,set(o){const l=s?.call(this);r?.call(this,o),this.requestUpdate(e,l,n)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??kt}static _$Ei(){if(this.hasOwnProperty(ne("elementProperties")))return;const e=Si(this);e.finalize(),e.l!==void 0&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(ne("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(ne("properties"))){const t=this.properties,n=[...Ci(t),...Ai(t)];for(const s of n)this.createProperty(s,t[s])}const e=this[Symbol.metadata];if(e!==null){const t=litPropertyMetadata.get(e);if(t!==void 0)for(const[n,s]of t)this.elementProperties.set(n,s)}this._$Eh=new Map;for(const[t,n]of this.elementProperties){const s=this._$Eu(t,n);s!==void 0&&this._$Eh.set(s,t)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){const t=[];if(Array.isArray(e)){const n=new Set(e.flat(1/0).reverse());for(const s of n)t.unshift(vt(s))}else e!==void 0&&t.push(vt(e));return t}static _$Eu(e,t){const n=t.attribute;return n===!1?void 0:typeof n=="string"?n:typeof e=="string"?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise(e=>this.enableUpdating=e),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach(e=>e(this))}addController(e){(this._$EO??=new Set).add(e),this.renderRoot!==void 0&&this.isConnected&&e.hostConnected?.()}removeController(e){this._$EO?.delete(e)}_$E_(){const e=new Map,t=this.constructor.elementProperties;for(const n of t.keys())this.hasOwnProperty(n)&&(e.set(n,this[n]),delete this[n]);e.size>0&&(this._$Ep=e)}createRenderRoot(){const e=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return vi(e,this.constructor.elementStyles),e}connectedCallback(){this.renderRoot??=this.createRenderRoot(),this.enableUpdating(!0),this._$EO?.forEach(e=>e.hostConnected?.())}enableUpdating(e){}disconnectedCallback(){this._$EO?.forEach(e=>e.hostDisconnected?.())}attributeChangedCallback(e,t,n){this._$AK(e,n)}_$ET(e,t){const n=this.constructor.elementProperties.get(e),s=this.constructor._$Eu(e,n);if(s!==void 0&&n.reflect===!0){const r=(n.converter?.toAttribute!==void 0?n.converter:we).toAttribute(t,n.type);this._$Em=e,r==null?this.removeAttribute(s):this.setAttribute(s,r),this._$Em=null}}_$AK(e,t){const n=this.constructor,s=n._$Eh.get(e);if(s!==void 0&&this._$Em!==s){const r=n.getPropertyOptions(s),o=typeof r.converter=="function"?{fromAttribute:r.converter}:r.converter?.fromAttribute!==void 0?r.converter:we;this._$Em=s;const l=o.fromAttribute(t,r.type);this[s]=l??this._$Ej?.get(s)??l,this._$Em=null}}requestUpdate(e,t,n,s=!1,r){if(e!==void 0){const o=this.constructor;if(s===!1&&(r=this[e]),n??=o.getPropertyOptions(e),!((n.hasChanged??st)(r,t)||n.useDefault&&n.reflect&&r===this._$Ej?.get(e)&&!this.hasAttribute(o._$Eu(e,n))))return;this.C(e,t,n)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(e,t,{useDefault:n,reflect:s,wrapped:r},o){n&&!(this._$Ej??=new Map).has(e)&&(this._$Ej.set(e,o??t??this[e]),r!==!0||o!==void 0)||(this._$AL.has(e)||(this.hasUpdated||n||(t=void 0),this._$AL.set(e,t)),s===!0&&this._$Em!==e&&(this._$Eq??=new Set).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(t){Promise.reject(t)}const e=this.scheduleUpdate();return e!=null&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??=this.createRenderRoot(),this._$Ep){for(const[s,r]of this._$Ep)this[s]=r;this._$Ep=void 0}const n=this.constructor.elementProperties;if(n.size>0)for(const[s,r]of n){const{wrapped:o}=r,l=this[s];o!==!0||this._$AL.has(s)||l===void 0||this.C(s,void 0,r,l)}}let e=!1;const t=this._$AL;try{e=this.shouldUpdate(t),e?(this.willUpdate(t),this._$EO?.forEach(n=>n.hostUpdate?.()),this.update(t)):this._$EM()}catch(n){throw e=!1,this._$EM(),n}e&&this._$AE(t)}willUpdate(e){}_$AE(e){this._$EO?.forEach(t=>t.hostUpdated?.()),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&=this._$Eq.forEach(t=>this._$ET(t,this[t])),this._$EM()}updated(e){}firstUpdated(e){}};z.elementStyles=[],z.shadowRootOptions={mode:"open"},z[ne("elementProperties")]=new Map,z[ne("finalized")]=new Map,Pi?.({ReactiveElement:z}),(Pe.reactiveElementVersions??=[]).push("2.1.2");/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const it=globalThis,wt=i=>i,Ce=it.trustedTypes,Ct=Ce?Ce.createPolicy("lit-html",{createHTML:i=>i}):void 0,Zt="$lit$",N=`lit$${Math.random().toFixed(9).slice(2)}$`,Xt="?"+N,Hi=`<${Xt}>`,U=document,re=()=>U.createComment(""),oe=i=>i===null||typeof i!="object"&&typeof i!="function",nt=Array.isArray,Oi=i=>nt(i)||typeof i?.[Symbol.iterator]=="function",Ne=`[ 	
\f\r]`,ee=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,At=/-->/g,St=/>/g,q=RegExp(`>|${Ne}(?:([^\\s"'>=/]+)(${Ne}*=${Ne}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),Et=/'/g,Pt=/"/g,Qt=/^(?:script|style|textarea|title)$/i,Ti=i=>(e,...t)=>({_$litType$:i,strings:e,values:t}),c=Ti(1),I=Symbol.for("lit-noChange"),h=Symbol.for("lit-nothing"),Ht=new WeakMap,M=U.createTreeWalker(U,129);function es(i,e){if(!nt(i)||!i.hasOwnProperty("raw"))throw Error("invalid template strings array");return Ct!==void 0?Ct.createHTML(e):e}const Ri=(i,e)=>{const t=i.length-1,n=[];let s,r=e===2?"<svg>":e===3?"<math>":"",o=ee;for(let l=0;l<t;l++){const a=i[l];let u,m,p=-1,f=0;for(;f<a.length&&(o.lastIndex=f,m=o.exec(a),m!==null);)f=o.lastIndex,o===ee?m[1]==="!--"?o=At:m[1]!==void 0?o=St:m[2]!==void 0?(Qt.test(m[2])&&(s=RegExp("</"+m[2],"g")),o=q):m[3]!==void 0&&(o=q):o===q?m[0]===">"?(o=s??ee,p=-1):m[1]===void 0?p=-2:(p=o.lastIndex-m[2].length,u=m[1],o=m[3]===void 0?q:m[3]==='"'?Pt:Et):o===Pt||o===Et?o=q:o===At||o===St?o=ee:(o=q,s=void 0);const y=o===q&&i[l+1].startsWith("/>")?" ":"";r+=o===ee?a+Hi:p>=0?(n.push(u),a.slice(0,p)+Zt+a.slice(p)+N+y):a+N+(p===-2?l:y)}return[es(i,r+(i[t]||"<?>")+(e===2?"</svg>":e===3?"</math>":"")),n]};class ae{constructor({strings:e,_$litType$:t},n){let s;this.parts=[];let r=0,o=0;const l=e.length-1,a=this.parts,[u,m]=Ri(e,t);if(this.el=ae.createElement(u,n),M.currentNode=this.el.content,t===2||t===3){const p=this.el.content.firstChild;p.replaceWith(...p.childNodes)}for(;(s=M.nextNode())!==null&&a.length<l;){if(s.nodeType===1){if(s.hasAttributes())for(const p of s.getAttributeNames())if(p.endsWith(Zt)){const f=m[o++],y=s.getAttribute(p).split(N),$=/([.?@])?(.*)/.exec(f);a.push({type:1,index:r,name:$[2],strings:y,ctor:$[1]==="."?Ni:$[1]==="?"?Ii:$[1]==="@"?qi:He}),s.removeAttribute(p)}else p.startsWith(N)&&(a.push({type:6,index:r}),s.removeAttribute(p));if(Qt.test(s.tagName)){const p=s.textContent.split(N),f=p.length-1;if(f>0){s.textContent=Ce?Ce.emptyScript:"";for(let y=0;y<f;y++)s.append(p[y],re()),M.nextNode(),a.push({type:2,index:++r});s.append(p[f],re())}}}else if(s.nodeType===8)if(s.data===Xt)a.push({type:2,index:r});else{let p=-1;for(;(p=s.data.indexOf(N,p+1))!==-1;)a.push({type:7,index:r}),p+=N.length-1}r++}}static createElement(e,t){const n=U.createElement("template");return n.innerHTML=e,n}}function Y(i,e,t=i,n){if(e===I)return e;let s=n!==void 0?t._$Co?.[n]:t._$Cl;const r=oe(e)?void 0:e._$litDirective$;return s?.constructor!==r&&(s?._$AO?.(!1),r===void 0?s=void 0:(s=new r(i),s._$AT(i,t,n)),n!==void 0?(t._$Co??=[])[n]=s:t._$Cl=s),s!==void 0&&(e=Y(i,s._$AS(i,e.values),s,n)),e}class Fi{constructor(e,t){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=t}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){const{el:{content:t},parts:n}=this._$AD,s=(e?.creationScope??U).importNode(t,!0);M.currentNode=s;let r=M.nextNode(),o=0,l=0,a=n[0];for(;a!==void 0;){if(o===a.index){let u;a.type===2?u=new Z(r,r.nextSibling,this,e):a.type===1?u=new a.ctor(r,a.name,a.strings,this,e):a.type===6&&(u=new Li(r,this,e)),this._$AV.push(u),a=n[++l]}o!==a?.index&&(r=M.nextNode(),o++)}return M.currentNode=U,s}p(e){let t=0;for(const n of this._$AV)n!==void 0&&(n.strings!==void 0?(n._$AI(e,n,t),t+=n.strings.length-2):n._$AI(e[t])),t++}}class Z{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(e,t,n,s){this.type=2,this._$AH=h,this._$AN=void 0,this._$AA=e,this._$AB=t,this._$AM=n,this.options=s,this._$Cv=s?.isConnected??!0}get parentNode(){let e=this._$AA.parentNode;const t=this._$AM;return t!==void 0&&e?.nodeType===11&&(e=t.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,t=this){e=Y(this,e,t),oe(e)?e===h||e==null||e===""?(this._$AH!==h&&this._$AR(),this._$AH=h):e!==this._$AH&&e!==I&&this._(e):e._$litType$!==void 0?this.$(e):e.nodeType!==void 0?this.T(e):Oi(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==h&&oe(this._$AH)?this._$AA.nextSibling.data=e:this.T(U.createTextNode(e)),this._$AH=e}$(e){const{values:t,_$litType$:n}=e,s=typeof n=="number"?this._$AC(e):(n.el===void 0&&(n.el=ae.createElement(es(n.h,n.h[0]),this.options)),n);if(this._$AH?._$AD===s)this._$AH.p(t);else{const r=new Fi(s,this),o=r.u(this.options);r.p(t),this.T(o),this._$AH=r}}_$AC(e){let t=Ht.get(e.strings);return t===void 0&&Ht.set(e.strings,t=new ae(e)),t}k(e){nt(this._$AH)||(this._$AH=[],this._$AR());const t=this._$AH;let n,s=0;for(const r of e)s===t.length?t.push(n=new Z(this.O(re()),this.O(re()),this,this.options)):n=t[s],n._$AI(r),s++;s<t.length&&(this._$AR(n&&n._$AB.nextSibling,s),t.length=s)}_$AR(e=this._$AA.nextSibling,t){for(this._$AP?.(!1,!0,t);e!==this._$AB;){const n=wt(e).nextSibling;wt(e).remove(),e=n}}setConnected(e){this._$AM===void 0&&(this._$Cv=e,this._$AP?.(e))}}class He{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,t,n,s,r){this.type=1,this._$AH=h,this._$AN=void 0,this.element=e,this.name=t,this._$AM=s,this.options=r,n.length>2||n[0]!==""||n[1]!==""?(this._$AH=Array(n.length-1).fill(new String),this.strings=n):this._$AH=h}_$AI(e,t=this,n,s){const r=this.strings;let o=!1;if(r===void 0)e=Y(this,e,t,0),o=!oe(e)||e!==this._$AH&&e!==I,o&&(this._$AH=e);else{const l=e;let a,u;for(e=r[0],a=0;a<r.length-1;a++)u=Y(this,l[n+a],t,a),u===I&&(u=this._$AH[a]),o||=!oe(u)||u!==this._$AH[a],u===h?e=h:e!==h&&(e+=(u??"")+r[a+1]),this._$AH[a]=u}o&&!s&&this.j(e)}j(e){e===h?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}}class Ni extends He{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===h?void 0:e}}class Ii extends He{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==h)}}class qi extends He{constructor(e,t,n,s,r){super(e,t,n,s,r),this.type=5}_$AI(e,t=this){if((e=Y(this,e,t,0)??h)===I)return;const n=this._$AH,s=e===h&&n!==h||e.capture!==n.capture||e.once!==n.once||e.passive!==n.passive,r=e!==h&&(n===h||s);s&&this.element.removeEventListener(this.name,this,n),r&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){typeof this._$AH=="function"?this._$AH.call(this.options?.host??this.element,e):this._$AH.handleEvent(e)}}class Li{constructor(e,t,n){this.element=e,this.type=6,this._$AN=void 0,this._$AM=t,this.options=n}get _$AU(){return this._$AM._$AU}_$AI(e){Y(this,e)}}const Mi={I:Z},Bi=it.litHtmlPolyfillSupport;Bi?.(ae,Z),(it.litHtmlVersions??=[]).push("3.3.3");const Ui=(i,e,t)=>{const n=t?.renderBefore??e;let s=n._$litPart$;if(s===void 0){const r=t?.renderBefore??null;n._$litPart$=s=new Z(e.insertBefore(re(),r),r,void 0,t??{})}return s._$AI(i),s};/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const rt=globalThis;let b=class extends z{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){const e=super.createRenderRoot();return this.renderOptions.renderBefore??=e.firstChild,e}update(e){const t=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=Ui(t,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1)}render(){return I}};b._$litElement$=!0,b.finalized=!0,rt.litElementHydrateSupport?.({LitElement:b});const Di=rt.litElementPolyfillSupport;Di?.({LitElement:b});(rt.litElementVersions??=[]).push("4.2.2");/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const ji=Symbol("SignalWatcherBrand"),Vi=new FinalizationRegistry((({watcher:i,signal:e})=>{i.unwatch(e)})),Ot=new WeakMap;function v(i){return i[ji]===!0?(console.warn("SignalWatcher should not be applied to the same class more than once."),i):class extends i{constructor(){super(...arguments),this._$St=new B.State(0),this._$Si=!1,this._$So=!0,this._$Sh=new Set}_$Sl(){if(this._$Su!==void 0)return;this._$Sv=new B.Computed((()=>{this._$St.get(),super.performUpdate()}));const e=this._$Su=new B.subtle.Watcher((function(){const t=Ot.get(this);t!==void 0&&(t._$Si===!1&&t.requestUpdate(),this.watch())}));Ot.set(e,this),Vi.register(this,{watcher:e,signal:this._$Sv}),e.watch(this._$Sv)}_$Sp(){this._$Su!==void 0&&(this._$Su.unwatch(this._$Sv),this._$Sv=void 0,this._$Su=void 0)}performUpdate(){this.isUpdatePending&&(this._$Sl(),this._$Si=!0,this._$St.set(this._$St.get()+1),this._$Si=!1,this._$Sv.get())}update(e){try{this._$So?(this._$So=!1,super.update(e)):this._$Sh.forEach((t=>t.commit()))}finally{this.isUpdatePending=!1,this._$Sh.clear()}}requestUpdate(e,t,n){this._$So=!0,super.requestUpdate(e,t,n)}connectedCallback(){super.connectedCallback(),this.requestUpdate()}disconnectedCallback(){super.disconnectedCallback(),queueMicrotask((()=>{this.isConnected===!1&&this._$Sp()}))}_(e){this._$Sh.add(e);const t=this._$So;this.requestUpdate(),this._$So=t}m(e){this._$Sh.delete(e)}}}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const ts={ATTRIBUTE:1,CHILD:2},ot=i=>(...e)=>({_$litDirective$:i,values:e});let at=class{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,t,n){this._$Ct=e,this._$AM=t,this._$Ci=n}_$AS(e,t){return this.update(e,t)}update(e,t){return this.render(...t)}};/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const{I:Wi}=Mi,Tt=i=>i,Rt=()=>document.createComment(""),te=(i,e,t)=>{const n=i._$AA.parentNode,s=e===void 0?i._$AB:e._$AA;if(t===void 0){const r=n.insertBefore(Rt(),s),o=n.insertBefore(Rt(),s);t=new Wi(r,o,i,i.options)}else{const r=t._$AB.nextSibling,o=t._$AM,l=o!==i;if(l){let a;t._$AQ?.(i),t._$AM=i,t._$AP!==void 0&&(a=i._$AU)!==o._$AU&&t._$AP(a)}if(r!==s||l){let a=t._$AA;for(;a!==r;){const u=Tt(a).nextSibling;Tt(n).insertBefore(a,s),a=u}}}return t},L=(i,e,t=i)=>(i._$AI(e,t),i),zi={},ss=(i,e=zi)=>i._$AH=e,Gi=i=>i._$AH,Ie=i=>{i._$AR(),i._$AA.remove()};/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */B.State;B.Computed;/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Ki={attribute:!0,type:String,converter:we,reflect:!1,hasChanged:st},Yi=(i=Ki,e,t)=>{const{kind:n,metadata:s}=t;let r=globalThis.litPropertyMetadata.get(s);if(r===void 0&&globalThis.litPropertyMetadata.set(s,r=new Map),n==="setter"&&((i=Object.create(i)).wrapped=!0),r.set(t.name,i),n==="accessor"){const{name:o}=t;return{set(l){const a=e.get.call(this);e.set.call(this,l),this.requestUpdate(o,a,i,!0,l)},init(l){return l!==void 0&&this.C(o,void 0,i,l),l}}}if(n==="setter"){const{name:o}=t;return function(l){const a=this[o];e.call(this,l),this.requestUpdate(o,a,i,!0,l)}}throw Error("Unsupported decorator location: "+n)};function _(i){return(e,t)=>typeof t=="object"?Yi(i,e,t):((n,s,r)=>{const o=s.hasOwnProperty(r);return s.constructor.createProperty(r,n),o?Object.getOwnPropertyDescriptor(s,r):void 0})(i,e,t)}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */function P(i){return _({...i,state:!0,attribute:!1})}var Ji=Object.defineProperty,Zi=(i,e,t,n)=>{for(var s=void 0,r=i.length-1,o;r>=0;r--)(o=i[r])&&(s=o(e,t,s)||s);return s&&Ji(e,t,s),s};const Xi=new Set(["order","coupon","contact"]);function Ft(){const i=D();return i?.hyperion?.cartUrl??i?.cartUrl??""}class is extends v(b){constructor(){super(...arguments),this.section="order",this._shown=null,this._waiting=!1,this._waitTimer=null,this._retry=()=>{this._waiting||this._status()?.retry?.()},this._reload=()=>{window.location.reload()}}createRenderRoot(){return this}disconnectedCallback(){super.disconnectedCallback(),this._endWait()}_status(){return g().sectionStatus.get()[this.section]??null}willUpdate(){const e=this._status();if(e===this._shown)return;this._endWait();const t=e?.retryAt===void 0?0:e.retryAt-Date.now();t>0&&(this._waiting=!0,this._waitTimer=setTimeout(()=>{this._waitTimer=null,this._waiting=!1,this.requestUpdate()},t))}render(){const e=this._status();return e===null?h:c`
            <div role=${e.source==="action"?"alert":"status"}
                 tabindex="-1"
                 data-section-status
                 data-kind=${e.kind}
                 class="rounded-md border border-danger/40 bg-danger/5 p-3 flex flex-wrap items-start gap-x-3 gap-y-2 outline-none focus-visible:ring-2 focus-visible:ring-danger">
                <p class="flex-1 text-sm text-error-strong">${e.message}</p>
                ${this._renderAction(e)}
            </div>
        `}updated(){const e=this._status(),t=e!==null&&e!==this._shown;if(this._shown=e,t&&e.source==="action"&&Xi.has(this.section)){const n=()=>{this.querySelector("[data-section-status]")?.focus()};this.closest("[inert]")!==null?setTimeout(n,0):n()}}_renderAction(e){if(e.kind==="quote-gone")return c`<a href=${Ft()}
                           data-section-status-action
                           class="text-sm font-medium text-error-strong underline"
                           @click=${As}>${d("Hyperion_Checkout::return_to_cart")}</a>`;if(e.kind==="stock")return c`<a href=${Ft()}
                           data-section-status-action
                           class="text-sm font-medium text-error-strong underline">${d("Hyperion_Checkout::error_stock_link")}</a>`;if(e.kind==="blocked")return c`<button type="button"
                                data-section-status-action
                                class="text-sm font-medium text-error-strong underline"
                                @click=${this._reload}>${d("Hyperion_Checkout::reload_page")}</button>`;if(!e.retry)return h;const t=e.kind==="order-unknown"?d("Hyperion_Checkout::check_again"):d("Hyperion_Checkout::retry");return c`<button type="button"
                            data-section-status-action
                            class="text-sm font-medium text-error-strong underline aria-disabled:opacity-50 aria-disabled:no-underline"
                            aria-disabled=${this._waiting?"true":"false"}
                            @click=${this._retry}>${t}</button>`}_endWait(){this._waitTimer!==null&&clearTimeout(this._waitTimer),this._waitTimer=null,this._waiting=!1}}Zi([_({type:String})],is.prototype,"section");customElements.get("hc-section-status")||customElements.define("hc-section-status",is);/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Qi=ot(class extends at{constructor(){super(...arguments),this.key=h}render(i,e){return this.key=i,e}update(i,[e,t]){return e!==this.key&&(ss(i),this.key=e),t}}),ns=new B.State(!1);let Nt=null;function en(){return ns.get()||customElements.get("hc-captcha")!==void 0}function tn(){Nt??=E(()=>import("./captcha-field-DxJ7AJVP.js"),__vite__mapDeps([0,1,2]),import.meta.url).then(()=>{ns.set(!0)}).catch(i=>{Nt=null,console.error("[hyperion-checkout] the CAPTCHA field failed to load",i)})}const rs=["pointerdown","keydown","touchstart"];let os=!1;const Ae=new Set;function sn(){for(const i of rs)document.addEventListener(i,as,{capture:!0,passive:!0})}function as(){os=!0;for(const e of rs)document.removeEventListener(e,as,!0);const i=Array.from(Ae);Ae.clear(),i.forEach(e=>e())}function nn(i){return os?(i(),()=>{}):(Ae.add(i),()=>{Ae.delete(i)})}sn();class lt extends v(b){constructor(){super(...arguments),this._detachField=null,this._attachedField=null,this._cancelMount=null,this._mounted=null,this._onAnswer=e=>{const{detail:t}=e;Ss(this.formId,t.value),t.value!==""&&et(this.formId,null)}}createRenderRoot(){return this}disconnectedCallback(){super.disconnectedCallback(),this._releaseField(),this._releaseCheckbox()}render(){const e=Es(g(),this.formId),t=D()?.hyperion?.captcha?.refreshUrl??"",n=this._checkboxAction();if(e?.isRequired!==!0&&n===null)return h;const s=e?.isRequired===!0&&en();return e?.isRequired===!0&&!s&&tn(),c`
            <div class="space-y-3">
                ${e!==null&&s?c`
                    <hc-captcha form-id=${this.formId}
                                refresh-url=${t}
                                image-width=${e.imageWidth}
                                image-height=${e.imageHeight}
                                ?case-sensitive=${e.isCaseSensitive}
                                required
                                label=${d("Hyperion_Checkout::captcha_label")}
                                reload-label=${d("Hyperion_Checkout::captcha_reload")}
                                case-note=${d("Hyperion_Checkout::captcha_case_note")}
                                error=${ke(this.formId)??""}
                                @hyperion:captcha-change=${this._onAnswer}></hc-captcha>
                `:h}
                ${n!==null?Qi(n,c`
                    <div class="min-h-[78px]" data-hc-recaptcha-checkbox=${n}></div>
                `):h}
            </div>
        `}updated(){this._syncField(),this._syncCheckbox()}_checkboxAction(){const e=this.recaptchaAction();return e!==null&&Ps(e)?.type==="v2-checkbox"?e:null}_syncField(){const e=this.querySelector("hc-captcha");e!==this._attachedField&&(this._releaseField(),e!==null&&(this._attachedField=e,this._detachField=Hs(this.formId,{refresh:()=>e.refresh(),focus:()=>e.focus()})))}_releaseField(){this._detachField?.(),this._detachField=null,this._attachedField=null}_syncCheckbox(){const e=this.querySelector("[data-hc-recaptcha-checkbox]"),t=e===null?null:this._checkboxAction();this._mounted!==null&&(this._mounted.host!==e||this._mounted.action!==t)&&this._releaseCheckbox(),!(e===null||t===null||this._mounted!==null)&&(this._mounted={action:t,host:e},this._cancelMount=nn(()=>{this._cancelMount=null,Rs(t,e).catch(n=>{console.warn("[hyperion-checkout] reCAPTCHA",n)})}))}_releaseCheckbox(){this._cancelMount?.(),this._cancelMount=null,this._mounted!==null&&(Os(this._mounted.action,this._mounted.host),this._mounted=null)}}class rn extends lt{constructor(){super(...arguments),this.formId="user_login"}recaptchaAction(){return"customer_login"}}class on extends lt{constructor(){super(...arguments),this.formId="sales_rule_coupon_request"}recaptchaAction(){return"coupon_code"}}class an extends lt{constructor(){super(...arguments),this.formId="payment_processing_request"}recaptchaAction(){return Ts(g())}}customElements.get("hc-login-captcha")||customElements.define("hc-login-captcha",rn);customElements.get("hc-coupon-captcha")||customElements.define("hc-coupon-captcha",on);customElements.get("hc-order-captcha")||customElements.define("hc-order-captcha",an);/**
 * @license
 * Copyright 2018 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const T=i=>i??h;let It=0;function ct(){return It+=1,`hc-f${It}`}function J(i,e){return e===""?i:`${i}-${e}`}var ln=Object.defineProperty,w=(i,e,t,n)=>{for(var s=void 0,r=i.length-1,o;r>=0;r--)(o=i[r])&&(s=o(e,t,s)||s);return s&&ln(e,t,s),s};function se(i){return i===""?void 0:i}class x extends b{constructor(){super(...arguments),this.label="",this.name="",this.value="",this.type="text",this.placeholder="",this.autocomplete="",this.required=!1,this.error="",this.warning="",this.hint="",this.inputmode="",this.idPrefix="",this.capitalize="",this.noSpellcheck=!1,this.enterHint="",this._ownIdPrefix=null,this._composing=!1}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.classList.add("hc-field")}get controlId(){return this.idPrefix!==""?J(this.idPrefix,this.name):(this._ownIdPrefix??=ct(),J(this._ownIdPrefix,this.name))}render(){const e=this.controlId,t=`${e}-msg`,n=this.error||this.warning||this.hint,s=this.error?"error":this.warning?"warning":"hint";return c`
            <label for=${e} class="hc-field-label text-brand">
                ${this.label}
                ${this.required?c`<span aria-hidden="true" class="text-danger">*</span>`:h}
            </label>
            <input
                id=${e}
                name=${this.name}
                type=${this.type}
                class="hc-field-control ${this.error?"border-danger":"border-subtle"} bg-surface text-brand placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                .value=${this.value}
                placeholder=${T(se(this.placeholder))}
                autocomplete=${T(se(this.autocomplete))}
                inputmode=${T(se(this.inputmode))}
                autocapitalize=${T(se(this.capitalize))}
                spellcheck=${T(this.noSpellcheck?"false":void 0)}
                enterkeyhint=${T(se(this.enterHint))}
                ?required=${this.required}
                aria-required=${this.required?"true":"false"}
                aria-invalid=${this.error?"true":"false"}
                aria-describedby=${T(n?t:void 0)}
                @input=${this._onInput}
                @change=${this._onChange}
                @compositionstart=${this._onCompositionStart}
                @compositionend=${this._onCompositionEnd}
                @blur=${this._onBlur}
            />
            <p id=${t}
               data-tone=${s}
               class="hc-field-message ${this.error?"text-danger":this.warning?"text-warning-strong":"text-muted"}">${n}</p>
        `}_commit(e){e!==this.value&&(this.value=e,this.dispatchEvent(new CustomEvent("value-change",{detail:{value:e,name:this.name},bubbles:!0,composed:!0})))}_onInput(e){this._composing||e.isComposing===!0||this._commit(e.target.value)}_onChange(e){this._composing||this._commit(e.target.value)}_onCompositionStart(){this._composing=!0}_onCompositionEnd(e){this._composing=!1,this._commit(e.target.value)}_onBlur(e){this._composing=!1,this._commit(e.target.value),this.dispatchEvent(new CustomEvent("value-blur",{detail:{value:this.value,name:this.name},bubbles:!0,composed:!0}))}}w([_({type:String})],x.prototype,"label");w([_({type:String})],x.prototype,"name");w([_({type:String})],x.prototype,"value");w([_({type:String})],x.prototype,"type");w([_({type:String})],x.prototype,"placeholder");w([_({type:String})],x.prototype,"autocomplete");w([_({type:Boolean,reflect:!0})],x.prototype,"required");w([_({type:String})],x.prototype,"error");w([_({type:String})],x.prototype,"warning");w([_({type:String})],x.prototype,"hint");w([_({type:String})],x.prototype,"inputmode");w([_({type:String,attribute:"id-prefix"})],x.prototype,"idPrefix");w([_({type:String})],x.prototype,"capitalize");w([_({type:Boolean,attribute:"no-spellcheck"})],x.prototype,"noSpellcheck");w([_({type:String,attribute:"enter-hint"})],x.prototype,"enterHint");customElements.get("hc-text-input")||customElements.define("hc-text-input",x);var cn=Object.defineProperty,X=(i,e,t,n)=>{for(var s=void 0,r=i.length-1,o;r>=0;r--)(o=i[r])&&(s=o(e,t,s)||s);return s&&cn(e,t,s),s};class j extends b{constructor(){super(...arguments),this.variant="primary",this.disabled=!1,this.softDisabled=!1,this.loading=!1,this.type="button",this.label=""}createRenderRoot(){return this}render(){const e="inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-accent",t=this.softDisabled&&!this.disabled&&!this.loading,n={primary:t?"bg-muted text-on-accent":"bg-accent text-on-accent hover:bg-accent/90",secondary:"bg-surface-raised text-brand border border-subtle hover:bg-subtle",ghost:"bg-transparent text-accent hover:underline"};let s="";return this.loading?s="cursor-wait":this.disabled&&(s="opacity-50 cursor-not-allowed"),c`
            <button
                type=${this.type}
                ?disabled=${this.disabled||this.loading}
                aria-disabled=${t?"true":h}
                class="${e} ${n[this.variant]} ${s}"
                @click=${this._onClick}
            >
                ${this.loading?c`<span class="inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"></span>`:null}
                ${this.label}
            </button>
        `}_onClick(e){(this.disabled||this.loading)&&(e.preventDefault(),e.stopPropagation())}}X([_({type:String})],j.prototype,"variant");X([_({type:Boolean})],j.prototype,"disabled");X([_({type:Boolean})],j.prototype,"softDisabled");X([_({type:Boolean})],j.prototype,"loading");X([_({type:String})],j.prototype,"type");X([_({type:String})],j.prototype,"label");customElements.get("hc-button")||customElements.define("hc-button",j);var dn=Object.defineProperty,hn=Object.getOwnPropertyDescriptor,ls=i=>{throw TypeError(i)},dt=(i,e,t,n)=>{for(var s=hn(e,t),r=i.length-1,o;r>=0;r--)(o=i[r])&&(s=o(e,t,s)||s);return s&&dn(e,t,s),s},cs=(i,e,t)=>e.has(i)||ls("Cannot "+t),qe=(i,e,t)=>(cs(i,e,"read from private field"),t?t.call(i):e.get(i)),Le=(i,e,t)=>e.has(i)?ls("Cannot add the same private member more than once"):e instanceof WeakSet?e.add(i):e.set(i,t),Me=(i,e,t,n)=>(cs(i,e,"write to private field"),e.set(i,t),t),_e,me,ge;const un=800;function Be(){return D()?.hyperion?.guestCheckoutLoginEnabled!==!1}function pn(){const i=D(),e=i?.hyperion?.forgotPasswordUrl||i?.forgotPasswordUrl||"";return e===""?null:Is(e)}const qt="hc-login-form",Ue="user_login";class Oe extends v(b){constructor(){super(...arguments),Le(this,_e,!1),Le(this,me,!1),Le(this,ge,!1),this._request=null,this._requestedValue=null,this._checkAfterTyping=Fs(e=>{this._checkAvailability(e)},un)}get _checking(){return qe(this,_e)}set _checking(e){Me(this,_e,e)}get _loginOpen(){return qe(this,me)}set _loginOpen(e){Me(this,me,e)}get _loginBusy(){return qe(this,ge)}set _loginBusy(e){Me(this,ge,e)}connectedCallback(){super.connectedCallback(),this.classList.add("hc-host")}disconnectedCallback(){super.disconnectedCallback(),this._dropPendingCheck(),this._loginBusy=!1}updated(){if(!this._loginBusy)return;const e=g().loginError.get()!==null;(e||ke(Ue)!==null)&&queueMicrotask(()=>this._endFailedLogin(e))}_endFailedLogin(e){this._loginBusy&&(this._loginBusy=!1,e&&(g().password.set(""),this.updateComplete.then(()=>{this.querySelector('input[name="password"]')?.focus({preventScroll:!0})})))}createRenderRoot(){return this}render(){const e=g(),t=e.email.get(),n=e.emailExists.get(),s=e.loginError.get();ke(Ue);const o=e.fieldErrors.get().email??"",l=Be(),a=l&&n===!0;return c`
            <div data-hyperion-email-step>
                <hc-text-input
                    label=${d("Hyperion_Checkout::email_label")}
                    name="email"
                    type="email"
                    id-prefix="hc-contact"
                    autocomplete="email"
                    inputmode="email"
                    capitalize="none"
                    enter-hint="next"
                    .noSpellcheck=${!0}
                    .value=${t}
                    .required=${!0}
                    .error=${o}
                    .hint=${this._checking?d("Hyperion_Checkout::checking_email"):""}
                    placeholder=${d("Hyperion_Checkout::email_placeholder")}
                    @value-change=${this._onEmailInput}
                    @value-blur=${this._onEmailBlur}
                ></hc-text-input>
                ${l?c`
                          <p class="hc-reserved-line text-brand" aria-live="polite" data-hyperion-login-slot>
                              ${a?c`
                                        <span>${d("Hyperion_Checkout::email_account_found")}</span>
                                        <button type="button"
                                                class="font-medium text-accent underline underline-offset-2 hover:no-underline focus:outline-none focus:ring-2 focus:ring-accent"
                                                aria-expanded=${this._loginOpen?"true":"false"}
                                                aria-controls=${qt}
                                                data-hyperion-login-open
                                                @click=${this._onLoginToggle}>
                                            ${d("Hyperion_Checkout::login_open")}
                                        </button>
                                    `:h}
                          </p>
                      `:h}
                ${a&&this._loginOpen?this._renderPasswordForm(s):h}
                <hc-section-status section="contact"></hc-section-status>
            </div>
        `}_renderPasswordForm(e){const t=g(),n=pn();return c`
            <form id=${qt}
                  class="mt-3 rounded-lg border border-subtle bg-surface-raised p-3"
                  aria-label=${d("Hyperion_Checkout::login_aria_label")}
                  aria-busy=${this._loginBusy?"true":"false"}
                  novalidate
                  data-hyperion-login-form
                  @submit=${this._onLoginSubmit}>
                <p class="mb-3 text-sm text-brand">
                    ${d("Hyperion_Checkout::email_existing_account")}
                </p>
                <hc-text-input
                    label=${d("Hyperion_Checkout::password_label")}
                    name="password"
                    type="password"
                    id-prefix="hc-login"
                    autocomplete="current-password"
                    enter-hint="go"
                    .value=${t.password.get()}
                    .required=${!0}
                    .error=${e??""}
                    @value-change=${this._onPasswordInput}
                ></hc-text-input>
                <div data-hyperion-login-captcha><hc-login-captcha></hc-login-captcha></div>
                <div class="mt-3 flex flex-wrap items-center gap-2">
                    <hc-button variant="primary"
                               type="submit"
                               .label=${d("Hyperion_Checkout::login_button")}
                               .loading=${this._loginBusy}></hc-button>
                    <hc-button variant="ghost"
                               .label=${d("Hyperion_Checkout::continue_as_guest")}
                               .disabled=${this._loginBusy}
                               @click=${this._onContinueAsGuestClick}></hc-button>
                    ${n!==null?c`<a href=${n}
                                  class="ml-auto text-sm font-medium text-accent hover:underline"
                                  data-hyperion-forgot-password>${d("Hyperion_Checkout::forgot_password")}</a>`:h}
                </div>
            </form>
        `}_onLoginToggle(){this._loginOpen=!this._loginOpen,this._loginOpen&&this.updateComplete.then(()=>{this.querySelector('input[name="password"]')?.focus({preventScroll:!0})})}_onEmailInput(e){const t=g(),n=t.email.get()!==e.detail.value;t.email.set(e.detail.value);const s=ue(e.detail.value);if(s===null&&t.fieldErrors.get().email!==void 0){const r={...t.fieldErrors.get()};delete r.email,t.fieldErrors.set(r)}n&&this._onEmailValueChanged(e.detail.value,s===null)}_onEmailValueChanged(e,t){this._dropPendingCheck();const n=g();n.emailExists.set(!1),this._loginOpen=!1,n.password.get()!==""&&n.password.set(""),n.loginError.get()!==null&&n.loginError.set(null),t&&Be()&&this._checkAfterTyping(e)}_dropPendingCheck(){this._checkAfterTyping.cancel(),this._request?.abort(),this._request=null,this._requestedValue=null,this._checking=!1}_checkAvailability(e){if(!Be()||ue(e)!==null)return;const t=g();if(t.email.get()!==e||this._requestedValue===e)return;this._request?.abort();const n=new AbortController;this._request=n,this._requestedValue=e,this._checking=!0,Ns({customerEmail:e},{signal:n.signal}).then(s=>{n.signal.aborted||t.email.get()!==e||t.emailExists.set(!s)}).catch(()=>{this._request===n&&(this._requestedValue=null)}).finally(()=>{this._request===n&&(this._request=null,this._checking=!1)})}_onEmailBlur(e){const t=g(),n=ue(e.detail.value);if(n){const s={...t.fieldErrors.get()};s.email=d(n),t.fieldErrors.set(s)}this._checkAfterTyping.cancel(),this._checkAvailability(e.detail.value)}_onPasswordInput(e){const t=g();t.password.set(e.detail.value),t.loginError.get()&&t.loginError.set(null)}_onLoginSubmit(e){e.preventDefault(),!this._loginBusy&&(this._loginBusy=!0,g().loginError.set(null),et(Ue,null),this.dispatchEvent(new CustomEvent("login-request",{bubbles:!0,composed:!0})))}_onContinueAsGuestClick(){const e=g();this._loginOpen=!1,e.emailExists.set(!1),e.password.set(""),e.loginError.set(null)}}_e=new WeakMap;me=new WeakMap;ge=new WeakMap;dt([P()],Oe.prototype,"_checking");dt([P()],Oe.prototype,"_loginOpen");dt([P()],Oe.prototype,"_loginBusy");customElements.get("checkout-email")||customElements.define("checkout-email",Oe);/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */class Je extends at{constructor(e){if(super(e),this.it=h,e.type!==ts.CHILD)throw Error(this.constructor.directiveName+"() can only be used in child bindings")}render(e){if(e===h||e==null)return this._t=void 0,this.it=e;if(e===I)return e;if(typeof e!="string")throw Error(this.constructor.directiveName+"() called with a non-string value");if(e===this.it)return this._t;this.it=e;const t=[e];return t.raw=t,this._t={_$litType$:this.constructor.resultType,strings:t,values:[]}}}Je.directiveName="unsafeHTML",Je.resultType=1;const _n=ot(Je),mn=["p","br","strong","em","b","i","u","ul","ol","li","a","span","div","h1","h2","h3","h4","h5","h6"],gn=["href","title","rel","target"],fn=["http:","https:","mailto:","tel:"],ds=new Set(["script","style","template","noscript","iframe","object","embed","svg","math","textarea","title","head"]);function hs(i){const e=new DOMParser().parseFromString(`<div>${i}</div>`,"text/html");return{doc:e,root:e.body.firstElementChild}}function $n(i,e){try{return e.has(new URL(i,window.location.origin).protocol)}catch{return!1}}function yn(i,e,t){for(const o of Array.from(i.attributes)){const l=o.name.toLowerCase();t.linkAttributes.has(l)&&e.setAttribute(l,o.value)}const n=e.getAttribute("href")??"";n&&!$n(n.trim(),t.linkProtocols)&&e.removeAttribute("href");const s=e.getAttribute("target");s!==null&&s!=="_blank"&&e.removeAttribute("target");const r=e.getAttribute("href")??"";(/^https?:/i.test(r)||e.getAttribute("target")==="_blank")&&e.setAttribute("rel","noopener noreferrer")}function Ze(i,e,t,n){e.childNodes.forEach(s=>{if(s.nodeType===3){t.appendChild(i.createTextNode(s.textContent??""));return}if(s.nodeType!==1)return;const r=s,o=r.tagName.toLowerCase();if(ds.has(o))return;if(!n.tags.has(o)){Ze(i,r,t,n);return}const l=i.createElement(o);o==="a"&&yn(r,l,n),Ze(i,r,l,n),t.appendChild(l)})}function bn(i,e={}){const{doc:t,root:n}=hs(String(i??""));if(!n)return"";const s=t.createElement("div");return Ze(t,n,s,{tags:new Set(e.tags??mn),linkAttributes:new Set(e.linkAttributes??gn),linkProtocols:new Set(e.linkProtocols??fn)}),s.innerHTML}function vn(i){const{doc:e,root:t}=hs(String(i??""));return t?(t.querySelectorAll(Array.from(ds).join(",")).forEach(n=>n.remove()),t.querySelectorAll("br").forEach(n=>n.replaceWith(e.createTextNode(", "))),(t.textContent??"").replace(/\s+/g," ").replace(/ ,/g,",").trim()):""}function xn(i){return bn(i)}class kn extends HTMLElement{constructor(){super(...arguments),this.unbind=null}connectedCallback(){this.hidden=this.childElementCount===0,(D()?.hyperion?.extensions?.length??0)!==0&&E(()=>import("./slot-binding-IGMIbl4z.js"),__vite__mapDeps([3,4,1,2,5,6,7]),import.meta.url).then(e=>{this.isConnected&&this.unbind===null&&(this.unbind=e.bindSlotOutlet(this))}).catch(e=>{console.error("[hyperion-checkout] a checkout slot could not be bound",e)})}disconnectedCallback(){this.unbind?.(),this.unbind=null}}customElements.get("hc-slot-outlet")||customElements.define("hc-slot-outlet",kn);const Se=new B.State(0);function wn(){Se.set(Se.get()+1)}var Cn=Object.defineProperty,F=(i,e,t,n)=>{for(var s=void 0,r=i.length-1,o;r>=0;r--)(o=i[r])&&(s=o(e,t,s)||s);return s&&Cn(e,t,s),s};class O extends b{constructor(){super(...arguments),this.label="",this.name="",this.value="",this.options=[],this.required=!1,this.error="",this.placeholder="",this.autocomplete="",this.idPrefix="",this._ownIdPrefix=null}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.classList.add("hc-field")}get controlId(){return this.idPrefix!==""?J(this.idPrefix,this.name):(this._ownIdPrefix??=ct(),J(this._ownIdPrefix,this.name))}render(){const e=this.controlId,t=`${e}-msg`,n=this.options.findIndex(s=>!s.separator&&s.value===this.value);return c`
            <label for=${e} class="hc-field-label text-brand">
                ${this.label}
                ${this.required?c`<span aria-hidden="true" class="text-danger">*</span>`:h}
            </label>
            <select
                id=${e}
                name=${this.name}
                class="hc-field-control ${this.error?"border-danger":"border-subtle"} bg-surface text-brand focus:outline-none focus:ring-2 focus:ring-accent"
                autocomplete=${T(this.autocomplete===""?void 0:this.autocomplete)}
                ?required=${this.required}
                aria-required=${this.required?"true":"false"}
                aria-invalid=${this.error?"true":"false"}
                aria-describedby=${T(this.error?t:void 0)}
                @change=${this._onChange}
                @blur=${this._onBlur}
            >
                ${this.placeholder?c`<option value="" ?selected=${n===-1}>${this.placeholder}</option>`:h}
                ${this.options.map((s,r)=>s.separator?c`<option disabled>${s.label}</option>`:c`
                          <option value=${s.value} ?selected=${r===n}>
                              ${s.label}
                          </option>
                      `)}
            </select>
            <p id=${t} data-tone="error" class="hc-field-message text-danger">${this.error}</p>
        `}updated(){const e=this.querySelector("select");e===null||e.value===this.value||(e.value=this.value,e.value!==this.value&&this.placeholder&&(e.value=""))}_onChange(e){const t=e.target;t.value!==this.value&&(this.value=t.value,this.dispatchEvent(new CustomEvent("value-change",{detail:{value:t.value,name:this.name},bubbles:!0,composed:!0})))}_onBlur(){this.dispatchEvent(new CustomEvent("value-blur",{detail:{value:this.value,name:this.name},bubbles:!0,composed:!0}))}}F([_({type:String})],O.prototype,"label");F([_({type:String})],O.prototype,"name");F([_({type:String})],O.prototype,"value");F([_({type:Array})],O.prototype,"options");F([_({type:Boolean,reflect:!0})],O.prototype,"required");F([_({type:String})],O.prototype,"error");F([_({type:String})],O.prototype,"placeholder");F([_({type:String})],O.prototype,"autocomplete");F([_({type:String,attribute:"id-prefix"})],O.prototype,"idPrefix");customElements.get("hc-select-input")||customElements.define("hc-select-input",O);var An=Object.defineProperty,Te=(i,e,t,n)=>{for(var s=void 0,r=i.length-1,o;r>=0;r--)(o=i[r])&&(s=o(e,t,s)||s);return s&&An(e,t,s),s};class le extends b{constructor(){super(...arguments),this.label="",this.name="",this.checked=!1,this.idPrefix="",this._ownIdPrefix=null}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.classList.add("hc-field")}get controlId(){return this.idPrefix!==""?J(this.idPrefix,this.name):(this._ownIdPrefix??=ct(),J(this._ownIdPrefix,this.name))}render(){const e=this.controlId;return c`
            <label for=${e} class="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                    id=${e}
                    type="checkbox"
                    name=${this.name}
                    class="h-4 w-4 rounded border-subtle text-accent focus:ring-2 focus:ring-accent"
                    .checked=${this.checked}
                    @change=${this._onChange}
                />
                <span class="text-sm text-brand">${this.label}</span>
            </label>
        `}_onChange(e){const t=e.target;this.checked=t.checked,this.dispatchEvent(new CustomEvent("value-change",{detail:{checked:t.checked,name:this.name},bubbles:!0,composed:!0}))}}Te([_({type:String})],le.prototype,"label");Te([_({type:String})],le.prototype,"name");Te([_({type:Boolean})],le.prototype,"checked");Te([_({type:String,attribute:"id-prefix"})],le.prototype,"idPrefix");customElements.get("hc-checkbox")||customElements.define("hc-checkbox",le);var Sn=Object.defineProperty,En=Object.getOwnPropertyDescriptor,us=i=>{throw TypeError(i)},Q=(i,e,t,n)=>{for(var s=n>1?void 0:n?En(e,t):e,r=i.length-1,o;r>=0;r--)(o=i[r])&&(s=(n?o(e,t,s):o(s))||s);return n&&s&&Sn(e,t,s),s},ps=(i,e,t)=>e.has(i)||us("Cannot "+t),De=(i,e,t)=>(ps(i,e,"read from private field"),t?t.call(i):e.get(i)),je=(i,e,t)=>e.has(i)?us("Cannot add the same private member more than once"):e instanceof WeakSet?e.add(i):e.set(i,t),Ve=(i,e,t,n)=>(ps(i,e,"write to private field"),e.set(i,t),t),fe,$e,ye;const Xe=Ye;function Lt(){const i=S().directoryData;if(!i||typeof i!="object")return[];const e=[];for(const[t,n]of Object.entries(i)){if(!n||typeof n!="object")continue;const s=n,r=typeof s.name=="string"?s.name:t;e.push({id:t,name:r,is_region_required:s.is_region_required===!0,is_region_visible:s.is_region_visible!==!1})}return e.sort((t,n)=>t.name.localeCompare(n.name)),e}const Pn="─".repeat(10);function Hn(i){const e=i.map(n=>({value:n.id,label:n.name})),t=[];for(const n of S().hyperion?.topDestinations??[]){const s=i.find(r=>r.id===n);s&&!t.some(r=>r.value===n)&&t.push({value:s.id,label:s.name})}return t.length===0?e:[...t,{value:"",label:Pn,separator:!0},...e]}function de(i){return i===""?[]:Ds(Xe().directoryData,i)}function Mt(i,e){return i.trim().toLocaleLowerCase()===e.trim().toLocaleLowerCase()}class V extends v(b){constructor(){super(...arguments),this.mode="shipping",this.value=null,this.showSaveInAddressBook=!1,je(this,fe,{}),je(this,$e,{}),je(this,ye,!1),this._validationBaseline=0}get _local(){return De(this,fe)}set _local(e){Ve(this,fe,e)}get _touched(){return De(this,$e)}set _touched(e){Ve(this,$e,e)}get _revealAll(){return De(this,ye)}set _revealAll(e){Ve(this,ye,e)}createRenderRoot(){return this}willUpdate(e){e.has("value")&&this.value&&(this._local={...this.value}),(e.has("value")||e.has("showSaveInAddressBook"))&&this._initSaveInAddressBook(),!this._revealAll&&Se.get()>this._validationBaseline&&(this._revealAll=!0)}connectedCallback(){super.connectedCallback(),this.classList.add("hc-host"),this._validationBaseline=Se.get(),this.value&&Object.keys(this._local).length===0&&(this._local={...this.value});let e=!1;if(!this._local.country_id){const t=S().defaultCountryId;this._local={...this._local,country_id:t},e=!0}this._initSaveInAddressBook()&&(e=!0),e&&this._emit()}_initSaveInAddressBook(){if(typeof this._local.save_in_address_book=="boolean")return!1;const e=this._local.id!=null&&this._local.id!=="";return this._local={...this._local,save_in_address_book:this.showSaveInAddressBook&&!e},!0}get _idPrefix(){return`hc-${this.mode}`}_token(e){return`${this.mode} ${e}`}_lastTextField(e,t){return e.showVat?"vat_id":e.showFax!=="no"?"fax":e.showTelephone!=="no"?"telephone":t?"region":"city"}render(){const e=Xe(),t=Lt(),n=this._local.country_id??"",s=de(n),r=t.find(A=>A.id===n),o=qs(n,e),l=s.length>0,a=r?.is_region_required===!0,u=r?.is_region_visible!==!1,m=this._idPrefix,p=this._lastTextField(e,u&&!l),f=A=>A===p?"":"next",y=this._local.street??[],$=[];for(let A=0;A<e.streetLines;A++)$.push(y[A]??"");const k=Ls();return c`
            <div class="hc-fields">
                ${this._renderNameField("prefix",k.prefix,"honorific-prefix")}
                <div class="hc-field-row hc-field-row-2">
                    <hc-text-input
                        label=${d("Hyperion_Checkout::firstname_label")}
                        name="firstname"
                        id-prefix=${m}
                        autocomplete=${this._token("given-name")}
                        capitalize="words"
                        enter-hint="next"
                        .value=${this._local.firstname??""}
                        .required=${!0}
                        .error=${this._errorFor("firstname",!0)}
                        @value-change=${this._onFieldChange}
                        @value-blur=${this._onBlur}
                    ></hc-text-input>
                    <hc-text-input
                        label=${d("Hyperion_Checkout::lastname_label")}
                        name="lastname"
                        id-prefix=${m}
                        autocomplete=${this._token("family-name")}
                        capitalize="words"
                        enter-hint="next"
                        .value=${this._local.lastname??""}
                        .required=${!0}
                        .error=${this._errorFor("lastname",!0)}
                        @value-change=${this._onFieldChange}
                        @value-blur=${this._onBlur}
                    ></hc-text-input>
                </div>
                ${this._renderNameField("middlename",k.middlename,"additional-name")}
                ${this._renderNameField("suffix",k.suffix,"honorific-suffix")}

                ${e.showCompany!=="no"?c`
                          <hc-text-input
                              label=${d("Hyperion_Checkout::company_label")}
                              name="company"
                              id-prefix=${m}
                              autocomplete=${this._token("organization")}
                              enter-hint="next"
                              .value=${this._local.company??""}
                              .required=${e.showCompany==="req"}
                              .error=${this._errorFor("company",e.showCompany==="req")}
                              @value-change=${this._onFieldChange}
                              @value-blur=${this._onBlur}
                          ></hc-text-input>
                      `:h}

                <hc-select-input
                    label=${d("Hyperion_Checkout::country_label")}
                    name="country_id"
                    id-prefix=${m}
                    autocomplete=${this._token("country")}
                    .options=${Hn(t)}
                    .value=${n}
                    .required=${!0}
                    .error=${this._errorFor("country_id",!0)}
                    @value-change=${this._onCountryChange}
                    @value-blur=${this._onBlur}
                ></hc-select-input>

                ${$.map((A,H)=>c`
                        <hc-text-input
                            label=${H===0?d("Hyperion_Checkout::street_label_primary"):d("Hyperion_Checkout::street_label_additional",{n:String(H+1)})}
                            name=${`street_${H}`}
                            id-prefix=${m}
                            autocomplete=${this._token(`address-line${H+1}`)}
                            enter-hint="next"
                            .value=${A}
                            .required=${H===0}
                            .error=${H===0?this._errorFor("street"):""}
                            @value-change=${this._onStreetChange}
                            @value-blur=${this._onBlur}
                            data-index=${H}
                        ></hc-text-input>
                    `)}

                <div class="hc-field-row hc-field-row-3">
                    <hc-text-input
                        label=${d("Hyperion_Checkout::postcode_label")}
                        name="postcode"
                        id-prefix=${m}
                        autocomplete=${this._token("postal-code")}
                        enter-hint="next"
                        .noSpellcheck=${!0}
                        .value=${this._local.postcode??""}
                        .required=${o}
                        .error=${this._errorFor("postcode",o)}
                        .warning=${this._warningFor("postcode")}
                        @value-change=${this._onFieldChange}
                        @value-blur=${this._onBlur}
                    ></hc-text-input>
                    <hc-text-input
                        label=${d("Hyperion_Checkout::city_label")}
                        name="city"
                        id-prefix=${m}
                        autocomplete=${this._token("address-level2")}
                        capitalize="words"
                        enter-hint=${f("city")}
                        .value=${this._local.city??""}
                        .required=${!0}
                        .error=${this._errorFor("city",!0)}
                        @value-change=${this._onFieldChange}
                        @value-blur=${this._onBlur}
                    ></hc-text-input>
                    ${this._renderRegion(s,a,u,e,f("region"))}
                </div>

                ${e.showTelephone!=="no"?c`
                          <hc-text-input
                              label=${d("Hyperion_Checkout::telephone_label")}
                              name="telephone"
                              type="tel"
                              id-prefix=${m}
                              autocomplete=${this._token("tel")}
                              inputmode="tel"
                              enter-hint=${f("telephone")}
                              .value=${this._local.telephone??""}
                              .required=${e.showTelephone==="req"}
                              .error=${this._errorFor("telephone",e.showTelephone==="req")}
                              @value-change=${this._onFieldChange}
                              @value-blur=${this._onBlur}
                          ></hc-text-input>
                      `:h}

                ${e.showFax!=="no"?c`
                          <hc-text-input
                              label=${d("Hyperion_Checkout::fax_label")}
                              name="fax"
                              type="tel"
                              id-prefix=${m}
                              inputmode="tel"
                              enter-hint=${f("fax")}
                              .value=${this._local.fax??""}
                              .required=${e.showFax==="req"}
                              .error=${this._errorFor("fax",e.showFax==="req")}
                              @value-change=${this._onFieldChange}
                              @value-blur=${this._onBlur}
                          ></hc-text-input>
                      `:h}

                ${e.showVat?c`
                          <hc-text-input
                              label=${d("Hyperion_Checkout::vat_label")}
                              name="vat_id"
                              id-prefix=${m}
                              .noSpellcheck=${!0}
                              .value=${this._local.vat_id??""}
                              @value-change=${this._onFieldChange}
                          ></hc-text-input>
                      `:h}

                ${Ms.get()?.render(this._declaredFieldsHost())??h}

                ${this.showSaveInAddressBook?c`
                          <hc-checkbox
                              name="save_in_address_book"
                              id-prefix=${m}
                              label=${d("Hyperion_Checkout::save_in_address_book")}
                              .checked=${this._local.save_in_address_book===!0}
                              @value-change=${this._onSaveToggle}
                          ></hc-checkbox>
                      `:h}
            </div>
        `}_renderRegion(e,t,n,s,r){if(!n)return c`<div class="hc-field-placeholder" aria-hidden="true" data-hyperion-region-placeholder></div>`;const o=this._regionError(s);return e.length>0?c`
                <hc-select-input
                    label=${d("Hyperion_Checkout::region_label")}
                    name="region_id"
                    id-prefix=${this._idPrefix}
                    autocomplete=${this._token("address-level1")}
                    placeholder=${d("Hyperion_Checkout::region_placeholder")}
                    .options=${e.map(l=>({value:String(l.id),label:l.name}))}
                    .value=${this._local.region_id==null?"":String(this._local.region_id)}
                    .required=${t}
                    .error=${o}
                    @value-change=${this._onRegionSelectChange}
                    @value-blur=${this._onBlur}
                ></hc-select-input>
            `:c`
            <hc-text-input
                label=${d("Hyperion_Checkout::region_label")}
                name="region"
                id-prefix=${this._idPrefix}
                autocomplete=${this._token("address-level1")}
                enter-hint=${r}
                .value=${this._regionText()}
                .required=${t}
                .error=${o}
                @value-change=${this._onFieldChange}
                @value-blur=${this._onBlur}
            ></hc-text-input>
        `}_regionText(){const e=this._local.region;return typeof e=="string"?e:ft(this._local)}_renderNameField(e,t,n){if(t.show==="no")return h;const s=t.show==="req",r=d(`Hyperion_Checkout::${e}_label`),o=this._local[e]??"",l=t.options??[];if(l.length>0){const a=l.includes(o)||o===""?l:[o,...l];return c`
                <div class="md:max-w-xs">
                    <hc-select-input
                        label=${r}
                        name=${e}
                        id-prefix=${this._idPrefix}
                        autocomplete=${this._token(n)}
                        placeholder=${d("Hyperion_Checkout::name_option_placeholder")}
                        .options=${a.map(u=>({value:u,label:u}))}
                        .value=${o}
                        .required=${s}
                        .error=${this._errorFor(e,s)}
                        @value-change=${this._onNameSelectChange}
                        @value-blur=${this._onBlur}
                    ></hc-select-input>
                </div>
            `}return c`
            <div class=${e==="middlename"?"":"md:max-w-xs"}>
                <hc-text-input
                    label=${r}
                    name=${e}
                    id-prefix=${this._idPrefix}
                    autocomplete=${this._token(n)}
                    capitalize=${e==="middlename"?"words":""}
                    enter-hint="next"
                    .value=${o}
                    .required=${s}
                    .error=${this._errorFor(e,s)}
                    @value-change=${this._onFieldChange}
                    @value-blur=${this._onBlur}
                ></hc-text-input>
            </div>
        `}_onNameSelectChange(e){this._touched={...this._touched,[e.detail.name]:!0},this._onFieldChange(e)}_declaredFieldsHost(){const e=this;return{mode:this.mode,idPrefix:this._idPrefix,get address(){return e._local},isTouched:t=>this._revealAll||this._touched[t]===!0,touch:t=>{this._touched[t]!==!0&&(this._touched={...this._touched,[t]:!0})},change:t=>{this._local=t,this._emit()}}}_errorFor(e,t=!1){if(!(this._revealAll||this._touched[e]===!0))return"";if(e==="street"){const r=this._local.street??[];return!r[0]||r[0].trim().length===0?d("Hyperion_Checkout::validation_required"):""}if(!t)return"";const s=this._local[e];return s==null?d("Hyperion_Checkout::validation_required"):typeof s=="string"&&s.trim().length===0?d("Hyperion_Checkout::validation_required"):""}_warningFor(e){if(e!=="postcode"||!(this._revealAll||this._touched[e]===!0))return"";const n=Bs(this._local.postcode,this._local.country_id??"",Xe());return n===null?"":d("Hyperion_Checkout::validation_postcode",{example:n.examples.join(", ")})}_onFieldChange(e){this._local={...this._local,[e.detail.name]:e.detail.value},this._emit()}_onStreetChange(e){const n=e.target.getAttribute("data-index"),s=n?Number(n):0,r=[...this._local.street??[]];for(;r.length<s+1;)r.push("");r[s]=e.detail.value,this._local={...this._local,street:r},this._emit()}_regionError(e){return(this._revealAll||this._touched.region_id===!0||this._touched.region===!0)&&Us(this._local,e)?d("Hyperion_Checkout::validation_required"):""}_onCountryChange(e){const t=e.detail.value,n=this._local.country_id??"";if(t===n)return;const r=Lt().find(u=>u.id===t)?.is_region_visible!==!1&&de(n).length===0?ft(this._local):"",o=de(t);let l=null,a=null;if(r!=="")if(o.length===0)a=r;else{const u=o.find(m=>Mt(m.name,r)||m.code!==""&&Mt(m.code,r));u&&(l=String(u.id),a={region:u.name,region_code:u.code,region_id:Number(u.id)})}this._touched={...this._touched,country_id:!0},this._local={...this._local,country_id:t,region_id:l,region:a},this._emit()}_onRegionSelectChange(e){const n=de(this._local.country_id??"").find(s=>String(s.id)===e.detail.value);this._touched={...this._touched,region_id:!0},this._local={...this._local,region_id:e.detail.value,region:n?{region:n.name,region_code:n.code,region_id:Number(n.id)}:null},this._emit()}_onBlur(e){const t=e.detail.name.startsWith("street_")?"street":e.detail.name;this._touched[t]!==!0&&(this._touched={...this._touched,[t]:!0})}_onSaveToggle(e){this._local={...this._local,save_in_address_book:e.detail.checked},this._emit()}_emit(){this.dispatchEvent(new CustomEvent("address-change",{detail:this._local,bubbles:!0,composed:!0}))}}fe=new WeakMap;$e=new WeakMap;ye=new WeakMap;Q([_({type:String})],V.prototype,"mode",2);Q([_({type:Object})],V.prototype,"value",2);Q([_({type:Boolean})],V.prototype,"showSaveInAddressBook",2);Q([P()],V.prototype,"_local",1);Q([P()],V.prototype,"_touched",1);Q([P()],V.prototype,"_revealAll",1);customElements.get("address-form")||customElements.define("address-form",V);var On=Object.defineProperty,Tn=(i,e,t,n)=>{for(var s=void 0,r=i.length-1,o;r>=0;r--)(o=i[r])&&(s=o(e,t,s)||s);return s&&On(e,t,s),s};function Rn(i){const t=D()?.directoryData?.[i],n=t&&typeof t=="object"?t.name:null;return typeof n=="string"&&n!==""?n:i}class _s extends b{createRenderRoot(){return this}render(){const e=this.address,t=e.street.filter(s=>s.trim().length>0).join(", "),n=typeof e.region=="object"&&e.region?.region?e.region.region:"";return c`
            <div class="text-sm text-brand space-y-0.5">
                <p class="font-semibold">${js(e)}</p>
                ${e.company?c`<p class="text-muted">${e.company}</p>`:null}
                <p>${t}</p>
                <p>
                    ${[e.city,n,e.postcode].filter(Boolean).join(", ")}
                </p>
                <p>${Rn(e.country_id)}</p>
                ${e.telephone?c`<p class="text-muted">${e.telephone}</p>`:null}
            </div>
        `}}Tn([_({type:Object})],_s.prototype,"address");customElements.get("address-card")||customElements.define("address-card",_s);var Fn=Object.defineProperty,Nn=Object.getOwnPropertyDescriptor,ms=i=>{throw TypeError(i)},gs=(i,e,t,n)=>{for(var s=n>1?void 0:n?Nn(e,t):e,r=i.length-1,o;r>=0;r--)(o=i[r])&&(s=(n?o(e,t,s):o(s))||s);return n&&s&&Fn(e,t,s),s},fs=(i,e,t)=>e.has(i)||ms("Cannot "+t),In=(i,e,t)=>(fs(i,e,"read from private field"),t?t.call(i):e.get(i)),qn=(i,e,t)=>e.has(i)?ms("Cannot add the same private member more than once"):e instanceof WeakSet?e.add(i):e.set(i,t),Ln=(i,e,t,n)=>(fs(i,e,"write to private field"),e.set(i,t),t),be;const Mn={firstname:"Hyperion_Checkout::firstname_label",lastname:"Hyperion_Checkout::lastname_label",prefix:"Hyperion_Checkout::prefix_label",middlename:"Hyperion_Checkout::middlename_label",suffix:"Hyperion_Checkout::suffix_label",company:"Hyperion_Checkout::company_label",country_id:"Hyperion_Checkout::country_label",street:"Hyperion_Checkout::street_label_primary",postcode:"Hyperion_Checkout::postcode_label",city:"Hyperion_Checkout::city_label",region:"Hyperion_Checkout::region_label",telephone:"Hyperion_Checkout::telephone_label",fax:"Hyperion_Checkout::fax_label"};function he(i){return i!==null&&i.id!=null&&i.id!==""}class ht extends v(b){constructor(){super(...arguments),this.mode="shipping",qn(this,be,!1),this._newAddressSeed=null,this._previous=null,this._openedAtConnect=!1,this._openNewForm=()=>{this._beginNewAddress(null)},this._closeNewForm=()=>{this._openedAtConnect=!1;const e=this._previous??this._firstUsable();this._showNewForm=!1,this._newAddressSeed=null,e!==null?this._selectSaved(e):this._clearSelection()}}get _showNewForm(){return In(this,be)}set _showNewForm(e){Ln(this,be,e)}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.classList.add("hc-host"),this._adoptInitialState()}_adoptInitialState(){if(g().savedAddresses.get().length===0)return;const n=this._currentAddress();if(n!==null){he(n)||(this._showNewForm=!0,this._openedAtConnect=!0);return}const s=this._firstUsable();s&&this._selectSaved(s)}_firstUsable(){const e=Ye().directoryData??{},t=Object.keys(e).length>0;return g().savedAddresses.get().find(s=>!t||e[s.country_id]!==void 0)??null}willUpdate(){this._openedAtConnect&&he(this._currentAddress())&&(this._showNewForm=!1,this._newAddressSeed=null,this._openedAtConnect=!1)}render(){const e=g(),t=e.savedAddresses.get(),n=this.mode==="shipping"?e.selectedShippingAddressId.get():e.selectedBillingAddressId.get();if(t.length===0)return c`
                <address-form
                    mode=${this.mode}
                    .showSaveInAddressBook=${!0}
                    .value=${this._seedForNewAddress()}
                    @address-change=${this._onNewAddressChange}
                ></address-form>
            `;const s=Ye();return c`
            <div>
                <div class="hc-field-row hc-field-row-2"
                     role="radiogroup"
                     aria-label=${this.mode==="shipping"?d("Hyperion_Checkout::shipping_address_heading"):d("Hyperion_Checkout::billing_address_heading")}>
                    ${t.map(r=>this._renderCard(r,n,Vs(r,s)))}
                </div>
                ${this._showNewForm?c`
                          <div class="mt-4 pt-4 border-t border-subtle">
                              <p class="text-sm font-medium text-brand mb-3">
                                  ${d("Hyperion_Checkout::add_new_address")}
                              </p>
                              <address-form
                                  mode=${this.mode}
                                  .showSaveInAddressBook=${!0}
                                  .value=${this._seedForNewAddress()}
                                  @address-change=${this._onNewAddressChange}
                              ></address-form>
                              <div class="mt-3">
                                  <hc-button variant="ghost"
                                             .label=${d("Hyperion_Checkout::cancel")}
                                             data-hyperion-address-cancel
                                             @click=${this._closeNewForm}></hc-button>
                              </div>
                          </div>
                      `:c`
                          <div class="mt-4">
                              <hc-button variant="secondary"
                                         .label=${d("Hyperion_Checkout::add_new_address")}
                                         data-hyperion-address-new
                                         @click=${this._openNewForm}></hc-button>
                          </div>
                      `}
            </div>
        `}_renderCard(e,t,n){const s=e.id??"",r=s===t&&!this._showNewForm;return c`
            <div data-hyperion-address-card=${s}>
                <label class="flex h-full items-start gap-3 rounded-lg border p-3 cursor-pointer ${r?"border-accent bg-accent/5":"border-subtle bg-surface hover:border-accent"}">
                    <input
                        type="radio"
                        name="saved-${this.mode}-address"
                        class="mt-0.5 h-4 w-4 text-accent focus:ring-2 focus:ring-accent"
                        .checked=${r}
                        @change=${()=>this._selectSaved(e)}
                    />
                    <span class="flex-1">
                        <address-card .address=${e}></address-card>
                        ${n.length>0?c`<span class="mt-2 block text-sm text-danger" data-hyperion-address-incomplete>
                                  ${d("Hyperion_Checkout::address_incomplete_notice",{fields:this._fieldNames(n)})}
                              </span>`:h}
                    </span>
                </label>
                ${n.length>0&&!this._showNewForm?c`
                          <div class="mt-1">
                              <hc-button variant="ghost"
                                         .label=${d("Hyperion_Checkout::address_edit")}
                                         data-hyperion-address-edit
                                         @click=${()=>this._editSaved(e)}></hc-button>
                          </div>
                      `:h}
            </div>
        `}_fieldNames(e){return e.map(t=>{const n=Mn[t];return n?d(n):t}).join(", ")}_currentAddress(){const e=g();return this.mode==="shipping"?e.shippingAddress.get():e.billingAddress.get()}_seedForNewAddress(){if(this._newAddressSeed===null){const t=g().customer.get(),n=this._currentAddress();this._newAddressSeed=n!==null&&!he(n)?n:{country_id:S().defaultCountryId,street:[],city:"",firstname:t?.firstname??"",lastname:t?.lastname??"",telephone:n?.telephone??""}}return this._newAddressSeed}_beginNewAddress(e){this._openedAtConnect=!1;const t=this._currentAddress();this._previous=he(t)?t:this._previous,this._newAddressSeed=e,this._showNewForm=!0,this.mode==="shipping"&&g().estimateState.set("idle")}_editSaved(e){const t={...e};delete t.id,delete t.customer_id,delete t.default_shipping,delete t.default_billing,delete t.inline,this._beginNewAddress(t)}_selectSaved(e){this._openedAtConnect=!1;const t=g();this._showNewForm=!1,this._newAddressSeed=null,this._previous=null,this.mode==="shipping"?(t.selectedShippingAddressId.set(e.id??null),t.shippingAddress.set(e)):(t.selectedBillingAddressId.set(e.id??null),t.billingAddress.set(e)),this.dispatchEvent(new CustomEvent("saved-address-select",{detail:{address:e,mode:this.mode},bubbles:!0,composed:!0}))}_clearSelection(){const e=g();this.mode==="shipping"?(e.selectedShippingAddressId.set(null),e.shippingAddress.set(null)):(e.selectedBillingAddressId.set(null),e.billingAddress.set(null))}_onNewAddressChange(e){const t=g(),n={...e.detail};delete n.id,delete n.customer_id,this.mode==="shipping"?(t.selectedShippingAddressId.set(null),t.shippingAddress.set(n)):(t.selectedBillingAddressId.set(null),t.billingAddress.set(n))}}be=new WeakMap;gs([_({type:String})],ht.prototype,"mode",2);gs([P()],ht.prototype,"_showNewForm",1);customElements.get("address-selector")||customElements.define("address-selector",ht);/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Bt=(i,e,t)=>{const n=new Map;for(let s=e;s<=t;s++)n.set(i[s],s);return n},Ee=ot(class extends at{constructor(i){if(super(i),i.type!==ts.CHILD)throw Error("repeat() can only be used in text expressions")}dt(i,e,t){let n;t===void 0?t=e:e!==void 0&&(n=e);const s=[],r=[];let o=0;for(const l of i)s[o]=n?n(l,o):o,r[o]=t(l,o),o++;return{values:r,keys:s}}render(i,e,t){return this.dt(i,e,t).values}update(i,[e,t,n]){const s=Gi(i),{values:r,keys:o}=this.dt(e,t,n);if(!Array.isArray(s))return this.ut=o,r;const l=this.ut??=[],a=[];let u,m,p=0,f=s.length-1,y=0,$=r.length-1;for(;p<=f&&y<=$;)if(s[p]===null)p++;else if(s[f]===null)f--;else if(l[p]===o[y])a[y]=L(s[p],r[y]),p++,y++;else if(l[f]===o[$])a[$]=L(s[f],r[$]),f--,$--;else if(l[p]===o[$])a[$]=L(s[p],r[$]),te(i,a[$+1],s[p]),p++,$--;else if(l[f]===o[y])a[y]=L(s[f],r[y]),te(i,s[p],s[f]),f--,y++;else if(u===void 0&&(u=Bt(o,y,$),m=Bt(l,p,f)),u.has(l[p]))if(u.has(l[f])){const k=m.get(o[y]),A=k!==void 0?s[k]:null;if(A===null){const H=te(i,s[p]);L(H,r[y]),a[y]=H}else a[y]=L(A,r[y]),te(i,s[p],A),s[k]=null;y++}else Ie(s[f]),f--;else Ie(s[p]),p++;for(;y<=$;){const k=te(i,a[$+1]);L(k,r[y]),a[y++]=k}for(;p<=f;){const k=s[p++];k!==null&&Ie(k)}return this.ut=o,ss(i,a),I}});function R(i,e){const t=typeof i=="string"?Number(i):i;if(!Number.isFinite(t))return e.pattern.replace("%s","");const n=e.integerRequired?0:Math.max(0,e.requiredPrecision??e.precision??2),s=Math.abs(t).toFixed(n),[r,o=""]=s.split("."),l=e.groupLength>0?e.groupLength:3,a=(r??"0").split("").reverse(),u=[];for(let f=0;f<a.length;f+=l)u.push(a.slice(f,f+l).reverse().join(""));u.reverse();let m=u.join(e.groupSymbol);o.length>0&&(m=`${m}${e.decimalSymbol}${o}`);const p=e.pattern.replace("%s",m);return t<0?`-${p}`:p}var Bn=Object.defineProperty,Re=(i,e,t,n)=>{for(var s=void 0,r=i.length-1,o;r>=0;r--)(o=i[r])&&(s=o(e,t,s)||s);return s&&Bn(e,t,s),s};function Qe(i){return i.available!==!1&&!!i.method_code}class ce extends b{constructor(){super(...arguments),this.selected=!1,this.disabled=!1,this.grouped=!1}createRenderRoot(){return this}render(){const e=this.method;if(!Qe(e))return this._renderError(e);const n=`hc-ship-${e.carrier_code}-${e.method_code}`,s=this.selected,r=s&&(S().hyperion?.shippingExtensions?.length??0)>0;return c`
            <label for=${n}
                   class="flex items-start justify-between gap-3 rounded-control border p-3 ${this.disabled?"cursor-default":"cursor-pointer"} ${s?"border-accent bg-accent/5":"border-subtle hover:border-accent bg-surface"}">
                <span class="flex min-w-0 items-start gap-3">
                    <input
                        id=${n}
                        type="radio"
                        name="shipping_method"
                        class="mt-0.5 h-4 w-4 shrink-0 text-accent focus:ring-2 focus:ring-accent"
                        .checked=${s}
                        ?disabled=${this.disabled}
                        @change=${this._onSelect}
                    />
                    <span class="block min-w-0 text-sm font-medium text-brand" data-shipping-method-title>
                        ${this.grouped?c`<span class="sr-only">${e.carrier_title}: </span>${e.method_title}`:c`${e.carrier_title}: ${e.method_title}`}
                    </span>
                </span>
                <span class="text-sm font-semibold text-brand text-right" data-shipping-method-price>
                    ${this._priceLabel(e)}
                </span>
            </label>
            ${r?c`<shipping-extension-host placement="below-method"
                                                data-shipping-method-extension
                                                .carrier=${e.carrier_code}
                                                .method=${e.method_code}></shipping-extension-host>`:h}
        `}_renderError(e){const t=`hc-ship-${e.carrier_code}-unavailable`,n=e.error_message;return c`
            <label for=${t}
                   class="flex items-start gap-3 rounded-control border border-subtle bg-surface p-3"
                   data-shipping-method-error>
                <input
                    id=${t}
                    type="radio"
                    name="shipping_method"
                    class="mt-0.5 h-4 w-4 shrink-0 text-accent"
                    .checked=${!1}
                    disabled
                    aria-describedby=${n?`${t}-message`:h}
                />
                <span class="block min-w-0">
                    <span class="block text-sm font-medium text-brand" data-shipping-method-title>${e.carrier_title}</span>
                    ${n?c`<span id="${t}-message" class="block text-xs text-danger mt-0.5">${n}</span>`:h}
                </span>
            </label>
        `}_priceLabel(e){const t=S(),n=K(),s=Number(e.price_incl_tax??e.amount??0),r=Number(e.price_excl_tax??e.amount??0);if(t.isDisplayShippingBothPrices&&s!==r)return d("Hyperion_Checkout::shipping_price_both",{excl:R(r,n),incl:R(s,n)});const o=t.isDisplayShippingPriceExclTax?r:s;return o===0?d("Hyperion_Checkout::shipping_free"):R(o,n)}_onSelect(){this.dispatchEvent(new CustomEvent("method-select",{detail:{carrier_code:this.method.carrier_code,method_code:this.method.method_code},bubbles:!0,composed:!0}))}}Re([_({type:Object})],ce.prototype,"method");Re([_({type:Boolean})],ce.prototype,"selected");Re([_({type:Boolean})],ce.prototype,"disabled");Re([_({type:Boolean})],ce.prototype,"grouped");customElements.get("shipping-method-row")||customElements.define("shipping-method-row",ce);function Un(i){const e=new Map;for(const s of i)Qe(s)&&e.set(s.carrier_code,(e.get(s.carrier_code)??0)+1);const t=new Set,n=[];for(const s of i){const r=Qe(s)&&(e.get(s.carrier_code)??0)>1;r&&!t.has(s.carrier_code)&&(t.add(s.carrier_code),n.push({key:`carrier:${s.carrier_code}`,heading:s.carrier_title})),n.push({key:`rate:${s.carrier_code}:${s.method_code}`,method:s,grouped:r})}return n}class Dn extends v(b){createRenderRoot(){return this}render(){const e=g(),t=e.estimateState.get(),n=t==="idle"||t==="error"?[]:e.availableShippingMethods.get(),s=t==="loading",r=t==="empty"||t==="ready"&&n.length===0;let o="";return s&&(o=d(n.length>0?"Hyperion_Checkout::shipping_updating":"Hyperion_Checkout::shipping_calculating")),c`
            <div class="min-h-[6.25rem] space-y-2" data-estimate-state=${t}>
                ${t==="idle"?c`<p class="text-sm text-muted" data-shipping-methods-idle>
                          ${d("Hyperion_Checkout::shipping_waiting_for_address")}
                      </p>`:h}
                ${s&&n.length===0?c`
                          <div class="space-y-2" aria-hidden="true" data-shipping-methods-loading>
                              <div class="h-[2.875rem] rounded-control border border-subtle bg-surface-raised animate-pulse"></div>
                              <div class="h-[2.875rem] rounded-control border border-subtle bg-surface-raised animate-pulse"></div>
                          </div>
                      `:h}
                ${r?c`<p class="text-sm text-danger" data-shipping-methods-none>
                          ${d("Hyperion_Checkout::shipping_none_available")}
                      </p>`:h}
                ${n.length>0?this._renderRows(n,s):h}
                <hc-section-status section="shipping-methods"></hc-section-status>
            </div>
            <p class="sr-only" role="status" data-shipping-methods-progress>${o}</p>
        `}_renderRows(e,t){const n=g().selectedShippingMethod.get();return c`
            <div role="radiogroup"
                 aria-label=${d("Hyperion_Checkout::shipping_method_aria")}
                 aria-busy=${t?"true":h}
                 class="space-y-2 ${t?"opacity-60":""}">
                ${Ee(Un(e),s=>s.key,s=>"heading"in s?c`<p class="pt-1 text-xs font-semibold uppercase tracking-wider text-muted"
                              aria-hidden="true"
                              data-shipping-carrier>${s.heading}</p>`:c`
                          <shipping-method-row
                              class="block"
                              .method=${s.method}
                              .grouped=${s.grouped}
                              .disabled=${t}
                              .selected=${n?.carrier_code===s.method.carrier_code&&n.method_code===s.method.method_code}
                              @method-select=${this._onSelect}
                          ></shipping-method-row>
                      `)}
            </div>
        `}_onSelect(e){C().selectShippingMethod(e.detail)}}customElements.get("shipping-method-list")||customElements.define("shipping-method-list",Dn);class jn extends v(b){constructor(){super(...arguments),this._openPolicy=()=>{const e=this.querySelector("dialog[data-hyperion-shipping-policy]");e&&(typeof e.showModal=="function"?e.showModal():e.setAttribute("open",""))},this._closePolicy=()=>{const e=this.querySelector("dialog[data-hyperion-shipping-policy]");e&&(typeof e.close=="function"?e.close():e.removeAttribute("open"))}}createRenderRoot(){return this}connectedCallback(){if(super.connectedCallback(),this.classList.add("hc-host"),(S().hyperion?.shippingExtensions?.length??0)>0&&!g().isVirtual.get()){const e=()=>E(()=>import("./shipping-extension-host-BqBFpBF3.js"),__vite__mapDeps([8,1,2,6,7,9,10]),import.meta.url);e().catch(()=>new Promise(t=>setTimeout(t,1e3)).then(e)).catch(t=>{console.error("[hyperion-checkout] the shipping extensions could not be loaded",t),Ws()})}}render(){if(g().isVirtual.get())return null;const t=this._renderEditor(),n=Yt.get();return c`
            <div>
                <h3 class="mb-4 text-base font-semibold text-brand">
                    ${d("Hyperion_Checkout::shipping_address_heading")}
                </h3>
                ${n===null?t:n.address(t)}
                <hc-section-status section="shipping-address"></hc-section-status>
                <hc-slot-outlet name="after-shipping-address"></hc-slot-outlet>
                <div class="mt-4 pt-2 border-t border-subtle">
                    <h3 class="text-base font-semibold text-brand mb-2">
                        ${d("Hyperion_Checkout::shipping_method_heading")}
                    </h3>
                    <shipping-method-list></shipping-method-list>
                    ${n?.afterMethods()??h}
                    <hc-slot-outlet name="after-shipping-methods"></hc-slot-outlet>
                    ${this._renderShippingPolicy()}
                </div>
            </div>
        `}_renderEditor(){const e=g();return e.customer.get()!==null?c`<address-selector mode="shipping"
                                      @saved-address-select=${this._onSavedPick}
                                      @address-change=${this._onAddressChange}
                                      @focusout=${this._onFormFocusOut}
                    ></address-selector>`:c`<address-form
                        mode="shipping"
                        .value=${e.shippingAddress.get()}
                        @address-change=${this._onAddressChange}
                        @focusout=${this._onFormFocusOut}
                    ></address-form>`}_renderShippingPolicy(){const e=S().shippingPolicy;if(!e||!e.isEnabled)return h;const t=xn(e.shippingPolicyContent??"");return t.trim()===""?h:c`
            <div class="pt-3">
                <button type="button"
                        class="flex min-h-6 items-center text-sm font-medium text-accent hover:underline"
                        data-hyperion-shipping-policy-open
                        @click=${this._openPolicy}>
                    ${d("Hyperion_Checkout::shipping_policy_open")}
                </button>
                <dialog class="w-full max-w-lg rounded-md border border-subtle bg-surface p-0 text-brand shadow-lg backdrop:bg-black/40"
                        aria-labelledby="hc-shipping-policy-heading"
                        data-hyperion-shipping-policy>
                    <div class="p-4 space-y-3">
                        <h3 id="hc-shipping-policy-heading" class="text-base font-semibold text-brand">
                            ${d("Hyperion_Checkout::shipping_policy_heading")}
                        </h3>
                        <div class="text-sm text-brand space-y-2 max-h-[60vh] overflow-y-auto">${_n(t)}</div>
                        <div class="flex justify-end">
                            <hc-button variant="secondary"
                                       .label=${d("Hyperion_Checkout::shipping_policy_close")}
                                       @click=${this._closePolicy}></hc-button>
                        </div>
                    </div>
                </dialog>
            </div>
        `}_onAddressChange(e){const t=g(),n=t.shippingAddress.get()?.country_id??"";t.shippingAddress.set(e.detail),n!==""&&e.detail.country_id!==n?C().estimateShippingNow():C().scheduleShippingEstimate()}_onFormFocusOut(e){const t=e.currentTarget,n=e.relatedTarget;t!==null&&n instanceof Node&&t.contains(n)||C().flushShippingForm()}_onSavedPick(){C().estimateShippingNow()}}customElements.get("checkout-shipping")||customElements.define("checkout-shipping",jn);zs(()=>E(()=>import("./payment-host-BPAzmFj7.js").then(i=>i.m),__vite__mapDeps([11,1,2,9,6,7,5]),import.meta.url));var Vn=Object.defineProperty,ut=(i,e,t,n)=>{for(var s=void 0,r=i.length-1,o;r>=0;r--)(o=i[r])&&(s=o(e,t,s)||s);return s&&Vn(e,t,s),s};class Fe extends v(b){constructor(){super(...arguments),this.row=null,this.unsupported=null,this.selected=!1,this._onRetryRow=()=>{const e=this.row;e!==null&&(G()?.retryRow($t(e.method.code,e.token)),this.requestUpdate())},this._onRetryEntry=()=>{const e=this.unsupported?.entry;e&&yt().then(t=>t.retryEntry(e))}}createRenderRoot(){return this}render(){const e=G();if(this.unsupported!==null)return e===null?h:e.renderUnsupportedRow(this.unsupported,this._onRetryEntry);const t=this.row;if(t===null)return h;const n=t.method,s=t.token?`hc-pay-${t.token.key}`:`hc-pay-${n.code}`,r=t.token&&e!==null?e.tokenTitle(t):n.title;return c`
            <div class="rounded-md border ${this.selected?"border-accent bg-accent/5":"border-subtle bg-surface"}">
                <label for=${s}
                       class="flex items-start gap-3 p-3 cursor-pointer ${t.pending?"cursor-not-allowed":""}">
                    <input
                        id=${s}
                        type="radio"
                        name="payment_method"
                        class="mt-0.5 h-4 w-4 text-accent focus:ring-2 focus:ring-accent"
                        .checked=${this.selected}
                        ?disabled=${t.pending}
                        @change=${this._onSelect}
                    />
                    <span class="text-sm">
                        <span class="font-medium text-brand">${r}</span>
                    </span>
                </label>
                ${this.selected&&e!==null?e.renderRowBody(t,this._onRetryRow):h}
            </div>
        `}updated(){const e=this.row;if(!this.selected||e===null||this.unsupported!==null)return;const t=G();if(t===null){yt().then(()=>this.requestUpdate(),o=>{console.error("[hyperion-checkout] the payment host could not be loaded",o)});return}const n=this.querySelector("[data-payment-body]");if(n===null)return;const s=$t(e.method.code,e.token),r=t.elementFor({rowKey:s,entry:e.entry,method:{code:e.method.code,title:e.method.title},token:e.token});if(r===null){Gs(e.entry);return}t.attach(n,s,r)}_onSelect(){const e=this.row;e!==null&&this.dispatchEvent(new CustomEvent("payment-select",{detail:{code:e.method.code,...e.token?{publicHash:e.token.publicHash}:{}},bubbles:!0,composed:!0}))}}ut([_({attribute:!1})],Fe.prototype,"row");ut([_({attribute:!1})],Fe.prototype,"unsupported");ut([_({type:Boolean})],Fe.prototype,"selected");customElements.get("payment-method-row")||customElements.define("payment-method-row",Fe);class Wn extends v(b){constructor(){super(...arguments),this._last=null,this._announcement=""}createRenderRoot(){return this}render(){const e=g(),t=Ks(e.availablePaymentMethods.get(),e.totals.get()),n=e.selectedPaymentMethod.get(),s=t.map(r=>r.code).join(",");return this._last!==null&&this._last.codes!==s&&this._last.selected!==null&&n===null?this._announcement=d("Hyperion_Checkout::payment_methods_updated"):this._last!==null&&this._last.codes!==s&&(this._announcement=""),this._last={codes:s,selected:n},c`
            <p class="sr-only" role="status" aria-live="polite" data-payment-methods-status>${this._announcement}</p>
            ${this._renderList(t)}
        `}_renderList(e){const t=g();Ys(e);const n=Js(e),s=G();if(s!==null)for(const l of n)s.checkUsable(l.entry,l.method.code);const r=t.selectedPaymentMethod.get(),o=s!==null&&s.showsUnsupportedPayments()?s.unsupportedRows(t.availablePaymentMethods.get()):[];return n.length===0&&o.length===0?t.quoteWritesPending.get()>0||t.isSettlingTotals.get()||t.isLoadingShippingMethods.get()?c`
                    <div class="space-y-2"
                         aria-busy="true"
                         aria-label=${d("Hyperion_Checkout::payment_method_aria")}
                         data-payment-methods-loading>
                        <div class="h-[2.875rem] rounded-control border border-subtle bg-surface-raised animate-pulse" aria-hidden="true"></div>
                        <div class="h-[2.875rem] rounded-control border border-subtle bg-surface-raised animate-pulse" aria-hidden="true"></div>
                    </div>
                `:e.length===0&&!t.isVirtual.get()&&t.appliedShippingMethod.get()===null?c`<p class="text-sm text-muted" role="status" aria-live="polite" data-payment-methods-waiting>
                    ${d("Hyperion_Checkout::payment_waiting_for_shipping")}
                </p>`:(s?.reportHidden(e.filter(a=>Zs(a.code)!==null).map(a=>a.code)),c`<p class="text-sm text-danger" role="alert" data-payment-methods-none>
                ${d("Hyperion_Checkout::payment_none_available")}
            </p>`):c`
            <div role="radiogroup"
                 aria-label=${d("Hyperion_Checkout::payment_method_aria")}
                 class="space-y-2">
                ${Ee(n,l=>l.token?.publicHash??l.method.code,l=>c`
                    <payment-method-row
                        class="block"
                        .row=${l}
                        .selected=${r===l.method.code&&(l.token===null||Xs(l.method.code)?.publicHash===l.token.publicHash)}
                        @payment-select=${this._onSelect}
                    ></payment-method-row>
                `)}
                ${o.length>0?Ee(o,l=>`unsupported:${l.method.code}`,l=>c`
                        <payment-method-row class="block" .unsupported=${l}></payment-method-row>
                    `):h}
            </div>
        `}_onSelect(e){const t=g();if(e.detail.publicHash){Qs(e.detail.code,e.detail.publicHash),t.selectedPaymentMethod.set(e.detail.code);return}t.selectedPaymentMethod.set(e.detail.code),C().savePaymentMethod()}}customElements.get("payment-method-list")||customElements.define("payment-method-list",Wn);class zn extends v(b){createRenderRoot(){return this}render(){const e=g(),t=e.isVirtual.get(),n=ei(e),s=e.shippingAddressOverride.get()?.separateBilling===!0,r=e.billingAddress.get(),l=e.customer.get()!==null?c`<address-selector mode="billing"
                                      @address-change=${this._onBillingChange}
                                      @saved-address-select=${this._onSavedBillingPick}
                    ></address-selector>`:c`<address-form
                        mode="billing"
                        .value=${r}
                        .showSaveInAddressBook=${e.customer.get()!==null}
                        @address-change=${this._onBillingChange}
                    ></address-form>`;return c`
            <section class="space-y-4">
                ${t?c`
                          <div class="space-y-3">
                              <h3 class="text-base font-semibold text-heading">
                                  ${d("Hyperion_Checkout::billing_address_heading")}
                              </h3>
                              ${l}
                              <hc-section-status section="billing"></hc-section-status>
                          </div>
                      `:c`
                          ${s?h:c`<hc-checkbox
                                    name="billing_same_as_shipping"
                                    label=${d("Hyperion_Checkout::billing_same_as_shipping")}
                                    .checked=${n}
                                    @value-change=${this._onToggle}
                                ></hc-checkbox>`}
                          ${n?h:c`
                                    <div class="space-y-3 pt-2 border-t border-subtle">
                                        <h3 class="text-base font-semibold text-heading">
                                            ${d("Hyperion_Checkout::billing_address_heading")}
                                        </h3>
                                        ${l}
                                        <hc-section-status section="billing"></hc-section-status>
                                    </div>
                                `}
                      `}
                <div class="pt-2 border-t border-subtle">
                    <h3 class="text-base font-semibold text-heading mb-2">
                        ${d("Hyperion_Checkout::payment_method_heading")}
                    </h3>
                    <hc-slot-outlet name="before-payment-methods"></hc-slot-outlet>
                    <payment-method-list></payment-method-list>
                    <hc-section-status section="payment"></hc-section-status>
                </div>
            </section>
        `}_onToggle(e){g().billingSameAsShipping.set(e.detail.checked),C().invalidateBillingSync(),C().syncBillingAddress()}_onBillingChange(e){g().billingAddress.set(e.detail),C().invalidateBillingSync(),C().scheduleBillingSync()}_onSavedBillingPick(){C().invalidateBillingSync(),C().syncBillingAddress()}}customElements.get("checkout-payment")||customElements.define("checkout-payment",zn);function Ut(i,e,t,n,s){return e==="both"?[{code:`${i.code}_excl`,label:s.exclTax(i.title),value:t,kind:"regular"},{code:`${i.code}_incl`,label:s.inclTax(i.title),value:n,kind:"regular"}]:[{code:i.code,label:i.title,value:e==="including"?n:t,kind:"regular"}]}function Dt(i,e){const t={code:"shipping",label:i,value:0,kind:"regular"};return e.shippingNotCalculated!==void 0&&(t.text=e.shippingNotCalculated),t}function Gn(i,e){const t=i.title??"";if(i.percent==null||!Number.isFinite(Number(i.percent)))return t;const n=e.percent?e.percent(Number(i.percent)):`${Number(i.percent)}%`;return t===""?n:`${t} (${n})`}function Kn(i,e,t){const n=Number(i.value);if(n===0&&!e.isZeroTaxDisplayed)return[];const s=[];if(e.isFullTaxSummaryDisplayed){const o=i.extension_attributes?.tax_grandtotal_details??[];for(const l of o)s.push({code:"tax_rate",label:(l.rates??[]).map(a=>Gn(a,t)).filter(a=>a!=="").join(", "),value:Number(l.amount??0),kind:"detail"})}return s.push({code:i.code,label:i.title,value:n,kind:"regular"}),s}const jt="grand_total",Yn=["tax_subtotal","tax_shipping","weee","msrp"];function Vt(i,e){if(i==null||Array.isArray(i)||!Object.hasOwn(i,e))return;const t=i[e];if(typeof t!="number"&&(typeof t!="string"||t.trim()===""))return;const n=Number(t);return Number.isFinite(n)?n:void 0}function Jn(i,e){const t=Vt(e,jt),n=t===void 0?Number.MAX_VALUE:t-.5;let s=-Number.MAX_VALUE;const r=i.map((o,l)=>{const a=Vt(e,o.code);let u;return a!==void 0?(u=a,Yn.includes(o.code)||(s=a)):u=o.code===jt?1/0:Math.min(s,n),{segment:o,position:u,index:l}});return r.sort((o,l)=>o.position===l.position?o.index-l.index:o.position<l.position?-1:1),r.map(o=>o.segment)}function Wt(i,e,t,n={}){const s=[],r=n.shippingPending===!0,o=Jn(i.total_segments,n.totalsSort),l=o.some(a=>a.code==="shipping");for(const a of o)switch(a.code){case"subtotal":s.push(...Ut(a,e.reviewTotalsDisplayMode,Number(i.subtotal),Number(i.subtotal_incl_tax),t)),r&&!l&&s.push(Dt(t.shippingTitle??"",t));break;case"shipping":r?s.push(Dt(a.title||(t.shippingTitle??""),t)):a.value!==null&&a.value!==void 0&&s.push(...Ut(a,e.reviewShippingDisplayMode,Number(i.shipping_amount),Number(i.shipping_incl_tax),t));break;case"tax":s.push(...Kn(a,e,t));break;case"grand_total":{const u=Number(a.value),m={code:a.code,label:a.title,value:u,kind:"grand"};r&&(m.provisional=!0),e.includeTaxInGrandTotal&&(s.push({code:"grand_total_excl",label:t.exclTax(a.title),value:u-Number(i.tax_amount),kind:"regular"}),m.label=t.inclTax(a.title)),s.push(m);break}default:{if(a.value===null||a.value===void 0)break;const u=Number(a.value);if(!Number.isFinite(u)||u===0)break;const m={code:a.code,label:a.title,value:u,kind:"regular"};u<0&&(m.tone="discount"),s.push(m)}}return s}function Zn(i,e,t){return i==="excluding"?e:t}function $s(i){return!i.isVirtual.get()&&i.appliedShippingMethod.get()===null&&i.optimisticTotals.get()===null}function pt(i=g()){const e=i.totals.get(),t=i.optimisticTotals.get(),n=t??e;if(!n)return null;const s=n.total_segments.find(o=>o.code==="grand_total"),r=s?.value??n.grand_total;return{label:s?.title??"",text:R(r,K()),settled:t===null&&!i.isSettlingTotals.get()&&!$s(i)}}function Xn(i){try{return new Intl.NumberFormat(ti(),{style:"percent",maximumFractionDigits:4}).format(i/100)}catch{return`${i}%`}}function Qn(){return{exclTax:i=>d("Hyperion_Checkout::total_excl_tax",{title:i}),inclTax:i=>d("Hyperion_Checkout::total_incl_tax",{title:i}),shippingNotCalculated:d("Hyperion_Checkout::shipping_not_calculated"),shippingTitle:d("Hyperion_Checkout::shipping_heading"),percent:Xn}}const er={grand:"mt-auto flex items-center justify-between gap-3 pt-2 border-t border-subtle text-base font-bold text-heading",detail:"flex items-center justify-between gap-3 text-xs text-muted",regular:"flex items-center justify-between gap-3 text-sm text-brand"};function tr(i){const e=new Map;return i.map(t=>{const n=e.get(t.code)??0;e.set(t.code,n+1);const s=t.text===void 0?t.code:`${t.code}:text`;return{key:n===0?s:`${s}:${n}`,row:t}})}class sr extends v(b){constructor(){super(...arguments),this._seenGrand=null,this._announcement=""}createRenderRoot(){return this}render(){const e=g(),t=e.totals.get(),n=e.optimisticTotals.get()??t;if(!n)return null;const s=e.isSettlingTotals.get(),r=e.isVirtual.get(),o=S(),l=K(),a=Qn(),u={shippingPending:$s(e),totalsSort:o.hyperion?.totalsSort},m=Wt(n,o,a,u),p=t===null||t===n?m:Wt(t,o,a,u),f=t===null?void 0:p.find($=>$.kind==="grand");this._trackAnnouncement(f?`${f.label} ${R(f.value,l)}`:null,e.optimisticTotals.get()===null&&!s);const y=this._baseChargeNotice(n.base_currency_code,n.quote_currency_code,n.base_grand_total);return c`
            <dl class="flex flex-col gap-1.5 ${r?"min-h-[5.3125rem]":"min-h-[6.9375rem]"}"
                data-hyperion-totals>
                ${Ee(tr(m),$=>$.key,({row:$})=>{const k=$.kind==="grand"&&(s||$.provisional===!0);return c`
                        <div class="${er[$.kind]} ${$.tone==="discount"?"text-success":""}"
                             data-total=${$.code}
                             ?data-provisional=${k}
                             aria-busy=${$.kind==="grand"&&s?"true":h}>
                            <dt class="min-w-0 flex-1 truncate" title=${$.label}>${$.label}</dt>
                            <dd class="shrink-0 whitespace-nowrap text-right ${$.text!==void 0?"text-muted":""}">
                                ${$.text??R($.value,l)}
                            </dd>
                        </div>
                        ${$.code==="shipping"?Yt.get()?.summary():h}
                    `})}
            </dl>
            ${y!==null?c`<p class="mt-1 text-xs text-muted text-right" data-base-charge-notice>${y}</p>`:h}
            <div role="status"
                 aria-live="polite"
                 class="sr-only"
                 data-hyperion-grand-total-live>${this._announcement}</div>
        `}_trackAnnouncement(e,t){if(!(e===null||e===this._seenGrand)){if(this._seenGrand===null){this._seenGrand=e;return}t&&(this._announcement=d("Hyperion_Checkout::summary_updated",{total:e}),this._seenGrand=e)}}_baseChargeNotice(e,t,n){if(typeof e!="string"||typeof t!="string"||e===""||t===""||e===t)return null;const s=S().basePriceFormat??K();return d("Hyperion_Checkout::base_charge_notice",{amount:R(n,s)})}}customElements.get("summary-totals")||customElements.define("summary-totals",sr);function ir(i,e=!1){const t=i.weee_tax_applied;if(t==null||t==="")return[];let n;try{n=typeof t=="string"?JSON.parse(t):t}catch{return[]}if(!Array.isArray(n))return[];const s=[];for(const r of n){if(!r||typeof r!="object")continue;const o=r,l=Number(e?o.amount_incl_tax??o.amount:o.amount),a=Number(e?o.row_amount_incl_tax??o.row_amount:o.row_amount);!Number.isFinite(a)||a<=0||s.push({title:typeof o.title=="string"&&o.title!==""?o.title:d("Hyperion_Checkout::fpt_fallback_title"),amount:Number.isFinite(l)?l:0,rowAmount:a})}return s}var nr=Object.defineProperty,ys=(i,e,t,n)=>{for(var s=void 0,r=i.length-1,o;r>=0;r--)(o=i[r])&&(s=o(e,t,s)||s);return s&&nr(e,t,s),s};class _t extends b{constructor(){super(...arguments),this.eager=!1}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.hasAttribute("role")||this.setAttribute("role","listitem")}render(){const e=this.item,t=S(),n=this._imageFromConfig(t,String(e.item_id))??e.thumbnail??"",s=this._parseOptions(e.options),r=t.isWeeeEnabled?ir(e,t.reviewItemPriceDisplayMode==="including"):[];return c`
            <div class="flex gap-3 py-2">
                ${n?c`<img src=${n}
                                alt=""
                                width="64"
                                height="64"
                                class="h-16 w-16 shrink-0 rounded-control border border-subtle object-cover bg-surface-raised"
                                loading=${this.eager?"eager":"lazy"}>`:c`<div class="h-16 w-16 shrink-0 rounded-control border border-subtle bg-surface-raised"></div>`}
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-brand line-clamp-2" title=${e.name}>${e.name}</p>
                    ${s.length>0?c`<ul class="text-xs text-muted space-y-0.5 mt-0.5">
                                ${s.map(o=>c`
                                    <li><span>${o.label}:</span> <span>${o.value}</span></li>
                                `)}
                            </ul>`:null}
                    ${r.length>0?c`<ul class="text-xs text-muted mt-0.5" data-hyperion-fpt>
                                ${r.map(o=>c`
                                    <li>${o.title}: ${R(o.rowAmount,K())}</li>
                                `)}
                            </ul>`:null}
                    <p class="text-xs text-muted mt-1">${d("Hyperion_Checkout::qty_label")} ${String(e.qty)}</p>
                </div>
                <div class="text-sm font-semibold text-brand whitespace-nowrap">
                    ${R(this._rowTotal(e,t),K())}
                </div>
            </div>
        `}_rowTotal(e,t){const n=Number(e.row_total),s=Number(e.row_total_incl_tax??e.row_total);return Zn(t.reviewItemPriceDisplayMode,n,s)}_parseOptions(e){if(!e)return[];let t;if(typeof e=="string")try{const n=JSON.parse(e);t=Array.isArray(n)?n:[]}catch{return[]}else t=e;return t.map(n=>({label:String(n.label??""),value:vn(String(n.value??""))}))}_imageFromConfig(e,t){const s=e.imageData;if(!s||typeof s!="object")return null;const r=s[t];if(!r||typeof r!="object")return null;const o=r.src;return typeof o=="string"?o:null}}ys([_({type:Object})],_t.prototype,"item");ys([_({type:Boolean})],_t.prototype,"eager");customElements.get("summary-item")||customElements.define("summary-item",_t);var rr=Object.defineProperty,or=Object.getOwnPropertyDescriptor,bs=i=>{throw TypeError(i)},vs=(i,e,t,n)=>{for(var s=or(e,t),r=i.length-1,o;r>=0;r--)(o=i[r])&&(s=o(e,t,s)||s);return s&&rr(e,t,s),s},xs=(i,e,t)=>e.has(i)||bs("Cannot "+t),zt=(i,e,t)=>(xs(i,e,"read from private field"),t?t.call(i):e.get(i)),Gt=(i,e,t)=>e.has(i)?bs("Cannot add the same private member more than once"):e instanceof WeakSet?e.add(i):e.set(i,t),Kt=(i,e,t,n)=>(xs(i,e,"write to private field"),e.set(i,t),t),ve,xe;const ie="sales_rule_coupon_request";class mt extends v(b){constructor(){super(...arguments),Gt(this,ve,!1),Gt(this,xe,!1),this._apply=async()=>{const e=g();if(si(e,ie)&&ii(e,ie)===""){et(ie,d("Hyperion_Checkout::validation_required")),ni(ie);return}this._busy=!0;try{await C().applyCoupon(W.get().trim())&&(W.set(""),this._open=!1)}finally{this._busy=!1}},this._remove=async()=>{this._busy=!0;try{await C().removeCoupon()}finally{this._busy=!1}}}get _open(){return zt(this,ve)}set _open(e){Kt(this,ve,e)}get _busy(){return zt(this,xe)}set _busy(e){Kt(this,xe,e)}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),W.get().trim()!==""&&(this._open=!0)}render(){const e=g(),t=W.get(),n=e.appliedCoupon.get(),s=ke(ie)===null?e.couponError.get():null;return n?c`
                <div class="rounded-md border border-accent/30 bg-accent/5 p-3">
                    <div class="flex items-center justify-between gap-3">
                        <div>
                            <p class="text-sm font-medium text-brand">
                                ${d("Hyperion_Checkout::coupon_applied")}
                            </p>
                            <p class="text-xs text-muted">
                                <code>${n}</code>
                            </p>
                        </div>
                        <hc-button variant="ghost"
                                   .label=${d("Hyperion_Checkout::coupon_remove")}
                                   .loading=${this._busy}
                                   @click=${this._remove}></hc-button>
                    </div>
                </div>
            `:this._open?c`
            <div class="space-y-2">
                <hc-text-input
                    label=${d("Hyperion_Checkout::coupon_code_label")}
                    name="coupon_code"
                    .value=${t}
                    .error=${s??""}
                    @value-change=${r=>{W.set(r.detail.value)}}
                ></hc-text-input>
                <hc-coupon-captcha></hc-coupon-captcha>
                <div class="flex gap-2">
                    <hc-button variant="primary"
                               .label=${d("Hyperion_Checkout::coupon_apply")}
                               .disabled=${t.trim().length===0}
                               .loading=${this._busy}
                               @click=${this._apply}></hc-button>
                    <hc-button variant="ghost"
                               .label=${d("Hyperion_Checkout::cancel")}
                               @click=${()=>{this._open=!1,W.set("")}}></hc-button>
                </div>
            </div>
        `:c`
                <button type="button"
                        class="text-sm font-medium text-accent hover:underline"
                        @click=${()=>{this._open=!0}}>
                    ${d("Hyperion_Checkout::coupon_have_code")}
                </button>
            `}}ve=new WeakMap;xe=new WeakMap;vs([P()],mt.prototype,"_open");vs([P()],mt.prototype,"_busy");customElements.get("coupon-form")||customElements.define("coupon-form",mt);var ar=Object.defineProperty,lr=(i,e,t,n)=>{for(var s=void 0,r=i.length-1,o;r>=0;r--)(o=i[r])&&(s=o(e,t,s)||s);return s&&ar(e,t,s),s};const cr=3;class ks extends v(b){constructor(){super(...arguments),this.collapsible=!1}createRenderRoot(){return this}render(){return this.collapsible?this._renderCollapsible():c`
            <div class="rounded-card border border-subtle bg-surface-raised">
                ${this._renderContent()}
            </div>
        `}_renderCollapsible(){const e=g(),t=e.items.get().reduce((s,r)=>s+(Number(r.qty)||0),0),n=pt(e);return c`
            <details class="group rounded-card border border-subtle bg-surface-raised">
                <summary class="flex h-[3.375rem] cursor-pointer list-none items-center justify-between gap-3 rounded-card px-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden"
                         data-hyperion-summary-bar>
                    <span class="flex min-w-0 items-center gap-2 text-sm font-medium text-brand">
                        <svg class="h-4 w-4 shrink-0 group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                        <span class="truncate">${ri("Hyperion_Checkout::summary_items",t)}</span>
                    </span>
                    <span class="shrink-0 text-base font-bold text-heading" data-hyperion-summary-bar-total>
                        ${n?.text??h}
                    </span>
                </summary>
                <div class="border-t border-subtle">
                    ${this._renderContent()}
                </div>
            </details>
        `}_renderContent(){const e=g().items.get(),t=S(),n=t.hyperion?.cartUrl||t.cartUrl;return c`
            <section aria-labelledby="hc-summary-heading" class="p-4 space-y-3">
                <div class="flex items-baseline justify-between gap-3">
                    <h2 id="hc-summary-heading" class="text-lg font-bold text-heading tracking-tight">
                        ${d("Hyperion_Checkout::summary_heading")}
                    </h2>
                    ${n?c`<a href=${n}
                                  class="shrink-0 text-sm font-medium text-accent hover:underline"
                                  data-hyperion-edit-cart>${d("Hyperion_Checkout::summary_edit_cart")}</a>`:h}
                </div>
                <div role="list" class="divide-y divide-subtle">
                    ${e.map((s,r)=>c`
                        <summary-item class="block" .item=${s} .eager=${r<cr}></summary-item>
                    `)}
                </div>
                <div class="border-t border-subtle pt-3">
                    <summary-totals></summary-totals>
                    <hc-slot-outlet name="summary-after-totals"></hc-slot-outlet>
                </div>
                <coupon-form class="block"></coupon-form>
                <hc-section-status section="coupon"></hc-section-status>
            </section>
        `}}lr([_({type:Boolean,reflect:!0})],ks.prototype,"collapsible");customElements.get("order-summary")||customElements.define("order-summary",ks);var dr=Object.defineProperty,ws=(i,e,t,n)=>{for(var s=void 0,r=i.length-1,o;r>=0;r--)(o=i[r])&&(s=o(e,t,s)||s);return s&&dr(e,t,s),s};function hr(i){if(i===null)return!1;const e=ui(i);return(e===null?null:pi(e).ownsPlaceOrder)??_i(i)?.ownsPlaceOrder===!0}class gt extends v(b){constructor(){super(...arguments),this._selectors=oi(),this._hint=null,this._invalid=[],this._onClick=async()=>{if(g().orderOutcome.get()!=="none")return;const e=await ai();e.status==="blocked"&&await this._revealMissing(e.reason)}}createRenderRoot(){return this}willUpdate(){if(this._hint===null)return;const e=g();e.orderOutcome.get()!=="none"||e.sessionExpired.get()||e.quoteGone.get()||this._selectors.canPlaceOrder.get()?(this._hint=null,this._invalid=[]):this._hint===li()&&(this._hint=ci(e,this._selectors))}render(){const e=g(),t=G();if(e.orderOutcome.get()==="placed"&&t!==null)return t.renderOrderPlaced(di(S().defaultSuccessPageUrl??""));if(hr(e.selectedPaymentMethod.get()))return h;const n=this._selectors.canPlaceOrder.get(),s=e.isPlacingOrder.get()||e.orderOutcome.get()==="placing",r=pt(e);let o=d("Hyperion_Checkout::place_order");return s?o=d("Hyperion_Checkout::placing_order"):r!==null&&r.settled&&(o=d("Hyperion_Checkout::place_order_amount",{total:r.text})),c`
            <hc-button variant="primary"
                       class="block"
                       data-hyperion-place-order
                       .label=${o}
                       .softDisabled=${!n}
                       .loading=${s}
                       @click=${this._onClick}></hc-button>
            ${this._hint!==null?c`<p class="mt-2 text-sm text-danger"
                          role="status"
                          tabindex="-1"
                          data-place-order-hint>${this._hint}</p>`:h}
            ${this._hint!==null&&t!==null?t.renderErrorSummary(this._invalid):h}
        `}async _revealMissing(e){if(e==="busy"||e==="write-failed"||e==="outcome-unknown")return;const t=g();if(!this._selectors.emailValid.get()){const o=ue(t.email.get());o&&t.fieldErrors.set({...t.fieldErrors.get(),email:d(o)})}if(wn(),this._hint=hi(t,e),e==="updating")return;await this.updateComplete,await new Promise(o=>setTimeout(o,0));const n=this.closest("checkout-app")??document,s=Array.from(n.querySelectorAll('[aria-invalid="true"]'));this._invalid=G()?.invalidFieldsOf(s)??[],(s[0]??this.querySelector("[data-place-order-hint]"))?.focus()}}ws([P()],gt.prototype,"_hint");ws([P()],gt.prototype,"_invalid");customElements.get("place-order-button")||customElements.define("place-order-button",gt);class ur extends v(b){createRenderRoot(){return this}render(){const e=g(),t=e.globalError.get(),n=e.minimumOrderError.get();return!t&&!n?h:c`
            <div role="alert"
                 data-error-banner
                 class="rounded-md border border-danger/40 bg-danger/5 p-3 flex items-start gap-3">
                <p class="flex-1 text-sm text-error-strong">${t??n??""}</p>
                ${t?c`<button type="button"
                                   class="text-xs text-error-strong hover:underline"
                                   @click=${()=>e.globalError.set(null)}>
                              ${d("Hyperion_Checkout::dismiss")}
                          </button>`:h}
            </div>
        `}}customElements.get("error-banner")||customElements.define("error-banner",ur);function pr(){const i=D()?.hyperion;if(i?.loginUrl)return i.loginUrl;const e=i?.baseUrl??"/";return`${e.endsWith("/")?e:`${e}/`}customer/account/login/`}let _r=()=>E(()=>import("./loading-overlay-CBtZ3XFV.js"),__vite__mapDeps([12,1,2]),import.meta.url),We=null;function ze(){return We??=_r().catch(i=>{throw We=null,console.error("[hyperion-checkout] the order overlay could not be loaded",i),i}),We}function mr(){ze().catch(ze).catch(()=>{});let i;try{i=g()}catch{return}mi(()=>i.sessionExpired.get()||i.isPlacingOrder.get(),e=>{!e||customElements.get("hc-session-expired")||ze().catch(()=>{i.sessionExpired.get()&&gi(pr())})})}function gr(i){const e=[];(i.isOrderLevelGiftOptionsEnabled===!0||i.isItemLevelGiftOptionsEnabled===!0)&&e.push(E(()=>import("./checkout-gift-message-Bw_Qs4MC.js"),__vite__mapDeps([13,1,2]),import.meta.url));const t=i.checkoutAgreements;return t?.isEnabled&&(t.agreements?.length??0)>0&&e.push(E(()=>import("./checkout-agreements-CgpjYbqb.js"),__vite__mapDeps([14,1,2]),import.meta.url)),Object.values(i.hyperion?.captcha?.forms??{}).some(s=>s?.isRequired===!0)&&e.push(E(()=>import("./captcha-field-DxJ7AJVP.js"),__vite__mapDeps([0,1,2]),import.meta.url)),fi()&&e.push(E(()=>import("./hyperion-recaptcha-rN8ndbQB.js"),__vite__mapDeps([15,1,2,7]),import.meta.url)),(i.hyperion?.addressFields?.length??0)>0&&e.push(E(()=>import("./address-fields-Dlk3um_U.js"),__vite__mapDeps([16,1,2]),import.meta.url)),e.push($i()),mr(),Promise.all(e)}const fr=()=>E(()=>import("./runtime-DMZ9AsYC.js"),__vite__mapDeps([17,1,2,9,6,7,10,4]),import.meta.url),$r="(min-width: 1024px)",Ge="rounded-card border border-subtle bg-surface p-4 space-y-3",Ke="text-lg font-bold text-heading tracking-tight";class Cs extends v(b){constructor(){super(...arguments),this._wideLayout=null,this._onLayoutChange=()=>{this.requestUpdate()},this._onLoginRequest=async()=>{const{inlineLogin:e}=await E(async()=>{const{inlineLogin:t}=await import("./login-action-sh0Uq97N.js");return{inlineLogin:t}},__vite__mapDeps([18,1,2]),import.meta.url);await e()}}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),typeof window.matchMedia=="function"&&(this._wideLayout=window.matchMedia($r),this._wideLayout.addEventListener("change",this._onLayoutChange))}disconnectedCallback(){this._wideLayout?.removeEventListener("change",this._onLayoutChange),this._wideLayout=null,super.disconnectedCallback()}render(){const e=g(),t=e.isVirtual.get(),n=e.customer.get()!==null,s=this._wideLayout?.matches??!1,r=pt(e);return c`
            <div class="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 p-4">
                ${s?h:c`<order-summary class="block min-w-0" collapsible></order-summary>`}
                <div class="space-y-6 min-w-0" data-hyperion-checkout-sections>
                    <h1 class="text-3xl font-bold text-heading tracking-tight">
                        ${d("Hyperion_Checkout::checkout_heading")}
                    </h1>
                    <error-banner></error-banner>
                    <section aria-labelledby="hc-email-heading" class=${Ge}>
                        <h2 id="hc-email-heading" class=${Ke}>
                            ${n?d("Hyperion_Checkout::signed_in_as"):d("Hyperion_Checkout::contact_heading")}
                        </h2>
                        ${n?c`<p class="text-sm text-muted">${e.email.get()}</p>`:c`<checkout-email class="block" @login-request=${this._onLoginRequest}></checkout-email>`}
                        <hc-slot-outlet name="after-email"></hc-slot-outlet>
                    </section>
                    ${t?null:c`
                              <section aria-labelledby="hc-shipping-heading" class=${Ge}>
                                  <h2 id="hc-shipping-heading" class=${Ke}>
                                      ${d("Hyperion_Checkout::shipping_heading")}
                                  </h2>
                                  <checkout-shipping class="block"></checkout-shipping>
                              </section>
                          `}
                    <checkout-gift-message></checkout-gift-message>
                    <section aria-labelledby="hc-payment-heading" class=${Ge}>
                        <h2 id="hc-payment-heading" class=${Ke}>
                            ${d("Hyperion_Checkout::payment_heading")}
                        </h2>
                        <checkout-payment class="block"></checkout-payment>
                        <checkout-agreements></checkout-agreements>
                        <hc-slot-outlet name="after-agreements"></hc-slot-outlet>
                        <hc-recaptcha-badge></hc-recaptcha-badge>
                        <hc-order-captcha></hc-order-captcha>
                        <hc-slot-outlet name="before-place-order"></hc-slot-outlet>
                        <hc-section-status section="order"></hc-section-status>
                        <div class="sticky bottom-0 z-10 -mx-4 -mb-4 space-y-3 rounded-b-card border-t border-subtle bg-surface px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:static lg:z-auto lg:mx-0 lg:mb-0 lg:rounded-none lg:px-0 lg:pb-0"
                             data-hyperion-place-order-bar>
                            ${s?h:c`
                                      <p class="flex h-6 items-center justify-between gap-3 text-base font-bold text-heading"
                                         aria-hidden="true"
                                         data-hyperion-place-order-total>
                                          <span>${r?.label??h}</span>
                                          <span>${r?.text??h}</span>
                                      </p>
                                  `}
                            <place-order-button class="block"></place-order-button>
                        </div>
                    </section>
                </div>
                ${s?c`
                          <aside class="min-w-0 self-start" data-hyperion-summary-rail>
                              <order-summary class="block"></order-summary>
                          </aside>
                      `:h}
            </div>
            <loading-overlay></loading-overlay>
        `}}customElements.get("checkout-app")||customElements.define("checkout-app",Cs);const wr=Object.freeze(Object.defineProperty({__proto__:null,CheckoutApp:Cs,loadExtensionRuntime:fr,loadOptionalSections:gr},Symbol.toStringTag,{value:"Module"}));export{h as A,I as E,ot as a,c as b,Ee as c,at as d,v as e,J as f,wn as g,R as h,b as i,vn as j,wr as k,pr as l,_ as n,T as o,P as r,xn as s,ts as t,Se as v};
//# sourceMappingURL=checkout-app-CCQ4A2FR.js.map
