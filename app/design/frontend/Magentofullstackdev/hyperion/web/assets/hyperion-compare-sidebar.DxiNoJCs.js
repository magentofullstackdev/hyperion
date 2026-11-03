var l=Object.defineProperty;var n=(r,e,t)=>e in r?l(r,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):r[e]=t;var a=(r,e,t)=>n(r,typeof e!="symbol"?e+"":e,t);import{A as s,b as i}from"./lit-element.CGWggwb8.js";import{H as m}from"./HyperionLightElement.CshfoQhS.js";import{s as c}from"./list-state.CmHp68hG.js";import{e as p,g as h}from"./form-key.CQFbBtk5.js";import{t as d,f as b}from"./product-card.Bj8dk9XA.js";class o extends m{constructor(){super(),this.compareUrl="",this.removeUrl="",this.clearUrl="",this.heading="Compare Products",this.compareLabel="Compare",this.clearLabel="Clear All",this.removeLabel="Remove This Item",this.confirmLabel="",this.items=[],this._onState=this._onState.bind(this)}connectedCallback(){super.connectedCallback(),this._unsubscribe=c(this._onState)}disconnectedCallback(){var e;super.disconnectedCallback(),(e=this._unsubscribe)==null||e.call(this),this._unsubscribe=null}_onState(e){this.items=Array.isArray(e.compareItems)?e.compareItems:[],this.hidden=this.items.length===0}updated(){var e,t;p(this),(t=(e=window.htmx)==null?void 0:e.process)==null||t.call(e,this)}render(){if(this.items.length===0)return s;const e=h()||"";return i`<section class="bg-surface rounded-xl border border-subtle p-4 mb-6" aria-labelledby="hyperion-compare-sidebar-heading" data-hyperion-compare-sidebar>
            <h2 id="hyperion-compare-sidebar-heading" class="text-base font-semibold text-secondary mb-1">${this.heading}</h2>
            <p class="text-xs text-muted mb-2">${this.items.length} ${this.items.length===1?"item":"items"}</p>
            <ol class="divide-y divide-subtle">
                ${this.items.map(t=>i`<li class="flex items-center justify-between gap-2 py-2" data-hyperion-product-id=${t.id}>
                    <a href=${t.url} class="text-sm font-medium text-secondary hover:text-primary line-clamp-2">${t.name}</a>
                    ${d(this.removeUrl,{product:t.id},e,i`<button type="submit" class="shrink-0 text-muted hover:text-error" title=${this.removeLabel} aria-label=${this.removeLabel} data-hyperion-compare-sidebar-remove>
                            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>`,{class:"flex"})}
                </li>`)}
            </ol>
            <div class="mt-3 flex items-center gap-3">
                <a href=${this.compareUrl} class="inline-flex items-center rounded-lg bg-primary px-3 py-2 text-xs font-bold uppercase tracking-wider text-on-primary hover:bg-primary-hover" data-hyperion-compare-sidebar-link>${this.compareLabel}</a>
                <form action=${this.clearUrl} method="post" class="flex" data-hyperion-confirm=${this.confirmLabel||s}>
                    ${b(e)}
                    <button type="submit" class="text-xs text-muted hover:text-error underline-offset-2 hover:underline" data-hyperion-compare-sidebar-clear>${this.clearLabel}</button>
                </form>
            </div>
        </section>`}}a(o,"properties",{compareUrl:{type:String,attribute:"compare-url"},removeUrl:{type:String,attribute:"remove-url"},clearUrl:{type:String,attribute:"clear-url"},heading:{type:String},compareLabel:{type:String,attribute:"compare-label"},clearLabel:{type:String,attribute:"clear-label"},removeLabel:{type:String,attribute:"remove-label"},confirmLabel:{type:String,attribute:"confirm-label"},items:{state:!0}});customElements.get("hyperion-compare-sidebar")||customElements.define("hyperion-compare-sidebar",o);export{o as HyperionCompareSidebar};
//# sourceMappingURL=hyperion-compare-sidebar.DxiNoJCs.js.map
