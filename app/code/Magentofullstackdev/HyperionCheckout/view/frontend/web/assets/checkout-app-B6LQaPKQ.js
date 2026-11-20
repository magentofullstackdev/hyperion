const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./captcha-field-BXlyYVKs.js","./checkout-bfdIjziR.js","./checkout-Buv3khmE.css","./payment-braintree-card-CD3VwNr5.js","./quote-CSMHN3Em.js","./hosted-field-styles-CJzDiTFh.js","./three-d-secure-CfNeM8hq.js","./payment-braintree-paypal-CbIjNZRX.js","./checkout-gate-D8ei00SF.js","./line-items-BrA_igti.js","./payment-braintree-vault-Cvo5gv-w.js","./payment-braintree-googlepay-BaHhWqm8.js","./payment-paypal-express-Bj1YWB4O.js","./login-action-Csd9fjNu.js"])))=>i.map(i=>d[i]);
import{j as nr,k as sr,u as ir,e as $,i as b,a as p,A as u,c as a,l as or,t as l,m as W,S as qe,s as ar,n as Le,o as lr,q as pe,r as cr,v as dr,w as ur,_ as H,x as hr,y as pr,z as _r,B as re,C as mr,D as xt,E as kt,b as E,F as gr,G as fr,H as Ze,I as br,J as yr,K as vr,L as Re,M as $r,N as xr,O as kr,P as U,f as x,Q as wt,R as K,T as et,U as wr,V as Cr,W as Er,X as Sr,Y as Ar,Z as M,$ as Pr,h as Hr,a0 as tt,a1 as Tr,a2 as Rr,a3 as Or,a4 as Fr}from"./checkout-bfdIjziR.js";/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Ct={ATTRIBUTE:1,CHILD:2},Me=r=>(...e)=>({_$litDirective$:r,values:e});let De=class{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,t,s){this._$Ct=e,this._$AM=t,this._$Ci=s}_$AS(e,t){return this.update(e,t)}update(e,t){return this.render(...t)}};/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const{I:Ir}=nr,rt=r=>r,nt=()=>document.createComment(""),z=(r,e,t)=>{const s=r._$AA.parentNode,n=e===void 0?r._$AB:e._$AA;if(t===void 0){const i=s.insertBefore(nt(),n),o=s.insertBefore(nt(),n);t=new Ir(i,o,r,r.options)}else{const i=t._$AB.nextSibling,o=t._$AM,c=o!==r;if(c){let d;t._$AQ?.(r),t._$AM=r,t._$AP!==void 0&&(d=r._$AU)!==o._$AU&&t._$AP(d)}if(i!==n||c){let d=t._$AA;for(;d!==i;){const _=rt(d).nextSibling;rt(s).insertBefore(d,n),d=_}}}return t},N=(r,e,t=r)=>(r._$AI(e,t),r),Nr={},Et=(r,e=Nr)=>r._$AH=e,Br=r=>r._$AH,ve=r=>{r._$AR(),r._$AA.remove()};/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const qr={attribute:!0,type:String,converter:ir,reflect:!1,hasChanged:sr},Lr=(r=qr,e,t)=>{const{kind:s,metadata:n}=t;let i=globalThis.litPropertyMetadata.get(n);if(i===void 0&&globalThis.litPropertyMetadata.set(n,i=new Map),s==="setter"&&((r=Object.create(r)).wrapped=!0),i.set(t.name,r),s==="accessor"){const{name:o}=t;return{set(c){const d=e.get.call(this);e.set.call(this,c),this.requestUpdate(o,d,r,!0,c)},init(c){return c!==void 0&&this.C(o,void 0,r,c),c}}}if(s==="setter"){const{name:o}=t;return function(c){const d=this[o];e.call(this,c),this.requestUpdate(o,d,r,!0,c)}}throw Error("Unsupported decorator location: "+s)};function h(r){return(e,t)=>typeof t=="object"?Lr(r,e,t):((s,n,i)=>{const o=n.hasOwnProperty(i);return n.constructor.createProperty(i,s),o?Object.getOwnPropertyDescriptor(n,i):void 0})(r,e,t)}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */function A(r){return h({...r,state:!0,attribute:!1})}var Mr=Object.defineProperty,Dr=(r,e,t,s)=>{for(var n=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(n=o(e,t,n)||n);return n&&Mr(e,t,n),n};const Ur=new Set(["order","coupon","contact"]);function st(){const r=W();return r?.hyperion?.cartUrl??r?.cartUrl??""}class St extends $(b){constructor(){super(...arguments),this.section="order",this._shown=null,this._waiting=!1,this._waitTimer=null,this._retry=()=>{this._waiting||this._status()?.retry?.()},this._reload=()=>{window.location.reload()}}createRenderRoot(){return this}disconnectedCallback(){super.disconnectedCallback(),this._endWait()}_status(){return p().sectionStatus.get()[this.section]??null}willUpdate(){const e=this._status();if(e===this._shown)return;this._endWait();const t=e?.retryAt===void 0?0:e.retryAt-Date.now();t>0&&(this._waiting=!0,this._waitTimer=setTimeout(()=>{this._waitTimer=null,this._waiting=!1,this.requestUpdate()},t))}render(){const e=this._status();return e===null?u:a`
            <div role=${e.source==="action"?"alert":"status"}
                 tabindex="-1"
                 data-section-status
                 data-kind=${e.kind}
                 class="rounded-md border border-danger/40 bg-danger/5 p-3 flex flex-wrap items-start gap-x-3 gap-y-2 outline-none focus-visible:ring-2 focus-visible:ring-danger">
                <p class="flex-1 text-sm text-danger">${e.message}</p>
                ${this._renderAction(e)}
            </div>
        `}updated(){const e=this._status(),t=e!==null&&e!==this._shown;if(this._shown=e,t&&e.source==="action"&&Ur.has(this.section)){const s=()=>{this.querySelector("[data-section-status]")?.focus()};this.closest("[inert]")!==null?setTimeout(s,0):s()}}_renderAction(e){if(e.kind==="quote-gone")return a`<a href=${st()}
                           data-section-status-action
                           class="text-sm font-medium text-danger underline"
                           @click=${or}>${l("Hyperion_Checkout::return_to_cart")}</a>`;if(e.kind==="stock")return a`<a href=${st()}
                           data-section-status-action
                           class="text-sm font-medium text-danger underline">${l("Hyperion_Checkout::error_stock_link")}</a>`;if(e.kind==="blocked")return a`<button type="button"
                                data-section-status-action
                                class="text-sm font-medium text-danger underline"
                                @click=${this._reload}>${l("Hyperion_Checkout::reload_page")}</button>`;if(!e.retry)return u;const t=e.kind==="order-unknown"?l("Hyperion_Checkout::check_again"):l("Hyperion_Checkout::retry");return a`<button type="button"
                            data-section-status-action
                            class="text-sm font-medium text-danger underline aria-disabled:opacity-50 aria-disabled:no-underline"
                            aria-disabled=${this._waiting?"true":"false"}
                            @click=${this._retry}>${t}</button>`}_endWait(){this._waitTimer!==null&&clearTimeout(this._waitTimer),this._waitTimer=null,this._waiting=!1}}Dr([h({type:String})],St.prototype,"section");customElements.get("hc-section-status")||customElements.define("hc-section-status",St);/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const At=Me(class extends De{constructor(){super(...arguments),this.key=u}render(r,e){return this.key=r,e}update(r,[e,t]){return e!==this.key&&(Et(r),this.key=e),t}}),Pt=new qe.State(!1);let it=null;function jr(){return Pt.get()||customElements.get("hc-captcha")!==void 0}function Vr(){it??=H(()=>import("./captcha-field-BXlyYVKs.js"),__vite__mapDeps([0,1,2]),import.meta.url).then(()=>{Pt.set(!0)}).catch(r=>{it=null,console.error("[hyperion-checkout] the CAPTCHA field failed to load",r)})}const Ht=["pointerdown","keydown","touchstart"];let Tt=!1;const _e=new Set;function Wr(){for(const r of Ht)document.addEventListener(r,Rt,{capture:!0,passive:!0})}function Rt(){Tt=!0;for(const e of Ht)document.removeEventListener(e,Rt,!0);const r=Array.from(_e);_e.clear(),r.forEach(e=>e())}function Gr(r){return Tt?(r(),()=>{}):(_e.add(r),()=>{_e.delete(r)})}Wr();class Ue extends $(b){constructor(){super(...arguments),this._detachField=null,this._attachedField=null,this._cancelMount=null,this._mounted=null,this._onAnswer=e=>{const{detail:t}=e;ar(this.formId,t.value),t.value!==""&&Le(this.formId,null)}}createRenderRoot(){return this}disconnectedCallback(){super.disconnectedCallback(),this._releaseField(),this._releaseCheckbox()}render(){const e=lr(p(),this.formId),t=W()?.hyperion?.captcha?.refreshUrl??"",s=this._checkboxAction();if(e?.isRequired!==!0&&s===null)return u;const n=e?.isRequired===!0&&jr();return e?.isRequired===!0&&!n&&Vr(),a`
            <div class="space-y-3">
                ${e!==null&&n?a`
                    <hc-captcha form-id=${this.formId}
                                refresh-url=${t}
                                image-width=${e.imageWidth}
                                image-height=${e.imageHeight}
                                ?case-sensitive=${e.isCaseSensitive}
                                required
                                label=${l("Hyperion_Checkout::captcha_label")}
                                reload-label=${l("Hyperion_Checkout::captcha_reload")}
                                case-note=${l("Hyperion_Checkout::captcha_case_note")}
                                error=${pe(this.formId)??""}
                                @hyperion:captcha-change=${this._onAnswer}></hc-captcha>
                `:u}
                ${s!==null?At(s,a`
                    <div class="min-h-[78px]" data-hc-recaptcha-checkbox=${s}></div>
                `):u}
            </div>
        `}updated(){this._syncField(),this._syncCheckbox()}_checkboxAction(){const e=this.recaptchaAction();return e!==null&&cr(e)?.type==="v2-checkbox"?e:null}_syncField(){const e=this.querySelector("hc-captcha");e!==this._attachedField&&(this._releaseField(),e!==null&&(this._attachedField=e,this._detachField=dr(this.formId,{refresh:()=>e.refresh(),focus:()=>e.focus()})))}_releaseField(){this._detachField?.(),this._detachField=null,this._attachedField=null}_syncCheckbox(){const e=this.querySelector("[data-hc-recaptcha-checkbox]"),t=e===null?null:this._checkboxAction();this._mounted!==null&&(this._mounted.host!==e||this._mounted.action!==t)&&this._releaseCheckbox(),!(e===null||t===null||this._mounted!==null)&&(this._mounted={action:t,host:e},this._cancelMount=Gr(()=>{this._cancelMount=null,pr(t,e).catch(s=>{console.warn("[hyperion-checkout] reCAPTCHA",s)})}))}_releaseCheckbox(){this._cancelMount?.(),this._cancelMount=null,this._mounted!==null&&(ur(this._mounted.action,this._mounted.host),this._mounted=null)}}class zr extends Ue{constructor(){super(...arguments),this.formId="user_login"}recaptchaAction(){return"customer_login"}}class Yr extends Ue{constructor(){super(...arguments),this.formId="sales_rule_coupon_request"}recaptchaAction(){return"coupon_code"}}class Xr extends Ue{constructor(){super(...arguments),this.formId="payment_processing_request"}recaptchaAction(){return hr(p())}}customElements.get("hc-login-captcha")||customElements.define("hc-login-captcha",zr);customElements.get("hc-coupon-captcha")||customElements.define("hc-coupon-captcha",Yr);customElements.get("hc-order-captcha")||customElements.define("hc-order-captcha",Xr);/**
 * @license
 * Copyright 2018 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const R=r=>r??u;let ot=0;function je(){return ot+=1,`hc-f${ot}`}function j(r,e){return e===""?r:`${r}-${e}`}var Kr=Object.defineProperty,C=(r,e,t,s)=>{for(var n=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(n=o(e,t,n)||n);return n&&Kr(e,t,n),n};function Y(r){return r===""?void 0:r}class k extends b{constructor(){super(...arguments),this.label="",this.name="",this.value="",this.type="text",this.placeholder="",this.autocomplete="",this.required=!1,this.error="",this.warning="",this.hint="",this.inputmode="",this.idPrefix="",this.capitalize="",this.noSpellcheck=!1,this.enterHint="",this._ownIdPrefix=null,this._composing=!1}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.classList.add("hc-field")}get controlId(){return this.idPrefix!==""?j(this.idPrefix,this.name):(this._ownIdPrefix??=je(),j(this._ownIdPrefix,this.name))}render(){const e=this.controlId,t=`${e}-msg`,s=this.error||this.warning||this.hint,n=this.error?"error":this.warning?"warning":"hint";return a`
            <label for=${e} class="hc-field-label text-brand">
                ${this.label}
                ${this.required?a`<span aria-hidden="true" class="text-danger">*</span>`:u}
            </label>
            <input
                id=${e}
                name=${this.name}
                type=${this.type}
                class="hc-field-control ${this.error?"border-danger":"border-subtle"} bg-surface text-brand placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                .value=${this.value}
                placeholder=${R(Y(this.placeholder))}
                autocomplete=${R(Y(this.autocomplete))}
                inputmode=${R(Y(this.inputmode))}
                autocapitalize=${R(Y(this.capitalize))}
                spellcheck=${R(this.noSpellcheck?"false":void 0)}
                enterkeyhint=${R(Y(this.enterHint))}
                ?required=${this.required}
                aria-required=${this.required?"true":"false"}
                aria-invalid=${this.error?"true":"false"}
                aria-describedby=${R(s?t:void 0)}
                @input=${this._onInput}
                @change=${this._onChange}
                @compositionstart=${this._onCompositionStart}
                @compositionend=${this._onCompositionEnd}
                @blur=${this._onBlur}
            />
            <p id=${t}
               data-tone=${n}
               class="hc-field-message ${this.error?"text-danger":this.warning?"text-warning-strong":"text-muted"}">${s}</p>
        `}_commit(e){e!==this.value&&(this.value=e,this.dispatchEvent(new CustomEvent("value-change",{detail:{value:e,name:this.name},bubbles:!0,composed:!0})))}_onInput(e){this._composing||e.isComposing===!0||this._commit(e.target.value)}_onChange(e){this._composing||this._commit(e.target.value)}_onCompositionStart(){this._composing=!0}_onCompositionEnd(e){this._composing=!1,this._commit(e.target.value)}_onBlur(e){this._composing=!1,this._commit(e.target.value),this.dispatchEvent(new CustomEvent("value-blur",{detail:{value:this.value,name:this.name},bubbles:!0,composed:!0}))}}C([h({type:String})],k.prototype,"label");C([h({type:String})],k.prototype,"name");C([h({type:String})],k.prototype,"value");C([h({type:String})],k.prototype,"type");C([h({type:String})],k.prototype,"placeholder");C([h({type:String})],k.prototype,"autocomplete");C([h({type:Boolean,reflect:!0})],k.prototype,"required");C([h({type:String})],k.prototype,"error");C([h({type:String})],k.prototype,"warning");C([h({type:String})],k.prototype,"hint");C([h({type:String})],k.prototype,"inputmode");C([h({type:String,attribute:"id-prefix"})],k.prototype,"idPrefix");C([h({type:String})],k.prototype,"capitalize");C([h({type:Boolean,attribute:"no-spellcheck"})],k.prototype,"noSpellcheck");C([h({type:String,attribute:"enter-hint"})],k.prototype,"enterHint");customElements.get("hc-text-input")||customElements.define("hc-text-input",k);var Jr=Object.defineProperty,G=(r,e,t,s)=>{for(var n=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(n=o(e,t,n)||n);return n&&Jr(e,t,n),n};class q extends b{constructor(){super(...arguments),this.variant="primary",this.disabled=!1,this.softDisabled=!1,this.loading=!1,this.type="button",this.label=""}createRenderRoot(){return this}render(){const e="inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:cursor-not-allowed",t={primary:"bg-accent text-on-accent hover:bg-accent/90",secondary:"bg-surface-raised text-brand border border-subtle hover:bg-subtle",ghost:"bg-transparent text-accent hover:underline"};return a`
            <button
                type=${this.type}
                ?disabled=${this.disabled||this.loading}
                aria-disabled=${this.softDisabled&&!this.disabled&&!this.loading?"true":u}
                class="${e} ${t[this.variant]}"
                @click=${this._onClick}
            >
                ${this.loading?a`<span class="inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"></span>`:null}
                ${this.label}
            </button>
        `}_onClick(e){(this.disabled||this.loading)&&(e.preventDefault(),e.stopPropagation())}}G([h({type:String})],q.prototype,"variant");G([h({type:Boolean})],q.prototype,"disabled");G([h({type:Boolean})],q.prototype,"softDisabled");G([h({type:Boolean})],q.prototype,"loading");G([h({type:String})],q.prototype,"type");G([h({type:String})],q.prototype,"label");customElements.get("hc-button")||customElements.define("hc-button",q);var Qr=Object.defineProperty,Zr=Object.getOwnPropertyDescriptor,Ot=r=>{throw TypeError(r)},Ve=(r,e,t,s)=>{for(var n=Zr(e,t),i=r.length-1,o;i>=0;i--)(o=r[i])&&(n=o(e,t,n)||n);return n&&Qr(e,t,n),n},Ft=(r,e,t)=>e.has(r)||Ot("Cannot "+t),$e=(r,e,t)=>(Ft(r,e,"read from private field"),t?t.call(r):e.get(r)),xe=(r,e,t)=>e.has(r)?Ot("Cannot add the same private member more than once"):e instanceof WeakSet?e.add(r):e.set(r,t),ke=(r,e,t,s)=>(Ft(r,e,"write to private field"),e.set(r,t),t),ne,se,ie;const en=800;function we(){return W()?.hyperion?.guestCheckoutLoginEnabled!==!1}function tn(){const r=W(),e=r?.hyperion?.forgotPasswordUrl||r?.forgotPasswordUrl||"";return e===""?null:xt(e)}const at="hc-login-form",Ce="user_login";class me extends $(b){constructor(){super(...arguments),xe(this,ne,!1),xe(this,se,!1),xe(this,ie,!1),this._request=null,this._requestedValue=null,this._checkAfterTyping=_r(e=>{this._checkAvailability(e)},en)}get _checking(){return $e(this,ne)}set _checking(e){ke(this,ne,e)}get _loginOpen(){return $e(this,se)}set _loginOpen(e){ke(this,se,e)}get _loginBusy(){return $e(this,ie)}set _loginBusy(e){ke(this,ie,e)}connectedCallback(){super.connectedCallback(),this.classList.add("hc-host")}disconnectedCallback(){super.disconnectedCallback(),this._dropPendingCheck(),this._loginBusy=!1}updated(){if(!this._loginBusy)return;const e=p().loginError.get()!==null;(e||pe(Ce)!==null)&&queueMicrotask(()=>this._endFailedLogin(e))}_endFailedLogin(e){this._loginBusy&&(this._loginBusy=!1,e&&(p().password.set(""),this.updateComplete.then(()=>{this.querySelector('input[name="password"]')?.focus({preventScroll:!0})})))}createRenderRoot(){return this}render(){const e=p(),t=e.email.get(),s=e.emailExists.get(),n=e.loginError.get();pe(Ce);const o=e.fieldErrors.get().email??"",c=we(),d=c&&s===!0;return a`
            <div data-hyperion-email-step>
                <hc-text-input
                    label=${l("Hyperion_Checkout::email_label")}
                    name="email"
                    type="email"
                    id-prefix="hc-contact"
                    autocomplete="email"
                    inputmode="email"
                    capitalize="none"
                    enter-hint="next"
                    .noSpellcheck=${!0}
                    .value=${t}
                    .required=${!0}
                    .error=${o}
                    .hint=${this._checking?l("Hyperion_Checkout::checking_email"):""}
                    placeholder=${l("Hyperion_Checkout::email_placeholder")}
                    @value-change=${this._onEmailInput}
                    @value-blur=${this._onEmailBlur}
                ></hc-text-input>
                ${c?a`
                          <p class="hc-reserved-line text-brand" aria-live="polite" data-hyperion-login-slot>
                              ${d?a`
                                        <span>${l("Hyperion_Checkout::email_account_found")}</span>
                                        <button type="button"
                                                class="font-medium text-accent underline underline-offset-2 hover:no-underline focus:outline-none focus:ring-2 focus:ring-accent"
                                                aria-expanded=${this._loginOpen?"true":"false"}
                                                aria-controls=${at}
                                                data-hyperion-login-open
                                                @click=${this._onLoginToggle}>
                                            ${l("Hyperion_Checkout::login_open")}
                                        </button>
                                    `:u}
                          </p>
                      `:u}
                ${d&&this._loginOpen?this._renderPasswordForm(n):u}
                <hc-section-status section="contact"></hc-section-status>
            </div>
        `}_renderPasswordForm(e){const t=p(),s=tn();return a`
            <form id=${at}
                  class="mt-3 rounded-lg border border-subtle bg-surface-raised p-3"
                  aria-label=${l("Hyperion_Checkout::login_aria_label")}
                  aria-busy=${this._loginBusy?"true":"false"}
                  novalidate
                  data-hyperion-login-form
                  @submit=${this._onLoginSubmit}>
                <p class="mb-3 text-sm text-brand">
                    ${l("Hyperion_Checkout::email_existing_account")}
                </p>
                <hc-text-input
                    label=${l("Hyperion_Checkout::password_label")}
                    name="password"
                    type="password"
                    id-prefix="hc-login"
                    autocomplete="current-password"
                    enter-hint="go"
                    .value=${t.password.get()}
                    .required=${!0}
                    .error=${e??""}
                    @value-change=${this._onPasswordInput}
                ></hc-text-input>
                <div data-hyperion-login-captcha><hc-login-captcha></hc-login-captcha></div>
                <div class="mt-3 flex flex-wrap items-center gap-2">
                    <hc-button variant="primary"
                               type="submit"
                               .label=${l("Hyperion_Checkout::login_button")}
                               .loading=${this._loginBusy}></hc-button>
                    <hc-button variant="ghost"
                               .label=${l("Hyperion_Checkout::continue_as_guest")}
                               .disabled=${this._loginBusy}
                               @click=${this._onContinueAsGuestClick}></hc-button>
                    ${s!==null?a`<a href=${s}
                                  class="ml-auto text-sm font-medium text-accent hover:underline"
                                  data-hyperion-forgot-password>${l("Hyperion_Checkout::forgot_password")}</a>`:u}
                </div>
            </form>
        `}_onLoginToggle(){this._loginOpen=!this._loginOpen,this._loginOpen&&this.updateComplete.then(()=>{this.querySelector('input[name="password"]')?.focus({preventScroll:!0})})}_onEmailInput(e){const t=p(),s=t.email.get()!==e.detail.value;t.email.set(e.detail.value);const n=re(e.detail.value);if(n===null&&t.fieldErrors.get().email!==void 0){const i={...t.fieldErrors.get()};delete i.email,t.fieldErrors.set(i)}s&&this._onEmailValueChanged(e.detail.value,n===null)}_onEmailValueChanged(e,t){this._dropPendingCheck();const s=p();s.emailExists.set(!1),this._loginOpen=!1,s.password.get()!==""&&s.password.set(""),s.loginError.get()!==null&&s.loginError.set(null),t&&we()&&this._checkAfterTyping(e)}_dropPendingCheck(){this._checkAfterTyping.cancel(),this._request?.abort(),this._request=null,this._requestedValue=null,this._checking=!1}_checkAvailability(e){if(!we()||re(e)!==null)return;const t=p();if(t.email.get()!==e||this._requestedValue===e)return;this._request?.abort();const s=new AbortController;this._request=s,this._requestedValue=e,this._checking=!0,mr({customerEmail:e},{signal:s.signal}).then(n=>{s.signal.aborted||t.email.get()!==e||t.emailExists.set(!n)}).catch(()=>{this._request===s&&(this._requestedValue=null)}).finally(()=>{this._request===s&&(this._request=null,this._checking=!1)})}_onEmailBlur(e){const t=p(),s=re(e.detail.value);if(s){const n={...t.fieldErrors.get()};n.email=l(s),t.fieldErrors.set(n)}this._checkAfterTyping.cancel(),this._checkAvailability(e.detail.value)}_onPasswordInput(e){const t=p();t.password.set(e.detail.value),t.loginError.get()&&t.loginError.set(null)}_onLoginSubmit(e){e.preventDefault(),!this._loginBusy&&(this._loginBusy=!0,p().loginError.set(null),Le(Ce,null),this.dispatchEvent(new CustomEvent("login-request",{bubbles:!0,composed:!0})))}_onContinueAsGuestClick(){const e=p();this._loginOpen=!1,e.emailExists.set(!1),e.password.set(""),e.loginError.set(null)}}ne=new WeakMap;se=new WeakMap;ie=new WeakMap;Ve([A()],me.prototype,"_checking");Ve([A()],me.prototype,"_loginOpen");Ve([A()],me.prototype,"_loginBusy");customElements.get("checkout-email")||customElements.define("checkout-email",me);/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */class Oe extends De{constructor(e){if(super(e),this.it=u,e.type!==Ct.CHILD)throw Error(this.constructor.directiveName+"() can only be used in child bindings")}render(e){if(e===u||e==null)return this._t=void 0,this.it=e;if(e===kt)return e;if(typeof e!="string")throw Error(this.constructor.directiveName+"() called with a non-string value");if(e===this.it)return this._t;this.it=e;const t=[e];return t.raw=t,this._t={_$litType$:this.constructor.resultType,strings:t,values:[]}}}Oe.directiveName="unsafeHTML",Oe.resultType=1;const rn=Me(Oe),nn=["p","br","strong","em","b","i","u","ul","ol","li","a","span","div","h1","h2","h3","h4","h5","h6"],sn=["href","title","rel","target"],on=["http:","https:","mailto:","tel:"],It=new Set(["script","style","template","noscript","iframe","object","embed","svg","math","textarea","title","head"]);function Nt(r){const e=new DOMParser().parseFromString(`<div>${r}</div>`,"text/html");return{doc:e,root:e.body.firstElementChild}}function an(r,e){try{return e.has(new URL(r,window.location.origin).protocol)}catch{return!1}}function ln(r,e,t){for(const o of Array.from(r.attributes)){const c=o.name.toLowerCase();t.linkAttributes.has(c)&&e.setAttribute(c,o.value)}const s=e.getAttribute("href")??"";s&&!an(s.trim(),t.linkProtocols)&&e.removeAttribute("href");const n=e.getAttribute("target");n!==null&&n!=="_blank"&&e.removeAttribute("target");const i=e.getAttribute("href")??"";(/^https?:/i.test(i)||e.getAttribute("target")==="_blank")&&e.setAttribute("rel","noopener noreferrer")}function Fe(r,e,t,s){e.childNodes.forEach(n=>{if(n.nodeType===3){t.appendChild(r.createTextNode(n.textContent??""));return}if(n.nodeType!==1)return;const i=n,o=i.tagName.toLowerCase();if(It.has(o))return;if(!s.tags.has(o)){Fe(r,i,t,s);return}const c=r.createElement(o);o==="a"&&ln(i,c,s),Fe(r,i,c,s),t.appendChild(c)})}function cn(r,e={}){const{doc:t,root:s}=Nt(String(r??""));if(!s)return"";const n=t.createElement("div");return Fe(t,s,n,{tags:new Set(e.tags??nn),linkAttributes:new Set(e.linkAttributes??sn),linkProtocols:new Set(e.linkProtocols??on)}),n.innerHTML}function dn(r){const{doc:e,root:t}=Nt(String(r??""));return t?(t.querySelectorAll(Array.from(It).join(",")).forEach(s=>s.remove()),t.querySelectorAll("br").forEach(s=>s.replaceWith(e.createTextNode(", "))),(t.textContent??"").replace(/\s+/g," ").replace(/ ,/g,",").trim()):""}function Ie(r){return cn(r)}const V=new qe.State(0);function un(){V.set(V.get()+1)}var hn=Object.defineProperty,F=(r,e,t,s)=>{for(var n=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(n=o(e,t,n)||n);return n&&hn(e,t,n),n};class T extends b{constructor(){super(...arguments),this.label="",this.name="",this.value="",this.options=[],this.required=!1,this.error="",this.placeholder="",this.autocomplete="",this.idPrefix="",this._ownIdPrefix=null}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.classList.add("hc-field")}get controlId(){return this.idPrefix!==""?j(this.idPrefix,this.name):(this._ownIdPrefix??=je(),j(this._ownIdPrefix,this.name))}render(){const e=this.controlId,t=`${e}-msg`,s=this.options.findIndex(n=>!n.separator&&n.value===this.value);return a`
            <label for=${e} class="hc-field-label text-brand">
                ${this.label}
                ${this.required?a`<span aria-hidden="true" class="text-danger">*</span>`:u}
            </label>
            <select
                id=${e}
                name=${this.name}
                class="hc-field-control ${this.error?"border-danger":"border-subtle"} bg-surface text-brand focus:outline-none focus:ring-2 focus:ring-accent"
                autocomplete=${R(this.autocomplete===""?void 0:this.autocomplete)}
                ?required=${this.required}
                aria-required=${this.required?"true":"false"}
                aria-invalid=${this.error?"true":"false"}
                aria-describedby=${R(this.error?t:void 0)}
                @change=${this._onChange}
                @blur=${this._onBlur}
            >
                ${this.placeholder?a`<option value="" ?selected=${s===-1}>${this.placeholder}</option>`:u}
                ${this.options.map((n,i)=>n.separator?a`<option disabled>${n.label}</option>`:a`
                          <option value=${n.value} ?selected=${i===s}>
                              ${n.label}
                          </option>
                      `)}
            </select>
            <p id=${t} data-tone="error" class="hc-field-message text-danger">${this.error}</p>
        `}updated(){const e=this.querySelector("select");e===null||e.value===this.value||(e.value=this.value,e.value!==this.value&&this.placeholder&&(e.value=""))}_onChange(e){const t=e.target;t.value!==this.value&&(this.value=t.value,this.dispatchEvent(new CustomEvent("value-change",{detail:{value:t.value,name:this.name},bubbles:!0,composed:!0})))}_onBlur(){this.dispatchEvent(new CustomEvent("value-blur",{detail:{value:this.value,name:this.name},bubbles:!0,composed:!0}))}}F([h({type:String})],T.prototype,"label");F([h({type:String})],T.prototype,"name");F([h({type:String})],T.prototype,"value");F([h({type:Array})],T.prototype,"options");F([h({type:Boolean,reflect:!0})],T.prototype,"required");F([h({type:String})],T.prototype,"error");F([h({type:String})],T.prototype,"placeholder");F([h({type:String})],T.prototype,"autocomplete");F([h({type:String,attribute:"id-prefix"})],T.prototype,"idPrefix");customElements.get("hc-select-input")||customElements.define("hc-select-input",T);var pn=Object.defineProperty,ge=(r,e,t,s)=>{for(var n=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(n=o(e,t,n)||n);return n&&pn(e,t,n),n};class J extends b{constructor(){super(...arguments),this.label="",this.name="",this.checked=!1,this.idPrefix="",this._ownIdPrefix=null}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.classList.add("hc-field")}get controlId(){return this.idPrefix!==""?j(this.idPrefix,this.name):(this._ownIdPrefix??=je(),j(this._ownIdPrefix,this.name))}render(){const e=this.controlId;return a`
            <label for=${e} class="inline-flex items-center gap-2 cursor-pointer select-none">
                <input
                    id=${e}
                    type="checkbox"
                    name=${this.name}
                    class="h-4 w-4 rounded border-subtle text-accent focus:ring-2 focus:ring-accent"
                    .checked=${this.checked}
                    @change=${this._onChange}
                />
                <span class="text-sm text-brand">${this.label}</span>
            </label>
        `}_onChange(e){const t=e.target;this.checked=t.checked,this.dispatchEvent(new CustomEvent("value-change",{detail:{checked:t.checked,name:this.name},bubbles:!0,composed:!0}))}}ge([h({type:String})],J.prototype,"label");ge([h({type:String})],J.prototype,"name");ge([h({type:Boolean})],J.prototype,"checked");ge([h({type:String,attribute:"id-prefix"})],J.prototype,"idPrefix");customElements.get("hc-checkbox")||customElements.define("hc-checkbox",J);var _n=Object.defineProperty,mn=Object.getOwnPropertyDescriptor,Bt=r=>{throw TypeError(r)},L=(r,e,t,s)=>{for(var n=s>1?void 0:s?mn(e,t):e,i=r.length-1,o;i>=0;i--)(o=r[i])&&(n=(s?o(e,t,n):o(n))||n);return s&&n&&_n(e,t,n),n},qt=(r,e,t)=>e.has(r)||Bt("Cannot "+t),Ee=(r,e,t)=>(qt(r,e,"read from private field"),t?t.call(r):e.get(r)),Se=(r,e,t)=>e.has(r)?Bt("Cannot add the same private member more than once"):e instanceof WeakSet?e.add(r):e.set(r,t),Ae=(r,e,t,s)=>(qt(r,e,"write to private field"),e.set(r,t),t),oe,ae,le;const ce=Re;function lt(){const r=E(),e=r.directoryData??r.countryData;if(!e||typeof e!="object")return[];const t=[];for(const[s,n]of Object.entries(e)){if(!n||typeof n!="object")continue;const i=n,o=typeof i.name=="string"?i.name:s;t.push({id:s,name:o,is_region_required:i.is_region_required===!0,is_region_visible:i.is_region_visible!==!1})}return t.sort((s,n)=>s.name.localeCompare(n.name)),t}const gn="─".repeat(10);function fn(r){const e=r.map(s=>({value:s.id,label:s.name})),t=[];for(const s of E().hyperion?.topDestinations??[]){const n=r.find(i=>i.id===s);n&&!t.some(i=>i.value===s)&&t.push({value:n.id,label:n.name})}return t.length===0?e:[...t,{value:"",label:gn,separator:!0},...e]}function ee(r){return r===""?[]:$r(ce().directoryData,r)}function ct(r,e){return r.trim().toLocaleLowerCase()===e.trim().toLocaleLowerCase()}class I extends $(b){constructor(){super(...arguments),this.mode="shipping",this.value=null,this.showSaveInAddressBook=!1,this.serverErrors={},Se(this,oe,{}),Se(this,ae,{}),Se(this,le,!1),this._validationBaseline=0}get _local(){return Ee(this,oe)}set _local(e){Ae(this,oe,e)}get _touched(){return Ee(this,ae)}set _touched(e){Ae(this,ae,e)}get _revealAll(){return Ee(this,le)}set _revealAll(e){Ae(this,le,e)}createRenderRoot(){return this}willUpdate(e){e.has("value")&&this.value&&(this._local={...this.value}),(e.has("value")||e.has("showSaveInAddressBook"))&&this._initSaveInAddressBook(),!this._revealAll&&V.get()>this._validationBaseline&&(this._revealAll=!0)}connectedCallback(){super.connectedCallback(),this.classList.add("hc-host"),this._validationBaseline=V.get(),this.value&&Object.keys(this._local).length===0&&(this._local={...this.value});let e=!1;if(!this._local.country_id){const t=E().defaultCountryId;this._local={...this._local,country_id:t},e=!0}this._initSaveInAddressBook()&&(e=!0),e&&this._emit()}_initSaveInAddressBook(){if(typeof this._local.save_in_address_book=="boolean")return!1;const e=this._local.id!=null&&this._local.id!=="";return this._local={...this._local,save_in_address_book:this.showSaveInAddressBook&&!e},!0}get _idPrefix(){return`hc-${this.mode}`}_token(e){return`${this.mode} ${e}`}_lastTextField(e,t){return e.showVat?"vat_id":e.showFax!=="no"?"fax":e.showTelephone!=="no"?"telephone":t?"region":"city"}render(){const e=ce(),t=lt(),s=this._local.country_id??"",n=ee(s),i=t.find(S=>S.id===s),o=gr(s,e),c=n.length>0,d=i?.is_region_required===!0,_=i?.is_region_visible!==!1,m=this._idPrefix,y=this._lastTextField(e,_&&!c),f=S=>S===y?"":"next",v=this._local.street??[],g=[];for(let S=0;S<e.streetLines;S++)g.push(v[S]??"");const w=fr();return a`
            <div class="hc-fields">
                ${this._renderNameField("prefix",w.prefix,"honorific-prefix")}
                <div class="hc-field-row hc-field-row-2">
                    <hc-text-input
                        label=${l("Hyperion_Checkout::firstname_label")}
                        name="firstname"
                        id-prefix=${m}
                        autocomplete=${this._token("given-name")}
                        capitalize="words"
                        enter-hint="next"
                        .value=${this._local.firstname??""}
                        .required=${!0}
                        .error=${this._errorFor("firstname",!0)}
                        @value-change=${this._onFieldChange}
                        @value-blur=${this._onBlur}
                    ></hc-text-input>
                    <hc-text-input
                        label=${l("Hyperion_Checkout::lastname_label")}
                        name="lastname"
                        id-prefix=${m}
                        autocomplete=${this._token("family-name")}
                        capitalize="words"
                        enter-hint="next"
                        .value=${this._local.lastname??""}
                        .required=${!0}
                        .error=${this._errorFor("lastname",!0)}
                        @value-change=${this._onFieldChange}
                        @value-blur=${this._onBlur}
                    ></hc-text-input>
                </div>
                ${this._renderNameField("middlename",w.middlename,"additional-name")}
                ${this._renderNameField("suffix",w.suffix,"honorific-suffix")}

                ${e.showCompany!=="no"?a`
                          <hc-text-input
                              label=${l("Hyperion_Checkout::company_label")}
                              name="company"
                              id-prefix=${m}
                              autocomplete=${this._token("organization")}
                              enter-hint="next"
                              .value=${this._local.company??""}
                              .required=${e.showCompany==="req"}
                              .error=${this._errorFor("company",e.showCompany==="req")}
                              @value-change=${this._onFieldChange}
                              @value-blur=${this._onBlur}
                          ></hc-text-input>
                      `:u}

                <hc-select-input
                    label=${l("Hyperion_Checkout::country_label")}
                    name="country_id"
                    id-prefix=${m}
                    autocomplete=${this._token("country")}
                    .options=${fn(t)}
                    .value=${s}
                    .required=${!0}
                    .error=${this._errorFor("country_id",!0)}
                    @value-change=${this._onCountryChange}
                    @value-blur=${this._onBlur}
                ></hc-select-input>

                ${g.map((S,P)=>a`
                        <hc-text-input
                            label=${P===0?l("Hyperion_Checkout::street_label_primary"):l("Hyperion_Checkout::street_label_additional",{n:String(P+1)})}
                            name=${`street_${P}`}
                            id-prefix=${m}
                            autocomplete=${this._token(`address-line${P+1}`)}
                            enter-hint="next"
                            .value=${S}
                            .required=${P===0}
                            .error=${P===0?this._errorFor("street"):""}
                            @value-change=${this._onStreetChange}
                            @value-blur=${this._onBlur}
                            data-index=${P}
                        ></hc-text-input>
                    `)}

                <div class="hc-field-row hc-field-row-3">
                    <hc-text-input
                        label=${l("Hyperion_Checkout::postcode_label")}
                        name="postcode"
                        id-prefix=${m}
                        autocomplete=${this._token("postal-code")}
                        enter-hint="next"
                        .noSpellcheck=${!0}
                        .value=${this._local.postcode??""}
                        .required=${o}
                        .error=${this._errorFor("postcode",o)}
                        .warning=${this._warningFor("postcode")}
                        @value-change=${this._onFieldChange}
                        @value-blur=${this._onBlur}
                    ></hc-text-input>
                    <hc-text-input
                        label=${l("Hyperion_Checkout::city_label")}
                        name="city"
                        id-prefix=${m}
                        autocomplete=${this._token("address-level2")}
                        capitalize="words"
                        enter-hint=${f("city")}
                        .value=${this._local.city??""}
                        .required=${!0}
                        .error=${this._errorFor("city",!0)}
                        @value-change=${this._onFieldChange}
                        @value-blur=${this._onBlur}
                    ></hc-text-input>
                    ${this._renderRegion(n,d,_,e,f("region"))}
                </div>

                ${e.showTelephone!=="no"?a`
                          <hc-text-input
                              label=${l("Hyperion_Checkout::telephone_label")}
                              name="telephone"
                              type="tel"
                              id-prefix=${m}
                              autocomplete=${this._token("tel")}
                              inputmode="tel"
                              enter-hint=${f("telephone")}
                              .value=${this._local.telephone??""}
                              .required=${e.showTelephone==="req"}
                              .error=${this._errorFor("telephone",e.showTelephone==="req")}
                              @value-change=${this._onFieldChange}
                              @value-blur=${this._onBlur}
                          ></hc-text-input>
                      `:u}

                ${e.showFax!=="no"?a`
                          <hc-text-input
                              label=${l("Hyperion_Checkout::fax_label")}
                              name="fax"
                              type="tel"
                              id-prefix=${m}
                              inputmode="tel"
                              enter-hint=${f("fax")}
                              .value=${this._local.fax??""}
                              .required=${e.showFax==="req"}
                              .error=${this._errorFor("fax",e.showFax==="req")}
                              @value-change=${this._onFieldChange}
                              @value-blur=${this._onBlur}
                          ></hc-text-input>
                      `:u}

                ${e.showVat?a`
                          <hc-text-input
                              label=${l("Hyperion_Checkout::vat_label")}
                              name="vat_id"
                              id-prefix=${m}
                              .noSpellcheck=${!0}
                              .value=${this._local.vat_id??""}
                              @value-change=${this._onFieldChange}
                          ></hc-text-input>
                      `:u}

                ${this.showSaveInAddressBook?a`
                          <hc-checkbox
                              name="save_in_address_book"
                              id-prefix=${m}
                              label=${l("Hyperion_Checkout::save_in_address_book")}
                              .checked=${this._local.save_in_address_book===!0}
                              @value-change=${this._onSaveToggle}
                          ></hc-checkbox>
                      `:u}
            </div>
        `}_renderRegion(e,t,s,n,i){if(!s)return a`<div class="hc-field-placeholder" aria-hidden="true" data-hyperion-region-placeholder></div>`;const o=this._regionError(n);return e.length>0?a`
                <hc-select-input
                    label=${l("Hyperion_Checkout::region_label")}
                    name="region_id"
                    id-prefix=${this._idPrefix}
                    autocomplete=${this._token("address-level1")}
                    placeholder=${l("Hyperion_Checkout::region_placeholder")}
                    .options=${e.map(c=>({value:String(c.id),label:c.name}))}
                    .value=${this._local.region_id==null?"":String(this._local.region_id)}
                    .required=${t}
                    .error=${o}
                    @value-change=${this._onRegionSelectChange}
                    @value-blur=${this._onBlur}
                ></hc-select-input>
            `:a`
            <hc-text-input
                label=${l("Hyperion_Checkout::region_label")}
                name="region"
                id-prefix=${this._idPrefix}
                autocomplete=${this._token("address-level1")}
                enter-hint=${i}
                .value=${this._regionText()}
                .required=${t}
                .error=${o}
                @value-change=${this._onFieldChange}
                @value-blur=${this._onBlur}
            ></hc-text-input>
        `}_regionText(){const e=this._local.region;return typeof e=="string"?e:Ze(this._local)}_renderNameField(e,t,s){if(t.show==="no")return u;const n=t.show==="req",i=l(`Hyperion_Checkout::${e}_label`),o=this._local[e]??"",c=t.options??[];if(c.length>0){const d=c.includes(o)||o===""?c:[o,...c];return a`
                <div class="md:max-w-xs">
                    <hc-select-input
                        label=${i}
                        name=${e}
                        id-prefix=${this._idPrefix}
                        autocomplete=${this._token(s)}
                        placeholder=${l("Hyperion_Checkout::name_option_placeholder")}
                        .options=${d.map(_=>({value:_,label:_}))}
                        .value=${o}
                        .required=${n}
                        .error=${this._errorFor(e,n)}
                        @value-change=${this._onNameSelectChange}
                        @value-blur=${this._onBlur}
                    ></hc-select-input>
                </div>
            `}return a`
            <div class=${e==="middlename"?"":"md:max-w-xs"}>
                <hc-text-input
                    label=${i}
                    name=${e}
                    id-prefix=${this._idPrefix}
                    autocomplete=${this._token(s)}
                    capitalize=${e==="middlename"?"words":""}
                    enter-hint="next"
                    .value=${o}
                    .required=${n}
                    .error=${this._errorFor(e,n)}
                    @value-change=${this._onFieldChange}
                    @value-blur=${this._onBlur}
                ></hc-text-input>
            </div>
        `}_onNameSelectChange(e){this._touched={...this._touched,[e.detail.name]:!0},this._onFieldChange(e)}_errorFor(e,t=!1){const s=this.serverErrors[e];if(s)return s;if(!(this._revealAll||this._touched[e]===!0))return"";if(e==="street"){const o=this._local.street??[];return!o[0]||o[0].trim().length===0?l("Hyperion_Checkout::validation_required"):""}if(!t)return"";const i=this._local[e];return i==null?l("Hyperion_Checkout::validation_required"):typeof i=="string"&&i.trim().length===0?l("Hyperion_Checkout::validation_required"):""}_warningFor(e){if(e!=="postcode"||this.serverErrors[e]||!(this._revealAll||this._touched[e]===!0))return"";const s=br(this._local.postcode,this._local.country_id??"",ce());return s===null?"":l("Hyperion_Checkout::validation_postcode",{example:s.examples.join(", ")})}_onFieldChange(e){this._local={...this._local,[e.detail.name]:e.detail.value},this._emit()}_onStreetChange(e){const s=e.target.getAttribute("data-index"),n=s?Number(s):0,i=[...this._local.street??[]];for(;i.length<n+1;)i.push("");i[n]=e.detail.value,this._local={...this._local,street:i},this._emit()}_regionError(e){const t=this.serverErrors.region_id||this.serverErrors.region;return t||((this._revealAll||this._touched.region_id===!0||this._touched.region===!0)&&yr(this._local,e)?l("Hyperion_Checkout::validation_required"):"")}_onCountryChange(e){const t=e.detail.value,s=this._local.country_id??"";if(t===s)return;const i=lt().find(_=>_.id===t)?.is_region_visible!==!1&&ee(s).length===0?Ze(this._local):"",o=ee(t);let c=null,d=null;if(i!=="")if(o.length===0)d=i;else{const _=o.find(m=>ct(m.name,i)||m.code!==""&&ct(m.code,i));_&&(c=String(_.id),d={region:_.name,region_code:_.code,region_id:Number(_.id)})}this._touched={...this._touched,country_id:!0},this._local={...this._local,country_id:t,region_id:c,region:d},this._emit()}_onRegionSelectChange(e){const s=ee(this._local.country_id??"").find(n=>String(n.id)===e.detail.value);this._touched={...this._touched,region_id:!0},this._local={...this._local,region_id:e.detail.value,region:s?{region:s.name,region_code:s.code,region_id:Number(s.id)}:null},this._emit()}_onBlur(e){const t=e.detail.name.startsWith("street_")?"street":e.detail.name;this._touched[t]!==!0&&(this._touched={...this._touched,[t]:!0})}_onSaveToggle(e){this._local={...this._local,save_in_address_book:e.detail.checked},this._emit()}_emit(){this.dispatchEvent(new CustomEvent("address-change",{detail:this._local,bubbles:!0,composed:!0})),this.dispatchEvent(new CustomEvent("address-valid",{detail:this._isComplete(),bubbles:!0,composed:!0}))}_isComplete(){return vr(this._local,ce())}}oe=new WeakMap;ae=new WeakMap;le=new WeakMap;L([h({type:String})],I.prototype,"mode",2);L([h({type:Object})],I.prototype,"value",2);L([h({type:Boolean})],I.prototype,"showSaveInAddressBook",2);L([h({type:Object})],I.prototype,"serverErrors",2);L([A()],I.prototype,"_local",1);L([A()],I.prototype,"_touched",1);L([A()],I.prototype,"_revealAll",1);customElements.get("address-form")||customElements.define("address-form",I);var bn=Object.defineProperty,yn=(r,e,t,s)=>{for(var n=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(n=o(e,t,n)||n);return n&&bn(e,t,n),n};function vn(r){const t=W()?.directoryData?.[r],s=t&&typeof t=="object"?t.name:null;return typeof s=="string"&&s!==""?s:r}class Lt extends b{createRenderRoot(){return this}render(){const e=this.address,t=e.street.filter(n=>n.trim().length>0).join(", "),s=typeof e.region=="object"&&e.region?.region?e.region.region:"";return a`
            <div class="text-sm text-brand space-y-0.5">
                <p class="font-semibold">${xr(e)}</p>
                ${e.company?a`<p class="text-muted">${e.company}</p>`:null}
                <p>${t}</p>
                <p>
                    ${[e.city,s,e.postcode].filter(Boolean).join(", ")}
                </p>
                <p>${vn(e.country_id)}</p>
                ${e.telephone?a`<p class="text-muted">${e.telephone}</p>`:null}
            </div>
        `}}yn([h({type:Object})],Lt.prototype,"address");customElements.get("address-card")||customElements.define("address-card",Lt);var $n=Object.defineProperty,xn=Object.getOwnPropertyDescriptor,Mt=r=>{throw TypeError(r)},Dt=(r,e,t,s)=>{for(var n=s>1?void 0:s?xn(e,t):e,i=r.length-1,o;i>=0;i--)(o=r[i])&&(n=(s?o(e,t,n):o(n))||n);return s&&n&&$n(e,t,n),n},Ut=(r,e,t)=>e.has(r)||Mt("Cannot "+t),kn=(r,e,t)=>(Ut(r,e,"read from private field"),t?t.call(r):e.get(r)),wn=(r,e,t)=>e.has(r)?Mt("Cannot add the same private member more than once"):e instanceof WeakSet?e.add(r):e.set(r,t),Cn=(r,e,t,s)=>(Ut(r,e,"write to private field"),e.set(r,t),t),de;const En={firstname:"Hyperion_Checkout::firstname_label",lastname:"Hyperion_Checkout::lastname_label",prefix:"Hyperion_Checkout::prefix_label",middlename:"Hyperion_Checkout::middlename_label",suffix:"Hyperion_Checkout::suffix_label",company:"Hyperion_Checkout::company_label",country_id:"Hyperion_Checkout::country_label",street:"Hyperion_Checkout::street_label_primary",postcode:"Hyperion_Checkout::postcode_label",city:"Hyperion_Checkout::city_label",region:"Hyperion_Checkout::region_label",telephone:"Hyperion_Checkout::telephone_label",fax:"Hyperion_Checkout::fax_label"};function Pe(r){return r!==null&&r.id!=null&&r.id!==""}class We extends $(b){constructor(){super(...arguments),this.mode="shipping",wn(this,de,!1),this._newAddressSeed=null,this._previous=null,this._openNewForm=()=>{this._beginNewAddress(null)},this._closeNewForm=()=>{const e=this._previous??this._firstUsable();this._showNewForm=!1,this._newAddressSeed=null,e!==null?this._selectSaved(e):this._clearSelection()}}get _showNewForm(){return kn(this,de)}set _showNewForm(e){Cn(this,de,e)}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.classList.add("hc-host"),this._adoptInitialState()}_adoptInitialState(){if(p().savedAddresses.get().length===0)return;const s=this._currentAddress();if(s!==null){Pe(s)||(this._showNewForm=!0);return}const n=this._firstUsable();n&&this._selectSaved(n)}_firstUsable(){const e=Re().directoryData??{},t=Object.keys(e).length>0;return p().savedAddresses.get().find(n=>!t||e[n.country_id]!==void 0)??null}render(){const e=p(),t=e.savedAddresses.get(),s=this.mode==="shipping"?e.selectedShippingAddressId.get():e.selectedBillingAddressId.get();if(t.length===0)return a`
                <address-form
                    mode=${this.mode}
                    .showSaveInAddressBook=${!0}
                    .value=${this._seedForNewAddress()}
                    @address-change=${this._onNewAddressChange}
                ></address-form>
            `;const n=Re();return a`
            <div>
                <div class="hc-field-row hc-field-row-2"
                     role="radiogroup"
                     aria-label=${this.mode==="shipping"?l("Hyperion_Checkout::shipping_address_heading"):l("Hyperion_Checkout::billing_address_heading")}>
                    ${t.map(i=>this._renderCard(i,s,kr(i,n)))}
                </div>
                ${this._showNewForm?a`
                          <div class="mt-4 pt-4 border-t border-subtle">
                              <p class="text-sm font-medium text-brand mb-3">
                                  ${l("Hyperion_Checkout::add_new_address")}
                              </p>
                              <address-form
                                  mode=${this.mode}
                                  .showSaveInAddressBook=${!0}
                                  .value=${this._seedForNewAddress()}
                                  @address-change=${this._onNewAddressChange}
                              ></address-form>
                              <div class="mt-3">
                                  <hc-button variant="ghost"
                                             .label=${l("Hyperion_Checkout::cancel")}
                                             data-hyperion-address-cancel
                                             @click=${this._closeNewForm}></hc-button>
                              </div>
                          </div>
                      `:a`
                          <div class="mt-4">
                              <hc-button variant="secondary"
                                         .label=${l("Hyperion_Checkout::add_new_address")}
                                         data-hyperion-address-new
                                         @click=${this._openNewForm}></hc-button>
                          </div>
                      `}
            </div>
        `}_renderCard(e,t,s){const n=e.id??"",i=n===t&&!this._showNewForm;return a`
            <div data-hyperion-address-card=${n}>
                <label class="flex h-full items-start gap-3 rounded-lg border p-3 cursor-pointer ${i?"border-accent bg-accent/5":"border-subtle bg-surface hover:border-accent"}">
                    <input
                        type="radio"
                        name="saved-${this.mode}-address"
                        class="mt-0.5 h-4 w-4 text-accent focus:ring-2 focus:ring-accent"
                        .checked=${i}
                        @change=${()=>this._selectSaved(e)}
                    />
                    <span class="flex-1">
                        <address-card .address=${e}></address-card>
                        ${s.length>0?a`<span class="mt-2 block text-sm text-danger" data-hyperion-address-incomplete>
                                  ${l("Hyperion_Checkout::address_incomplete_notice",{fields:this._fieldNames(s)})}
                              </span>`:u}
                    </span>
                </label>
                ${s.length>0&&!this._showNewForm?a`
                          <div class="mt-1">
                              <hc-button variant="ghost"
                                         .label=${l("Hyperion_Checkout::address_edit")}
                                         data-hyperion-address-edit
                                         @click=${()=>this._editSaved(e)}></hc-button>
                          </div>
                      `:u}
            </div>
        `}_fieldNames(e){return e.map(t=>{const s=En[t];return s?l(s):t}).join(", ")}_currentAddress(){const e=p();return this.mode==="shipping"?e.shippingAddress.get():e.billingAddress.get()}_seedForNewAddress(){if(this._newAddressSeed===null){const t=p().customer.get(),s=this._currentAddress();this._newAddressSeed=s!==null&&!Pe(s)?s:{country_id:E().defaultCountryId,street:[],city:"",firstname:t?.firstname??"",lastname:t?.lastname??"",telephone:s?.telephone??""}}return this._newAddressSeed}_beginNewAddress(e){const t=this._currentAddress();this._previous=Pe(t)?t:this._previous,this._newAddressSeed=e,this._showNewForm=!0,this.mode==="shipping"&&p().estimateState.set("idle")}_editSaved(e){const t={...e};delete t.id,delete t.customer_id,delete t.default_shipping,delete t.default_billing,delete t.inline,this._beginNewAddress(t)}_selectSaved(e){const t=p();this._showNewForm=!1,this._newAddressSeed=null,this._previous=null,this.mode==="shipping"?(t.selectedShippingAddressId.set(e.id??null),t.shippingAddress.set(e)):(t.selectedBillingAddressId.set(e.id??null),t.billingAddress.set(e)),this.dispatchEvent(new CustomEvent("saved-address-select",{detail:{address:e,mode:this.mode},bubbles:!0,composed:!0}))}_clearSelection(){const e=p();this.mode==="shipping"?(e.selectedShippingAddressId.set(null),e.shippingAddress.set(null)):(e.selectedBillingAddressId.set(null),e.billingAddress.set(null))}_onNewAddressChange(e){const t=p(),s={...e.detail};delete s.id,delete s.customer_id,this.mode==="shipping"?(t.selectedShippingAddressId.set(null),t.shippingAddress.set(s)):(t.selectedBillingAddressId.set(null),t.billingAddress.set(s))}}de=new WeakMap;Dt([h({type:String})],We.prototype,"mode",2);Dt([A()],We.prototype,"_showNewForm",1);customElements.get("address-selector")||customElements.define("address-selector",We);/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const dt=(r,e,t)=>{const s=new Map;for(let n=e;n<=t;n++)s.set(r[n],n);return s},Ge=Me(class extends De{constructor(r){if(super(r),r.type!==Ct.CHILD)throw Error("repeat() can only be used in text expressions")}dt(r,e,t){let s;t===void 0?t=e:e!==void 0&&(s=e);const n=[],i=[];let o=0;for(const c of r)n[o]=s?s(c,o):o,i[o]=t(c,o),o++;return{values:i,keys:n}}render(r,e,t){return this.dt(r,e,t).values}update(r,[e,t,s]){const n=Br(r),{values:i,keys:o}=this.dt(e,t,s);if(!Array.isArray(n))return this.ut=o,i;const c=this.ut??=[],d=[];let _,m,y=0,f=n.length-1,v=0,g=i.length-1;for(;y<=f&&v<=g;)if(n[y]===null)y++;else if(n[f]===null)f--;else if(c[y]===o[v])d[v]=N(n[y],i[v]),y++,v++;else if(c[f]===o[g])d[g]=N(n[f],i[g]),f--,g--;else if(c[y]===o[g])d[g]=N(n[y],i[g]),z(r,d[g+1],n[y]),y++,g--;else if(c[f]===o[v])d[v]=N(n[f],i[v]),z(r,n[y],n[f]),f--,v++;else if(_===void 0&&(_=dt(o,v,g),m=dt(c,y,f)),_.has(c[y]))if(_.has(c[f])){const w=m.get(o[v]),S=w!==void 0?n[w]:null;if(S===null){const P=z(r,n[y]);N(P,i[v]),d[v]=P}else d[v]=N(S,i[v]),z(r,n[y],S),n[w]=null;v++}else ve(n[f]),f--;else ve(n[y]),y++;for(;v<=g;){const w=z(r,d[g+1]);N(w,i[v]),d[v++]=w}for(;y<=f;){const w=n[y++];w!==null&&ve(w)}return this.ut=o,Et(r,d),kt}});function O(r,e){const t=typeof r=="string"?Number(r):r;if(!Number.isFinite(t))return e.pattern.replace("%s","");const s=e.integerRequired?0:Math.max(0,e.requiredPrecision??e.precision??2),n=Math.abs(t).toFixed(s),[i,o=""]=n.split("."),c=e.groupLength>0?e.groupLength:3,d=(i??"0").split("").reverse(),_=[];for(let f=0;f<d.length;f+=c)_.push(d.slice(f,f+c).reverse().join(""));_.reverse();let m=_.join(e.groupSymbol);o.length>0&&(m=`${m}${e.decimalSymbol}${o}`);const y=e.pattern.replace("%s",m);return t<0?`-${y}`:y}var Sn=Object.defineProperty,fe=(r,e,t,s)=>{for(var n=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(n=o(e,t,n)||n);return n&&Sn(e,t,n),n};function Ne(r){return r.available!==!1&&!!r.method_code}class Q extends b{constructor(){super(...arguments),this.selected=!1,this.disabled=!1,this.grouped=!1}createRenderRoot(){return this}render(){const e=this.method;if(!Ne(e))return this._renderError(e);const s=`hc-ship-${e.carrier_code}-${e.method_code}`,n=this.selected;return a`
            <label for=${s}
                   class="flex items-start justify-between gap-3 rounded-control border p-3 ${this.disabled?"cursor-default":"cursor-pointer"} ${n?"border-accent bg-accent/5":"border-subtle hover:border-accent bg-surface"}">
                <span class="flex min-w-0 items-start gap-3">
                    <input
                        id=${s}
                        type="radio"
                        name="shipping_method"
                        class="mt-0.5 h-4 w-4 shrink-0 text-accent focus:ring-2 focus:ring-accent"
                        .checked=${n}
                        ?disabled=${this.disabled}
                        @change=${this._onSelect}
                    />
                    <span class="block min-w-0 text-sm font-medium text-brand" data-shipping-method-title>
                        ${this.grouped?a`<span class="sr-only">${e.carrier_title}: </span>${e.method_title}`:a`${e.carrier_title}: ${e.method_title}`}
                    </span>
                </span>
                <span class="text-sm font-semibold text-brand text-right" data-shipping-method-price>
                    ${this._priceLabel(e)}
                </span>
            </label>
        `}_renderError(e){const t=`hc-ship-${e.carrier_code}-unavailable`,s=e.error_message;return a`
            <label for=${t}
                   class="flex items-start gap-3 rounded-control border border-subtle bg-surface p-3"
                   data-shipping-method-error>
                <input
                    id=${t}
                    type="radio"
                    name="shipping_method"
                    class="mt-0.5 h-4 w-4 shrink-0 text-accent"
                    .checked=${!1}
                    disabled
                    aria-describedby=${s?`${t}-message`:u}
                />
                <span class="block min-w-0">
                    <span class="block text-sm font-medium text-brand" data-shipping-method-title>${e.carrier_title}</span>
                    ${s?a`<span id="${t}-message" class="block text-xs text-danger mt-0.5">${s}</span>`:u}
                </span>
            </label>
        `}_priceLabel(e){const t=E(),s=U(),n=Number(e.price_incl_tax??e.amount??0),i=Number(e.price_excl_tax??e.amount??0);if(t.isDisplayShippingBothPrices&&n!==i)return l("Hyperion_Checkout::shipping_price_both",{excl:O(i,s),incl:O(n,s)});const o=t.isDisplayShippingPriceExclTax?i:n;return o===0?l("Hyperion_Checkout::shipping_free"):O(o,s)}_onSelect(){this.dispatchEvent(new CustomEvent("method-select",{detail:{carrier_code:this.method.carrier_code,method_code:this.method.method_code},bubbles:!0,composed:!0}))}}fe([h({type:Object})],Q.prototype,"method");fe([h({type:Boolean})],Q.prototype,"selected");fe([h({type:Boolean})],Q.prototype,"disabled");fe([h({type:Boolean})],Q.prototype,"grouped");customElements.get("shipping-method-row")||customElements.define("shipping-method-row",Q);function An(r){const e=new Map;for(const n of r)Ne(n)&&e.set(n.carrier_code,(e.get(n.carrier_code)??0)+1);const t=new Set,s=[];for(const n of r){const i=Ne(n)&&(e.get(n.carrier_code)??0)>1;i&&!t.has(n.carrier_code)&&(t.add(n.carrier_code),s.push({key:`carrier:${n.carrier_code}`,heading:n.carrier_title})),s.push({key:`rate:${n.carrier_code}:${n.method_code}`,method:n,grouped:i})}return s}class Pn extends $(b){createRenderRoot(){return this}render(){const e=p(),t=e.estimateState.get(),s=t==="idle"||t==="error"?[]:e.availableShippingMethods.get(),n=t==="loading",i=t==="empty"||t==="ready"&&s.length===0;let o="";return n&&(o=l(s.length>0?"Hyperion_Checkout::shipping_updating":"Hyperion_Checkout::shipping_calculating")),a`
            <div class="min-h-[6.25rem] space-y-2" data-estimate-state=${t}>
                ${t==="idle"?a`<p class="text-sm text-muted" data-shipping-methods-idle>
                          ${l("Hyperion_Checkout::shipping_waiting_for_address")}
                      </p>`:u}
                ${n&&s.length===0?a`
                          <div class="space-y-2" aria-hidden="true" data-shipping-methods-loading>
                              <div class="h-[2.875rem] rounded-control border border-subtle bg-surface-raised animate-pulse"></div>
                              <div class="h-[2.875rem] rounded-control border border-subtle bg-surface-raised animate-pulse"></div>
                          </div>
                      `:u}
                ${i?a`<p class="text-sm text-danger" data-shipping-methods-none>
                          ${l("Hyperion_Checkout::shipping_none_available")}
                      </p>`:u}
                ${s.length>0?this._renderRows(s,n):u}
                <hc-section-status section="shipping-methods"></hc-section-status>
            </div>
            <p class="sr-only" role="status" data-shipping-methods-progress>${o}</p>
        `}_renderRows(e,t){const s=p().selectedShippingMethod.get();return a`
            <div role="radiogroup"
                 aria-label=${l("Hyperion_Checkout::shipping_method_aria")}
                 aria-busy=${t?"true":u}
                 class="space-y-2 ${t?"opacity-60":""}">
                ${Ge(An(e),n=>n.key,n=>"heading"in n?a`<p class="pt-1 text-xs font-semibold uppercase tracking-wider text-muted"
                              aria-hidden="true"
                              data-shipping-carrier>${n.heading}</p>`:a`
                          <shipping-method-row
                              class="block"
                              .method=${n.method}
                              .grouped=${n.grouped}
                              .disabled=${t}
                              .selected=${s?.carrier_code===n.method.carrier_code&&s.method_code===n.method.method_code}
                              @method-select=${this._onSelect}
                          ></shipping-method-row>
                      `)}
            </div>
        `}_onSelect(e){x().selectShippingMethod(e.detail)}}customElements.get("shipping-method-list")||customElements.define("shipping-method-list",Pn);class Hn extends $(b){constructor(){super(...arguments),this._openPolicy=()=>{const e=this.querySelector("dialog[data-hyperion-shipping-policy]");e&&(typeof e.showModal=="function"?e.showModal():e.setAttribute("open",""))},this._closePolicy=()=>{const e=this.querySelector("dialog[data-hyperion-shipping-policy]");e&&(typeof e.close=="function"?e.close():e.removeAttribute("open"))}}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.classList.add("hc-host")}render(){const e=p();if(e.isVirtual.get())return null;const t=e.shippingAddress.get(),s=e.customer.get()!==null;return a`
            <div>
                <h3 class="mb-4 text-base font-semibold text-brand">
                    ${l("Hyperion_Checkout::shipping_address_heading")}
                </h3>
                ${s?a`<address-selector mode="shipping"
                                              @saved-address-select=${this._onSavedPick}
                                              @address-change=${this._onAddressChange}
                                              @focusout=${this._onFormFocusOut}
                            ></address-selector>`:a`<address-form
                                mode="shipping"
                                .value=${t}
                                @address-change=${this._onAddressChange}
                                @focusout=${this._onFormFocusOut}
                            ></address-form>`}
                <hc-section-status section="shipping-address"></hc-section-status>
                <div class="mt-4 pt-2 border-t border-subtle">
                    <h3 class="text-base font-semibold text-brand mb-2">
                        ${l("Hyperion_Checkout::shipping_method_heading")}
                    </h3>
                    <shipping-method-list></shipping-method-list>
                    ${this._renderShippingPolicy()}
                </div>
            </div>
        `}_renderShippingPolicy(){const e=E().shippingPolicy;if(!e||!e.isEnabled)return u;const t=Ie(e.shippingPolicyContent??"");return t.trim()===""?u:a`
            <div class="pt-3">
                <button type="button"
                        class="text-sm font-medium text-accent hover:underline"
                        data-hyperion-shipping-policy-open
                        @click=${this._openPolicy}>
                    ${l("Hyperion_Checkout::shipping_policy_open")}
                </button>
                <dialog class="w-full max-w-lg rounded-md border border-subtle bg-surface p-0 text-brand shadow-lg backdrop:bg-black/40"
                        aria-labelledby="hc-shipping-policy-heading"
                        data-hyperion-shipping-policy>
                    <div class="p-4 space-y-3">
                        <h3 id="hc-shipping-policy-heading" class="text-base font-semibold text-brand">
                            ${l("Hyperion_Checkout::shipping_policy_heading")}
                        </h3>
                        <div class="text-sm text-brand space-y-2 max-h-[60vh] overflow-y-auto">${rn(t)}</div>
                        <div class="flex justify-end">
                            <hc-button variant="secondary"
                                       .label=${l("Hyperion_Checkout::shipping_policy_close")}
                                       @click=${this._closePolicy}></hc-button>
                        </div>
                    </div>
                </dialog>
            </div>
        `}_onAddressChange(e){const t=p(),s=t.shippingAddress.get()?.country_id??"";t.shippingAddress.set(e.detail),s!==""&&e.detail.country_id!==s?x().estimateShippingNow():x().scheduleShippingEstimate()}_onFormFocusOut(e){const t=e.currentTarget,s=e.relatedTarget;t!==null&&s instanceof Node&&t.contains(s)||x().flushShippingForm()}_onSavedPick(){x().estimateShippingNow()}}customElements.get("checkout-shipping")||customElements.define("checkout-shipping",Hn);const jt={braintree:()=>H(()=>import("./payment-braintree-card-CD3VwNr5.js"),__vite__mapDeps([3,1,2,4,5,6]),import.meta.url),braintree_paypal:()=>H(()=>import("./payment-braintree-paypal-CbIjNZRX.js"),__vite__mapDeps([7,1,2,8,4,9]),import.meta.url),braintree_cc_vault:()=>H(()=>import("./payment-braintree-vault-Cvo5gv-w.js"),__vite__mapDeps([10,1,2,4,5,6]),import.meta.url),braintree_paypal_vault:()=>H(()=>import("./payment-braintree-vault-Cvo5gv-w.js"),__vite__mapDeps([10,1,2,4,5,6]),import.meta.url),braintree_googlepay:()=>H(()=>import("./payment-braintree-googlepay-BaHhWqm8.js"),__vite__mapDeps([11,1,2,8,4,9,6]),import.meta.url),braintree_googlepay_vault:()=>H(()=>import("./payment-braintree-vault-Cvo5gv-w.js"),__vite__mapDeps([10,1,2,4,5,6]),import.meta.url),paypal_express:()=>H(()=>import("./payment-paypal-express-Bj1YWB4O.js"),__vite__mapDeps([12,1,2,8]),import.meta.url),payflow_express:()=>H(()=>import("./payment-paypal-express-Bj1YWB4O.js"),__vite__mapDeps([12,1,2,8]),import.meta.url)},D=new qe.State(0),ut=new Set,Vt=new Set;function Be(r){return r in jt&&!Vt.has(r)}function Tn(r){for(const e of r){const t=jt[e];!t||ut.has(e)||(ut.add(e),t().then(()=>D.set(D.get()+1)).catch(s=>{Vt.add(e),D.set(D.get()+1),console.error(`[hyperion-checkout] payment renderer for "${e}" failed to load`,s)}))}}const be=new Map;function ks(r){be.set(r.code,r),wt({code:r.code,component:"payment-vault",beforePlaceOrder:async()=>{const e=Ye(r.code);if(!e)throw new Error(l("Hyperion_Checkout::vault_no_token_selected"));return(r.beforePlaceOrder??qn)(e)},...r.recaptchaAction?{recaptchaAction:r.recaptchaAction}:{}})}function Wt(r){return be.get(r)??null}function Rn(r){const e=E().vault;return e&&typeof e=="object"&&r in e?!0:ze().some(t=>t.code===r)}function ze(r){const e=E().payment?.vault;if(!e||typeof e!="object")return[];const t=[];for(const[s,n]of Object.entries(e)){const i=n?.config;if(!i||typeof i!="object")continue;const o=typeof i.code=="string"?i.code:"",c=typeof i.publicHash=="string"?i.publicHash:"";if(!o||!c||r!==void 0&&o!==r)continue;const d=i.details;t.push({key:s,code:o,publicHash:c,nonceUrl:typeof i.nonceUrl=="string"?i.nonceUrl:null,updatePaymentUrl:typeof i.updatePaymentUrl=="string"&&i.updatePaymentUrl!==""?i.updatePaymentUrl:null,details:d&&typeof d=="object"?d:{}})}return t}function On(r){return be.has(r)?ze(r):[]}function Fn(r){return be.has(r)||Be(r)?ze(r):[]}function Ye(r){const e=On(r),t=p().paymentMethodData.get()[r]?.public_hash;return e.find(s=>s.publicHash===t)??e[0]??null}function In(r){const e=[],t=[];for(const s of r){if(Rn(s.code)){for(const i of Fn(s.code))e.push({method:s,token:i});continue}const n=K(s.code)?.isAvailable;n&&!n(s)||t.push({method:s,token:null})}return[...e,...t]}function Nn(r,e){const t=p();t.paymentMethodData.set({...t.paymentMethodData.get(),[r]:{public_hash:e}}),t.selectedPaymentMethod.set(r)}async function Bn(r){const e=d=>new Error(typeof d=="string"&&d?d:l("Hyperion_Checkout::vault_nonce_failed"));if(!r.nonceUrl)throw e();const t=new URL(r.nonceUrl,window.location.href);if(t.origin!==window.location.origin)throw e();t.searchParams.set("public_hash",r.publicHash);let s,n;try{s=await fetch(t.toString(),{method:"GET",credentials:"same-origin",headers:{Accept:"application/json","X-Requested-With":"XMLHttpRequest"}}),n=await s.json().catch(()=>null)}catch{throw e()}const i=n?.paymentMethodNonce;if(!s.ok||typeof i!="string"||!i)throw e(n?.message);const o=n?.details,c=o&&typeof o=="object"?o.bin:"";return{nonce:i,bin:typeof c=="string"?c:""}}async function qn(r){const{nonce:e}=await Bn(r);return{public_hash:r.publicHash,payment_method_nonce:e}}var Ln=Object.defineProperty,Gt=(r,e,t,s)=>{for(var n=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(n=o(e,t,n)||n);return n&&Ln(e,t,n),n};const B="purchaseorder",Mn=["checkmo","banktransfer","cashondelivery","free",B];function ht(){return String(p().paymentMethodData.get()[B]?.po_number??"").trim()}function pt(){return E().payment??{}}function te(r){return typeof r=="string"?r:""}class Xe extends $(b){constructor(){super(...arguments),this.code="",this._poTouched=!1,this._validationBaseline=0}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this._validationBaseline=V.get()}render(){const e=Ie(te(pt().instructions?.[this.code]));return a`
            <div class="space-y-3">
                ${e?a`<div class="text-sm text-muted"
                                data-payment-instructions
                                .innerHTML=${e}></div>`:u}
                ${this.code==="checkmo"?this._renderCheckDetails():u}
                ${this.code===B?this._renderPoInput():u}
            </div>
        `}_renderCheckDetails(){const e=pt().checkmo??{},t=te(e.payableTo).trim(),s=Ie(te(e.mailingAddress));return t===""&&s.trim()===""?u:a`
            <dl class="text-sm text-muted space-y-2" data-payment-check-details>
                ${t!==""?a`<div>
                              <dt class="font-medium text-brand">${l("Hyperion_Checkout::checkmo_payable_to")}</dt>
                              <dd data-payment-check-payable-to>${t}</dd>
                          </div>`:u}
                ${s.trim()!==""?a`<div>
                              <dt class="font-medium text-brand">${l("Hyperion_Checkout::checkmo_send_to")}</dt>
                              <dd data-payment-check-send-to .innerHTML=${s}></dd>
                          </div>`:u}
            </dl>
        `}_renderPoInput(){const t=p().paymentMethodData.get()[B]??{},s=te(t.po_number),i=(this._poTouched||V.get()>this._validationBaseline)&&s.trim()===""?l("Hyperion_Checkout::po_number_required"):"";return a`
            <hc-text-input
                label=${l("Hyperion_Checkout::po_number_label")}
                name="po_number"
                .value=${s}
                .required=${!0}
                .error=${i}
                @value-change=${this._onPoChange}
                @value-blur=${this._onPoBlur}
            ></hc-text-input>
        `}_onPoChange(e){const t=p(),s=t.paymentMethodData.get();t.paymentMethodData.set({...s,[B]:{...s[B]??{},po_number:e.detail.value}})}_onPoBlur(){this._poTouched=!0}}Gt([h({type:String})],Xe.prototype,"code");Gt([A()],Xe.prototype,"_poTouched");customElements.get("payment-offline")||customElements.define("payment-offline",Xe);function Dn(){for(const r of Mn)wt({code:r,component:"payment-offline",...r===B?{isReady:()=>ht()!=="",notReadyMessage:()=>l("Hyperion_Checkout::po_number_required"),beforePlaceOrder:async()=>{const e=ht();if(e==="")throw new Error(l("Hyperion_Checkout::po_number_required"));return{po_number:e}}}:{}})}Dn();var Un=Object.defineProperty,jn=(r,e,t,s)=>{for(var n=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(n=o(e,t,n)||n);return n&&Un(e,t,n),n};class zt extends b{constructor(){super(...arguments),this.code=""}createRenderRoot(){return this}render(){return a`
            <div role="alert"
                 class="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
                ${l("Hyperion_Checkout::payment_method_unavailable",{code:this.code})}
            </div>
        `}}jn([h({type:String})],zt.prototype,"code");customElements.get("payment-generic")||customElements.define("payment-generic",zt);var Vn=Object.defineProperty,Wn=(r,e,t,s)=>{for(var n=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(n=o(e,t,n)||n);return n&&Vn(e,t,n),n};class Yt extends $(b){constructor(){super(...arguments),this.code=""}createRenderRoot(){return this}render(){const e=Ye(this.code),t=e?Wt(this.code)?.renderBody?.(e):null;return t?At(e?.publicHash,a`${t}`):u}}Wn([h({type:String})],Yt.prototype,"code");customElements.get("payment-vault")||customElements.define("payment-vault",Yt);var Gn=Object.defineProperty,ye=(r,e,t,s)=>{for(var n=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(n=o(e,t,n)||n);return n&&Gn(e,t,n),n};class Z extends b{constructor(){super(...arguments),this.token=null,this.renderersVersion=0,this.selected=!1,this._body=null}createRenderRoot(){return this}render(){const e=this.method,t=K(e.code)!==null,s=et(e.code),n=this.token?`hc-pay-${this.token.key}`:`hc-pay-${e.code}`,i=this.token?Wt(e.code)?.label(this.token)??e.title:e.title,o=!t&&!s,c=o&&!Be(e.code);return a`
            <div class="rounded-md border ${this.selected?"border-accent bg-accent/5":"border-subtle bg-surface"} ${c?"opacity-60":""}">
                <label for=${n}
                       class="flex items-start gap-3 p-3 cursor-pointer ${o?"cursor-not-allowed":""}">
                    <input
                        id=${n}
                        type="radio"
                        name="payment_method"
                        class="mt-0.5 h-4 w-4 text-accent focus:ring-2 focus:ring-accent"
                        .checked=${this.selected}
                        ?disabled=${o}
                        @change=${this._onSelect}
                    />
                    <span class="text-sm">
                        <span class="font-medium text-brand">${i}</span>
                        ${c?a`<span class="block text-xs text-muted" data-payment-unsupported>
                                  ${l("Hyperion_Checkout::payment_method_unsupported_hint")}
                              </span>`:u}
                    </span>
                </label>
                ${this.selected?this._renderSelectedBody():this._dropBody()}
            </div>
        `}_renderSelectedBody(){const e=K(this.method.code),t=et(this.method.code);return e?a`<div class="px-3 pb-3">
                ${this._bodyElement(e.component,this.method.code)}
            </div>`:(this._body=null,t||Be(this.method.code)?null:a`<div class="px-3 pb-3">
            <payment-generic code=${this.method.code}></payment-generic>
        </div>`)}_bodyElement(e,t){const s=this._body;if(s&&s.localName===e&&s.getAttribute("code")===t)return s;const n=document.createElement(e);return n.setAttribute("code",t),this._body=n,n}_dropBody(){return this._body=null,null}_onSelect(){this.dispatchEvent(new CustomEvent("payment-select",{detail:{code:this.method.code,...this.token?{publicHash:this.token.publicHash}:{}},bubbles:!0,composed:!0}))}}ye([h({type:Object})],Z.prototype,"method");ye([h({attribute:!1})],Z.prototype,"token");ye([h({type:Number})],Z.prototype,"renderersVersion");ye([h({type:Boolean})],Z.prototype,"selected");customElements.get("payment-method-row")||customElements.define("payment-method-row",Z);class zn extends $(b){createRenderRoot(){return this}render(){const e=p(),t=wr(e.availablePaymentMethods.get(),e.totals.get());Tn(t.map(o=>o.code));const s=D.get(),n=In(t),i=e.selectedPaymentMethod.get();return n.length===0?e.quoteWritesPending.get()>0||e.isSettlingTotals.get()||e.isLoadingShippingMethods.get()?a`
                    <div class="space-y-2"
                         aria-busy="true"
                         aria-label=${l("Hyperion_Checkout::payment_method_aria")}
                         data-payment-methods-loading>
                        <div class="h-[2.875rem] rounded-control border border-subtle bg-surface-raised animate-pulse" aria-hidden="true"></div>
                        <div class="h-[2.875rem] rounded-control border border-subtle bg-surface-raised animate-pulse" aria-hidden="true"></div>
                    </div>
                `:!e.isVirtual.get()&&e.appliedShippingMethod.get()===null?a`<p class="text-sm text-muted" role="status" aria-live="polite" data-payment-methods-waiting>
                    ${l("Hyperion_Checkout::payment_waiting_for_shipping")}
                </p>`:a`<p class="text-sm text-danger" role="alert" data-payment-methods-none>
                ${l("Hyperion_Checkout::payment_none_available")}
            </p>`:a`
            <div role="radiogroup"
                 aria-label=${l("Hyperion_Checkout::payment_method_aria")}
                 class="space-y-2">
                ${Ge(n,({method:o,token:c})=>c?.publicHash??o.code,({method:o,token:c})=>a`
                    <payment-method-row
                        class="block"
                        .method=${o}
                        .token=${c}
                        .renderersVersion=${s}
                        .selected=${i===o.code&&(c===null||Ye(o.code)?.publicHash===c.publicHash)}
                        @payment-select=${this._onSelect}
                    ></payment-method-row>
                `)}
            </div>
        `}_onSelect(e){if(e.detail.publicHash){Nn(e.detail.code,e.detail.publicHash);return}p().selectedPaymentMethod.set(e.detail.code),x().savePaymentMethod()}}customElements.get("payment-method-list")||customElements.define("payment-method-list",zn);class Yn extends $(b){createRenderRoot(){return this}render(){const e=p(),t=e.isVirtual.get(),s=e.billingSameAsShipping.get(),n=e.billingAddress.get(),o=e.customer.get()!==null?a`<address-selector mode="billing"
                                      @address-change=${this._onBillingChange}
                                      @saved-address-select=${this._onSavedBillingPick}
                    ></address-selector>`:a`<address-form
                        mode="billing"
                        .value=${n}
                        .showSaveInAddressBook=${e.customer.get()!==null}
                        @address-change=${this._onBillingChange}
                    ></address-form>`;return a`
            <section class="space-y-4">
                ${t?a`
                          <div class="space-y-3">
                              <h3 class="text-base font-semibold text-heading">
                                  ${l("Hyperion_Checkout::billing_address_heading")}
                              </h3>
                              ${o}
                              <hc-section-status section="billing"></hc-section-status>
                          </div>
                      `:a`
                          <hc-checkbox
                              name="billing_same_as_shipping"
                              label=${l("Hyperion_Checkout::billing_same_as_shipping")}
                              .checked=${s}
                              @value-change=${this._onToggle}
                          ></hc-checkbox>
                          ${s?u:a`
                                    <div class="space-y-3 pt-2 border-t border-subtle">
                                        <h3 class="text-base font-semibold text-heading">
                                            ${l("Hyperion_Checkout::billing_address_heading")}
                                        </h3>
                                        ${o}
                                        <hc-section-status section="billing"></hc-section-status>
                                    </div>
                                `}
                      `}
                <div class="pt-2 border-t border-subtle">
                    <h3 class="text-base font-semibold text-heading mb-2">
                        ${l("Hyperion_Checkout::payment_method_heading")}
                    </h3>
                    <payment-method-list></payment-method-list>
                    <hc-section-status section="payment"></hc-section-status>
                </div>
            </section>
        `}_onToggle(e){p().billingSameAsShipping.set(e.detail.checked),x().invalidateBillingSync(),x().syncBillingAddress()}_onBillingChange(e){p().billingAddress.set(e.detail),x().invalidateBillingSync(),x().scheduleBillingSync()}_onSavedBillingPick(){x().invalidateBillingSync(),x().syncBillingAddress()}}customElements.get("checkout-payment")||customElements.define("checkout-payment",Yn);function _t(r,e,t,s,n){return e==="both"?[{code:`${r.code}_excl`,label:n.exclTax(r.title),value:t,kind:"regular"},{code:`${r.code}_incl`,label:n.inclTax(r.title),value:s,kind:"regular"}]:[{code:r.code,label:r.title,value:e==="including"?s:t,kind:"regular"}]}function mt(r,e){const t={code:"shipping",label:r,value:0,kind:"regular"};return e.shippingNotCalculated!==void 0&&(t.text=e.shippingNotCalculated),t}function Xn(r,e){const t=r.title??"";if(r.percent==null||!Number.isFinite(Number(r.percent)))return t;const s=e.percent?e.percent(Number(r.percent)):`${Number(r.percent)}%`;return t===""?s:`${t} (${s})`}function Kn(r,e,t){const s=Number(r.value);if(s===0&&!e.isZeroTaxDisplayed)return[];const n=[];if(e.isFullTaxSummaryDisplayed){const o=r.extension_attributes?.tax_grandtotal_details??[];for(const c of o)n.push({code:"tax_rate",label:(c.rates??[]).map(d=>Xn(d,t)).filter(d=>d!=="").join(", "),value:Number(c.amount??0),kind:"detail"})}return n.push({code:r.code,label:r.title,value:s,kind:"regular"}),n}const gt="grand_total",Jn=["tax_subtotal","tax_shipping","weee","msrp"];function ft(r,e){if(r==null||Array.isArray(r)||!Object.hasOwn(r,e))return;const t=r[e];if(typeof t!="number"&&(typeof t!="string"||t.trim()===""))return;const s=Number(t);return Number.isFinite(s)?s:void 0}function Qn(r,e){const t=ft(e,gt),s=t===void 0?Number.MAX_VALUE:t-.5;let n=-Number.MAX_VALUE;const i=r.map((o,c)=>{const d=ft(e,o.code);let _;return d!==void 0?(_=d,Jn.includes(o.code)||(n=d)):_=o.code===gt?1/0:Math.min(n,s),{segment:o,position:_,index:c}});return i.sort((o,c)=>o.position===c.position?o.index-c.index:o.position<c.position?-1:1),i.map(o=>o.segment)}function bt(r,e,t,s={}){const n=[],i=s.shippingPending===!0,o=Qn(r.total_segments,s.totalsSort),c=o.some(d=>d.code==="shipping");for(const d of o)switch(d.code){case"subtotal":n.push(..._t(d,e.reviewTotalsDisplayMode,Number(r.subtotal),Number(r.subtotal_incl_tax),t)),i&&!c&&n.push(mt(t.shippingTitle??"",t));break;case"shipping":i?n.push(mt(d.title||(t.shippingTitle??""),t)):d.value!==null&&d.value!==void 0&&n.push(..._t(d,e.reviewShippingDisplayMode,Number(r.shipping_amount),Number(r.shipping_incl_tax),t));break;case"tax":n.push(...Kn(d,e,t));break;case"grand_total":{const _=Number(d.value),m={code:d.code,label:d.title,value:_,kind:"grand"};i&&(m.provisional=!0),e.includeTaxInGrandTotal&&(n.push({code:"grand_total_excl",label:t.exclTax(d.title),value:_-Number(r.tax_amount),kind:"regular"}),m.label=t.inclTax(d.title)),n.push(m);break}default:{if(d.value===null||d.value===void 0)break;const _=Number(d.value);if(!Number.isFinite(_)||_===0)break;const m={code:d.code,label:d.title,value:_,kind:"regular"};_<0&&(m.tone="discount"),n.push(m)}}return n}function Zn(r,e,t){return r==="excluding"?e:t}function Xt(r){return!r.isVirtual.get()&&r.appliedShippingMethod.get()===null&&r.optimisticTotals.get()===null}function Ke(r=p()){const e=r.totals.get(),t=r.optimisticTotals.get(),s=t??e;if(!s)return null;const n=s.total_segments.find(o=>o.code==="grand_total"),i=n?.value??s.grand_total;return{label:n?.title??"",text:O(i,U()),settled:t===null&&!r.isSettlingTotals.get()&&!Xt(r)}}function es(r){try{return new Intl.NumberFormat(Cr(),{style:"percent",maximumFractionDigits:4}).format(r/100)}catch{return`${r}%`}}function ts(){return{exclTax:r=>l("Hyperion_Checkout::total_excl_tax",{title:r}),inclTax:r=>l("Hyperion_Checkout::total_incl_tax",{title:r}),shippingNotCalculated:l("Hyperion_Checkout::shipping_not_calculated"),shippingTitle:l("Hyperion_Checkout::shipping_heading"),percent:es}}const rs={grand:"mt-auto flex items-center justify-between gap-3 pt-2 border-t border-subtle text-base font-bold text-heading",detail:"flex items-center justify-between gap-3 text-xs text-muted",regular:"flex items-center justify-between gap-3 text-sm text-brand"};function ns(r){const e=new Map;return r.map(t=>{const s=e.get(t.code)??0;e.set(t.code,s+1);const n=t.text===void 0?t.code:`${t.code}:text`;return{key:s===0?n:`${n}:${s}`,row:t}})}class ss extends $(b){constructor(){super(...arguments),this._seenGrand=null,this._announcement=""}createRenderRoot(){return this}render(){const e=p(),t=e.totals.get(),s=e.optimisticTotals.get()??t;if(!s)return null;const n=e.isSettlingTotals.get(),i=e.isVirtual.get(),o=E(),c=U(),d=ts(),_={shippingPending:Xt(e),totalsSort:o.hyperion?.totalsSort},m=bt(s,o,d,_),y=t===null||t===s?m:bt(t,o,d,_),f=t===null?void 0:y.find(g=>g.kind==="grand");this._trackAnnouncement(f?`${f.label} ${O(f.value,c)}`:null);const v=this._baseChargeNotice(s.base_currency_code,s.quote_currency_code,s.base_grand_total);return a`
            <dl class="flex flex-col gap-1.5 ${i?"min-h-[5.3125rem]":"min-h-[6.9375rem]"}"
                data-hyperion-totals>
                ${Ge(ns(m),g=>g.key,({row:g})=>{const w=g.kind==="grand"&&(n||g.provisional===!0);return a`
                        <div class="${rs[g.kind]} ${g.tone==="discount"?"text-success":""}"
                             data-total=${g.code}
                             ?data-provisional=${w}
                             aria-busy=${g.kind==="grand"&&n?"true":u}>
                            <dt class="min-w-0 flex-1 truncate" title=${g.label}>${g.label}</dt>
                            <dd class="shrink-0 whitespace-nowrap text-right ${g.text!==void 0?"text-muted":""}">
                                ${g.text??O(g.value,c)}
                            </dd>
                        </div>
                    `})}
            </dl>
            ${v!==null?a`<p class="mt-1 text-xs text-muted text-right" data-base-charge-notice>${v}</p>`:u}
            <div role="status"
                 aria-live="polite"
                 class="sr-only"
                 data-hyperion-grand-total-live>${this._announcement}</div>
        `}_trackAnnouncement(e){e===null||e===this._seenGrand||(this._seenGrand!==null&&(this._announcement=e),this._seenGrand=e)}_baseChargeNotice(e,t,s){if(typeof e!="string"||typeof t!="string"||e===""||t===""||e===t)return null;const n=E().basePriceFormat??U();return l("Hyperion_Checkout::base_charge_notice",{amount:O(s,n)})}}customElements.get("summary-totals")||customElements.define("summary-totals",ss);function is(r,e=!1){const t=r.weee_tax_applied;if(t==null||t==="")return[];let s;try{s=typeof t=="string"?JSON.parse(t):t}catch{return[]}if(!Array.isArray(s))return[];const n=[];for(const i of s){if(!i||typeof i!="object")continue;const o=i,c=Number(e?o.amount_incl_tax??o.amount:o.amount),d=Number(e?o.row_amount_incl_tax??o.row_amount:o.row_amount);!Number.isFinite(d)||d<=0||n.push({title:typeof o.title=="string"&&o.title!==""?o.title:l("Hyperion_Checkout::fpt_fallback_title"),amount:Number.isFinite(c)?c:0,rowAmount:d})}return n}var os=Object.defineProperty,Kt=(r,e,t,s)=>{for(var n=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(n=o(e,t,n)||n);return n&&os(e,t,n),n};class Je extends b{constructor(){super(...arguments),this.eager=!1}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.hasAttribute("role")||this.setAttribute("role","listitem")}render(){const e=this.item,t=E(),s=this._imageFromConfig(t,String(e.item_id))??e.thumbnail??"",n=this._parseOptions(e.options),i=t.isWeeeEnabled?is(e,t.reviewItemPriceDisplayMode==="including"):[];return a`
            <div class="flex gap-3 py-2">
                ${s?a`<img src=${s}
                                alt=""
                                width="64"
                                height="64"
                                class="h-16 w-16 shrink-0 rounded-control border border-subtle object-cover bg-surface-raised"
                                loading=${this.eager?"eager":"lazy"}>`:a`<div class="h-16 w-16 shrink-0 rounded-control border border-subtle bg-surface-raised"></div>`}
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-brand line-clamp-2" title=${e.name}>${e.name}</p>
                    ${n.length>0?a`<ul class="text-xs text-muted space-y-0.5 mt-0.5">
                                ${n.map(o=>a`
                                    <li><span>${o.label}:</span> <span>${o.value}</span></li>
                                `)}
                            </ul>`:null}
                    ${i.length>0?a`<ul class="text-xs text-muted mt-0.5" data-hyperion-fpt>
                                ${i.map(o=>a`
                                    <li>${o.title}: ${O(o.rowAmount,U())}</li>
                                `)}
                            </ul>`:null}
                    <p class="text-xs text-muted mt-1">${l("Hyperion_Checkout::qty_label")} ${String(e.qty)}</p>
                </div>
                <div class="text-sm font-semibold text-brand whitespace-nowrap">
                    ${O(this._rowTotal(e,t),U())}
                </div>
            </div>
        `}_rowTotal(e,t){const s=Number(e.row_total),n=Number(e.row_total_incl_tax??e.row_total);return Zn(t.reviewItemPriceDisplayMode,s,n)}_parseOptions(e){if(!e)return[];let t;if(typeof e=="string")try{const s=JSON.parse(e);t=Array.isArray(s)?s:[]}catch{return[]}else t=e;return t.map(s=>({label:String(s.label??""),value:dn(String(s.value??""))}))}_imageFromConfig(e,t){const n=e.imageData;if(!n||typeof n!="object")return null;const i=n[t];if(!i||typeof i!="object")return null;const o=i.src;return typeof o=="string"?o:null}}Kt([h({type:Object})],Je.prototype,"item");Kt([h({type:Boolean})],Je.prototype,"eager");customElements.get("summary-item")||customElements.define("summary-item",Je);var as=Object.defineProperty,ls=Object.getOwnPropertyDescriptor,Jt=r=>{throw TypeError(r)},Qt=(r,e,t,s)=>{for(var n=ls(e,t),i=r.length-1,o;i>=0;i--)(o=r[i])&&(n=o(e,t,n)||n);return n&&as(e,t,n),n},Zt=(r,e,t)=>e.has(r)||Jt("Cannot "+t),yt=(r,e,t)=>(Zt(r,e,"read from private field"),t?t.call(r):e.get(r)),vt=(r,e,t)=>e.has(r)?Jt("Cannot add the same private member more than once"):e instanceof WeakSet?e.add(r):e.set(r,t),$t=(r,e,t,s)=>(Zt(r,e,"write to private field"),e.set(r,t),t),ue,he;const X="sales_rule_coupon_request";class Qe extends $(b){constructor(){super(...arguments),vt(this,ue,!1),vt(this,he,!1),this._apply=async()=>{const e=p();if(Er(e,X)&&Sr(e,X)===""){Le(X,l("Hyperion_Checkout::validation_required")),Ar(X);return}this._busy=!0;try{await x().applyCoupon(M.get().trim())&&(M.set(""),this._open=!1)}finally{this._busy=!1}},this._remove=async()=>{this._busy=!0;try{await x().removeCoupon()}finally{this._busy=!1}}}get _open(){return yt(this,ue)}set _open(e){$t(this,ue,e)}get _busy(){return yt(this,he)}set _busy(e){$t(this,he,e)}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),M.get().trim()!==""&&(this._open=!0)}render(){const e=p(),t=M.get(),s=e.appliedCoupon.get(),n=pe(X)===null?e.couponError.get():null;return s?a`
                <div class="rounded-md border border-accent/30 bg-accent/5 p-3">
                    <div class="flex items-center justify-between gap-3">
                        <div>
                            <p class="text-sm font-medium text-brand">
                                ${l("Hyperion_Checkout::coupon_applied")}
                            </p>
                            <p class="text-xs text-muted">
                                <code>${s}</code>
                            </p>
                        </div>
                        <hc-button variant="ghost"
                                   .label=${l("Hyperion_Checkout::coupon_remove")}
                                   .loading=${this._busy}
                                   @click=${this._remove}></hc-button>
                    </div>
                </div>
            `:this._open?a`
            <div class="space-y-2">
                <hc-text-input
                    label=${l("Hyperion_Checkout::coupon_code_label")}
                    name="coupon_code"
                    .value=${t}
                    .error=${n??""}
                    @value-change=${i=>{M.set(i.detail.value)}}
                ></hc-text-input>
                <hc-coupon-captcha></hc-coupon-captcha>
                <div class="flex gap-2">
                    <hc-button variant="primary"
                               .label=${l("Hyperion_Checkout::coupon_apply")}
                               .disabled=${t.trim().length===0}
                               .loading=${this._busy}
                               @click=${this._apply}></hc-button>
                    <hc-button variant="ghost"
                               .label=${l("Hyperion_Checkout::cancel")}
                               @click=${()=>{this._open=!1,M.set("")}}></hc-button>
                </div>
            </div>
        `:a`
                <button type="button"
                        class="text-sm font-medium text-accent hover:underline"
                        @click=${()=>{this._open=!0}}>
                    ${l("Hyperion_Checkout::coupon_have_code")}
                </button>
            `}}ue=new WeakMap;he=new WeakMap;Qt([A()],Qe.prototype,"_open");Qt([A()],Qe.prototype,"_busy");customElements.get("coupon-form")||customElements.define("coupon-form",Qe);var cs=Object.defineProperty,ds=(r,e,t,s)=>{for(var n=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(n=o(e,t,n)||n);return n&&cs(e,t,n),n};const us=3;class er extends $(b){constructor(){super(...arguments),this.collapsible=!1}createRenderRoot(){return this}render(){return this.collapsible?this._renderCollapsible():a`
            <div class="rounded-card border border-subtle bg-surface-raised">
                ${this._renderContent()}
            </div>
        `}_renderCollapsible(){const e=p(),t=e.items.get().reduce((n,i)=>n+(Number(i.qty)||0),0),s=Ke(e);return a`
            <details class="group rounded-card border border-subtle bg-surface-raised">
                <summary class="flex h-[3.375rem] cursor-pointer list-none items-center justify-between gap-3 rounded-card px-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden"
                         data-hyperion-summary-bar>
                    <span class="flex min-w-0 items-center gap-2 text-sm font-medium text-brand">
                        <svg class="h-4 w-4 shrink-0 group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                        <span class="truncate">${Pr("Hyperion_Checkout::summary_items",t)}</span>
                    </span>
                    <span class="shrink-0 text-base font-bold text-heading" data-hyperion-summary-bar-total>
                        ${s?.text??u}
                    </span>
                </summary>
                <div class="border-t border-subtle">
                    ${this._renderContent()}
                </div>
            </details>
        `}_renderContent(){const e=p().items.get(),t=E(),s=t.hyperion?.cartUrl||t.cartUrl;return a`
            <section aria-labelledby="hc-summary-heading" class="p-4 space-y-3">
                <div class="flex items-baseline justify-between gap-3">
                    <h2 id="hc-summary-heading" class="text-lg font-bold text-heading tracking-tight">
                        ${l("Hyperion_Checkout::summary_heading")}
                    </h2>
                    ${s?a`<a href=${s}
                                  class="shrink-0 text-sm font-medium text-accent hover:underline"
                                  data-hyperion-edit-cart>${l("Hyperion_Checkout::summary_edit_cart")}</a>`:u}
                </div>
                <div role="list" class="divide-y divide-subtle">
                    ${e.map((n,i)=>a`
                        <summary-item class="block" .item=${n} .eager=${i<us}></summary-item>
                    `)}
                </div>
                <div class="border-t border-subtle pt-3">
                    <summary-totals></summary-totals>
                </div>
                <coupon-form class="block"></coupon-form>
                <hc-section-status section="coupon"></hc-section-status>
            </section>
        `}}ds([h({type:Boolean,reflect:!0})],er.prototype,"collapsible");customElements.get("order-summary")||customElements.define("order-summary",er);var hs=Object.defineProperty,ps=(r,e,t,s)=>{for(var n=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(n=o(e,t,n)||n);return n&&hs(e,t,n),n};class tr extends $(b){constructor(){super(...arguments),this._selectors=Hr(),this._hint=null,this._onClick=async()=>{const e=p();if(e.orderOutcome.get()!=="none")return;const t=x(),s=await t.prepareOrder();if(s.status==="blocked"){await this._revealMissing(s.reason);return}const n=e.selectedPaymentMethod.get();if(!n){t.cancelOrder();return}const i=K(n);if(i?.beforePlaceOrder){e.globalError.set(null);try{const c=await i.beforePlaceOrder(),d=e.paymentMethodData.get();e.paymentMethodData.set({...d,[n]:c})}catch(c){t.cancelOrder(),e.globalError.set(c.message||l("Hyperion_Checkout::unexpected_error"));return}}if(i?.placeOrder){await this._placeThroughRenderer(i.placeOrder,i);return}if(await t.submitOrder()!==null){tt(Tr(E().defaultSuccessPageUrl));return}i?.afterPlaceOrderFailed?.()}}createRenderRoot(){return this}willUpdate(){if(this._hint===null)return;const e=p();e.orderOutcome.get()!=="none"||e.sessionExpired.get()||e.quoteGone.get()||this._selectors.canPlaceOrder.get()?this._hint=null:this._hint===Rr()&&(this._hint=Or(e,this._selectors))}render(){D.get();const e=p(),t=e.selectedPaymentMethod.get();if(t&&K(t)?.ownsPlaceOrder?.())return u;const s=this._selectors.canPlaceOrder.get(),n=e.isPlacingOrder.get()||e.orderOutcome.get()==="placing",i=Ke(e);let o=l("Hyperion_Checkout::place_order");return n?o=l("Hyperion_Checkout::placing_order"):i!==null&&i.settled&&(o=l("Hyperion_Checkout::place_order_amount",{total:i.text})),a`
            <hc-button variant="primary"
                       class="block"
                       data-hyperion-place-order
                       .label=${o}
                       .softDisabled=${!s}
                       .loading=${n}
                       @click=${this._onClick}></hc-button>
            ${this._hint!==null?a`<p class="mt-2 text-sm text-danger"
                          role="status"
                          tabindex="-1"
                          data-place-order-hint>${this._hint}</p>`:u}
        `}async _revealMissing(e){if(e==="busy"||e==="write-failed"||e==="outcome-unknown")return;const t=p();if(!this._selectors.emailValid.get()){const o=re(t.email.get());o&&t.fieldErrors.set({...t.fieldErrors.get(),email:l(o)})}if(un(),this._hint=Fr(t,e),e==="updating")return;await this.updateComplete,await new Promise(o=>setTimeout(o,0)),((this.closest("checkout-app")??document).querySelector('[aria-invalid="true"]')??this.querySelector("[data-place-order-hint]"))?.focus()}async _placeThroughRenderer(e,t){const s=p();let n=null;try{const i=await e();n=i===null?null:xt(i),i!==null&&n===null&&s.globalError.set(l("Hyperion_Checkout::unexpected_error"))}catch(i){s.globalError.set(i.message||l("Hyperion_Checkout::unexpected_error"))}if(n!==null){tt(n);return}x().cancelOrder(),t.afterPlaceOrderFailed?.()}}ps([A()],tr.prototype,"_hint");customElements.get("place-order-button")||customElements.define("place-order-button",tr);function _s(){const r=W()?.hyperion;if(r?.loginUrl)return r.loginUrl;const e=r?.baseUrl??"/";return`${e.endsWith("/")?e:`${e}/`}customer/account/login/`}class ms extends $(b){constructor(){super(...arguments),this._keepOpen=e=>{e.preventDefault()}}createRenderRoot(){return this}render(){const e=p();return e.sessionExpired.get()?a`
            <dialog class="w-full max-w-md rounded-md border border-subtle bg-surface p-0 text-brand shadow-lg backdrop:bg-black/40"
                    aria-labelledby="hc-session-expired-message"
                    data-session-expired
                    @cancel=${this._keepOpen}>
                <div class="p-4 space-y-3">
                    <p id="hc-session-expired-message" class="text-sm">
                        ${l("Hyperion_Checkout::error_session_expired")}
                    </p>
                    ${e.orderOutcome.get()==="unknown"?a`<p class="text-sm text-danger" data-session-expired-order>
                                   ${l("Hyperion_Checkout::order_outcome_unknown")}
                               </p>`:u}
                    <a href=${_s()}
                       data-session-expired-login
                       class="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent/90">
                        ${l("Hyperion_Checkout::sign_in_again")}
                    </a>
                </div>
            </dialog>
        `:u}updated(){const e=this.querySelector("dialog[data-session-expired]");!e||e.open||(typeof e.showModal=="function"?e.showModal():e.setAttribute("open",""))}}customElements.get("hc-session-expired")||customElements.define("hc-session-expired",ms);const gs=400,fs="HC-SESSION-EXPIRED";class bs extends $(b){constructor(){super(...arguments),this._slow=!1,this._slowTimer=null,this._shown=!1,this._inerted=new Set,this._focusBefore=null}createRenderRoot(){return this}disconnectedCallback(){super.disconnectedCallback(),this._stopSlowTimer(),this._release(),this._shown=!1}_visible(){const e=p(),t=e.orderOutcome.get(),s=e.orderStep.get();return t==="placed"||s==="submitting"||s==="confirming"?!0:s==="preparing"?this._slow:e.isPlacingOrder.get()&&t==="none"}_text(){const e=p(),t=e.orderNumber.get();return e.orderOutcome.get()==="placed"&&t!==null?l("Hyperion_Checkout::order_received_number",{number:t}):e.orderStep.get()==="confirming"?l("Hyperion_Checkout::order_confirming"):l("Hyperion_Checkout::placing_order")}render(){return this._visible()?a`
            <div role="status"
                 data-loading-overlay
                 class="fixed inset-0 z-50 bg-brand/60 flex items-center justify-center">
                <div class="bg-surface rounded-md p-6 shadow-lg max-w-sm text-center space-y-3">
                    <span class="inline-block w-10 h-10 rounded-full border-4 border-accent border-t-transparent animate-spin"
                          aria-hidden="true"></span>
                    <p class="text-sm font-medium text-brand">${this._text()}</p>
                </div>
            </div>
        `:u}updated(){const e=p().orderStep.get()==="preparing";e&&!this._slow&&this._slowTimer===null?this._slowTimer=setTimeout(()=>{this._slowTimer=null,this._slow=!0,this.requestUpdate()},gs):!e&&(this._slow||this._slowTimer!==null)&&(this._stopSlowTimer(),this._slow=!1);const t=this._visible();t!==this._shown&&(this._shown=t,t?this._cover():this._release())}_stopSlowTimer(){this._slowTimer!==null&&clearTimeout(this._slowTimer),this._slowTimer=null}_cover(){const e=document.activeElement;this._focusBefore=e instanceof HTMLElement&&e!==document.body?e:null;const t=this.closest("checkout-app");let s=this;for(;s.parentElement!==null;){const n=s.parentElement;for(const i of Array.from(n.children))i===s||i.tagName===fs||i.hasAttribute("inert")||(i.setAttribute("inert",""),this._inerted.add(i));if(t===null||n===t)break;s=n}}_release(){for(const t of this._inerted)t.removeAttribute("inert");this._inerted.clear();const e=this._focusBefore;this._focusBefore=null,e!==null&&e.isConnected&&(document.activeElement===null||document.activeElement===document.body)&&e.focus({preventScroll:!0})}}customElements.get("loading-overlay")||customElements.define("loading-overlay",bs);class ys extends $(b){createRenderRoot(){return this}render(){const e=p(),t=e.globalError.get(),s=e.minimumOrderError.get();return!t&&!s?u:a`
            <div role="alert"
                 data-error-banner
                 class="rounded-md border border-danger/40 bg-danger/5 p-3 flex items-start gap-3">
                <p class="flex-1 text-sm text-danger">${t??s??""}</p>
                ${t?a`<button type="button"
                                   class="text-xs text-danger hover:underline"
                                   @click=${()=>e.globalError.set(null)}>
                              ${l("Hyperion_Checkout::dismiss")}
                          </button>`:u}
            </div>
        `}}customElements.get("error-banner")||customElements.define("error-banner",ys);const vs="(min-width: 1024px)",He="rounded-card border border-subtle bg-surface p-4 space-y-3",Te="text-lg font-bold text-heading tracking-tight";class rr extends $(b){constructor(){super(...arguments),this._wideLayout=null,this._onLayoutChange=()=>{this.requestUpdate()},this._onLoginRequest=async()=>{const{inlineLogin:e}=await H(async()=>{const{inlineLogin:t}=await import("./login-action-Csd9fjNu.js");return{inlineLogin:t}},__vite__mapDeps([13,1,2]),import.meta.url);await e()}}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),typeof window.matchMedia=="function"&&(this._wideLayout=window.matchMedia(vs),this._wideLayout.addEventListener("change",this._onLayoutChange))}disconnectedCallback(){this._wideLayout?.removeEventListener("change",this._onLayoutChange),this._wideLayout=null,super.disconnectedCallback()}render(){const e=p(),t=e.isVirtual.get(),s=e.customer.get()!==null,n=this._wideLayout?.matches??!1,i=Ke(e);return a`
            <div class="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 p-4">
                ${n?u:a`<order-summary class="block min-w-0" collapsible></order-summary>`}
                <div class="space-y-6 min-w-0" data-hyperion-checkout-sections>
                    <h1 class="text-3xl font-bold text-heading tracking-tight">
                        ${l("Hyperion_Checkout::checkout_heading")}
                    </h1>
                    <error-banner></error-banner>
                    <section aria-labelledby="hc-email-heading" class=${He}>
                        <h2 id="hc-email-heading" class=${Te}>
                            ${s?l("Hyperion_Checkout::signed_in_as"):l("Hyperion_Checkout::contact_heading")}
                        </h2>
                        ${s?a`<p class="text-sm text-muted">${e.email.get()}</p>`:a`<checkout-email class="block" @login-request=${this._onLoginRequest}></checkout-email>`}
                    </section>
                    ${t?null:a`
                              <section aria-labelledby="hc-shipping-heading" class=${He}>
                                  <h2 id="hc-shipping-heading" class=${Te}>
                                      ${l("Hyperion_Checkout::shipping_heading")}
                                  </h2>
                                  <checkout-shipping class="block"></checkout-shipping>
                              </section>
                          `}
                    <checkout-gift-message></checkout-gift-message>
                    <section aria-labelledby="hc-payment-heading" class=${He}>
                        <h2 id="hc-payment-heading" class=${Te}>
                            ${l("Hyperion_Checkout::payment_heading")}
                        </h2>
                        <checkout-payment class="block"></checkout-payment>
                        <checkout-agreements></checkout-agreements>
                        <hc-recaptcha-badge></hc-recaptcha-badge>
                        <hc-order-captcha></hc-order-captcha>
                        <hc-section-status section="order"></hc-section-status>
                        <div class="sticky bottom-0 z-10 -mx-4 -mb-4 space-y-3 rounded-b-card border-t border-subtle bg-surface px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:static lg:z-auto lg:mx-0 lg:mb-0 lg:rounded-none lg:px-0 lg:pb-0"
                             data-hyperion-place-order-bar>
                            ${n?u:a`
                                      <p class="flex h-6 items-center justify-between gap-3 text-base font-bold text-heading"
                                         aria-hidden="true"
                                         data-hyperion-place-order-total>
                                          <span>${i?.label??u}</span>
                                          <span>${i?.text??u}</span>
                                      </p>
                                  `}
                            <place-order-button class="block"></place-order-button>
                        </div>
                    </section>
                </div>
                ${n?a`
                          <aside class="min-w-0 self-start" data-hyperion-summary-rail>
                              <order-summary class="block"></order-summary>
                          </aside>
                      `:u}
            </div>
            <loading-overlay></loading-overlay>
        `}}customElements.get("checkout-app")||customElements.define("checkout-app",rr);const ws=Object.freeze(Object.defineProperty({__proto__:null,CheckoutApp:rr},Symbol.toStringTag,{value:"Module"}));export{ks as a,un as b,ws as c,Me as e,Bn as f,dn as h,De as i,h as n,R as o,A as r,Ie as s,Ct as t,V as v};
//# sourceMappingURL=checkout-app-B6LQaPKQ.js.map
