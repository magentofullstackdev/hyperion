var c=Object.defineProperty;var d=(r,t,e)=>t in r?c(r,t,{enumerable:!0,configurable:!0,writable:!0,value:e}):r[t]=e;var o=(r,t,e)=>d(r,typeof t!="symbol"?t+"":t,e);import{i as u,b as s}from"./lit-element.CGWggwb8.js";const a="hyperion-order-cancel";class l extends u{constructor(){super();o(this,"_onBeforeRequest",()=>{this._busy=!0});o(this,"_onAfterRequest",()=>{this._busy=!1,this.close()});o(this,"_onBackdropClick",e=>{e.target===e.currentTarget&&this.close()});this.action="",this.orderId="",this.orderNumber="",this.formKey="",this.context="view",this.variant="button",this.reasons=[],this.buttonClass="",this.triggerLabel="Cancel Order",this.titleLabel="",this.promptLabel="Provide a cancellation reason:",this.keepLabel="Keep Order",this.confirmLabel="Cancel Order",this._busy=!1}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.addEventListener("htmx:beforeRequest",this._onBeforeRequest),this.addEventListener("htmx:afterRequest",this._onAfterRequest)}disconnectedCallback(){this.removeEventListener("htmx:beforeRequest",this._onBeforeRequest),this.removeEventListener("htmx:afterRequest",this._onAfterRequest),super.disconnectedCallback()}firstUpdated(){window.htmx&&typeof window.htmx.process=="function"&&window.htmx.process(this)}get dialog(){return this.querySelector("dialog")}get isOpen(){var e;return!!((e=this.dialog)!=null&&e.open)}open(){var i;const e=this.dialog;!e||e.open||(typeof e.showModal=="function"?e.showModal():e.setAttribute("open",""),(i=e.querySelector("select"))==null||i.focus())}close(){const e=this.dialog;!e||!e.open||(typeof e.close=="function"?e.close():e.removeAttribute("open"))}_renderTrigger(){return this.variant==="icon"?s`
                <button type="button"
                        data-hyperion-order-cancel-trigger
                        class="p-1.5 text-muted hover:text-error transition-colors rounded
                               focus:outline-none focus-visible:ring-2 focus-visible:ring-error"
                        aria-label=${this.triggerLabel}
                        title=${this.triggerLabel}
                        @click=${this.open}>
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2"
                         viewBox="0 0 24 24" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round"
                              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </button>
            `:s`
            <button type="button"
                    data-hyperion-order-cancel-trigger
                    class=${this.buttonClass||"inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold border border-subtle text-secondary hover:bg-surface-raised transition-colors focus:outline-none focus:ring-2 focus:ring-primary"}
                    @click=${this.open}>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2"
                     viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round"
                          d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                ${this.triggerLabel}
            </button>
        `}render(){const e=this.titleLabel||`${this.confirmLabel} #${this.orderNumber}`,i=Array.isArray(this.reasons)?this.reasons:[];return s`
            <span class="contents">${this._renderTrigger()}</span>
            <dialog class="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-subtle
                           bg-surface p-0 text-secondary shadow-xl backdrop:bg-black/50"
                    aria-labelledby="hyperion-order-cancel-title-${this.orderId}"
                    @click=${this._onBackdropClick}>
                <form method="post"
                      action=${this.action}
                      hx-post=${this.action}
                      hx-swap="none"
                      class="p-6 space-y-4"
                      data-hyperion-order-cancel-form>
                    <input type="hidden" name="form_key" value=${this.formKey}>
                    <input type="hidden" name="order_id" value=${this.orderId}>
                    <input type="hidden" name="context" value=${this.context}>
                    <h3 id="hyperion-order-cancel-title-${this.orderId}" class="text-lg font-semibold">
                        ${e}
                    </h3>
                    <label class="block space-y-1">
                        <span class="text-sm text-muted">${this.promptLabel}</span>
                        <select name="reason" required
                                class="block w-full rounded-lg border border-subtle bg-surface px-3 py-2 text-sm
                                       text-secondary focus:outline-none focus:ring-2 focus:ring-primary">
                            ${i.map(n=>s`<option value=${n}>${n}</option>`)}
                        </select>
                    </label>
                    <div class="flex justify-end gap-3 pt-2">
                        <button type="button"
                                data-hyperion-order-cancel-keep
                                class="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium
                                       bg-surface border border-subtle text-secondary
                                       hover:border-primary hover:text-primary transition-colors
                                       focus:outline-none focus:ring-2 focus:ring-primary"
                                @click=${this.close}>
                            ${this.keepLabel}
                        </button>
                        <button type="submit"
                                data-hyperion-order-cancel-confirm
                                ?disabled=${this._busy}
                                class="inline-flex items-center px-4 py-2 rounded-lg text-sm font-bold
                                       uppercase tracking-wider bg-error text-on-error shadow-sm
                                       hover:bg-error-hover hover:shadow-md transition-all
                                       disabled:opacity-60 disabled:cursor-wait
                                       focus:outline-none focus:ring-2 focus:ring-error">
                            ${this.confirmLabel}
                        </button>
                    </div>
                </form>
            </dialog>
        `}}o(l,"properties",{action:{type:String},orderId:{type:String,attribute:"order-id"},orderNumber:{type:String,attribute:"order-number"},formKey:{type:String,attribute:"form-key"},context:{type:String},variant:{type:String},reasons:{type:Array},buttonClass:{type:String,attribute:"button-class"},triggerLabel:{type:String,attribute:"trigger-label"},titleLabel:{type:String,attribute:"title-label"},promptLabel:{type:String,attribute:"prompt-label"},keepLabel:{type:String,attribute:"keep-label"},confirmLabel:{type:String,attribute:"confirm-label"},_busy:{state:!0}});customElements.get(a)||customElements.define(a,l);export{l as HyperionOrderCancel};
//# sourceMappingURL=hyperion-order-cancel.Dxk_BirQ.js.map
