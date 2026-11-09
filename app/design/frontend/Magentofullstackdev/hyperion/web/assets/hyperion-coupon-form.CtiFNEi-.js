var p=Object.defineProperty;var h=(r,e,t)=>e in r?p(r,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):r[e]=t;var o=(r,e,t)=>h(r,typeof e!="symbol"?e+"":e,t);import{i as u,a as m,A as b,b as n}from"./lit-element.CGWggwb8.js";class i extends u{createRenderRoot(){return this}constructor(){super(),this.appliedCoupon="",this.actionUrl="",this.formKey="",this.headingLabel="Apply Discount Code",this.placeholderLabel="Enter discount code",this.applyLabel="Apply Discount",this.cancelLabel="Cancel Coupon",this.inputLabel="Discount code",this._loading=!1,this._extraChildren=null,this._onBefore=this._onBefore.bind(this),this._onAfter=this._onAfter.bind(this)}connectedCallback(){this._captureChildren(),super.connectedCallback(),this.addEventListener("htmx:beforeRequest",this._onBefore),this.addEventListener("htmx:afterRequest",this._onAfter),this.addEventListener("htmx:responseError",this._onAfter),this.addEventListener("htmx:sendError",this._onAfter)}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("htmx:beforeRequest",this._onBefore),this.removeEventListener("htmx:afterRequest",this._onAfter),this.removeEventListener("htmx:responseError",this._onAfter),this.removeEventListener("htmx:sendError",this._onAfter)}firstUpdated(){this._injectChildren();const e=this.querySelector("form[data-hyperion-coupon-form]");e&&window.htmx&&typeof window.htmx.process=="function"&&window.htmx.process(e)}updated(){this._injectChildren()}_onBefore(){this._loading=!0}_onAfter(){this._loading=!1}_captureChildren(){const e=this.querySelector(":scope > template[data-hyperion-coupon-children]");if(!e)return;const t=e.content;t&&t.childNodes.length>0&&(this._extraChildren=t),e.remove()}_injectChildren(){const e=this._extraChildren;if(!e||e.childNodes.length===0)return;const t=this.querySelector("form[data-hyperion-coupon-form] [data-coupon-extra-slot]");!t||t.childNodes.length>0||(t.appendChild(e),this._extraChildren=null)}render(){const e=(this.appliedCoupon||"").trim(),t=e!=="",a=t?this.cancelLabel:this.applyLabel,s="shrink-0 whitespace-nowrap px-4 py-2 text-sm font-semibold rounded-lg focus:outline-none focus:ring-2 focus:ring-primary transition-colors",l=s+" bg-primary text-on-primary border border-primary hover:bg-primary-hover",d=s+" bg-surface-raised border border-subtle text-secondary hover:border-primary hover:text-primary",c=t?d:l;return n`
            <section id="hyperion-coupon-form"
                     class="bg-surface rounded-xl border border-subtle p-4"
                     aria-label=${this.headingLabel}>
                <details class="group" ?open=${t}>
                    <summary class="flex cursor-pointer items-center justify-between select-none">
                        <span class="text-sm font-semibold text-primary hover:text-primary-hover transition-colors">
                            ${this.headingLabel}
                        </span>
                        <svg class="w-4 h-4 text-muted transition-transform group-open:rotate-180"
                             fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </summary>
                    <form method="post"
                          action=${this.actionUrl}
                          data-hyperion-coupon-form
                          class="mt-3 flex flex-col gap-2"
                          hx-post=${this.actionUrl}
                          hx-target="#hyperion-coupon-form"
                          hx-swap="outerHTML">
                        <input type="hidden" name="form_key" .value=${this.formKey}>
                        ${t?n`<input type="hidden" name="remove" value="1" data-coupon-remove-flag>`:b}
                        <div class="flex items-stretch gap-2 min-w-0">
                            <input type="text"
                                   name="coupon_code"
                                   .value=${e}
                                   placeholder=${this.placeholderLabel}
                                   class="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg bg-surface border border-subtle text-secondary
                                          focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                   ?readonly=${t}
                                   aria-label=${this.inputLabel}>
                            <button type="submit"
                                    class=${c}
                                    ?disabled=${this._loading}>
                                ${this._loading?n`<span class="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true"></span>`:a}
                            </button>
                        </div>
                        <div data-coupon-extra-slot class="empty:hidden"></div>
                    </form>
                </details>
            </section>
        `}}o(i,"properties",{appliedCoupon:{type:String,attribute:"applied-coupon"},actionUrl:{type:String,attribute:"action-url"},formKey:{type:String,attribute:"form-key"},headingLabel:{type:String,attribute:"heading-label"},placeholderLabel:{type:String,attribute:"placeholder-label"},applyLabel:{type:String,attribute:"apply-label"},cancelLabel:{type:String,attribute:"cancel-label"},inputLabel:{type:String,attribute:"input-label"},_loading:{state:!0}}),o(i,"styles",m``);customElements.get("hyperion-coupon-form")||customElements.define("hyperion-coupon-form",i);export{i as HyperionCouponForm};
//# sourceMappingURL=hyperion-coupon-form.CtiFNEi-.js.map
