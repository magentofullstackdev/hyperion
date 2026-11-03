var C=Object.defineProperty;var E=(n,t,e)=>t in n?C(n,t,{enumerable:!0,configurable:!0,writable:!0,value:e}):n[t]=e;var m=(n,t,e)=>E(n,typeof t!="symbol"?t+"":t,e);import{A as _,E as x,i as T,a as A,b as d}from"./lit-element.CGWggwb8.js";import{l as $,u as y,t as L}from"./scroll-lock.Ok7HH6hu.js";import{d as R}from"./hyperion-notification.BA06YLDb.js";import{H as I}from"./hyperion-confirm.CnXw50CA.js";/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const O={CHILD:2},q=n=>(...t)=>({_$litDirective$:n,values:t});class F{constructor(t){}get _$AU(){return this._$AM._$AU}_$AT(t,e,r){this._$Ct=t,this._$AM=e,this._$Ci=r}_$AS(t,e){return this.update(t,e)}update(t,e){return this.render(...e)}}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */class f extends F{constructor(t){if(super(t),this.it=_,t.type!==O.CHILD)throw Error(this.constructor.directiveName+"() can only be used in child bindings")}render(t){if(t===_||t==null)return this._t=void 0,this.it=t;if(t===x)return t;if(typeof t!="string")throw Error(this.constructor.directiveName+"() called with a non-string value");if(t===this.it)return this._t;this.it=t;const e=[t];return e.raw=e,this._t={_$litType$:this.constructor.resultType,strings:e,values:[]}}}f.directiveName="unsafeHTML",f.resultType=1;const D=q(f),U="[data-hyperion-minicart-remove]",g="[data-hyperion-minicart-qty-step]",l="[data-hyperion-minicart-qty]",u="[data-hyperion-minicart-item]",H="[data-hyperion-minicart-update-url]",v="#hyperion-cart-items",w=[["href","data-hyperion-href"],["aria-label","data-hyperion-aria-label"]];function k(n){for(const t of n.children)if(t.tagName==="A"&&t.getAttribute("slot")==="trigger")return t;return null}function S(){for(const n of document.cookie.split(";")){const t=n.trim();if(t.indexOf("form_key=")===0)return t.substring(9)}return""}let p=null;async function P(){return p||(p=(async()=>{const n=document.querySelector('link[rel="stylesheet"][data-hyperion-theme-css]')||document.querySelector('link[rel="stylesheet"][href*="/assets/entry."]');if(!n)return null;try{const t=await fetch(n.href,{credentials:"same-origin"});if(!t.ok)return null;const e=await t.text(),r=new CSSStyleSheet;return r.replaceSync(e),r}catch{return null}})(),p)}class b extends T{constructor(){super(),this.count=0,this.triggerLabel="",this.emptyMessage="",this.closeLabel="",this.fragmentUrl="",this.triggerUrl="",this.removeConfirm="",this._open=!1,this._loading=!1,this._bodyHtml="",this._stale=!0,this._onKeyDown=this._onKeyDown.bind(this),this._onCartChanged=()=>this._markStale(),this._onShadowClick=this._onShadowClick.bind(this),this._onShadowChange=this._onShadowChange.bind(this),this._onTriggerSlotChange=()=>this._neutralizeTriggerLink(),this._pendingFocus=null}_neutralizeTriggerLink(){const t=k(this);if(!(!t||!t.hasAttribute("href"))){for(const[e,r]of w)t.hasAttribute(e)&&(t.setAttribute(r,t.getAttribute(e)),t.removeAttribute(e));t.setAttribute("role","presentation"),t.setAttribute("tabindex","-1")}}_restoreTriggerLink(){const t=k(this);if(!(!t||!t.hasAttribute("data-hyperion-href"))){for(const[e,r]of w)t.hasAttribute(r)&&(t.setAttribute(e,t.getAttribute(r)),t.removeAttribute(r));t.removeAttribute("role"),t.removeAttribute("tabindex")}}updated(t){t.has("_open")&&(this._open?(this.setAttribute("open",""),$()):(this.removeAttribute("open"),y()))}_observeBadge(){this._badgeObserver||(this._badgeObserver=new MutationObserver(()=>this._syncCountFromBadge()),this._badgeObserver.observe(this,{childList:!0,subtree:!0,characterData:!0}),this._syncCountFromBadge())}_syncCountFromBadge(){const t=this.querySelector("#hyperion-mini-cart-count");if(!t)return;const e=parseInt((t.textContent||"").trim(),10)||0;e!==this.count&&(this.count=e,this._markStale())}_markStale(){this._stale=!0,this._open&&!this._updating&&this._fetchFragment()}refresh(){this._markStale()}_onShadowClick(t){const e=t.target.closest(g);if(e){t.preventDefault(),this._stepQty(e);return}const r=t.target.closest(U);if(!r)return;t.preventDefault();const i=r.getAttribute("data-remove-url");if(!i)return;const o=this.removeConfirm;(o?I.ask(o):Promise.resolve(!0)).then(a=>{a&&this._removeItem(i,r)})}_onShadowChange(t){const e=t.target.closest(l);e&&this._updateQty(e,parseInt(e.value,10),{itemId:this._itemIdOf(e),selector:l})}_stepQty(t){const e=t.closest(u),r=e==null?void 0:e.querySelector(l);if(!r)return;const i=parseInt(t.getAttribute("data-hyperion-minicart-qty-step"),10)||0,o=(parseInt(r.value,10)||0)+i;o<1||(r.value=String(o),this._updateQty(r,o,{itemId:this._itemIdOf(r),selector:`${g.slice(0,-1)}="${i}"]`}))}_itemIdOf(t){var e;return((e=t.closest(u))==null?void 0:e.getAttribute("data-item-id"))||""}_updateQty(t,e,r){var h;const i=t.closest(u),o=(h=t.closest(H))==null?void 0:h.getAttribute("data-hyperion-minicart-update-url"),s=this._itemIdOf(t);if(!i||!o||!s||!Number.isInteger(e)||e<1){t.value=t.getAttribute("value")||"1";return}this._pendingFocus=r;const a=Array.from(i.querySelectorAll(`${g}, ${l}`));this._post(o,{update_cart_action:"update_qty",[`cart[${s}][qty]`]:e},a)}_removeItem(t,e){this._post(t,{},[e])}_post(t,e,r){const i=window.htmx;if(!i||typeof i.ajax!="function"){const s=document.createElement("form");s.method="post",s.action=t;for(const[a,h]of Object.entries({...e,form_key:S()})){const c=document.createElement("input");c.type="hidden",c.name=a,c.value=String(h),s.appendChild(c)}document.body.appendChild(s),s.submit();return}r.forEach(s=>{s.disabled=!0}),this._updating=!0;const o=document.querySelector(v);i.ajax("POST",t,{source:this,target:o?v:this,swap:o?"outerHTML":"none",values:{...e,form_key:S()}}).finally(()=>{r.forEach(s=>{s.disabled=!1}),this._updating=!1,this._markStale()})}_restorePendingFocus(){var o;const t=this._pendingFocus;if(!t)return;this._pendingFocus=null;const e=(o=this.shadowRoot)==null?void 0:o.querySelector(`${u}[data-item-id="${t.itemId}"]`);if(!e)return;const r=e.querySelector(t.selector),i=r&&!r.disabled?r:e.querySelector(l);i==null||i.focus()}_fetchFragment(){return this.fragmentUrl?this._fetching?(this._refetchQueued=!0,this._fetching):(this._fetching=this._fetchFragmentOnce().finally(()=>(this._fetching=null,this._refetchQueued?(this._refetchQueued=!1,this._fetchFragment()):this.updateComplete.then(()=>this._restorePendingFocus()))),this._fetching):Promise.resolve()}async _fetchFragmentOnce(){this._loading=!0;try{const t=await fetch(this.fragmentUrl,{credentials:"same-origin",headers:{Accept:"text/html, */*;q=0.8","HX-Request":"true"}});if(!t.ok){this.dispatchEvent(new CustomEvent("hyperion-mini-cart-error",{bubbles:!0,composed:!0,detail:{status:t.status}}));return}this._bodyHtml=await t.text(),this._stale=!1}catch{this.dispatchEvent(new CustomEvent("hyperion-mini-cart-error",{bubbles:!0,composed:!0,detail:{status:0}}))}finally{this._loading=!1}}async openPanel(t){t&&t.preventDefault(),R(),this._open=!0;const e=this._adoptSharedTailwind();this.fragmentUrl&&(!this._bodyHtml||this._stale)&&await this._fetchFragment(),await e,requestAnimationFrame(()=>{var r,i;(i=(r=this.shadowRoot)==null?void 0:r.querySelector('[part="panel"] header button'))==null||i.focus()})}close(){var t,e;this._open=!1,(e=(t=this.shadowRoot)==null?void 0:t.querySelector('[part="trigger"]'))==null||e.focus({preventScroll:!0})}_onKeyDown(t){var e;if(this._open){if(t.key==="Escape"){this.close();return}if(t.key==="Tab"&&t.currentTarget===this){const r=(e=this.shadowRoot)==null?void 0:e.querySelector('[part="panel"]');r&&L(t,r)}}}connectedCallback(){super.connectedCallback(),this._adoptSharedTailwind(),this._neutralizeTriggerLink(),this.addEventListener("keydown",this._onKeyDown),document.addEventListener("keydown",this._onKeyDown),document.addEventListener("hyperion:cart-changed",this._onCartChanged),this._observeBadge(),this.updateComplete.then(()=>{var t,e;(t=this.shadowRoot)==null||t.addEventListener("click",this._onShadowClick),(e=this.shadowRoot)==null||e.addEventListener("change",this._onShadowChange)})}async _adoptSharedTailwind(){if(!this.shadowRoot||this._tailwindAdopted)return;const t=await P();if(!t||!this.shadowRoot)return;const e=this.shadowRoot.adoptedStyleSheets||[];e.includes(t)||(this.shadowRoot.adoptedStyleSheets=[...e,t],this._tailwindAdopted=!0)}disconnectedCallback(){var t,e;super.disconnectedCallback(),this.removeEventListener("keydown",this._onKeyDown),document.removeEventListener("keydown",this._onKeyDown),document.removeEventListener("hyperion:cart-changed",this._onCartChanged),(t=this.shadowRoot)==null||t.removeEventListener("click",this._onShadowClick),(e=this.shadowRoot)==null||e.removeEventListener("change",this._onShadowChange),this._badgeObserver&&(this._badgeObserver.disconnect(),this._badgeObserver=null),this._open&&y(),this._restoreTriggerLink()}render(){return d`
            <button
                part="trigger"
                aria-label="${this.triggerLabel}"
                aria-haspopup="dialog"
                aria-expanded="${this._open}"
                aria-controls="hyperion-mini-cart-panel"
                @click=${this.openPanel}
            >
                <slot name="trigger" @slotchange=${this._onTriggerSlotChange}></slot>
            </button>
            <div
                part="backdrop"
                aria-hidden="${!this._open}"
                @click=${this.close}
            ></div>
            <aside
                part="panel"
                id="hyperion-mini-cart-panel"
                role="dialog"
                aria-modal="true"
                aria-label="${this.triggerLabel}"
                aria-hidden="${!this._open}"
                ?inert=${!this._open}
            >
                <header part="header">
                    <slot name="title"></slot>
                    <button aria-label="${this.closeLabel}" @click=${this.close}>
                        &#x2715;
                    </button>
                </header>
                <div part="item-list">
                    ${this._loading?d`<slot name="loading"></slot>`:this._bodyHtml?d`${D(this._bodyHtml)}`:d`<slot name="empty-message">${this.emptyMessage}</slot>`}
                </div>
                <footer part="footer">
                    <slot name="footer"></slot>
                </footer>
            </aside>
        `}}m(b,"properties",{count:{type:Number,reflect:!0},triggerLabel:{type:String,attribute:"trigger-label"},emptyMessage:{type:String,attribute:"empty-message"},closeLabel:{type:String,attribute:"close-label"},fragmentUrl:{type:String,attribute:"fragment-url"},triggerUrl:{type:String,attribute:"trigger-url"},removeConfirm:{type:String,attribute:"remove-confirm"},_open:{state:!0},_loading:{state:!0},_bodyHtml:{state:!0}}),m(b,"styles",A`
        :host {
            --panel-width: 32rem;
            --panel-background: rgb(var(--color-surface));
            --panel-header-background: rgb(var(--color-surface-raised));
            --panel-text-color: rgb(var(--color-secondary));
            --panel-focus-ring: rgb(var(--color-primary));
            --panel-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
            --backdrop-color: rgba(0, 0, 0, 0.5);
            --transition-duration: 0.3s;
            display: inline-block;
        }

        [part="trigger"] {
            background: transparent;
            border: none;
            cursor: pointer;
            color: var(--panel-text-color);
            display: inline-flex;
            align-items: center;
            gap: 0.375rem;
            padding: 0.5rem;
        }

        [part="trigger"]:focus-visible {
            outline: 2px solid var(--panel-focus-ring);
            outline-offset: 2px;
        }

        [part="backdrop"] {
            position: fixed;
            inset: 0;
            background: var(--backdrop-color);
            opacity: 0;
            visibility: hidden;
            transition: opacity var(--transition-duration) ease, visibility var(--transition-duration) ease;
            z-index: 9998;
        }

        :host([open]) [part="backdrop"] {
            opacity: 1;
            visibility: visible;
        }

        [part="panel"] {
            position: fixed;
            top: 0;
            right: 0;
            bottom: 0;
            /* 100% of the viewport minus the scrollbar: a viewport unit
               includes the scrollbar and, with the root's stable gutter,
               overflows the page by its width. */
            width: 100%;
            max-width: var(--panel-width);
            background: var(--panel-background);
            box-shadow: var(--panel-shadow);
            display: flex;
            flex-direction: column;
            transform: translateX(100%);
            transition: transform var(--transition-duration) ease;
            z-index: 9999;
        }

        :host([open]) [part="panel"] {
            transform: translateX(0);
        }

        header[part="header"] {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: var(--panel-header-background);
            padding: 1rem;
            border-bottom: 1px solid rgb(var(--color-subtle));
            flex-shrink: 0;
        }

        header[part="header"] button {
            background: transparent;
            border: none;
            cursor: pointer;
            color: var(--panel-text-color);
            font-size: 1.25rem;
            line-height: 1;
            padding: 0.25rem 0.5rem;
            border-radius: 0.25rem;
        }

        header[part="header"] button:hover {
            background: rgba(0, 0, 0, 0.05);
        }

        header[part="header"] button:focus-visible {
            outline: 2px solid var(--panel-focus-ring);
            outline-offset: 2px;
        }

        [part="item-list"] {
            flex: 1 1 auto;
            overflow-y: auto;
            padding: 0;
        }

        /* The fragment markup uses <ul role="list"> -- browsers still show
           disc bullets on those unless we explicitly strip them inside the
           component's scope. Same for the implicit left padding. */
        [part="item-list"] ul {
            list-style: none;
            margin: 0;
            padding: 0;
        }

        footer[part="footer"] {
            padding: 1rem;
            border-top: 1px solid rgb(var(--color-subtle));
            flex-shrink: 0;
        }

        @media (prefers-reduced-motion: reduce) {
            [part="panel"], [part="backdrop"] { transition: none; }
        }
    `);customElements.get("hyperion-mini-cart")||customElements.define("hyperion-mini-cart",b);
//# sourceMappingURL=hyperion-mini-cart.CMsSrnij.js.map
