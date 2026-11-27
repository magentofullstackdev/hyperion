var f=Object.defineProperty;var b=(i,t,e)=>t in i?f(i,t,{enumerable:!0,configurable:!0,writable:!0,value:e}):i[t]=e;var l=(i,t,e)=>b(i,typeof t!="symbol"?t+"":t,e);import{i as y,a as _,A as n,b as d}from"./lit-element.CGWggwb8.js";class p extends y{createRenderRoot(){return this}constructor(){super(),this.appliedCoupon="",this.expanded=!1,this.actionUrl="",this.formKey="",this.attemptedCode="",this.errorMessage="",this.headingLabel="Apply Discount Code",this.placeholderLabel="Enter discount code",this.applyLabel="Apply Discount",this.cancelLabel="Cancel Coupon",this.inputLabel="Discount code",this._loading=!1,this._edited=!1,this._open=!1,this._extraChildren=null,this._carried=null,this._onBefore=this._onBefore.bind(this),this._onAfter=this._onAfter.bind(this)}connectedCallback(){this._captureSkeleton(),super.connectedCallback(),this.addEventListener("htmx:beforeRequest",this._onBefore),this.addEventListener("htmx:afterRequest",this._onAfter),this.addEventListener("htmx:responseError",this._onAfter),this.addEventListener("htmx:sendError",this._onAfter)}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("htmx:beforeRequest",this._onBefore),this.removeEventListener("htmx:afterRequest",this._onAfter),this.removeEventListener("htmx:responseError",this._onAfter),this.removeEventListener("htmx:sendError",this._onAfter)}firstUpdated(){this._injectChildren();const t=this.querySelector("form[data-hyperion-coupon-form]");t&&window.htmx&&typeof window.htmx.process=="function"&&window.htmx.process(t);const e=t==null?void 0:t.querySelector('input[name="coupon_code"]'),r=this._carried;this._carried=null,e&&r&&r.typed!==null&&!e.readOnly&&(e.value=r.typed),(this._failedCode()!==""||r!=null&&r.focused)&&(e==null||e.focus({preventScroll:!0}))}willUpdate(t){const e=this.expanded||(this.appliedCoupon||"").trim()!==""||this._failedCode()!=="";if(!this.hasUpdated){this._open=this._open||e;return}e&&!this._open&&(t.has("expanded")||t.has("appliedCoupon")||t.has("attemptedCode"))&&(this._open=!0)}_onToggle(t){const e=t.currentTarget;e&&this._open!==e.open&&(this._open=e.open)}_failedCode(){return(this.appliedCoupon||"").trim()!==""?"":(this.attemptedCode||"").trim()}_onCodeInput(){this._edited=!0}updated(){this._injectChildren()}_onBefore(){this._loading=!0}_onAfter(){this._loading=!1}_captureSkeleton(){var s;const t=this.querySelector(":scope > [data-hyperion-coupon-skeleton]");if(!t)return;const e=t.querySelector("[data-coupon-extra-slot]");if(e&&(e.children.length>0||(e.textContent||"").trim()!=="")){const a=document.createDocumentFragment();a.append(...e.childNodes),this._extraChildren=a}const r=t.querySelector('input[name="coupon_code"]'),o=r&&!r.readOnly&&r.value!==r.defaultValue?r.value:null;o!==null&&(this._edited=!0),(s=t.querySelector("details"))!=null&&s.open&&(this._open=!0),this._carried={typed:o,focused:!!r&&r===document.activeElement},t.remove()}_injectChildren(){const t=this._extraChildren;if(!t||t.childNodes.length===0)return;const e=this.querySelector("form[data-hyperion-coupon-form] [data-coupon-extra-slot]");!e||e.childNodes.length>0||(e.appendChild(t),this._extraChildren=null)}render(){const t=(this.appliedCoupon||"").trim(),e=t!=="",r=this._failedCode(),o=r!==""&&!this._edited?(this.errorMessage||"").trim():"",s=r!==""&&!this._edited,a=e?this.cancelLabel:this.applyLabel,c="relative shrink-0 whitespace-nowrap px-4 py-2 text-sm font-semibold rounded-lg focus:outline-none focus:ring-2 focus:ring-primary transition-colors",h=c+" bg-primary text-on-primary border border-primary hover:bg-primary-hover",u=c+" bg-surface-raised border border-subtle text-secondary hover:border-primary hover:text-primary",m=e?u:h;return d`
            <section class="bg-surface rounded-xl border border-subtle p-4"
                     aria-label=${this.headingLabel}>
                <details class="group" .open=${this._open} @toggle=${this._onToggle}>
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
                        ${e?d`<input type="hidden" name="remove" value="1" data-coupon-remove-flag>`:n}
                        <div class="flex items-stretch gap-2 min-w-0">
                            <input type="text"
                                   name="coupon_code"
                                   .value=${e?t:r}
                                   placeholder=${this.placeholderLabel}
                                   class="flex-1 min-w-0 px-3 py-2 text-sm rounded-lg bg-surface border border-subtle text-secondary
                                          focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
                                          aria-[invalid=true]:border-error"
                                   ?readonly=${e}
                                   aria-invalid=${s?"true":n}
                                   aria-describedby=${o!==""?"hyperion-coupon-error":n}
                                   @input=${this._onCodeInput}
                                   aria-label=${this.inputLabel}>
                            <button type="submit"
                                    class=${m}
                                    aria-busy=${this._loading?"true":n}
                                    ?disabled=${this._loading}>
                                <span class=${this._loading?"opacity-0":""}>${a}</span>
                                ${this._loading?d`<span class="absolute inset-0 m-auto w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true"></span>`:n}
                            </button>
                        </div>
                        <p id=${o!==""?"hyperion-coupon-error":n}
                           class="min-h-10 text-sm text-error sm:min-h-5"
                           data-hyperion-coupon-message
                           ?data-hyperion-coupon-error=${o!==""}>${o}</p>
                        <div data-coupon-extra-slot class="empty:hidden"></div>
                    </form>
                </details>
            </section>
        `}}l(p,"properties",{appliedCoupon:{type:String,attribute:"applied-coupon"},expanded:{type:Boolean},actionUrl:{type:String,attribute:"action-url"},formKey:{type:String,attribute:"form-key"},attemptedCode:{type:String,attribute:"attempted-code"},errorMessage:{type:String,attribute:"error-message"},headingLabel:{type:String,attribute:"heading-label"},placeholderLabel:{type:String,attribute:"placeholder-label"},applyLabel:{type:String,attribute:"apply-label"},cancelLabel:{type:String,attribute:"cancel-label"},inputLabel:{type:String,attribute:"input-label"},_loading:{state:!0},_edited:{state:!0},_open:{state:!0}}),l(p,"styles",_``);customElements.get("hyperion-coupon-form")||customElements.define("hyperion-coupon-form",p);export{p as HyperionCouponForm};
//# sourceMappingURL=hyperion-coupon-form.DvPEZQ4p.js.map
