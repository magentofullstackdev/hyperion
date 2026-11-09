var g=Object.defineProperty;var b=(i,t,e)=>t in i?g(i,t,{enumerable:!0,configurable:!0,writable:!0,value:e}):i[t]=e;var p=(i,t,e)=>b(i,typeof t!="symbol"?t+"":t,e);import{i as _,a as y,b as u}from"./lit-element.CGWggwb8.js";const h="address",a="shipping",n="totals",c="payment",l="placing",f="done",m="error";class d extends _{constructor(){super(),this.formKey="",this.estimateShippingUrl="",this.setShippingMethodUrl="",this.setPaymentMethodUrl="",this.placeOrderUrl="",this.getCheckoutDataUrl="",this.stepLabels="",this._step=h,this._errorMessage="",this._onAfterSwap=this._onAfterSwap.bind(this),this._onBeforeRequest=this._onBeforeRequest.bind(this),this._onResponseError=this._onResponseError.bind(this),this._onPaymentChange=this._onPaymentChange.bind(this)}connectedCallback(){super.connectedCallback(),this.addEventListener("htmx:afterSwap",this._onAfterSwap),this.addEventListener("htmx:beforeRequest",this._onBeforeRequest),this.addEventListener("htmx:responseError",this._onResponseError),this.addEventListener("htmx:sendError",this._onResponseError),this.addEventListener("change",this._onPaymentChange)}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("htmx:afterSwap",this._onAfterSwap),this.removeEventListener("htmx:beforeRequest",this._onBeforeRequest),this.removeEventListener("htmx:responseError",this._onResponseError),this.removeEventListener("htmx:sendError",this._onResponseError),this.removeEventListener("change",this._onPaymentChange)}_onAfterSwap(t){var s;const e=(s=t==null?void 0:t.detail)==null?void 0:s.target;if(!e)return;const r=e.id||"";r==="hyperion-checkout-shipping-methods"?(this._step=a,this._errorMessage=""):r==="hyperion-checkout-totals"?(this._step=n,this._errorMessage=""):r==="hyperion-checkout-feedback"&&this._step===l&&(this._step=m)}_onBeforeRequest(t){var r,s;const e=(r=t==null?void 0:t.detail)==null?void 0:r.elt;e&&(e.id==="hyperion-checkout-place-order"||(s=e.closest)!=null&&s.call(e,"#hyperion-checkout-place-order"))&&(this._step=l,this._errorMessage="")}_onResponseError(t){var o;const e=(o=t==null?void 0:t.detail)==null?void 0:o.xhr,r=e?e.status:0,s=r===419?"Session expired. Please reload the page.":`Request failed (${r||"network"}). Please try again.`;this._errorMessage=s,this._step=m}_onPaymentChange(t){const e=t==null?void 0:t.target;(e==null?void 0:e.name)==="payment_method"&&(this._step=c)}_getStepEntries(){const t=["Address","Shipping","Payment","Review"];let e=this.stepLabels?this.stepLabels.split("|").map(s=>s.trim()).filter(Boolean):[];return e.length!==4&&(e=t),[{id:h,label:e[0]},{id:a,label:e[1]},{id:c,label:e[2]},{id:n,label:e[3]}].map((s,o)=>({...s,current:o===(this._step===h?0:this._step===a||this._step===n?1:this._step===c?2:3),done:(this._step===a||this._step===n)&&o<1||this._step===c&&o<2||(this._step===l||this._step===f)&&o<3}))}render(){const t=this._getStepEntries();return u`
            <ol part="stepper" aria-label="Checkout progress" role="list">
                ${t.map((e,r)=>u`
                    <li
                        data-step="${e.id}"
                        data-current="${e.current}"
                        data-done="${e.done}"
                        aria-current="${e.current?"step":"false"}">
                        <span aria-hidden="true">${r+1}.</span>
                        <span>${e.label}</span>
                    </li>
                `)}
            </ol>

            <div part="sections">
                <div part="primary-column">
                    <section part="address-section" aria-labelledby="hyperion-checkout-address-heading">
                        <slot name="address-form"></slot>
                    </section>

                    <section part="shipping-section" aria-labelledby="hyperion-checkout-shipping-heading">
                        <slot name="shipping-methods"></slot>
                    </section>

                    <section part="payment-section" aria-labelledby="hyperion-checkout-payment-heading">
                        <slot name="payment-methods"></slot>
                    </section>

                    <section part="actions-section">
                        <slot name="actions"></slot>
                        <p part="error" role="alert" ?hidden=${!this._errorMessage}>
                            ${this._errorMessage}
                        </p>
                    </section>
                </div>

                <aside part="totals-section" aria-labelledby="hyperion-checkout-totals-heading">
                    <slot name="totals"></slot>
                </aside>
            </div>
        `}}p(d,"properties",{formKey:{type:String,attribute:"form-key"},estimateShippingUrl:{type:String,attribute:"estimate-shipping-url"},setShippingMethodUrl:{type:String,attribute:"set-shipping-method-url"},setPaymentMethodUrl:{type:String,attribute:"set-payment-method-url"},placeOrderUrl:{type:String,attribute:"place-order-url"},getCheckoutDataUrl:{type:String,attribute:"get-checkout-data-url"},stepLabels:{type:String,attribute:"step-labels"},_step:{state:!0},_errorMessage:{state:!0}}),p(d,"styles",y`
        :host {
            --checkout-background: rgb(var(--color-surface));
            --checkout-border-radius: 0.5rem;
            --checkout-section-gap: 1.5rem;
            --checkout-section-bg: rgb(var(--color-surface));
            --checkout-section-border: rgb(var(--color-subtle));
            --checkout-label-color: rgb(var(--color-muted));
            --checkout-label-active: rgb(var(--color-primary));
            --checkout-step-connector: rgb(var(--color-subtle));
            --checkout-text-color: rgb(var(--color-secondary));
            display: block;
            background: var(--checkout-background);
            border-radius: var(--checkout-border-radius);
        }

        [part="stepper"] {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.5rem;
            padding: 0 0.25rem 1rem;
            list-style: none;
            margin: 0;
            color: var(--checkout-label-color);
            font-size: 0.875rem;
        }

        [part="stepper"] li {
            flex: 1;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            min-width: 0;
        }

        [part="stepper"] li[data-current="true"] {
            color: var(--checkout-label-active);
            font-weight: 600;
        }

        [part="stepper"] li[data-done="true"] {
            color: var(--checkout-text-color);
        }

        [part="stepper"] li:not(:last-child)::after {
            content: '';
            display: block;
            height: 1px;
            background: var(--checkout-step-connector);
            flex: 1;
        }

        [part="sections"] {
            display: grid;
            gap: var(--checkout-section-gap);
            grid-template-columns: 1fr;
        }

        @media (min-width: 64rem) {
            [part="sections"] {
                grid-template-columns: 1fr 22rem;
            }
        }

        [part="primary-column"] {
            display: flex;
            flex-direction: column;
            gap: var(--checkout-section-gap);
        }

        [part="address-section"],
        [part="shipping-section"],
        [part="payment-section"],
        [part="totals-section"],
        [part="actions-section"] {
            background: var(--checkout-section-bg);
            border: 1px solid var(--checkout-section-border);
            border-radius: var(--checkout-border-radius);
            padding: 1rem 1.25rem;
        }

        [part="error"] {
            color: rgb(var(--color-error));
            padding-top: 0.5rem;
            font-size: 0.875rem;
        }

        [part="error"][hidden] {
            display: none;
        }

        ::slotted(*) {
            min-width: 0;
        }
    `);customElements.get("hyperion-checkout")||customElements.define("hyperion-checkout",d);export{d as HyperionCheckout};
//# sourceMappingURL=hyperion-checkout.kh4ZwcQq.js.map
