import{e as B,i as S,S as E,A as h,t as l,c as d,a as F,Q as L}from"./checkout-bfdIjziR.js";import{n as H,r as v}from"./checkout-app-B6LQaPKQ.js";import{p as O}from"./checkout-gate-D8ei00SF.js";import{d as P,e as y,i as b,f as k,a as N,l as R,b as w,h as C,j as x,k as I,r as T}from"./quote-CSMHN3Em.js";import{b as D}from"./line-items-BrA_igti.js";var Q=Object.defineProperty,f=(e,t,n,a)=>{for(var r=void 0,s=e.length-1,o;s>=0;s--)(o=e[s])&&(r=o(t,n,r)||r);return r&&Q(t,n,r),r};const u=new E.State(null);function Y(){return u.get()}function U(e){u.set(e)}function A(){const e=I();if(!e)return null;const[t="",n="",a]=e.street;return{recipientName:`${e.firstname} ${e.lastname}`,line1:t,line2:a===void 0?n:`${n} ${a}`,city:e.city,countryCode:e.country_id,postalCode:e.postcode??"",state:T(e)??""}}function $(e=k(),t=A()){return JSON.stringify([e,t?[t.recipientName,t.line1,t.line2,t.city,t.state,t.postalCode,t.countryCode]:null])}function g(){const e=u.get();return e!==null&&e.fingerprint===$()}function j(e,t){const n={"page-type":"checkout"};e.cspNonce&&(n["csp-nonce"]=e.cspNonce);const a={components:"buttons,messages,funding-eligibility","enable-funding":t?"credit":"paylater",currency:x(),commit:!1,dataAttributes:n};return e.locale&&(a.locale=e.locale),e.environment==="sandbox"&&e.merchantCountry&&(a["buyer-country"]=e.merchantCountry),a}function q(e,t){const n=F(),a={flow:"checkout",amount:k(),currency:x()};e.locale&&(a.locale=e.locale),e.merchantName&&(a.displayName=e.merchantName),t&&(a.requestBillingAgreement=!0);const r=A();if(r&&(a.enableShippingAddress=!0,a.shippingAddressEditable=!1,a.shippingAddressOverride=r),e.canSendLineItems){const s=D(n.items.get(),n.totals.get());s.length>0&&(a.lineItems=s)}return a}class m extends B(S){constructor(){super(...arguments),this.code=P,this._status="idle",this._message=null,this._saveForLater=!1,this._checkout=null,this._pending=null,this._buttons=[],this._generation=0,this._initQueued=!1,this._onChange=()=>{u.set(null)},this._onRetry=()=>{this._init()}}createRenderRoot(){return this}disconnectedCallback(){super.disconnectedCallback(),this._generation++,this._status="idle",this._teardown()}render(){const t=y(),n=u.get(),a=g(),r=t!==null&&b(t.vaultCode);return d`
            <div class="space-y-3">
                ${a&&n?this._renderApproved(n):h}
                ${!a&&n?d`<p class="text-sm text-muted" role="status">
                          ${n.amount===k()?l("Hyperion_Checkout::braintree_paypal_address_changed"):l("Hyperion_Checkout::braintree_paypal_amount_changed")}
                      </p>`:h}
                ${this._message?d`<p role="alert" class="text-sm text-danger">${this._message}</p>`:h}
                ${this._status==="error"?d`<button type="button"
                                   class="text-sm text-accent hover:underline"
                                   @click=${this._onRetry}>
                              ${l("Hyperion_Checkout::braintree_retry")}
                          </button>`:h}
                <div class="space-y-3 ${a?"hidden":""}">
                    <p class="text-sm text-muted">${l("Hyperion_Checkout::braintree_paypal_hint")}</p>
                    ${r?d`<hc-checkbox
                                  name="braintree_paypal_save"
                                  label=${l("Hyperion_Checkout::braintree_paypal_save")}
                                  .checked=${this._saveForLater}
                                  @value-change=${this._onSaveChange}
                              ></hc-checkbox>`:h}
                    ${this._status==="loading"?d`<p class="text-sm text-muted" role="status" aria-live="polite">
                              ${l("Hyperion_Checkout::braintree_paypal_loading")}
                          </p>`:h}
                    <div class="max-w-sm space-y-2">
                        <div data-paypal-button="paypal"></div>
                        <div data-paypal-button="credit"></div>
                        <div data-paypal-button="paylater"></div>
                    </div>
                </div>
            </div>
        `}_renderApproved(t){return d`
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-subtle bg-surface-raised p-3"
                 role="status">
                <p class="flex-1 text-sm text-brand" data-paypal-approved>
                    ${t.email?l("Hyperion_Checkout::braintree_paypal_authorised_as",{email:t.email}):l("Hyperion_Checkout::braintree_paypal_authorised")}
                </p>
                <button type="button"
                        class="text-sm text-accent hover:underline"
                        @click=${this._onChange}>
                    ${l("Hyperion_Checkout::braintree_paypal_change")}
                </button>
            </div>
        `}updated(){this._initQueued||!this._needsInit()||(this._initQueued=!0,queueMicrotask(()=>{this._initQueued=!1,this._needsInit()&&this._init()}))}_needsInit(){return this.isConnected&&this._status==="idle"&&!g()}async _init(){const t=++this._generation,n=()=>t!==this._generation||!this.isConnected;this._status="loading",this._message=null;try{const a=y();if(!a?.clientToken)throw new Error("missing Braintree client token");const[r,s]=await Promise.all([N(a.clientToken),R("paypal-checkout")]);if(w(a.clientToken,{paypal:!0}),n())return;await this._teardown();const o=await s.create({client:r});if(n()){o.teardown().catch(()=>{});return}this._checkout=o;const p=C("credit"),c=C("paylater");if(await o.loadPayPalSDK(j(a,p?.isActive===!0)),n())return;const i=await Promise.all([this._renderButton(o,a,"paypal",a.style),p?.isActive?this._renderButton(o,a,"credit",p.style):!1,c?.isActive?this._renderButton(o,a,"paylater",c.style):!1]);if(n())return;if(!i.some(Boolean))throw new Error("no eligible PayPal button");this._status="ready"}catch(a){if(n())return;console.error("[hyperion-checkout] Braintree PayPal could not be initialized",a),this._status="error",this._message=l("Hyperion_Checkout::braintree_paypal_init_failed")}}async _renderButton(t,n,a,r){const s=this.querySelector(`[data-paypal-button="${a}"]`),o=window.paypal;if(!s||!o)return!1;s.replaceChildren();const p=o.Buttons({fundingSource:a,style:r,onClick:async(c,i)=>{this._message=null;const _=await O();return this._message=_,_===null?i.resolve():i.reject()},createOrder:()=>{this._message=null;const c=this._isSaving(),i=q(n,c);return this._pending={amount:i.amount,fingerprint:$(i.amount,i.shippingAddressOverride??null),savedForLater:c},t.createPayment(i)},onApprove:async c=>{const i=this._pending;if(this._pending=null,!i)throw new Error("PayPal approved a payment this checkout did not create");const _=await t.tokenizePayment(c);u.set({nonce:_.nonce,email:_.details.email??"",amount:i.amount,fingerprint:i.fingerprint,savedForLater:i.savedForLater})},onError:c=>{console.error("[hyperion-checkout] PayPal button error",c),this._message=l("Hyperion_Checkout::braintree_paypal_failed")}});return p.isEligible()?(await p.render(s),this._buttons.push(p),!0):!1}_isSaving(){const t=y();return t!==null&&b(t.vaultCode)&&this._saveForLater}async _teardown(){const t=this._buttons,n=this._checkout;this._buttons=[],this._checkout=null;for(const a of t)try{await a.close?.()}catch{}if(n)try{await n.teardown()}catch(a){console.error("[hyperion-checkout] Braintree PayPal teardown failed",a)}}_onSaveChange(t){this._saveForLater=t.detail.checked}}f([H({type:String})],m.prototype,"code");f([v()],m.prototype,"_status");f([v()],m.prototype,"_message");f([v()],m.prototype,"_saveForLater");customElements.get("payment-braintree-paypal")||customElements.define("payment-braintree-paypal",m);function z(){L({code:P,component:"payment-braintree-paypal",isAvailable:()=>{const e=y();return!!(e?.isActive&&e.clientToken)},isReady:g,recaptchaAction:()=>null,afterPlaceOrderFailed:()=>u.set(null),beforePlaceOrder:async()=>{const e=y(),t=u.get();if(!e||!t||!g())throw new Error(l("Hyperion_Checkout::braintree_paypal_not_authorised"));const n=await w(e.clientToken,{paypal:!0});return{payment_method_nonce:t.nonce,...n?{device_data:n}:{},...b(e.vaultCode)?{is_active_payment_token_enabler:t.savedForLater}:{}}}})}z();export{m as PaymentBraintreePaypal,$ as approvalFingerprint,q as buildCreatePaymentOptions,j as buildPayPalSdkOptions,A as buildShippingAddressOverride,Y as getPayPalApproval,z as registerBraintreePayPalRenderer,U as setPayPalApproval};
//# sourceMappingURL=payment-braintree-paypal-CbIjNZRX.js.map
