var A=Object.defineProperty;var C=(s,t,e)=>t in s?A(s,t,{enumerable:!0,configurable:!0,writable:!0,value:e}):s[t]=e;var f=(s,t,e)=>C(s,typeof t!="symbol"?t+"":t,e);import{A as S,E,i as q,a as $,b as d}from"./lit-element.CGWggwb8.js";import{l as O,u as k,t as R}from"./scroll-lock.Ok7HH6hu.js";import{dismissAllNotifications as F}from"./hyperion-notification.DUupAMp4.js";import{H as N}from"./hyperion-confirm.CnXw50CA.js";/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Q={CHILD:2},I=s=>(...t)=>({_$litDirective$:s,values:t});class M{constructor(t){}get _$AU(){return this._$AM._$AU}_$AT(t,e,i){this._$Ct=t,this._$AM=e,this._$Ci=i}_$AS(t,e){return this.update(t,e)}update(t,e){return this.render(...e)}}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */class v extends M{constructor(t){if(super(t),this.it=S,t.type!==Q.CHILD)throw Error(this.constructor.directiveName+"() can only be used in child bindings")}render(t){if(t===S||t==null)return this._t=void 0,this.it=t;if(t===E)return t;if(typeof t!="string")throw Error(this.constructor.directiveName+"() called with a non-string value");if(t===this.it)return this._t;this.it=t;const e=[t];return e.raw=e,this._t={_$litType$:this.constructor.resultType,strings:e,values:[]}}}v.directiveName="unsafeHTML",v.resultType=1;const D=I(v),x="[data-hyperion-minicart-remove]",g="[data-hyperion-minicart-qty-step]",c="[data-hyperion-minicart-qty]",u="[data-hyperion-minicart-item]",H="[data-hyperion-minicart-update-url]",p="#hyperion-cart-items",P=250;function _(s){const t=s.getAttribute("step"),e=t===null||t===""?NaN:Number(t),i=Number.isFinite(e)&&e>0,r=t==="any"||i&&!Number.isInteger(e),n=l=>{const h=r?parseFloat(l):parseInt(l,10);return Number.isFinite(h)?Math.round(h*1e4)/1e4:NaN},o=n(s.getAttribute("min")),a=n(s.getAttribute("max"));return{parse:n,step:i?e:1,min:Number.isFinite(o)?o:r?0:1,minExclusive:!Number.isFinite(o)&&r,max:Number.isFinite(a)?a:1/0}}function b(s,t){return Number.isFinite(t)?s.minExclusive?t>s.min:t>=s.min:!1}const L=[["href","data-hyperion-href"],["aria-label","data-hyperion-aria-label"]];function T(s){for(const t of s.children)if(t.tagName==="A"&&t.getAttribute("slot")==="trigger")return t;return null}function y(){for(const s of document.cookie.split(";")){const t=s.trim();if(t.indexOf("form_key=")===0)return t.substring(9)}return""}let m=null;async function U(){return m||(m=(async()=>{const s=document.querySelector('link[rel="stylesheet"][data-hyperion-theme-css]')||document.querySelector('link[rel="stylesheet"][href*="/assets/entry."]');if(!s)return null;try{const t=await fetch(s.href,{credentials:"same-origin"});if(!t.ok)return null;const e=await t.text(),i=new CSSStyleSheet;return i.replaceSync(e),i}catch{return null}})(),m)}class w extends q{constructor(){super(),this.count=0,this.triggerLabel="",this.emptyMessage="",this.closeLabel="",this.fragmentUrl="",this.triggerUrl="",this.removeConfirm="",this._open=!1,this._loading=!1,this._bodyHtml="",this._stale=!0,this._onKeyDown=this._onKeyDown.bind(this),this._onCartChanged=()=>this._markStale(),this._onShadowClick=this._onShadowClick.bind(this),this._onShadowChange=this._onShadowChange.bind(this),this._onTriggerSlotChange=()=>this._neutralizeTriggerLink(),this._pendingFocus=null,this._qtyLines=new Map}_neutralizeTriggerLink(){const t=T(this);if(!(!t||!t.hasAttribute("href"))){for(const[e,i]of L)t.hasAttribute(e)&&(t.setAttribute(i,t.getAttribute(e)),t.removeAttribute(e));t.setAttribute("role","presentation"),t.setAttribute("tabindex","-1")}}_restoreTriggerLink(){const t=T(this);if(!(!t||!t.hasAttribute("data-hyperion-href"))){for(const[e,i]of L)t.hasAttribute(i)&&(t.setAttribute(e,t.getAttribute(i)),t.removeAttribute(i));t.removeAttribute("role"),t.removeAttribute("tabindex")}}updated(t){t.has("_open")&&(this._open?(this.setAttribute("open",""),O()):(this.removeAttribute("open"),k()))}_observeBadge(){this._badgeObserver||(this._badgeObserver=new MutationObserver(()=>this._syncCountFromBadge()),this._badgeObserver.observe(this,{childList:!0,subtree:!0,characterData:!0}),this._syncCountFromBadge())}_syncCountFromBadge(){const t=this.querySelector("#hyperion-mini-cart-count");if(!t)return;const e=parseInt((t.textContent||"").trim(),10)||0;e!==this.count&&(this.count=e,this._markStale())}_markStale(){this._stale=!0,this._open&&!this._updating&&this._qtyLines.size===0&&this._fetchFragment()}refresh(){this._markStale()}_onShadowClick(t){const e=t.target.closest(g);if(e){t.preventDefault(),this._stepQty(e);return}const i=t.target.closest(x);if(!i)return;t.preventDefault();const r=i.getAttribute("data-remove-url");if(!r)return;const n=this.removeConfirm;(n?N.ask(n):Promise.resolve(!0)).then(a=>{a&&this._removeItem(r,i)})}_onShadowChange(t){const e=t.target.closest(c);if(!e)return;const i=_(e);this._queueQty(e,i,i.parse(e.value),c)}_stepQty(t){var l;const e=t.closest(u),i=e==null?void 0:e.querySelector(c);if(!i)return;const r=Math.sign(parseInt(t.getAttribute("data-hyperion-minicart-qty-step"),10)||0);if(r===0)return;const n=_(i),o=((l=this._qtyLines.get(this._itemIdOf(i)))==null?void 0:l.pending)??n.parse(i.value),a=Math.round(((Number.isFinite(o)?o:0)+r*n.step)*1e4)/1e4;!b(n,a)||a>n.max||this._queueQty(i,n,a,`${g.slice(0,-1)}="${t.getAttribute("data-hyperion-minicart-qty-step")}"]`)}_itemIdOf(t){var e;return((e=t.closest(u))==null?void 0:e.getAttribute("data-item-id"))||""}_queueQty(t,e,i,r){var h;const n=t.closest(u),o=(h=t.closest(H))==null?void 0:h.getAttribute("data-hyperion-minicart-update-url"),a=this._itemIdOf(t);let l=this._qtyLines.get(a);if(!n||!o||!a||!b(e,i)){t.value=String(l?l.pending:t.getAttribute("value")||"1");return}l||(l={url:o,pending:i,sent:null,confirmed:e.parse(t.getAttribute("value")),timer:null},this._qtyLines.set(a,l)),l.pending=i,this._pendingFocus={itemId:a,selector:r},this._paintQty(n,i),clearTimeout(l.timer),l.timer=setTimeout(()=>{l.timer=null,l.sent===null&&this._flushQty(a)},P)}_paintQty(t,e){const i=t.querySelector(c);if(!i)return;const r=_(i);i.value=String(e);for(const n of t.querySelectorAll(g)){const o=Math.sign(parseInt(n.getAttribute("data-hyperion-minicart-qty-step"),10)||0),a=Math.round((e+o*r.step)*1e4)/1e4;n.disabled=!b(r,a)||a>r.max}}_itemOf(t){var e;return((e=this.shadowRoot)==null?void 0:e.querySelector(`${u}[data-item-id="${t}"]`))||null}_flushQty(t){var a;const e=this._qtyLines.get(t);if(!e||e.sent!==null||e.timer!==null)return;if(e.pending===e.confirmed){this._settleQty(t);return}const i={update_cart_action:"update_qty",[`cart[${t}][qty]`]:e.pending},r=window.htmx;if(!r||typeof r.ajax!="function"){this._qtyLines.delete(t),this._post(e.url,i,[]);return}e.sent=e.pending;const n=(a=this._itemOf(t))==null?void 0:a.querySelector(x);n&&(n.disabled=!0);const o=document.querySelector(p);r.ajax("POST",e.url,{source:this,target:o?p:this,swap:o?"outerHTML":"none",values:{...i,form_key:y()}}).finally(()=>{this._qtyLines.get(t)===e&&(e.confirmed=e.sent,e.sent=null,this._flushQty(t))})}_settleQty(t){this._qtyLines.delete(t),this._qtyLines.size===0&&this._markStale()}_repaintPendingQty(){for(const[t,e]of this._qtyLines){const i=this._itemOf(t);i&&this._paintQty(i,e.pending)}}_removeItem(t,e){var r;const i=this._itemIdOf(e);clearTimeout((r=this._qtyLines.get(i))==null?void 0:r.timer),this._qtyLines.delete(i),this._post(t,{},[e])}_post(t,e,i){const r=window.htmx;if(!r||typeof r.ajax!="function"){const o=document.createElement("form");o.method="post",o.action=t;for(const[a,l]of Object.entries({...e,form_key:y()})){const h=document.createElement("input");h.type="hidden",h.name=a,h.value=String(l),o.appendChild(h)}document.body.appendChild(o),o.submit();return}i.forEach(o=>{o.disabled=!0}),this._updating=!0;const n=document.querySelector(p);r.ajax("POST",t,{source:this,target:n?p:this,swap:n?"outerHTML":"none",values:{...e,form_key:y()}}).finally(()=>{i.forEach(o=>{o.disabled=!1}),this._updating=!1,this._markStale()})}_restorePendingFocus(){var n;const t=this._pendingFocus;if(!t)return;this._pendingFocus=null;const e=(n=this.shadowRoot)==null?void 0:n.querySelector(`${u}[data-item-id="${t.itemId}"]`);if(!e)return;const i=e.querySelector(t.selector),r=i&&!i.disabled?i:e.querySelector(c);r==null||r.focus()}_fetchFragment(){return this.fragmentUrl?this._fetching?(this._refetchQueued=!0,this._fetching):(this._fetching=this._fetchFragmentOnce().finally(()=>(this._fetching=null,this._refetchQueued?(this._refetchQueued=!1,this._fetchFragment()):this.updateComplete.then(()=>{this._repaintPendingQty(),this._restorePendingFocus()}))),this._fetching):Promise.resolve()}async _fetchFragmentOnce(){this._loading=!0;try{const t=await fetch(this.fragmentUrl,{credentials:"same-origin",headers:{Accept:"text/html, */*;q=0.8","HX-Request":"true"}});if(!t.ok){this.dispatchEvent(new CustomEvent("hyperion-mini-cart-error",{bubbles:!0,composed:!0,detail:{status:t.status}}));return}this._bodyHtml=await t.text(),this._stale=!1}catch{this.dispatchEvent(new CustomEvent("hyperion-mini-cart-error",{bubbles:!0,composed:!0,detail:{status:0}}))}finally{this._loading=!1}}async openPanel(t){t&&t.preventDefault(),F(),this._open=!0;const e=this._adoptSharedTailwind();this.fragmentUrl&&(!this._bodyHtml||this._stale)&&await this._fetchFragment(),await e,requestAnimationFrame(()=>{var i,r;(r=(i=this.shadowRoot)==null?void 0:i.querySelector('[part="panel"] header button'))==null||r.focus()})}close(){var t,e;this._open=!1,(e=(t=this.shadowRoot)==null?void 0:t.querySelector('[part="trigger"]'))==null||e.focus({preventScroll:!0})}_onKeyDown(t){var e;if(this._open){if(t.key==="Escape"){this.close();return}if(t.key==="Tab"&&t.currentTarget===this){const i=(e=this.shadowRoot)==null?void 0:e.querySelector('[part="panel"]');i&&R(t,i)}}}connectedCallback(){super.connectedCallback(),this._adoptSharedTailwind(),this._neutralizeTriggerLink(),this.addEventListener("keydown",this._onKeyDown),document.addEventListener("keydown",this._onKeyDown),document.addEventListener("hyperion:cart-changed",this._onCartChanged),this._observeBadge(),this.updateComplete.then(()=>{var t,e;(t=this.shadowRoot)==null||t.addEventListener("click",this._onShadowClick),(e=this.shadowRoot)==null||e.addEventListener("change",this._onShadowChange)})}async _adoptSharedTailwind(){if(!this.shadowRoot||this._tailwindAdopted)return;const t=await U();if(!t||!this.shadowRoot)return;const e=this.shadowRoot.adoptedStyleSheets||[];e.includes(t)||(this.shadowRoot.adoptedStyleSheets=[...e,t],this._tailwindAdopted=!0)}disconnectedCallback(){var t,e;super.disconnectedCallback(),this.removeEventListener("keydown",this._onKeyDown),document.removeEventListener("keydown",this._onKeyDown),document.removeEventListener("hyperion:cart-changed",this._onCartChanged),(t=this.shadowRoot)==null||t.removeEventListener("click",this._onShadowClick),(e=this.shadowRoot)==null||e.removeEventListener("change",this._onShadowChange);for(const i of this._qtyLines.values())clearTimeout(i.timer);this._qtyLines.clear(),this._badgeObserver&&(this._badgeObserver.disconnect(),this._badgeObserver=null),this._open&&k(),this._restoreTriggerLink()}render(){return d`
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
        `}}f(w,"properties",{count:{type:Number,reflect:!0},triggerLabel:{type:String,attribute:"trigger-label"},emptyMessage:{type:String,attribute:"empty-message"},closeLabel:{type:String,attribute:"close-label"},fragmentUrl:{type:String,attribute:"fragment-url"},triggerUrl:{type:String,attribute:"trigger-url"},removeConfirm:{type:String,attribute:"remove-confirm"},_open:{state:!0},_loading:{state:!0},_bodyHtml:{state:!0}}),f(w,"styles",$`
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
            /* Hidden while closed: the panel sits just past the right edge and
               its 40px shadow would otherwise shade the page along that edge.
               visibility flips at the end of the closing slide (this rule's
               transition) and at once when opening (the open rule's 0s
               transition), so the focus can move into the panel in the same
               frame. */
            visibility: hidden;
            transition: transform var(--transition-duration) ease, visibility var(--transition-duration) ease;
            z-index: 9999;
        }

        :host([open]) [part="panel"] {
            transform: translateX(0);
            visibility: visible;
            transition: transform var(--transition-duration) ease, visibility 0s;
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
    `);customElements.get("hyperion-mini-cart")||customElements.define("hyperion-mini-cart",w);export{w as HyperionMiniCart};
//# sourceMappingURL=hyperion-mini-cart.CQdTSDF7.js.map
