import{i as A,S as B,A as p,t as o,b as d,g as S,n as E}from"./checkout-LkzN5NMc.js";import{e as H,n as L,r as b}from"./checkout-app-DZpJlxgH.js";import{d as w,e as h,i as f,a as F,l as O,b as x,f as P,h as $,j as k,k as R,r as I}from"./quote-Ceyw1wN5.js";import{b as T}from"./line-items-YJD2m31K.js";var D=Object.defineProperty,g=(t,a,n,e)=>{for(var r=void 0,i=t.length-1,s;i>=0;i--)(s=t[i])&&(r=s(a,n,r)||r);return r&&D(a,n,r),r};const l=new B.State(null);function K(){return l.get()}function V(t){l.set(t)}function m(){const t=l.get();return t!==null&&t.amount===k()}function N(){const t=R();if(!t)return null;const[a="",n="",e]=t.street;return{recipientName:`${t.firstname} ${t.lastname}`,line1:a,line2:e===void 0?n:`${n} ${e}`,city:t.city,countryCode:t.country_id,postalCode:t.postcode??"",state:I(t)??""}}function Q(t,a){const n=S(),e={flow:"checkout",amount:k(),currency:$()};t.locale&&(e.locale=t.locale),t.merchantName&&(e.displayName=t.merchantName),a&&(e.requestBillingAgreement=!0);const r=N();if(r&&(e.enableShippingAddress=!0,e.shippingAddressEditable=!1,e.shippingAddressOverride=r),t.canSendLineItems){const i=T(n.items.get(),n.totals.get());i.length>0&&(e.lineItems=i)}return e}class _ extends H(A){constructor(){super(...arguments),this.code=w,this._status="idle",this._message=null,this._saveForLater=!1,this._checkout=null,this._buttons=[],this._generation=0,this._initQueued=!1,this._onChange=()=>{l.set(null)},this._onRetry=()=>{this._init()}}createRenderRoot(){return this}disconnectedCallback(){super.disconnectedCallback(),this._generation++,this._status="idle",this._teardown()}render(){const a=h(),n=l.get(),e=m(),r=a!==null&&f(a.vaultCode);return d`
            <div class="space-y-3">
                ${e&&n?this._renderApproved(n):p}
                ${!e&&n?d`<p class="text-sm text-muted" role="status">
                          ${o("Hyperion_Checkout::braintree_paypal_amount_changed")}
                      </p>`:p}
                ${this._message?d`<p role="alert" class="text-sm text-danger">${this._message}</p>`:p}
                ${this._status==="error"?d`<button type="button"
                                   class="text-sm text-accent hover:underline"
                                   @click=${this._onRetry}>
                              ${o("Hyperion_Checkout::braintree_retry")}
                          </button>`:p}
                <div class="space-y-3 ${e?"hidden":""}">
                    <p class="text-sm text-muted">${o("Hyperion_Checkout::braintree_paypal_hint")}</p>
                    ${r?d`<hc-checkbox
                                  name="braintree_paypal_save"
                                  label=${o("Hyperion_Checkout::braintree_paypal_save")}
                                  .checked=${this._saveForLater}
                                  @value-change=${this._onSaveChange}
                              ></hc-checkbox>`:p}
                    ${this._status==="loading"?d`<p class="text-sm text-muted" role="status" aria-live="polite">
                              ${o("Hyperion_Checkout::braintree_paypal_loading")}
                          </p>`:p}
                    <div class="max-w-sm space-y-2">
                        <div data-paypal-button="paypal"></div>
                        <div data-paypal-button="credit"></div>
                        <div data-paypal-button="paylater"></div>
                    </div>
                </div>
            </div>
        `}_renderApproved(a){return d`
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-subtle bg-surface-raised p-3"
                 role="status">
                <p class="flex-1 text-sm text-brand" data-paypal-approved>
                    ${a.email?o("Hyperion_Checkout::braintree_paypal_authorised_as",{email:a.email}):o("Hyperion_Checkout::braintree_paypal_authorised")}
                </p>
                <button type="button"
                        class="text-sm text-accent hover:underline"
                        @click=${this._onChange}>
                    ${o("Hyperion_Checkout::braintree_paypal_change")}
                </button>
            </div>
        `}updated(){this._initQueued||!this._needsInit()||(this._initQueued=!0,queueMicrotask(()=>{this._initQueued=!1,this._needsInit()&&this._init()}))}_needsInit(){return this.isConnected&&this._status==="idle"&&!m()}async _init(){const a=++this._generation,n=()=>a!==this._generation||!this.isConnected;this._status="loading",this._message=null;try{const e=h();if(!e?.clientToken)throw new Error("missing Braintree client token");const[r,i]=await Promise.all([F(e.clientToken),O("paypal-checkout")]);if(x(e.clientToken,{paypal:!0}),n())return;await this._teardown();const s=await i.create({client:r});if(n()){s.teardown().catch(()=>{});return}this._checkout=s;const c=P("credit"),u=P("paylater"),y={components:"buttons,funding-eligibility","enable-funding":c?.isActive?"credit":"paylater",currency:$(),commit:!1};if(e.environment==="sandbox"&&e.merchantCountry&&(y["buyer-country"]=e.merchantCountry),await s.loadPayPalSDK(y),n())return;const v=await Promise.all([this._renderButton(s,e,"paypal",e.style),c?.isActive?this._renderButton(s,e,"credit",c.style):!1,u?.isActive?this._renderButton(s,e,"paylater",u.style):!1]);if(n())return;if(!v.some(Boolean))throw new Error("no eligible PayPal button");this._status="ready"}catch(e){if(n())return;console.error("[hyperion-checkout] Braintree PayPal could not be initialized",e),this._status="error",this._message=o("Hyperion_Checkout::braintree_paypal_init_failed")}}async _renderButton(a,n,e,r){const i=this.querySelector(`[data-paypal-button="${e}"]`),s=window.paypal;if(!i||!s)return!1;i.replaceChildren();const c=s.Buttons({fundingSource:e,style:r,createOrder:()=>(this._message=null,a.createPayment(Q(n,this._isSaving()))),onApprove:async u=>{const y=k(),v=this._isSaving(),C=await a.tokenizePayment(u);l.set({nonce:C.nonce,email:C.details.email??"",amount:y,savedForLater:v})},onError:u=>{console.error("[hyperion-checkout] PayPal button error",u),this._message=o("Hyperion_Checkout::braintree_paypal_failed")}});return c.isEligible()?(await c.render(i),this._buttons.push(c),!0):!1}_isSaving(){const a=h();return a!==null&&f(a.vaultCode)&&this._saveForLater}async _teardown(){const a=this._buttons,n=this._checkout;this._buttons=[],this._checkout=null;for(const e of a)try{await e.close?.()}catch{}if(n)try{await n.teardown()}catch(e){console.error("[hyperion-checkout] Braintree PayPal teardown failed",e)}}_onSaveChange(a){this._saveForLater=a.detail.checked}}g([L({type:String})],_.prototype,"code");g([b()],_.prototype,"_status");g([b()],_.prototype,"_message");g([b()],_.prototype,"_saveForLater");customElements.get("payment-braintree-paypal")||customElements.define("payment-braintree-paypal",_);function q(){E({code:w,component:"payment-braintree-paypal",isAvailable:()=>{const t=h();return!!(t?.isActive&&t.clientToken)},isReady:m,afterPlaceOrderFailed:()=>l.set(null),beforePlaceOrder:async()=>{const t=h(),a=l.get();if(!t||!a||!m())throw new Error(o("Hyperion_Checkout::braintree_paypal_not_authorised"));const n=await x(t.clientToken,{paypal:!0});return{payment_method_nonce:a.nonce,...n?{device_data:n}:{},...f(t.vaultCode)?{is_active_payment_token_enabler:a.savedForLater}:{}}}})}q();export{_ as PaymentBraintreePaypal,Q as buildCreatePaymentOptions,N as buildShippingAddressOverride,K as getPayPalApproval,q as registerBraintreePayPalRenderer,V as setPayPalApproval};
//# sourceMappingURL=payment-braintree-paypal-14d_-E8D.js.map
