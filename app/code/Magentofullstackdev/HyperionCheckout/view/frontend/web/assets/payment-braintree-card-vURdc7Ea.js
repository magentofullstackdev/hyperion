import{i as C,A as l,t as s,b as c,n as E}from"./checkout-CwuysbvX.js";import{n as m,r as y}from"./checkout-app-CQ9YpIXM.js";import{B as f,g as _,i as b,a as g,l as k,b as v,c as T}from"./quote-1ZwGw7Nl.js";import{h as F,H as D,r as w}from"./hosted-field-styles-B9VoKNxT.js";import{v as I}from"./three-d-secure-M-BlHL1t.js";var x=Object.defineProperty,p=(o,e,t,i)=>{for(var r=void 0,a=o.length-1,n;a>=0;a--)(n=o[a])&&(r=n(e,t,r)||r);return r&&x(e,t,r),r};const $={number:"Hyperion_Checkout::braintree_card_number",expirationDate:"Hyperion_Checkout::braintree_card_expiry",cvv:"Hyperion_Checkout::braintree_card_cvv"},H={number:"Hyperion_Checkout::braintree_card_number_invalid",expirationDate:"Hyperion_Checkout::braintree_card_expiry_invalid",cvv:"Hyperion_Checkout::braintree_card_cvv_invalid"},S={HOSTED_FIELDS_FIELDS_EMPTY:"Hyperion_Checkout::braintree_card_fields_empty",HOSTED_FIELDS_FIELDS_INVALID:"Hyperion_Checkout::braintree_card_fields_invalid",HOSTED_FIELDS_TOKENIZATION_FAIL_ON_DUPLICATE:"Hyperion_Checkout::braintree_card_duplicate",HOSTED_FIELDS_TOKENIZATION_CVV_VERIFICATION_FAILED:"Hyperion_Checkout::braintree_card_cvv_failed",HOSTED_FIELDS_TOKENIZATION_NETWORK_ERROR:"Hyperion_Checkout::braintree_network_error"};function O(o,e,t){const i=o.ccTypesMapper[e];if(!i)return null;const r=t?o.countrySpecificCardTypes[t]:void 0;return(r?o.availableCardTypes.filter(n=>r.includes(n)):o.availableCardTypes).includes(i)?i:null}let u=null;class h extends C{constructor(){super(...arguments),this.code=f,this._status="loading",this._fields={number:{isFocused:!1,showError:!1},expirationDate:{isFocused:!1,showError:!1},cvv:{isFocused:!1,showError:!1}},this._brand=null,this._saveCard=!1,this._hostedFields=null,this._generation=0,this._pending=null,this._onRetry=()=>{this._init()}}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),u=this,this.updateComplete.then(()=>this._init())}disconnectedCallback(){super.disconnectedCallback(),u===this&&(u=null),this._generation++,this._teardown()}render(){const e=_(),t=e!==null&&b(e.ccVaultCode);return c`
            <div class="space-y-3">
                ${F()}
                ${this._status==="error"?this._renderInitError():l}
                ${this._status==="loading"?c`<p class="text-sm text-muted" role="status" aria-live="polite">
                          ${s("Hyperion_Checkout::braintree_card_loading")}
                      </p>`:l}
                <div class="space-y-3 ${this._status==="error"?"hidden":""}">
                    ${this._renderField("number")}
                    <div class="grid grid-cols-2 gap-3">
                        ${this._renderField("expirationDate")}
                        ${e?.useCvv?this._renderField("cvv"):l}
                    </div>
                    ${t?c`<hc-checkbox
                                  name="braintree_save_card"
                                  label=${s("Hyperion_Checkout::braintree_save_card")}
                                  .checked=${this._saveCard}
                                  @value-change=${this._onSaveCardChange}
                              ></hc-checkbox>`:l}
                </div>
            </div>
        `}_renderInitError(){return c`
            <div role="alert"
                 class="rounded-md border border-danger/40 bg-danger/5 p-3 flex items-start gap-3">
                <p class="flex-1 text-sm text-danger">${s("Hyperion_Checkout::braintree_init_failed")}</p>
                <button type="button"
                        class="text-xs text-danger hover:underline"
                        @click=${this._onRetry}>
                    ${s("Hyperion_Checkout::braintree_retry")}
                </button>
            </div>
        `}_renderField(e){const t=this._fields[e],i=e==="number"&&this._brand!==null&&!this._isBrandAccepted(),r=t.showError||i,a=`hc-bt-${e}-label`,n=`hc-bt-${e}-err`,d=i?s("Hyperion_Checkout::braintree_card_type_not_accepted",{type:this._brand?.niceType??""}):s(H[e]);return c`
            <div>
                <div class="flex items-center justify-between gap-2">
                    <label id=${a}
                           class="block text-sm font-medium text-brand"
                           @click=${()=>this._hostedFields?.focus(e)}>
                        ${s($[e])}
                        <span aria-hidden="true" class="text-danger">*</span>
                    </label>
                    ${e==="number"&&this._brand?c`<span class="text-xs font-medium text-muted" data-card-brand>${this._brand.niceType}</span>`:l}
                </div>
                <div data-hosted-field=${e}
                     role="group"
                     aria-labelledby=${a}
                     aria-describedby=${r?n:""}
                     class="${D} ${r?"border-danger":"border-subtle"} ${t.isFocused?"ring-2 ring-accent":""}"></div>
                ${r?c`<p id=${n} class="mt-1 text-sm text-danger">${d}</p>`:l}
            </div>
        `}async _init(){const e=++this._generation,t=()=>e!==this._generation||!this.isConnected;this._status="loading";try{const i=_();if(!i?.clientToken)throw new Error("missing Braintree client token");const[r,a]=await Promise.all([g(i.clientToken),k("hosted-fields")]);if(v(i.clientToken),t())return;await this._teardown();const n=await a.create({client:r,fields:this._fieldOptions(i),styles:w(this)});if(t()){n.teardown().catch(()=>{});return}n.on("validityChange",d=>this._onValidityChange(d)),n.on("cardTypeChange",d=>this._onCardTypeChange(d)),n.on("focus",d=>this._patchField(d.emittedBy,{isFocused:!0})),n.on("blur",d=>this._onBlur(d)),this._hostedFields=n,this._status="ready"}catch(i){if(t())return;console.error("[hyperion-checkout] Braintree hosted fields could not be initialised",i),this._status="error"}}async _teardown(){const e=this._hostedFields;if(this._hostedFields=null,!!e)try{await e.teardown()}catch(t){console.error("[hyperion-checkout] Braintree hosted fields teardown failed",t)}}_fieldOptions(e){const t=r=>{const a=this.querySelector(`[data-hosted-field="${r}"]`);if(!a)throw new Error(`hosted field container "${r}" is missing`);return a},i={number:{container:t("number"),placeholder:"4111 1111 1111 1111"},expirationDate:{container:t("expirationDate"),placeholder:s("Hyperion_Checkout::braintree_card_expiry_placeholder")}};return e.useCvv&&(i.cvv={container:t("cvv"),placeholder:"123"}),i}_patchField(e,t){this._fields={...this._fields,[e]:{...this._fields[e],...t}}}_onValidityChange(e){const t=e.fields[e.emittedBy];t&&this._patchField(e.emittedBy,{showError:!t.isValid&&!t.isPotentiallyValid})}_onBlur(e){const t=e.fields[e.emittedBy];this._patchField(e.emittedBy,{isFocused:!1,...t?{showError:!t.isValid&&!t.isEmpty}:{}})}_onCardTypeChange(e){const t=e.cards.length===1?e.cards[0]:void 0;this._brand=t?{type:t.type,niceType:t.niceType}:null}_isBrandAccepted(){const e=_();return!e||!this._brand?!0:O(e,this._brand.type,T()?.country_id??null)!==null}_onSaveCardChange(e){this._saveCard=e.detail.checked}collectPaymentData(){return this._pending||(this._pending=this._collect().finally(()=>{this._pending=null})),this._pending}async _collect(){const e=_(),t=this._hostedFields;if(!e||!t||this._status!=="ready")throw new Error(s("Hyperion_Checkout::braintree_not_ready"));if(!this._isBrandAccepted())throw new Error(s("Hyperion_Checkout::braintree_card_type_not_accepted",{type:this._brand?.niceType??""}));let i;try{i=await t.tokenize({})}catch(d){throw new Error(this._explainTokenizeError(d))}const r=b(e.ccVaultCode),a=await I({authorization:e.clientToken,nonce:i.nonce,bin:i.details.bin??"",storedCard:!1,savingCard:r&&this._saveCard}),n=await v(e.clientToken);return{payment_method_nonce:a,...n?{device_data:n}:{},...r?{is_active_payment_token_enabler:this._saveCard}:{}}}_explainTokenizeError(e){console.error("[hyperion-checkout] Braintree tokenization failed",e);const t=e?.code??"",r=_()?.useCvv??!1?["number","expirationDate","cvv"]:["number","expirationDate"];if(t==="HOSTED_FIELDS_FIELDS_EMPTY")for(const a of r)this._patchField(a,{showError:!0});if(t==="HOSTED_FIELDS_FIELDS_INVALID"){const a=e.details?.invalidFieldKeys??[];for(const n of r)a.includes(n)&&this._patchField(n,{showError:!0})}return s(S[t]??"Hyperion_Checkout::braintree_tokenize_failed")}}p([m({type:String})],h.prototype,"code");p([y()],h.prototype,"_status");p([y()],h.prototype,"_fields");p([y()],h.prototype,"_brand");p([y()],h.prototype,"_saveCard");customElements.get("payment-braintree-card")||customElements.define("payment-braintree-card",h);function B(){E({code:f,component:"payment-braintree-card",isAvailable:()=>{const o=_();return!!(o?.isActive&&o.clientToken)},beforePlaceOrder:async()=>{if(!u)throw new Error(s("Hyperion_Checkout::braintree_not_ready"));return u.collectPaymentData()}})}B();export{h as PaymentBraintreeCard,B as registerBraintreeCardRenderer,O as resolveAcceptedCardType};
//# sourceMappingURL=payment-braintree-card-vURdc7Ea.js.map
