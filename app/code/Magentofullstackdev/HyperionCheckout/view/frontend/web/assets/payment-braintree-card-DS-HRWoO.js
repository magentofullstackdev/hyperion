import{i as v,A as d,b as c,r as h}from"./checkout-app-CCQ4A2FR.js";import{f as m}from"./payment-host-BPAzmFj7.js";import{g as _,B as b,i as p,a as E,l as g,b as y}from"./quote-BCHKMm56.js";import{H as T,r as C}from"./hosted-field-styles-BsXQymF1.js";import{v as x}from"./three-d-secure-B6dAxSyO.js";import"./checkout-C9dXtvMq.js";import"./call-D1bdsmlj.js";import"./context-BmzCCr7W.js";import"./load-script-DNHf_Ah2.js";import"./slot-render-CgZVirTT.js";var D=Object.defineProperty,u=(o,e,t,r)=>{for(var i=void 0,n=o.length-1,s;n>=0;n--)(s=o[n])&&(i=s(e,t,i)||i);return i&&D(e,t,i),i};const F={number:"Card number",expirationDate:"Expiry date",cvv:"Security code (CVV)"},w={number:"Enter a valid card number.",expirationDate:"Enter a valid expiry date.",cvv:"Enter a valid security code."},I={HOSTED_FIELDS_FIELDS_EMPTY:"Enter your card details to continue.",HOSTED_FIELDS_FIELDS_INVALID:"Some card details are not valid. Check the highlighted fields.",HOSTED_FIELDS_TOKENIZATION_FAIL_ON_DUPLICATE:"This card is already stored in your account. Pick it from your stored cards or use another one.",HOSTED_FIELDS_TOKENIZATION_CVV_VERIFICATION_FAILED:"The security code could not be verified. Check it and try again.",HOSTED_FIELDS_TOKENIZATION_NETWORK_ERROR:"The payment service could not be reached. Check your connection and try again."},k="Your card could not be processed. Check the details or use another card.",S="The payment form is still loading. Please wait a moment and try again.",f="{type} cards are not accepted. Please use another card.";function $(o,e,t){const r=o.ccTypesMapper[e];if(!r)return null;const i=t?o.countrySpecificCardTypes[t]:void 0;return(i?o.availableCardTypes.filter(s=>i.includes(s)):o.availableCardTypes).includes(r)?r:null}class l extends v{constructor(){super(...arguments),this.options={},this.config={},this.token=null,this._status="loading",this._fields={number:{isFocused:!1,showError:!1},expirationDate:{isFocused:!1,showError:!1},cvv:{isFocused:!1,showError:!1}},this._brand=null,this._saveCard=!1,this._hostedFields=null,this._generation=0,this._pending=null,this._onRetry=()=>{this._init()}}static{this.hyperionApi="1"}static canMakePayment(e){const t=_({payment:{[b]:{...e.config}}});return!!(t?.isActive&&t.clientToken)}static hyperionRecaptchaAction(e){return e.hyperion?.recaptcha?.braintree?"braintree":"place_order"}createRenderRoot(){return this}get _services(){const e=m(this.context);if(e===null)throw new Error("the Braintree card renderer needs the first-party context");return e}_config(){return _(this._services.config())}_emit(e,t={}){this.dispatchEvent(new CustomEvent(`hyperion-payment:${e}`,{bubbles:!0,composed:!0,detail:t}))}connectedCallback(){super.connectedCallback(),this.updateComplete.then(()=>this._init())}disconnectedCallback(){super.disconnectedCallback(),this._generation++,this._teardown()}render(){const e=this._config(),t=e!==null&&p(this._services.config(),e.ccVaultCode);return c`
            <div class="space-y-3">
                ${this._status==="error"?this._renderInitError():d}
                ${this._status==="loading"?c`<p class="text-sm text-muted" role="status" aria-live="polite">
                          ${this.context.t("Loading the secure card form...")}
                      </p>`:d}
                <div class="space-y-3 ${this._status==="error"?"hidden":""}">
                    ${this._renderField("number")}
                    <div class="grid grid-cols-2 gap-3">
                        ${this._renderField("expirationDate")}
                        ${e?.useCvv?this._renderField("cvv"):d}
                    </div>
                    ${t?c`<hc-checkbox
                                  name="braintree_save_card"
                                  label=${this.context.t("Save this card for future purchases")}
                                  .checked=${this._saveCard}
                                  @value-change=${this._onSaveCardChange}
                              ></hc-checkbox>`:d}
                </div>
            </div>
        `}_renderInitError(){return c`
            <div role="alert"
                 class="rounded-md border border-danger/40 bg-danger/5 p-3 flex items-start gap-3">
                <p class="flex-1 text-sm text-error-strong">${this.context.t("The secure payment form could not be loaded. Try again or choose another payment method.")}</p>
                <button type="button"
                        class="text-xs text-error-strong hover:underline"
                        @click=${this._onRetry}>
                    ${this.context.t("Try again")}
                </button>
            </div>
        `}_renderField(e){const t=this._fields[e],r=e==="number"&&this._brand!==null&&!this._isBrandAccepted(),i=t.showError||r,n=`hc-bt-${e}-label`,s=`hc-bt-${e}-err`,a=r?this.context.t(f,{type:this._brand?.niceType??""}):this.context.t(w[e]);return c`
            <div>
                <div class="flex items-center justify-between gap-2">
                    <label id=${n}
                           class="block text-sm font-medium text-brand"
                           @click=${()=>this._hostedFields?.focus(e)}>
                        ${this.context.t(F[e])}
                        <span aria-hidden="true" class="text-danger">*</span>
                    </label>
                    ${e==="number"&&this._brand?c`<span class="text-xs font-medium text-muted" data-card-brand>${this._brand.niceType}</span>`:d}
                </div>
                <div data-hosted-field=${e}
                     role="group"
                     aria-labelledby=${n}
                     aria-describedby=${i?s:""}
                     class="${T} ${i?"border-danger":"border-subtle"} ${t.isFocused?"ring-2 ring-accent":""}"></div>
                ${i?c`<p id=${s} class="mt-1 text-sm text-danger">${a}</p>`:d}
            </div>
        `}async _init(){const e=++this._generation,t=()=>e!==this._generation||!this.isConnected;this._status="loading";try{const r=this._config();if(!r?.clientToken)throw new Error("missing Braintree client token");const[i,n]=await Promise.all([E(this.context,r.clientToken),g(this.context,"hosted-fields")]);if(y(this.context,r.clientToken),t())return;await this._teardown();const s=await n.create({client:i,fields:this._fieldOptions(r),styles:C(this.context)});if(t()){s.teardown().catch(()=>{});return}s.on("validityChange",a=>this._onValidityChange(a)),s.on("cardTypeChange",a=>this._onCardTypeChange(a)),s.on("focus",a=>this._patchField(a.emittedBy,{isFocused:!0})),s.on("blur",a=>this._onBlur(a)),this._hostedFields=s,this._status="ready",this._emit("ready")}catch(r){if(t())return;console.error("[hyperion-checkout] Braintree hosted fields could not be initialized",r),this._status="error",this._emit("ready")}}async _teardown(){const e=this._hostedFields;if(this._hostedFields=null,!!e)try{await e.teardown()}catch(t){console.error("[hyperion-checkout] Braintree hosted fields teardown failed",t)}}_fieldOptions(e){const t=i=>{const n=this.querySelector(`[data-hosted-field="${i}"]`);if(!n)throw new Error(`hosted field container "${i}" is missing`);return n},r={number:{container:t("number"),placeholder:"4111 1111 1111 1111"},expirationDate:{container:t("expirationDate"),placeholder:this.context.t("MM/YY")}};return e.useCvv&&(r.cvv={container:t("cvv"),placeholder:"123"}),r}_patchField(e,t){this._fields={...this._fields,[e]:{...this._fields[e],...t}}}_onValidityChange(e){const t=e.fields[e.emittedBy];t&&this._patchField(e.emittedBy,{showError:!t.isValid&&!t.isPotentiallyValid})}_onBlur(e){const t=e.fields[e.emittedBy];this._patchField(e.emittedBy,{isFocused:!1,...t?{showError:!t.isValid&&!t.isEmpty}:{}})}_onCardTypeChange(e){const t=e.cards.length===1?e.cards[0]:void 0;this._brand=t?{type:t.type,niceType:t.niceType}:null}_isBrandAccepted(){const e=this._config();return!e||!this._brand?!0:$(e,this._brand.type,this._services.quote().billingAddress?.country_id??null)!==null}_onSaveCardChange(e){this._saveCard=e.detail.checked}async getPaymentData(){return{additional_data:await this.collectPaymentData()}}collectPaymentData(){return this._pending||(this._pending=this._collect().finally(()=>{this._pending=null})),this._pending}async _collect(){const e=this._config(),t=this._hostedFields;if(!e||!t||this._status!=="ready")throw new Error(this.context.t(S));if(!this._isBrandAccepted())throw new Error(this.context.t(f,{type:this._brand?.niceType??""}));let r;try{r=await t.tokenize({})}catch(a){throw new Error(this._explainTokenizeError(a),{cause:a})}const i=p(this._services.config(),e.ccVaultCode);this._emit("busy",{busy:!0});let n;try{n=await x(this.context,{authorization:e.clientToken,nonce:r.nonce,bin:r.details.bin??"",storedCard:!1,savingCard:i&&this._saveCard})}finally{this._emit("busy",{busy:!1})}const s=await y(this.context,e.clientToken);return{payment_method_nonce:n,...s?{device_data:s}:{},...i?{is_active_payment_token_enabler:this._saveCard}:{}}}_explainTokenizeError(e){console.error("[hyperion-checkout] Braintree tokenization failed",e);const t=e?.code??"",i=this._config()?.useCvv??!1?["number","expirationDate","cvv"]:["number","expirationDate"];if(t==="HOSTED_FIELDS_FIELDS_EMPTY")for(const n of i)this._patchField(n,{showError:!0});if(t==="HOSTED_FIELDS_FIELDS_INVALID"){const n=e.details?.invalidFieldKeys??[];for(const s of i)n.includes(s)&&this._patchField(s,{showError:!0})}return this.context.t(I[t]??k)}}u([h()],l.prototype,"_status");u([h()],l.prototype,"_fields");u([h()],l.prototype,"_brand");u([h()],l.prototype,"_saveCard");customElements.get("hc-payment-braintree-card")||customElements.define("hc-payment-braintree-card",l);export{l as PaymentBraintreeCard,$ as resolveAcceptedCardType};
//# sourceMappingURL=payment-braintree-card-DS-HRWoO.js.map
