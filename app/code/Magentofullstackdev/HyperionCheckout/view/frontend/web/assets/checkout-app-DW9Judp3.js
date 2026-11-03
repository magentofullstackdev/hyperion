const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./payment-braintree-card-CT0Ts2JN.js","./checkout-BMmec92X.js","./checkout-DQp9z3_9.css","./quote-DArtz96u.js","./three-d-secure-BF-vPgPN.js","./payment-braintree-paypal-BYvY0AYd.js","./payment-braintree-vault-CA0Pehp4.js","./payment-paypal-express-CVSmzpGN.js","./login-action-pKt2nIsC.js"])))=>i.map(i=>d[i]);
import{S as H,f as ht,u as pt,s as _t,a as be,i as _,b as l,A as p,g as u,t as a,E as mt,c as f,d as gt,r as ft,p as bt,e as vt,h as yt,j as $t,k as te,l as y,m as q,n as qe,_ as P,o as Ae,q as xt,M as kt,v as wt}from"./checkout-BMmec92X.js";/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Ct=Symbol("SignalWatcherBrand"),St=new FinalizationRegistry((({watcher:r,signal:e})=>{r.unwatch(e)})),Pe=new WeakMap;function m(r){return r[Ct]===!0?(console.warn("SignalWatcher should not be applied to the same class more than once."),r):class extends r{constructor(){super(...arguments),this._$St=new H.State(0),this._$Si=!1,this._$So=!0,this._$Sh=new Set}_$Sl(){if(this._$Su!==void 0)return;this._$Sv=new H.Computed((()=>{this._$St.get(),super.performUpdate()}));const e=this._$Su=new H.subtle.Watcher((function(){const t=Pe.get(this);t!==void 0&&(t._$Si===!1&&t.requestUpdate(),this.watch())}));Pe.set(e,this),St.register(this,{watcher:e,signal:this._$Sv}),e.watch(this._$Sv)}_$Sp(){this._$Su!==void 0&&(this._$Su.unwatch(this._$Sv),this._$Sv=void 0,this._$Su=void 0)}performUpdate(){this.isUpdatePending&&(this._$Sl(),this._$Si=!0,this._$St.set(this._$St.get()+1),this._$Si=!1,this._$Sv.get())}update(e){try{this._$So?(this._$So=!1,super.update(e)):this._$Sh.forEach((t=>t.commit()))}finally{this.isUpdatePending=!1,this._$Sh.clear()}}requestUpdate(e,t,n){this._$So=!0,super.requestUpdate(e,t,n)}connectedCallback(){super.connectedCallback(),this.requestUpdate()}disconnectedCallback(){super.disconnectedCallback(),queueMicrotask((()=>{this.isConnected===!1&&this._$Sp()}))}_(e){this._$Sh.add(e);const t=this._$So;this.requestUpdate(),this._$So=t}m(e){this._$Sh.delete(e)}}}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Et={CHILD:2},Be=r=>(...e)=>({_$litDirective$:r,values:e});let Ne=class{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,t,n){this._$Ct=e,this._$AM=t,this._$Ci=n}_$AS(e,t){return this.update(e,t)}update(e,t){return this.render(...t)}};/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const At={},Pt=(r,e=At)=>r._$AH=e;/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */H.State;H.Computed;/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Ht={attribute:!0,type:String,converter:pt,reflect:!1,hasChanged:ht},Rt=(r=Ht,e,t)=>{const{kind:n,metadata:s}=t;let o=globalThis.litPropertyMetadata.get(s);if(o===void 0&&globalThis.litPropertyMetadata.set(s,o=new Map),n==="setter"&&((r=Object.create(r)).wrapped=!0),o.set(t.name,r),n==="accessor"){const{name:i}=t;return{set(c){const h=e.get.call(this);e.set.call(this,c),this.requestUpdate(i,h,r,!0,c)},init(c){return c!==void 0&&this.C(i,void 0,r,c),c}}}if(n==="setter"){const{name:i}=t;return function(c){const h=this[i];e.call(this,c),this.requestUpdate(i,h,r,!0,c)}}throw Error("Unsupported decorator location: "+n)};function d(r){return(e,t)=>typeof t=="object"?Rt(r,e,t):((n,s,o)=>{const i=s.hasOwnProperty(o);return s.constructor.createProperty(o,n),i?Object.getOwnPropertyDescriptor(s,o):void 0})(r,e,t)}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */function b(r){return d({...r,state:!0,attribute:!1})}function Ot(r){return be("customers/isEmailAvailable",{method:"POST",body:r,auth:"none"})}const Mt="user_login";function Zr(r,e){const t={captcha_form_id:Mt,...r};return _t("customer/ajax/login",e?{...t,"g-recaptcha-response":e}:t,e?{"g-recaptcha-response":e}:void 0)}function ve(r,e){let t=null;return(...n)=>{t!==null&&clearTimeout(t),t=setTimeout(()=>{t=null,r(...n)},e)}}const j=r=>r?/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r)?null:"Hyperion_Checkout::validation_email":"Hyperion_Checkout::validation_required";var Tt=Object.defineProperty,k=(r,e,t,n)=>{for(var s=void 0,o=r.length-1,i;o>=0;o--)(i=r[o])&&(s=i(e,t,s)||s);return s&&Tt(e,t,s),s};class $ extends _{constructor(){super(...arguments),this.label="",this.name="",this.value="",this.type="text",this.placeholder="",this.autocomplete="",this.required=!1,this.error="",this.warning="",this.inputmode=""}createRenderRoot(){return this}render(){const e=`hc-input-${this.name||Math.random().toString(36).slice(2)}`,t=[this.error?`${e}-err`:"",this.warning?`${e}-warn`:""].filter(Boolean).join(" ");return l`
            <label for=${e} class="block text-sm font-medium text-brand">
                ${this.label}
                ${this.required?l`<span aria-hidden="true" class="text-danger">*</span>`:null}
            </label>
            <input
                id=${e}
                name=${this.name}
                type=${this.type}
                class="mt-1 block w-full rounded-md border ${this.error?"border-danger":"border-subtle"} bg-surface px-3 py-2 text-brand placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
                .value=${this.value}
                placeholder=${this.placeholder}
                autocomplete=${this.autocomplete}
                inputmode=${this.inputmode||""}
                ?required=${this.required}
                aria-required=${this.required?"true":"false"}
                aria-invalid=${this.error?"true":"false"}
                aria-describedby=${t}
                @input=${this._onInput}
                @blur=${this._onBlur}
            />
            ${this.error?l`<p id="${e}-err" class="mt-1 text-sm text-danger">${this.error}</p>`:null}
            ${this.warning?l`<p id="${e}-warn" class="mt-1 text-sm text-warning-strong">${this.warning}</p>`:null}
        `}_onInput(e){const t=e.target;this.value=t.value,this.dispatchEvent(new CustomEvent("value-change",{detail:{value:t.value,name:this.name},bubbles:!0,composed:!0}))}_onBlur(){this.dispatchEvent(new CustomEvent("value-blur",{detail:{value:this.value,name:this.name},bubbles:!0,composed:!0}))}}k([d({type:String})],$.prototype,"label");k([d({type:String})],$.prototype,"name");k([d({type:String})],$.prototype,"value");k([d({type:String})],$.prototype,"type");k([d({type:String})],$.prototype,"placeholder");k([d({type:String})],$.prototype,"autocomplete");k([d({type:Boolean,reflect:!0})],$.prototype,"required");k([d({type:String})],$.prototype,"error");k([d({type:String})],$.prototype,"warning");k([d({type:String})],$.prototype,"inputmode");customElements.get("hc-text-input")||customElements.define("hc-text-input",$);var Ft=Object.defineProperty,F=(r,e,t,n)=>{for(var s=void 0,o=r.length-1,i;o>=0;o--)(i=r[o])&&(s=i(e,t,s)||s);return s&&Ft(e,t,s),s};class O extends _{constructor(){super(...arguments),this.variant="primary",this.disabled=!1,this.softDisabled=!1,this.loading=!1,this.type="button",this.label=""}createRenderRoot(){return this}render(){const e="inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:cursor-not-allowed",t={primary:"bg-accent text-on-accent hover:bg-accent/90",secondary:"bg-surface-raised text-brand border border-subtle hover:bg-subtle",ghost:"bg-transparent text-accent hover:underline"};return l`
            <button
                type=${this.type}
                ?disabled=${this.disabled||this.loading}
                aria-disabled=${this.softDisabled&&!this.disabled&&!this.loading?"true":p}
                class="${e} ${t[this.variant]}"
                @click=${this._onClick}
            >
                ${this.loading?l`<span class="inline-block w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"></span>`:null}
                ${this.label}
            </button>
        `}_onClick(e){(this.disabled||this.loading)&&(e.preventDefault(),e.stopPropagation())}}F([d({type:String})],O.prototype,"variant");F([d({type:Boolean})],O.prototype,"disabled");F([d({type:Boolean})],O.prototype,"softDisabled");F([d({type:Boolean})],O.prototype,"loading");F([d({type:String})],O.prototype,"type");F([d({type:String})],O.prototype,"label");customElements.get("hc-button")||customElements.define("hc-button",O);var qt=Object.defineProperty,Bt=Object.getOwnPropertyDescriptor,Ie=r=>{throw TypeError(r)},Nt=(r,e,t,n)=>{for(var s=Bt(e,t),o=r.length-1,i;o>=0;o--)(i=r[o])&&(s=i(e,t,s)||s);return s&&qt(e,t,s),s},De=(r,e,t)=>e.has(r)||Ie("Cannot "+t),It=(r,e,t)=>(De(r,e,"read from private field"),t?t.call(r):e.get(r)),Dt=(r,e,t)=>e.has(r)?Ie("Cannot add the same private member more than once"):e instanceof WeakSet?e.add(r):e.set(r,t),Lt=(r,e,t,n)=>(De(r,e,"write to private field"),e.set(r,t),t),V;class Le extends m(_){constructor(){super(...arguments),Dt(this,V,!1),this._checkAvailability=ve(e=>{if(j(e)!==null){this._checking=!1;return}this._checking=!0,Ot({customerEmail:e}).then(t=>{u().emailExists.set(!t)}).catch(()=>{}).finally(()=>{this._checking=!1})},500)}get _checking(){return It(this,V)}set _checking(e){Lt(this,V,e)}createRenderRoot(){return this}render(){const e=u(),t=e.email.get(),n=e.emailExists.get(),s=e.loginError.get(),i=e.fieldErrors.get().email??"";return l`
            <div class="space-y-3">
                <hc-text-input
                    label=${a("Hyperion_Checkout::email_label")}
                    name="email"
                    type="email"
                    autocomplete="email"
                    inputmode="email"
                    .value=${t}
                    .required=${!0}
                    .error=${i}
                    placeholder="you@example.com"
                    @value-change=${this._onEmailInput}
                    @value-blur=${this._onEmailBlur}
                ></hc-text-input>
                ${this._checking?l`<p class="text-xs text-muted">${a("Hyperion_Checkout::checking_email")}</p>`:null}
                ${n===!0?this._renderPasswordBlock(s):null}
            </div>
        `}_renderPasswordBlock(e){const t=u();return l`
            <div class="rounded-md border border-subtle bg-surface-raised p-3 space-y-2"
                 role="region"
                 aria-label=${a("Hyperion_Checkout::login_aria_label")}>
                <p class="text-sm text-brand">
                    ${a("Hyperion_Checkout::email_existing_account")}
                </p>
                <hc-text-input
                    label=${a("Hyperion_Checkout::password_label")}
                    name="password"
                    type="password"
                    autocomplete="current-password"
                    .value=${t.password.get()}
                    .required=${!0}
                    .error=${e??""}
                    @value-change=${this._onPasswordInput}
                ></hc-text-input>
                <div class="flex gap-2">
                    <hc-button variant="primary"
                               .label=${a("Hyperion_Checkout::login_button")}
                               @click=${this._onLoginClick}></hc-button>
                    <hc-button variant="ghost"
                               .label=${a("Hyperion_Checkout::continue_as_guest")}
                               @click=${this._onContinueAsGuestClick}></hc-button>
                </div>
            </div>
        `}_onEmailInput(e){const t=u();t.email.set(e.detail.value);const n=j(e.detail.value),s={...t.fieldErrors.get()};n?s.email=a(n):delete s.email,t.fieldErrors.set(s),this._checkAvailability(e.detail.value)}_onEmailBlur(e){const t=u(),n=j(e.detail.value);if(n){const s={...t.fieldErrors.get()};s.email=a(n),t.fieldErrors.set(s)}}_onPasswordInput(e){const t=u();t.password.set(e.detail.value),t.loginError.get()&&t.loginError.set(null)}_onLoginClick(){this.dispatchEvent(new CustomEvent("login-request",{bubbles:!0,composed:!0}))}_onContinueAsGuestClick(){const e=u();e.emailExists.set(!1),e.password.set(""),e.loginError.set(null)}}V=new WeakMap;Nt([b()],Le.prototype,"_checking");customElements.get("checkout-email")||customElements.define("checkout-email",Le);/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */class ge extends Ne{constructor(e){if(super(e),this.it=p,e.type!==Et.CHILD)throw Error(this.constructor.directiveName+"() can only be used in child bindings")}render(e){if(e===p||e==null)return this._t=void 0,this.it=e;if(e===mt)return e;if(typeof e!="string")throw Error(this.constructor.directiveName+"() called with a non-string value");if(e===this.it)return this._t;this.it=e;const t=[e];return t.raw=t,this._t={_$litType$:this.constructor.resultType,strings:t,values:[]}}}ge.directiveName="unsafeHTML",ge.resultType=1;const jt=Be(ge),Vt=["p","br","strong","em","b","i","u","ul","ol","li","a","span","div","h1","h2","h3","h4","h5","h6"],Ut=["href","title","rel","target"],Wt=["http:","https:","mailto:","tel:"],je=new Set(["script","style","template","noscript","iframe","object","embed","svg","math","textarea","title","head"]);function Ve(r){const e=new DOMParser().parseFromString(`<div>${r}</div>`,"text/html");return{doc:e,root:e.body.firstElementChild}}function Gt(r,e){try{return e.has(new URL(r,window.location.origin).protocol)}catch{return!1}}function zt(r,e,t){for(const i of Array.from(r.attributes)){const c=i.name.toLowerCase();t.linkAttributes.has(c)&&e.setAttribute(c,i.value)}const n=e.getAttribute("href")??"";n&&!Gt(n.trim(),t.linkProtocols)&&e.removeAttribute("href");const s=e.getAttribute("target");s!==null&&s!=="_blank"&&e.removeAttribute("target");const o=e.getAttribute("href")??"";(/^https?:/i.test(o)||e.getAttribute("target")==="_blank")&&e.setAttribute("rel","noopener noreferrer")}function fe(r,e,t,n){e.childNodes.forEach(s=>{if(s.nodeType===3){t.appendChild(r.createTextNode(s.textContent??""));return}if(s.nodeType!==1)return;const o=s,i=o.tagName.toLowerCase();if(je.has(i))return;if(!n.tags.has(i)){fe(r,o,t,n);return}const c=r.createElement(i);i==="a"&&zt(o,c,n),fe(r,o,c,n),t.appendChild(c)})}function Xt(r,e={}){const{doc:t,root:n}=Ve(String(r??""));if(!n)return"";const s=t.createElement("div");return fe(t,n,s,{tags:new Set(e.tags??Vt),linkAttributes:new Set(e.linkAttributes??Ut),linkProtocols:new Set(e.linkProtocols??Wt)}),s.innerHTML}function Jt(r){const{doc:e,root:t}=Ve(String(r??""));return t?(t.querySelectorAll(Array.from(je).join(",")).forEach(n=>n.remove()),t.querySelectorAll("br").forEach(n=>n.replaceWith(e.createTextNode(", "))),(t.textContent??"").replace(/\s+/g," ").replace(/ ,/g,",").trim()):""}function ye(r){return Xt(r)}const re=new H.State(0);function Kt(){re.set(re.get()+1)}var Qt=Object.defineProperty,M=(r,e,t,n)=>{for(var s=void 0,o=r.length-1,i;o>=0;o--)(i=r[o])&&(s=i(e,t,s)||s);return s&&Qt(e,t,s),s};class S extends _{constructor(){super(...arguments),this.label="",this.name="",this.value="",this.options=[],this.required=!1,this.error="",this.placeholder=""}createRenderRoot(){return this}render(){const e=`hc-select-${this.name||Math.random().toString(36).slice(2)}`;return l`
            <label for=${e} class="block text-sm font-medium text-brand">
                ${this.label}
                ${this.required?l`<span aria-hidden="true" class="text-danger">*</span>`:null}
            </label>
            <select
                id=${e}
                name=${this.name}
                class="mt-1 block w-full rounded-md border ${this.error?"border-danger":"border-subtle"} bg-surface px-3 py-2 text-brand focus:outline-none focus:ring-2 focus:ring-accent"
                .value=${this.value}
                ?required=${this.required}
                aria-required=${this.required?"true":"false"}
                aria-invalid=${this.error?"true":"false"}
                @change=${this._onChange}
            >
                ${this.placeholder?l`<option value="" ?selected=${!this.value}>${this.placeholder}</option>`:null}
                ${this.options.map(t=>l`
                    <option value=${t.value} ?selected=${t.value===this.value}>
                        ${t.label}
                    </option>
                `)}
            </select>
            ${this.error?l`<p class="mt-1 text-sm text-danger">${this.error}</p>`:null}
        `}_onChange(e){const t=e.target;this.value=t.value,this.dispatchEvent(new CustomEvent("value-change",{detail:{value:t.value,name:this.name},bubbles:!0,composed:!0}))}}M([d({type:String})],S.prototype,"label");M([d({type:String})],S.prototype,"name");M([d({type:String})],S.prototype,"value");M([d({type:Array})],S.prototype,"options");M([d({type:Boolean,reflect:!0})],S.prototype,"required");M([d({type:String})],S.prototype,"error");M([d({type:String})],S.prototype,"placeholder");customElements.get("hc-select-input")||customElements.define("hc-select-input",S);var Zt=Object.defineProperty,$e=(r,e,t,n)=>{for(var s=void 0,o=r.length-1,i;o>=0;o--)(i=r[o])&&(s=i(e,t,s)||s);return s&&Zt(e,t,s),s};class ne extends _{constructor(){super(...arguments),this.label="",this.name="",this.checked=!1}createRenderRoot(){return this}render(){const e=`hc-cb-${this.name||Math.random().toString(36).slice(2)}`;return l`
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
        `}_onChange(e){const t=e.target;this.checked=t.checked,this.dispatchEvent(new CustomEvent("value-change",{detail:{checked:t.checked,name:this.name},bubbles:!0,composed:!0}))}}$e([d({type:String})],ne.prototype,"label");$e([d({type:String})],ne.prototype,"name");$e([d({type:Boolean})],ne.prototype,"checked");customElements.get("hc-checkbox")||customElements.define("hc-checkbox",ne);var Yt=Object.defineProperty,er=Object.getOwnPropertyDescriptor,Ue=r=>{throw TypeError(r)},T=(r,e,t,n)=>{for(var s=n>1?void 0:n?er(e,t):e,o=r.length-1,i;o>=0;o--)(i=r[o])&&(s=(n?i(e,t,s):i(s))||s);return n&&s&&Yt(e,t,s),s},We=(r,e,t)=>e.has(r)||Ue("Cannot "+t),le=(r,e,t)=>(We(r,e,"read from private field"),t?t.call(r):e.get(r)),ce=(r,e,t)=>e.has(r)?Ue("Cannot add the same private member more than once"):e instanceof WeakSet?e.add(r):e.set(r,t),de=(r,e,t,n)=>(We(r,e,"write to private field"),e.set(r,t),t),U,W,G;const ue=yt;function tr(){const r=f(),e=r.directoryData??r.countryData;if(!e||typeof e!="object")return[];const t=[];for(const[n,s]of Object.entries(e)){if(!s||typeof s!="object")continue;const o=s,i=typeof o.name=="string"?o.name:n;t.push({id:n,name:i,is_region_required:o.is_region_required===!0,is_region_visible:o.is_region_visible!==!1})}return t.sort((n,s)=>n.name.localeCompare(s.name)),t}function He(r){const t=f().directoryData;if(!t||typeof t!="object")return[];const n=t[r];if(!n||typeof n!="object")return[];const s=n,o=s.regions&&typeof s.regions=="object"?s.regions:s,i=[];for(const[c,h]of Object.entries(o)){if(!h||typeof h!="object")continue;const g=h,x=typeof g.name=="string"?g.name:null,A=typeof g.code=="string"?g.code:"";x&&i.push({id:c,code:A,name:x})}return i}class E extends m(_){constructor(){super(...arguments),this.mode="shipping",this.value=null,this.showSaveInAddressBook=!1,this.serverErrors={},ce(this,U,{}),ce(this,W,{}),ce(this,G,!1),this._validationBaseline=0}get _local(){return le(this,U)}set _local(e){de(this,U,e)}get _touched(){return le(this,W)}set _touched(e){de(this,W,e)}get _revealAll(){return le(this,G)}set _revealAll(e){de(this,G,e)}createRenderRoot(){return this}willUpdate(e){e.has("value")&&this.value&&(this._local={...this.value}),(e.has("value")||e.has("showSaveInAddressBook"))&&this._initSaveInAddressBook(),!this._revealAll&&re.get()>this._validationBaseline&&(this._revealAll=!0)}connectedCallback(){super.connectedCallback(),this._validationBaseline=re.get(),this.value&&Object.keys(this._local).length===0&&(this._local={...this.value});let e=!1;if(!this._local.country_id){const t=f().defaultCountryId;this._local={...this._local,country_id:t},e=!0}this._initSaveInAddressBook()&&(e=!0),e&&this._emit()}_initSaveInAddressBook(){if(typeof this._local.save_in_address_book=="boolean")return!1;const e=this._local.id!=null&&this._local.id!=="";return this._local={...this._local,save_in_address_book:this.showSaveInAddressBook&&!e},!0}render(){const e=ue(),t=tr(),n=this._local.country_id??"",s=n?He(n):[],o=t.find(v=>v.id===n),i=gt(n,e),c=s.length>0,h=o?.is_region_required===!0||c,g=o?.is_region_visible!==!1,x=this._local.street??[],A=[];for(let v=0;v<e.streetLines;v++)A.push(x[v]??"");const w=ft();return l`
            <div class="space-y-3">
                ${this._renderNameField("prefix",w.prefix,"honorific-prefix")}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <hc-text-input
                        label=${a("Hyperion_Checkout::firstname_label")}
                        name="firstname"
                        autocomplete="given-name"
                        .value=${this._local.firstname??""}
                        .required=${!0}
                        .error=${this._errorFor("firstname",!0)}
                        @value-change=${this._onFieldChange}
                        @value-blur=${this._onBlur}
                    ></hc-text-input>
                    <hc-text-input
                        label=${a("Hyperion_Checkout::lastname_label")}
                        name="lastname"
                        autocomplete="family-name"
                        .value=${this._local.lastname??""}
                        .required=${!0}
                        .error=${this._errorFor("lastname",!0)}
                        @value-change=${this._onFieldChange}
                        @value-blur=${this._onBlur}
                    ></hc-text-input>
                </div>
                ${this._renderNameField("middlename",w.middlename,"additional-name")}
                ${this._renderNameField("suffix",w.suffix,"honorific-suffix")}

                ${e.showCompany!=="no"?l`
                          <hc-text-input
                              label=${a("Hyperion_Checkout::company_label")}
                              name="company"
                              autocomplete="organization"
                              .value=${this._local.company??""}
                              .required=${e.showCompany==="req"}
                              .error=${this._errorFor("company",e.showCompany==="req")}
                              @value-change=${this._onFieldChange}
                              @value-blur=${this._onBlur}
                          ></hc-text-input>
                      `:p}

                ${A.map((v,C)=>l`
                        <hc-text-input
                            label=${C===0?a("Hyperion_Checkout::street_label_primary"):a("Hyperion_Checkout::street_label_additional",{n:String(C+1)})}
                            name=${`street_${C}`}
                            autocomplete=${C===0?"address-line1":`address-line${C+1}`}
                            .value=${v}
                            .required=${C===0}
                            .error=${C===0?this._errorFor("street"):""}
                            @value-change=${this._onStreetChange}
                            @value-blur=${this._onBlur}
                            data-index=${C}
                        ></hc-text-input>
                    `)}

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <hc-text-input
                        label=${a("Hyperion_Checkout::city_label")}
                        name="city"
                        autocomplete="address-level2"
                        .value=${this._local.city??""}
                        .required=${!0}
                        .error=${this._errorFor("city",!0)}
                        @value-change=${this._onFieldChange}
                        @value-blur=${this._onBlur}
                    ></hc-text-input>
                    ${g?c?l`
                                  <hc-select-input
                                      label=${a("Hyperion_Checkout::region_label")}
                                      name="region_id"
                                      placeholder=${a("Hyperion_Checkout::region_placeholder")}
                                      .options=${s.map(v=>({value:v.id,label:v.name}))}
                                      .value=${this._local.region_id??""}
                                      .required=${h}
                                      .error=${this._errorFor("region_id",h)}
                                      @value-change=${this._onRegionSelectChange}
                                  ></hc-select-input>
                              `:l`
                                  <hc-text-input
                                      label=${a("Hyperion_Checkout::region_label")}
                                      name="region"
                                      autocomplete="address-level1"
                                      .value=${this._local.region??""}
                                      .required=${h}
                                      .error=${this._errorFor("region",h)}
                                      @value-change=${this._onFieldChange}
                                      @value-blur=${this._onBlur}
                                  ></hc-text-input>
                              `:p}
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <hc-text-input
                        label=${a("Hyperion_Checkout::postcode_label")}
                        name="postcode"
                        autocomplete="postal-code"
                        .value=${this._local.postcode??""}
                        .required=${i}
                        .error=${this._errorFor("postcode",i)}
                        .warning=${this._warningFor("postcode")}
                        @value-change=${this._onFieldChange}
                        @value-blur=${this._onBlur}
                    ></hc-text-input>
                    <hc-select-input
                        label=${a("Hyperion_Checkout::country_label")}
                        name="country_id"
                        .options=${t.map(v=>({value:v.id,label:v.name}))}
                        .value=${n}
                        .required=${!0}
                        .error=${this._errorFor("country_id",!0)}
                        @value-change=${this._onCountryChange}
                    ></hc-select-input>
                </div>

                ${e.showTelephone!=="no"?l`
                          <hc-text-input
                              label=${a("Hyperion_Checkout::telephone_label")}
                              name="telephone"
                              type="tel"
                              autocomplete="tel"
                              .value=${this._local.telephone??""}
                              .required=${e.showTelephone==="req"}
                              .error=${this._errorFor("telephone",e.showTelephone==="req")}
                              @value-change=${this._onFieldChange}
                              @value-blur=${this._onBlur}
                          ></hc-text-input>
                      `:p}

                ${e.showFax!=="no"?l`
                          <hc-text-input
                              label=${a("Hyperion_Checkout::fax_label")}
                              name="fax"
                              .value=${this._local.fax??""}
                              .required=${e.showFax==="req"}
                              @value-change=${this._onFieldChange}
                          ></hc-text-input>
                      `:p}

                ${e.showVat?l`
                          <hc-text-input
                              label=${a("Hyperion_Checkout::vat_label")}
                              name="vat_id"
                              .value=${this._local.vat_id??""}
                              @value-change=${this._onFieldChange}
                          ></hc-text-input>
                      `:p}

                ${this.showSaveInAddressBook?l`
                          <hc-checkbox
                              name="save_in_address_book"
                              label=${a("Hyperion_Checkout::save_in_address_book")}
                              .checked=${this._local.save_in_address_book===!0}
                              @value-change=${this._onSaveToggle}
                          ></hc-checkbox>
                      `:p}
            </div>
        `}_renderNameField(e,t,n){if(t.show==="no")return p;const s=t.show==="req",o=a(`Hyperion_Checkout::${e}_label`),i=this._local[e]??"",c=t.options??[];if(c.length>0){const h=c.includes(i)||i===""?c:[i,...c];return l`
                <div class="md:max-w-xs">
                    <hc-select-input
                        label=${o}
                        name=${e}
                        placeholder=${a("Hyperion_Checkout::name_option_placeholder")}
                        .options=${h.map(g=>({value:g,label:g}))}
                        .value=${i}
                        .required=${s}
                        .error=${this._errorFor(e,s)}
                        @value-change=${this._onNameSelectChange}
                    ></hc-select-input>
                </div>
            `}return l`
            <div class=${e==="middlename"?"":"md:max-w-xs"}>
                <hc-text-input
                    label=${o}
                    name=${e}
                    autocomplete=${n}
                    .value=${i}
                    .required=${s}
                    .error=${this._errorFor(e,s)}
                    @value-change=${this._onFieldChange}
                    @value-blur=${this._onBlur}
                ></hc-text-input>
            </div>
        `}_onNameSelectChange(e){this._touched={...this._touched,[e.detail.name]:!0},this._onFieldChange(e)}_errorFor(e,t=!1){const n=this.serverErrors[e];if(n)return n;if(!(this._revealAll||this._touched[e]===!0))return"";if(e==="street"){const i=this._local.street??[];return!i[0]||i[0].trim().length===0?a("Hyperion_Checkout::validation_required"):""}if(!t)return"";const o=this._local[e];return o==null?a("Hyperion_Checkout::validation_required"):typeof o=="string"&&o.trim().length===0?a("Hyperion_Checkout::validation_required"):""}_warningFor(e){if(e!=="postcode"||this.serverErrors[e]||!(this._revealAll||this._touched[e]===!0))return"";const n=bt(this._local.postcode,this._local.country_id??"",ue());return n===null?"":a("Hyperion_Checkout::validation_postcode",{example:n.examples.join(", ")})}_onFieldChange(e){this._local={...this._local,[e.detail.name]:e.detail.value},this._emit()}_onStreetChange(e){const n=e.target.getAttribute("data-index"),s=n?Number(n):0,o=[...this._local.street??[]];for(;o.length<s+1;)o.push("");o[s]=e.detail.value,this._local={...this._local,street:o},this._emit()}_onCountryChange(e){this._local={...this._local,country_id:e.detail.value,region_id:null,region:null},this._emit()}_onRegionSelectChange(e){const n=He(this._local.country_id??"").find(s=>s.id===e.detail.value);this._local={...this._local,region_id:e.detail.value,region:n?{region:n.name,region_code:n.code,region_id:Number(n.id)}:null},this._emit()}_onBlur(e){this._touched={...this._touched,[e.detail.name]:!0}}_onSaveToggle(e){this._local={...this._local,save_in_address_book:e.detail.checked},this._emit()}_emit(){this.dispatchEvent(new CustomEvent("address-change",{detail:this._local,bubbles:!0,composed:!0})),this.dispatchEvent(new CustomEvent("address-valid",{detail:this._isComplete(),bubbles:!0,composed:!0}))}_isComplete(){return vt(this._local,ue())}}U=new WeakMap;W=new WeakMap;G=new WeakMap;T([d({type:String})],E.prototype,"mode",2);T([d({type:Object})],E.prototype,"value",2);T([d({type:Boolean})],E.prototype,"showSaveInAddressBook",2);T([d({type:Object})],E.prototype,"serverErrors",2);T([b()],E.prototype,"_local",1);T([b()],E.prototype,"_touched",1);T([b()],E.prototype,"_revealAll",1);customElements.get("address-form")||customElements.define("address-form",E);var rr=Object.defineProperty,sr=(r,e,t,n)=>{for(var s=void 0,o=r.length-1,i;o>=0;o--)(i=r[o])&&(s=i(e,t,s)||s);return s&&rr(e,t,s),s};class Ge extends _{createRenderRoot(){return this}render(){const e=this.address,t=e.street.filter(s=>s.trim().length>0).join(", "),n=typeof e.region=="object"&&e.region?.region?e.region.region:"";return l`
            <div class="text-sm text-brand space-y-0.5">
                <p class="font-semibold">${$t(e)}</p>
                ${e.company?l`<p class="text-muted">${e.company}</p>`:null}
                <p>${t}</p>
                <p>
                    ${[e.city,n,e.postcode].filter(Boolean).join(", ")}
                </p>
                <p>${e.country_id}</p>
                ${e.telephone?l`<p class="text-muted">${e.telephone}</p>`:null}
            </div>
        `}}sr([d({type:Object})],Ge.prototype,"address");customElements.get("address-card")||customElements.define("address-card",Ge);var nr=Object.defineProperty,or=Object.getOwnPropertyDescriptor,ze=r=>{throw TypeError(r)},Xe=(r,e,t,n)=>{for(var s=n>1?void 0:n?or(e,t):e,o=r.length-1,i;o>=0;o--)(i=r[o])&&(s=(n?i(e,t,s):i(s))||s);return n&&s&&nr(e,t,s),s},Je=(r,e,t)=>e.has(r)||ze("Cannot "+t),ir=(r,e,t)=>(Je(r,e,"read from private field"),t?t.call(r):e.get(r)),ar=(r,e,t)=>e.has(r)?ze("Cannot add the same private member more than once"):e instanceof WeakSet?e.add(r):e.set(r,t),lr=(r,e,t,n)=>(Je(r,e,"write to private field"),e.set(r,t),t),z;class xe extends m(_){constructor(){super(...arguments),this.mode="shipping",ar(this,z,!1),this._newAddressSeed=null,this._openNewForm=()=>{this._newAddressSeed=null,this._showNewForm=!0},this._closeNewForm=()=>{this._showNewForm=!1,this._newAddressSeed=null,this._clearSelection()}}get _showNewForm(){return ir(this,z)}set _showNewForm(e){lr(this,z,e)}createRenderRoot(){return this}render(){const e=u(),t=e.savedAddresses.get(),n=this.mode==="shipping"?e.selectedShippingAddressId.get():e.selectedBillingAddressId.get();return t.length===0?l`
                <address-form
                    mode=${this.mode}
                    .showSaveInAddressBook=${!0}
                    .value=${this._seedForNewAddress()}
                    @address-change=${this._onNewAddressChange}
                ></address-form>
            `:l`
            <div class="space-y-3">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    ${t.map(s=>this._renderCard(s,n))}
                </div>
                ${this._showNewForm?l`
                          <div class="mt-3 pt-3 border-t border-subtle">
                              <p class="text-sm font-medium text-brand mb-2">
                                  ${a("Hyperion_Checkout::add_new_address")}
                              </p>
                              <address-form
                                  mode=${this.mode}
                                  .showSaveInAddressBook=${!0}
                                  .value=${this._seedForNewAddress()}
                                  @address-change=${this._onNewAddressChange}
                              ></address-form>
                              <div class="mt-2">
                                  <hc-button variant="ghost"
                                             .label=${a("Hyperion_Checkout::cancel")}
                                             @click=${this._closeNewForm}></hc-button>
                              </div>
                          </div>
                      `:l`
                          <div>
                              <hc-button variant="secondary"
                                         .label=${a("Hyperion_Checkout::add_new_address")}
                                         @click=${this._openNewForm}></hc-button>
                          </div>
                      `}
            </div>
        `}_renderCard(e,t){const s=(e.id??"")===t&&!this._showNewForm;return l`
            <label class="flex items-start gap-3 rounded-md border p-3 cursor-pointer ${s?"border-accent bg-accent/5":"border-subtle bg-surface hover:border-accent"}">
                <input
                    type="radio"
                    name="saved-${this.mode}-address"
                    class="mt-0.5 h-4 w-4 text-accent focus:ring-2 focus:ring-accent"
                    .checked=${s}
                    @change=${()=>this._selectSaved(e)}
                />
                <address-card .address=${e} class="flex-1"></address-card>
            </label>
        `}_currentAddress(){const e=u();return this.mode==="shipping"?e.shippingAddress.get():e.billingAddress.get()}_seedForNewAddress(){if(this._newAddressSeed===null){const t=u().customer.get(),n=this._currentAddress();this._newAddressSeed={country_id:f().defaultCountryId,street:[],city:"",firstname:t?.firstname??"",lastname:t?.lastname??"",telephone:n?.telephone??""}}return this._newAddressSeed}_selectSaved(e){const t=u();this._showNewForm=!1,this._newAddressSeed=null,this.mode==="shipping"?(t.selectedShippingAddressId.set(e.id??null),t.shippingAddress.set(e)):(t.selectedBillingAddressId.set(e.id??null),t.billingAddress.set(e)),this.dispatchEvent(new CustomEvent("saved-address-select",{detail:{address:e,mode:this.mode},bubbles:!0,composed:!0}))}_clearSelection(){const e=u();this.mode==="shipping"?(e.selectedShippingAddressId.set(null),e.shippingAddress.set(null)):(e.selectedBillingAddressId.set(null),e.billingAddress.set(null))}_onNewAddressChange(e){const t=u(),n={...e.detail};delete n.id,delete n.customer_id,this.mode==="shipping"?(t.selectedShippingAddressId.set(null),t.shippingAddress.set(n)):(t.selectedBillingAddressId.set(null),t.billingAddress.set(n))}}z=new WeakMap;Xe([d({type:String})],xe.prototype,"mode",2);Xe([b()],xe.prototype,"_showNewForm",1);customElements.get("address-selector")||customElements.define("address-selector",xe);function R(r,e){const t=typeof r=="string"?Number(r):r;if(!Number.isFinite(t))return e.pattern.replace("%s","");const n=Math.max(0,e.requiredPrecision??e.precision??2),s=Math.abs(t).toFixed(n),[o,i=""]=s.split("."),c=e.groupLength>0?e.groupLength:3,h=(o??"0").split("").reverse(),g=[];for(let w=0;w<h.length;w+=c)g.push(h.slice(w,w+c).reverse().join(""));g.reverse();let x=g.join(e.groupSymbol);i.length>0&&(x=`${x}${e.decimalSymbol}${i}`);const A=e.pattern.replace("%s",x);return t<0?`-${A}`:A}var cr=Object.defineProperty,Ke=(r,e,t,n)=>{for(var s=void 0,o=r.length-1,i;o>=0;o--)(i=r[o])&&(s=i(e,t,s)||s);return s&&cr(e,t,s),s};class ke extends _{constructor(){super(...arguments),this.selected=!1}createRenderRoot(){return this}render(){const e=this.method,t=f(),n=te(),s=e.price_incl_tax??e.amount??0,o=e.price_excl_tax??e.amount??0,i=t.isDisplayShippingBothPrices&&s!==o?`${R(o,n)} (${a("Hyperion_Checkout::total_incl_tax",{title:R(s,n)})})`:R(t.isDisplayShippingPriceExclTax?o:s,n),c=`hc-ship-${e.carrier_code}-${e.method_code}`;return l`
            <label for=${c}
                   class="flex items-start justify-between gap-3 rounded-md border p-3 cursor-pointer ${this.selected?"border-accent bg-accent/5":"border-subtle hover:border-accent bg-surface"}">
                <span class="flex items-start gap-3">
                    <input
                        id=${c}
                        type="radio"
                        name="shipping_method"
                        class="mt-0.5 h-4 w-4 text-accent focus:ring-2 focus:ring-accent"
                        .checked=${this.selected}
                        ?disabled=${!e.available}
                        @change=${this._onSelect}
                    />
                    <span>
                        <span class="block text-sm font-medium text-brand">
                            ${e.carrier_title}${" "}-- ${e.method_title}
                        </span>
                        ${e.error_message?l`<span class="block text-xs text-danger mt-0.5">${e.error_message}</span>`:null}
                    </span>
                </span>
                <span class="text-sm font-semibold text-brand whitespace-nowrap">${i}</span>
            </label>
        `}_onSelect(){this.dispatchEvent(new CustomEvent("method-select",{detail:{carrier_code:this.method.carrier_code,method_code:this.method.method_code},bubbles:!0,composed:!0}))}}Ke([d({type:Object})],ke.prototype,"method");Ke([d({type:Boolean})],ke.prototype,"selected");customElements.get("shipping-method-row")||customElements.define("shipping-method-row",ke);class dr extends m(_){createRenderRoot(){return this}render(){const e=u(),t=e.availableShippingMethods.get(),n=e.isLoadingShippingMethods.get(),s=e.selectedShippingMethod.get();return n&&t.length===0?l`<p class="text-sm text-muted" role="status" aria-live="polite">
                ${a("Hyperion_Checkout::shipping_calculating")}
            </p>`:t.length===0?l`<p class="text-sm text-muted">
                ${a("Hyperion_Checkout::shipping_waiting_for_address")}
            </p>`:l`
            <div role="radiogroup"
                 aria-label=${a("Hyperion_Checkout::shipping_method_aria")}
                 class="space-y-2">
                ${t.map(o=>l`
                    <shipping-method-row
                        .method=${o}
                        .selected=${s?.carrier_code===o.carrier_code&&s.method_code===o.method_code}
                        @method-select=${this._onSelect}
                    ></shipping-method-row>
                `)}
                ${n?l`<p class="text-xs text-muted">${a("Hyperion_Checkout::shipping_updating")}</p>`:p}
            </div>
        `}_onSelect(e){u().selectedShippingMethod.set(e.detail),y().saveShippingAndEstimateTotals()}}customElements.get("shipping-method-list")||customElements.define("shipping-method-list",dr);class ur extends m(_){constructor(){super(...arguments),this._triggerEstimate=ve(()=>{y().estimateShipping()},500),this._openPolicy=()=>{const e=this.querySelector("dialog[data-hyperion-shipping-policy]");e&&(typeof e.showModal=="function"?e.showModal():e.setAttribute("open",""))},this._closePolicy=()=>{const e=this.querySelector("dialog[data-hyperion-shipping-policy]");e&&(typeof e.close=="function"?e.close():e.removeAttribute("open"))}}createRenderRoot(){return this}render(){const e=u();if(e.isVirtual.get())return null;const t=e.shippingAddress.get(),n=e.savedAddresses.get(),s=e.customer.get()!==null&&n.length>0;return l`
            <section class="space-y-4">
                <h3 class="text-base font-semibold text-brand">
                    ${a("Hyperion_Checkout::shipping_address_heading")}
                </h3>
                ${s?l`<address-selector mode="shipping"
                                              @saved-address-select=${this._onSavedPick}
                                              @address-change=${this._onAddressChange}
                            ></address-selector>`:l`<address-form
                                mode="shipping"
                                .value=${t}
                                @address-change=${this._onAddressChange}
                            ></address-form>`}
                <div class="pt-2 border-t border-subtle">
                    <h3 class="text-base font-semibold text-brand mb-2">
                        ${a("Hyperion_Checkout::shipping_method_heading")}
                    </h3>
                    <shipping-method-list></shipping-method-list>
                    ${this._renderShippingPolicy()}
                </div>
            </section>
        `}_renderShippingPolicy(){const e=f().shippingPolicy;if(!e||!e.isEnabled)return p;const t=ye(e.shippingPolicyContent??"");return t.trim()===""?p:l`
            <div class="pt-3">
                <button type="button"
                        class="text-sm font-medium text-accent hover:underline"
                        data-hyperion-shipping-policy-open
                        @click=${this._openPolicy}>
                    ${a("Hyperion_Checkout::shipping_policy_open")}
                </button>
                <dialog class="w-full max-w-lg rounded-md border border-subtle bg-surface p-0 text-brand shadow-lg backdrop:bg-black/40"
                        aria-labelledby="hc-shipping-policy-heading"
                        data-hyperion-shipping-policy>
                    <div class="p-4 space-y-3">
                        <h3 id="hc-shipping-policy-heading" class="text-base font-semibold text-brand">
                            ${a("Hyperion_Checkout::shipping_policy_heading")}
                        </h3>
                        <div class="text-sm text-brand space-y-2 max-h-[60vh] overflow-y-auto">${jt(t)}</div>
                        <div class="flex justify-end">
                            <hc-button variant="secondary"
                                       .label=${a("Hyperion_Checkout::shipping_policy_close")}
                                       @click=${this._closePolicy}></hc-button>
                        </div>
                    </div>
                </dialog>
            </div>
        `}_onAddressChange(e){u().shippingAddress.set(e.detail),this._triggerEstimate()}_onSavedPick(){y().estimateShipping()}}customElements.get("checkout-shipping")||customElements.define("checkout-shipping",ur);const we=new Map;function Yr(r){we.set(r.code,r),qe({code:r.code,component:"payment-vault",beforePlaceOrder:async()=>{const e=Ce(r.code);if(!e)throw new Error(a("Hyperion_Checkout::vault_no_token_selected"));return(r.beforePlaceOrder??gr)(e)}})}function Qe(r){return we.get(r)??null}function hr(r){const e=f().vault;return e&&typeof e=="object"&&r in e?!0:Ze().some(t=>t.code===r)}function Ze(r){const e=f().payment?.vault;if(!e||typeof e!="object")return[];const t=[];for(const[n,s]of Object.entries(e)){const o=s?.config;if(!o||typeof o!="object")continue;const i=typeof o.code=="string"?o.code:"",c=typeof o.publicHash=="string"?o.publicHash:"";if(!i||!c||r!==void 0&&i!==r)continue;const h=o.details;t.push({key:n,code:i,publicHash:c,nonceUrl:typeof o.nonceUrl=="string"?o.nonceUrl:null,details:h&&typeof h=="object"?h:{}})}return t}function Ye(r){return we.has(r)?Ze(r):[]}function Ce(r){const e=Ye(r),t=u().paymentMethodData.get()[r]?.public_hash;return e.find(n=>n.publicHash===t)??e[0]??null}function pr(r){const e=[],t=[];for(const n of r){if(hr(n.code)){for(const o of Ye(n.code))e.push({method:n,token:o});continue}const s=q(n.code)?.isAvailable;s&&!s(n)||t.push({method:n,token:null})}return[...e,...t]}function _r(r,e){const t=u();t.paymentMethodData.set({...t.paymentMethodData.get(),[r]:{public_hash:e}}),t.selectedPaymentMethod.set(r)}async function mr(r){const e=h=>new Error(typeof h=="string"&&h?h:a("Hyperion_Checkout::vault_nonce_failed"));if(!r.nonceUrl)throw e();const t=new URL(r.nonceUrl,window.location.href);if(t.origin!==window.location.origin)throw e();t.searchParams.set("public_hash",r.publicHash);let n,s=null;try{n=await fetch(t.toString(),{method:"GET",credentials:"same-origin",headers:{Accept:"application/json","X-Requested-With":"XMLHttpRequest"}}),s=await n.json().catch(()=>null)}catch{throw e()}const o=s?.paymentMethodNonce;if(!n.ok||typeof o!="string"||!o)throw e(s?.message);const i=s?.details,c=i&&typeof i=="object"?i.bin:"";return{nonce:o,bin:typeof c=="string"?c:""}}async function gr(r){const{nonce:e}=await mr(r);return{public_hash:r.publicHash,payment_method_nonce:e}}const fr={braintree:()=>P(()=>import("./payment-braintree-card-CT0Ts2JN.js"),__vite__mapDeps([0,1,2,3,4]),import.meta.url),braintree_paypal:()=>P(()=>import("./payment-braintree-paypal-BYvY0AYd.js"),__vite__mapDeps([5,1,2,3]),import.meta.url),braintree_cc_vault:()=>P(()=>import("./payment-braintree-vault-CA0Pehp4.js"),__vite__mapDeps([6,1,2,3,4]),import.meta.url),braintree_paypal_vault:()=>P(()=>import("./payment-braintree-vault-CA0Pehp4.js"),__vite__mapDeps([6,1,2,3,4]),import.meta.url),paypal_express:()=>P(()=>import("./payment-paypal-express-CVSmzpGN.js"),__vite__mapDeps([7,1,2]),import.meta.url),payflow_express:()=>P(()=>import("./payment-paypal-express-CVSmzpGN.js"),__vite__mapDeps([7,1,2]),import.meta.url)},se=new H.State(0),he=new Set;function br(r){for(const e of r){const t=fr[e];!t||he.has(e)||(he.add(e),t().then(()=>se.set(se.get()+1)).catch(n=>{he.delete(e),console.error(`[hyperion-checkout] payment renderer for "${e}" failed to load`,n)}))}}var vr=Object.defineProperty,yr=(r,e,t,n)=>{for(var s=void 0,o=r.length-1,i;o>=0;o--)(i=r[o])&&(s=i(e,t,s)||s);return s&&vr(e,t,s),s};class et extends _{constructor(){super(...arguments),this.code=""}createRenderRoot(){return this}render(){const t=f().payment?.[this.code],n=t&&typeof t.instructions=="string"?ye(t.instructions):"",s=this.code==="purchaseorder";return l`
            <div class="space-y-3">
                ${n?l`<div class="text-sm text-muted"
                                .innerHTML=${n}></div>`:p}
                ${s?this._renderPoInput():p}
            </div>
        `}_renderPoInput(){const n=(u().paymentMethodData.get().purchaseorder??{}).po_number??"";return l`
            <hc-text-input
                label=${a("Hyperion_Checkout::po_number_label")}
                name="po_number"
                .value=${n}
                .required=${!0}
                @value-change=${this._onPoChange}
            ></hc-text-input>
        `}_onPoChange(e){const t=u(),n=t.paymentMethodData.get();t.paymentMethodData.set({...n,purchaseorder:{...n.purchaseorder??{},po_number:e.detail.value}})}}yr([d({type:String})],et.prototype,"code");customElements.get("payment-offline")||customElements.define("payment-offline",et);for(const r of["checkmo","banktransfer","cashondelivery","free","purchaseorder"])qe({code:r,component:"payment-offline",...r==="purchaseorder"?{beforePlaceOrder:async()=>({po_number:(u().paymentMethodData.get().purchaseorder??{}).po_number??""})}:{}});var $r=Object.defineProperty,xr=(r,e,t,n)=>{for(var s=void 0,o=r.length-1,i;o>=0;o--)(i=r[o])&&(s=i(e,t,s)||s);return s&&$r(e,t,s),s};class tt extends _{constructor(){super(...arguments),this.code=""}createRenderRoot(){return this}render(){return l`
            <div role="alert"
                 class="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
                ${a("Hyperion_Checkout::payment_method_unavailable",{code:this.code})}
            </div>
        `}}xr([d({type:String})],tt.prototype,"code");customElements.get("payment-generic")||customElements.define("payment-generic",tt);/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const kr=Be(class extends Ne{constructor(){super(...arguments),this.key=p}render(r,e){return this.key=r,e}update(r,[e,t]){return e!==this.key&&(Pt(r),this.key=e),t}});var wr=Object.defineProperty,Cr=(r,e,t,n)=>{for(var s=void 0,o=r.length-1,i;o>=0;o--)(i=r[o])&&(s=i(e,t,s)||s);return s&&wr(e,t,s),s};class rt extends m(_){constructor(){super(...arguments),this.code=""}createRenderRoot(){return this}render(){const e=Ce(this.code),t=e?Qe(this.code)?.renderBody?.(e):null;return t?kr(e?.publicHash,l`${t}`):p}}Cr([d({type:String})],rt.prototype,"code");customElements.get("payment-vault")||customElements.define("payment-vault",rt);var Sr=Object.defineProperty,oe=(r,e,t,n)=>{for(var s=void 0,o=r.length-1,i;o>=0;o--)(i=r[o])&&(s=i(e,t,s)||s);return s&&Sr(e,t,s),s};class B extends _{constructor(){super(...arguments),this.token=null,this.renderersVersion=0,this.selected=!1,this._body=null}createRenderRoot(){return this}render(){const e=this.method,t=q(e.code)!==null,n=Ae(e.code),s=this.token?`hc-pay-${this.token.key}`:`hc-pay-${e.code}`,o=this.token?Qe(e.code)?.label(this.token)??e.title:e.title,i=!t&&!n;return l`
            <div class="rounded-md border ${this.selected?"border-accent bg-accent/5":"border-subtle bg-surface"} ${i?"opacity-60":""}">
                <label for=${s}
                       class="flex items-start gap-3 p-3 cursor-pointer ${i?"cursor-not-allowed":""}">
                    <input
                        id=${s}
                        type="radio"
                        name="payment_method"
                        class="mt-0.5 h-4 w-4 text-accent focus:ring-2 focus:ring-accent"
                        .checked=${this.selected}
                        ?disabled=${i}
                        @change=${this._onSelect}
                    />
                    <span class="text-sm">
                        <span class="font-medium text-brand">${o}</span>
                        ${i?l`<span class="block text-xs text-muted" data-payment-unsupported>
                                  ${a("Hyperion_Checkout::payment_method_unsupported_hint")}
                              </span>`:p}
                    </span>
                </label>
                ${this.selected?this._renderSelectedBody():this._dropBody()}
            </div>
        `}_renderSelectedBody(){const e=q(this.method.code),t=Ae(this.method.code);return e?l`<div class="px-3 pb-3">
                ${this._bodyElement(e.component,this.method.code)}
            </div>`:(this._body=null,t?null:l`<div class="px-3 pb-3">
            <payment-generic code=${this.method.code}></payment-generic>
        </div>`)}_bodyElement(e,t){const n=this._body;if(n&&n.localName===e&&n.getAttribute("code")===t)return n;const s=document.createElement(e);return s.setAttribute("code",t),this._body=s,s}_dropBody(){return this._body=null,null}_onSelect(){this.dispatchEvent(new CustomEvent("payment-select",{detail:{code:this.method.code,...this.token?{publicHash:this.token.publicHash}:{}},bubbles:!0,composed:!0}))}}oe([d({type:Object})],B.prototype,"method");oe([d({attribute:!1})],B.prototype,"token");oe([d({type:Number})],B.prototype,"renderersVersion");oe([d({type:Boolean})],B.prototype,"selected");customElements.get("payment-method-row")||customElements.define("payment-method-row",B);class Er extends m(_){createRenderRoot(){return this}render(){const e=u(),t=e.availablePaymentMethods.get();br(t.map(i=>i.code));const n=se.get(),s=pr(t),o=e.selectedPaymentMethod.get();return s.length===0?l`<p class="text-sm text-muted" role="status" aria-live="polite">
                ${a("Hyperion_Checkout::payment_waiting_for_shipping")}
            </p>`:l`
            <div role="radiogroup"
                 aria-label=${a("Hyperion_Checkout::payment_method_aria")}
                 class="space-y-2">
                ${s.map(({method:i,token:c})=>l`
                    <payment-method-row
                        .method=${i}
                        .token=${c}
                        .renderersVersion=${n}
                        .selected=${o===i.code&&(c===null||Ce(i.code)?.publicHash===c.publicHash)}
                        @payment-select=${this._onSelect}
                    ></payment-method-row>
                `)}
            </div>
        `}_onSelect(e){if(e.detail.publicHash){_r(e.detail.code,e.detail.publicHash);return}u().selectedPaymentMethod.set(e.detail.code)}}customElements.get("payment-method-list")||customElements.define("payment-method-list",Er);class Ar extends m(_){constructor(){super(...arguments),this._syncBilling=ve(()=>{y().syncBillingAddress()},500)}createRenderRoot(){return this}render(){const e=u(),t=e.isVirtual.get(),n=e.billingSameAsShipping.get(),s=e.billingAddress.get(),o=e.savedAddresses.get(),c=e.customer.get()!==null&&o.length>0?l`<address-selector mode="billing"
                                      @address-change=${this._onBillingChange}
                                      @saved-address-select=${this._onSavedBillingPick}
                    ></address-selector>`:l`<address-form
                        mode="billing"
                        .value=${s}
                        .showSaveInAddressBook=${e.customer.get()!==null}
                        @address-change=${this._onBillingChange}
                    ></address-form>`;return l`
            <section class="space-y-4">
                ${t?l`
                          <div class="space-y-3">
                              <h3 class="text-base font-semibold text-brand">
                                  ${a("Hyperion_Checkout::billing_address_heading")}
                              </h3>
                              ${c}
                          </div>
                      `:l`
                          <hc-checkbox
                              name="billing_same_as_shipping"
                              label=${a("Hyperion_Checkout::billing_same_as_shipping")}
                              .checked=${n}
                              @value-change=${this._onToggle}
                          ></hc-checkbox>
                          ${n?p:l`
                                    <div class="space-y-3 pt-2 border-t border-subtle">
                                        <h3 class="text-base font-semibold text-brand">
                                            ${a("Hyperion_Checkout::billing_address_heading")}
                                        </h3>
                                        ${c}
                                    </div>
                                `}
                      `}
                <div class="pt-2 border-t border-subtle">
                    <h3 class="text-base font-semibold text-brand mb-2">
                        ${a("Hyperion_Checkout::payment_method_heading")}
                    </h3>
                    <payment-method-list></payment-method-list>
                </div>
            </section>
        `}_onToggle(e){u().billingSameAsShipping.set(e.detail.checked),y().invalidateBillingSync(),e.detail.checked||y().syncBillingAddress()}_onBillingChange(e){u().billingAddress.set(e.detail),y().invalidateBillingSync(),this._syncBilling()}_onSavedBillingPick(){y().invalidateBillingSync(),y().syncBillingAddress()}}customElements.get("checkout-payment")||customElements.define("checkout-payment",Ar);class Pr extends m(_){createRenderRoot(){return this}render(){const e=f().checkoutAgreements;if(!e||!e.isEnabled||!e.agreements)return p;const t=e.agreements.filter(s=>s.mode===xt);if(t.length===0)return p;const n=new Set(u().acceptedAgreements.get());return l`
            <fieldset class="space-y-3 pt-3 border-t border-subtle"
                      aria-labelledby="hc-agreements-heading">
                <legend id="hc-agreements-heading" class="sr-only">
                    ${a("Hyperion_Checkout::agreements_heading")}
                </legend>
                ${t.map(s=>this._renderRow(s,n.has(s.agreementId)))}
            </fieldset>
        `}_renderRow(e,t){const n=`hc-agreement-${e.agreementId}`,s=`${n}-label`,o=`${n}-desc`,i=e.checkboxText||e.name||"";return l`
            <div class="space-y-2">
                <label for=${n} id=${s}
                       class="flex items-start gap-2 cursor-pointer text-sm text-brand">
                    <input
                        id=${n}
                        type="checkbox"
                        class="mt-0.5 h-4 w-4 rounded border-subtle text-accent focus:ring-2 focus:ring-accent"
                        .checked=${t}
                        aria-describedby=${o}
                        @change=${c=>this._onToggle(e.agreementId,c)}
                    />
                    <span>${i}</span>
                </label>
                ${e.content?l`<div id=${o}
                                class="text-xs text-muted pl-6 max-h-40 overflow-auto rounded border border-subtle bg-surface p-2"
                                .innerHTML=${ye(e.content)}></div>`:p}
            </div>
        `}_onToggle(e,t){const n=t.target.checked,s=u().acceptedAgreements,o=s.get();n?o.includes(e)||s.set([...o,e]):s.set(o.filter(i=>i!==e))}}customElements.get("checkout-agreements")||customElements.define("checkout-agreements",Pr);function st(r,e){return e===null?`${r}/gift-message`:`${r}/gift-message/${encodeURIComponent(String(e))}`}function Hr(r,e,t){return be(st(`guest-carts/${encodeURIComponent(r)}`,e),{method:"POST",body:{giftMessage:t},auth:"guest"})}function Rr(r,e){return be(st("carts/mine",r),{method:"POST",body:{giftMessage:e},auth:"customer"})}var Or=Object.defineProperty,Mr=Object.getOwnPropertyDescriptor,nt=r=>{throw TypeError(r)},ie=(r,e,t,n)=>{for(var s=Mr(e,t),o=r.length-1,i;o>=0;o--)(i=r[o])&&(s=i(e,t,s)||s);return s&&Or(e,t,s),s},ot=(r,e,t)=>e.has(r)||nt("Cannot "+t),I=(r,e,t)=>(ot(r,e,"read from private field"),t?t.call(r):e.get(r)),D=(r,e,t)=>e.has(r)?nt("Cannot add the same private member more than once"):e instanceof WeakSet?e.add(r):e.set(r,t),L=(r,e,t,n)=>(ot(r,e,"write to private field"),e.set(r,t),t),X,J,K,Q;const Re=2e3;function Oe(r){return r===null?"order":String(r)}function Me(r){return!r||r===!0?{sender:"",recipient:"",message:""}:{sender:typeof r.sender=="string"?r.sender:"",recipient:typeof r.recipient=="string"?r.recipient:"",message:typeof r.message=="string"?r.message:""}}function Tr(r,e){const t=r.isOrderLevelGiftOptionsEnabled===!0?Me(r.giftMessage?.orderLevel):null,n=r.giftMessage?.itemLevel,s=n&&n!==!0?n:{},o=r.isItemLevelGiftOptionsEnabled===!0?e.filter(i=>i.is_virtual==="1"||i.is_virtual===1||i.is_virtual===!0?!1:s[String(i.item_id)]?.is_available!==!1).map(i=>({item:i,state:Me(s[String(i.item_id)]?.message)})):[];return{order:t,items:o}}class N extends m(_){constructor(){super(...arguments),D(this,X,!1),D(this,J,{}),D(this,K,{}),D(this,Q,{}),this._save=async(e,t)=>{const n=Oe(e),s=u(),o={sender:t.sender.trim(),recipient:t.recipient.trim(),message:t.message.trim().slice(0,Re)};this._busy={...this._busy,[n]:!0};try{s.isGuest.get()?await Hr(s.maskedQuoteId.get()??"",e,o):await Rr(e,o),this._notice={...this._notice,[n]:{tone:"success",text:o.message===""?a("Hyperion_Checkout::gift_removed"):a("Hyperion_Checkout::gift_saved")}}}catch(i){const c=i instanceof kt?i.message:a("Hyperion_Checkout::gift_save_failed");this._notice={...this._notice,[n]:{tone:"error",text:c}}}finally{this._busy={...this._busy,[n]:!1}}}}get _open(){return I(this,X)}set _open(e){L(this,X,e)}get _forms(){return I(this,J)}set _forms(e){L(this,J,e)}get _busy(){return I(this,K)}set _busy(e){L(this,K,e)}get _notice(){return I(this,Q)}set _notice(e){L(this,Q,e)}createRenderRoot(){return this}render(){const e=f(),t=Tr(e,u().items.get());return t.order===null&&t.items.length===0?p:this._open?l`
            <div class="space-y-4" data-hyperion-gift-options>
                ${t.order!==null?this._renderForm(null,a("Hyperion_Checkout::gift_order_heading"),t.order):p}
                ${t.items.map(({item:n,state:s})=>this._renderForm(Number(n.item_id),a("Hyperion_Checkout::gift_item_heading",{name:n.name}),s))}
                <button type="button"
                        class="text-sm font-medium text-muted hover:underline"
                        @click=${()=>{this._open=!1}}>
                    ${a("Hyperion_Checkout::gift_options_close")}
                </button>
            </div>
        `:l`
                <button type="button"
                        class="text-sm font-medium text-accent hover:underline"
                        data-hyperion-gift-open
                        @click=${()=>{this._open=!0}}>
                    ${a("Hyperion_Checkout::gift_options_open")}
                </button>
            `}_renderForm(e,t,n){const s=Oe(e),o=this._forms[s]??n,i=this._notice[s],c=(h,g)=>l`
            <hc-text-input
                label=${g}
                name=${`gift_${s}_${h}`}
                .value=${o[h]}
                @value-change=${x=>this._update(s,n,h,x.detail.value)}
            ></hc-text-input>
        `;return l`
            <fieldset class="space-y-2 rounded-md border border-subtle p-3" data-hyperion-gift-form=${s}>
                <legend class="px-1 text-sm font-semibold text-brand">${t}</legend>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                    ${c("sender",a("Hyperion_Checkout::gift_sender_label"))}
                    ${c("recipient",a("Hyperion_Checkout::gift_recipient_label"))}
                </div>
                <label class="block">
                    <span class="block text-sm font-medium text-brand mb-1">${a("Hyperion_Checkout::gift_message_label")}</span>
                    <textarea
                        name=${`gift_${s}_message`}
                        rows="3"
                        maxlength=${String(Re)}
                        class="w-full rounded border border-subtle bg-surface px-3 py-2 text-sm text-brand focus:outline-none focus:ring-2 focus:ring-accent"
                        .value=${o.message}
                        @input=${h=>this._update(s,n,"message",h.target.value)}
                    ></textarea>
                </label>
                ${i?l`<p class=${i.tone==="error"?"text-sm text-error":"text-sm text-success"}
                              role="status" data-hyperion-gift-notice=${i.tone}>${i.text}</p>`:p}
                <div class="flex gap-2">
                    <hc-button variant="secondary"
                               .label=${a("Hyperion_Checkout::gift_save")}
                               .loading=${this._busy[s]===!0}
                               @click=${()=>this._save(e,o)}></hc-button>
                </div>
            </fieldset>
        `}_update(e,t,n,s){const o=this._forms[e]??t;if(this._forms={...this._forms,[e]:{...o,[n]:s}},this._notice[e]){const i={...this._notice};delete i[e],this._notice=i}}}X=new WeakMap;J=new WeakMap;K=new WeakMap;Q=new WeakMap;ie([b()],N.prototype,"_open");ie([b()],N.prototype,"_forms");ie([b()],N.prototype,"_busy");ie([b()],N.prototype,"_notice");customElements.get("checkout-gift-message")||customElements.define("checkout-gift-message",N);function Te(r,e,t,n,s){return e==="both"?[{code:`${r.code}_excl`,label:s.exclTax(r.title),value:t,kind:"regular"},{code:`${r.code}_incl`,label:s.inclTax(r.title),value:n,kind:"regular"}]:[{code:r.code,label:r.title,value:e==="including"?n:t,kind:"regular"}]}function Fr(r,e){const t=Number(r.value);if(t===0&&!e.isZeroTaxDisplayed)return[];const n=[];if(e.isFullTaxSummaryDisplayed){const o=r.extension_attributes?.tax_grandtotal_details??[];for(const i of o)for(const c of i.rates??[]){const h=c.percent==null?"":` (${Number(c.percent)}%)`;n.push({code:"tax_rate",label:`${c.title??""}${h}`,value:Number(i.amount??0),kind:"detail"})}}return n.push({code:r.code,label:r.title,value:t,kind:"regular"}),n}function qr(r,e,t){const n=[];for(const s of r.total_segments)switch(s.code){case"subtotal":n.push(...Te(s,e.reviewTotalsDisplayMode,Number(r.subtotal),Number(r.subtotal_incl_tax),t));break;case"shipping":n.push(...Te(s,e.reviewShippingDisplayMode,Number(r.shipping_amount),Number(r.shipping_incl_tax),t));break;case"tax":n.push(...Fr(s,e));break;case"grand_total":{const o=Number(s.value);e.includeTaxInGrandTotal?(n.push({code:"grand_total_excl",label:t.exclTax(s.title),value:o-Number(r.tax_amount),kind:"regular"}),n.push({code:s.code,label:t.inclTax(s.title),value:o,kind:"grand"})):n.push({code:s.code,label:s.title,value:o,kind:"grand"});break}default:n.push({code:s.code,label:s.title,value:Number(s.value),kind:"regular"})}return n}function Br(r,e,t){return r==="excluding"?e:t}function Nr(r,e=!1){const t=r.weee_tax_applied;if(t==null||t==="")return[];let n;try{n=typeof t=="string"?JSON.parse(t):t}catch{return[]}if(!Array.isArray(n))return[];const s=[];for(const o of n){if(!o||typeof o!="object")continue;const i=o,c=Number(e?i.amount_incl_tax??i.amount:i.amount),h=Number(e?i.row_amount_incl_tax??i.row_amount:i.row_amount);!Number.isFinite(h)||h<=0||s.push({title:typeof i.title=="string"&&i.title!==""?i.title:"FPT",amount:Number.isFinite(c)?c:0,rowAmount:h})}return s}var Ir=Object.defineProperty,Dr=(r,e,t,n)=>{for(var s=void 0,o=r.length-1,i;o>=0;o--)(i=r[o])&&(s=i(e,t,s)||s);return s&&Ir(e,t,s),s};class it extends _{createRenderRoot(){return this}render(){const e=this.item,t=f(),n=e.thumbnail??this._imageFromConfig(t,String(e.item_id))??"",s=this._parseOptions(e.options),o=t.isWeeeEnabled?Nr(e,t.reviewItemPriceDisplayMode==="including"):[];return l`
            <li class="flex gap-3 py-2">
                ${n?l`<img src=${n} alt="" class="h-16 w-16 rounded border border-subtle object-cover bg-surface-raised" loading="lazy">`:l`<div class="h-16 w-16 rounded border border-subtle bg-surface-raised"></div>`}
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-brand truncate">${e.name}</p>
                    ${s.length>0?l`<ul class="text-xs text-muted space-y-0.5 mt-0.5">
                                ${s.map(i=>l`
                                    <li><span>${i.label}:</span> <span>${i.value}</span></li>
                                `)}
                            </ul>`:null}
                    ${o.length>0?l`<ul class="text-xs text-muted mt-0.5" data-hyperion-fpt>
                                ${o.map(i=>l`
                                    <li>${i.title}: ${R(i.rowAmount,te())}</li>
                                `)}
                            </ul>`:null}
                    <p class="text-xs text-muted mt-1">${a("Hyperion_Checkout::qty_label")} ${String(e.qty)}</p>
                </div>
                <div class="text-sm font-semibold text-brand whitespace-nowrap">
                    ${R(this._rowTotal(e,t),te())}
                </div>
            </li>
        `}_rowTotal(e,t){const n=Number(e.row_total),s=Number(e.row_total_incl_tax??e.row_total);return Br(t.reviewItemPriceDisplayMode,n,s)}_parseOptions(e){if(!e)return[];let t=[];if(typeof e=="string")try{const n=JSON.parse(e);t=Array.isArray(n)?n:[]}catch{return[]}else t=e;return t.map(n=>({label:String(n.label??""),value:Jt(String(n.value??""))}))}_imageFromConfig(e,t){const s=e.imageData;if(!s||typeof s!="object")return null;const o=s[t];if(!o||typeof o!="object")return null;const i=o.src;return typeof i=="string"?i:null}}Dr([d({type:Object})],it.prototype,"item");customElements.get("summary-item")||customElements.define("summary-item",it);class Lr extends m(_){createRenderRoot(){return this}render(){const t=u().totals.get();if(!t)return null;const n=te(),s=qr(t,f(),{exclTax:c=>a("Hyperion_Checkout::total_excl_tax",{title:c}),inclTax:c=>a("Hyperion_Checkout::total_incl_tax",{title:c})}),o=s.find(c=>c.kind==="grand"),i=o?`${o.label} ${R(o.value,n)}`:"";return l`
            <dl class="space-y-1.5">
                ${s.map(c=>{const h={grand:"flex items-center justify-between pt-2 mt-2 border-t border-subtle text-base font-bold text-brand",detail:"flex items-center justify-between text-xs text-muted",regular:"flex items-center justify-between text-sm text-brand"}[c.kind];return l`
                        <div class=${h} data-total=${c.code}>
                            <dt>${c.label}</dt>
                            <dd>${R(c.value,n)}</dd>
                        </div>
                    `})}
            </dl>
            <div role="status"
                 aria-live="polite"
                 class="sr-only">
                ${i}
            </div>
        `}}customElements.get("summary-totals")||customElements.define("summary-totals",Lr);var jr=Object.defineProperty,Vr=Object.getOwnPropertyDescriptor,at=r=>{throw TypeError(r)},Se=(r,e,t,n)=>{for(var s=Vr(e,t),o=r.length-1,i;o>=0;o--)(i=r[o])&&(s=i(e,t,s)||s);return s&&jr(e,t,s),s},lt=(r,e,t)=>e.has(r)||at("Cannot "+t),pe=(r,e,t)=>(lt(r,e,"read from private field"),t?t.call(r):e.get(r)),_e=(r,e,t)=>e.has(r)?at("Cannot add the same private member more than once"):e instanceof WeakSet?e.add(r):e.set(r,t),me=(r,e,t,n)=>(lt(r,e,"write to private field"),e.set(r,t),t),Z,Y,ee;class ae extends m(_){constructor(){super(...arguments),_e(this,Z,""),_e(this,Y,!1),_e(this,ee,!1),this._apply=async()=>{this._busy=!0;try{await y().applyCoupon(this._draft.trim())&&(this._draft="",this._open=!1)}finally{this._busy=!1}},this._remove=async()=>{this._busy=!0;try{await y().removeCoupon()}finally{this._busy=!1}}}get _draft(){return pe(this,Z)}set _draft(e){me(this,Z,e)}get _open(){return pe(this,Y)}set _open(e){me(this,Y,e)}get _busy(){return pe(this,ee)}set _busy(e){me(this,ee,e)}createRenderRoot(){return this}render(){const e=u(),t=e.appliedCoupon.get(),n=e.couponError.get();return t?l`
                <div class="rounded-md border border-accent/30 bg-accent/5 p-3">
                    <div class="flex items-center justify-between gap-3">
                        <div>
                            <p class="text-sm font-medium text-brand">
                                ${a("Hyperion_Checkout::coupon_applied")}
                            </p>
                            <p class="text-xs text-muted">
                                <code>${t}</code>
                            </p>
                        </div>
                        <hc-button variant="ghost"
                                   .label=${a("Hyperion_Checkout::coupon_remove")}
                                   .loading=${this._busy}
                                   @click=${this._remove}></hc-button>
                    </div>
                </div>
            `:this._open?l`
            <div class="space-y-2">
                <hc-text-input
                    label=${a("Hyperion_Checkout::coupon_code_label")}
                    name="coupon_code"
                    .value=${this._draft}
                    .error=${n??""}
                    @value-change=${s=>{this._draft=s.detail.value}}
                ></hc-text-input>
                <div class="flex gap-2">
                    <hc-button variant="primary"
                               .label=${a("Hyperion_Checkout::coupon_apply")}
                               .disabled=${this._draft.trim().length===0}
                               .loading=${this._busy}
                               @click=${this._apply}></hc-button>
                    <hc-button variant="ghost"
                               .label=${a("Hyperion_Checkout::cancel")}
                               @click=${()=>{this._open=!1,this._draft=""}}></hc-button>
                </div>
            </div>
        `:l`
                <button type="button"
                        class="text-sm font-medium text-accent hover:underline"
                        @click=${()=>{this._open=!0}}>
                    ${a("Hyperion_Checkout::coupon_have_code")}
                </button>
            `}}Z=new WeakMap;Y=new WeakMap;ee=new WeakMap;Se([b()],ae.prototype,"_draft");Se([b()],ae.prototype,"_open");Se([b()],ae.prototype,"_busy");customElements.get("coupon-form")||customElements.define("coupon-form",ae);class Ur extends m(_){createRenderRoot(){return this}render(){const t=u().items.get();return l`
            <section aria-labelledby="hc-summary-heading"
                     class="rounded-md border border-subtle bg-surface-raised p-4 space-y-3">
                <h2 id="hc-summary-heading" class="text-lg font-semibold text-brand">
                    ${a("Hyperion_Checkout::summary_heading")}
                </h2>
                <ul class="divide-y divide-subtle">
                    ${t.map(n=>l`<summary-item .item=${n}></summary-item>`)}
                </ul>
                <div class="border-t border-subtle pt-3">
                    <summary-totals></summary-totals>
                </div>
                <coupon-form></coupon-form>
            </section>
        `}}customElements.get("order-summary")||customElements.define("order-summary",Ur);function Fe(r){window.location.assign(r)}function Wr(r,e="/checkout/onepage/success"){return ct(r)??e}function ct(r){try{const e=new URL(r,window.location.origin);return e.origin!==window.location.origin||e.protocol!=="http:"&&e.protocol!=="https:"?null:e.toString()}catch{return null}}var Gr=Object.defineProperty,dt=(r,e,t,n)=>{for(var s=void 0,o=r.length-1,i;o>=0;o--)(i=r[o])&&(s=i(e,t,s)||s);return s&&Gr(e,t,s),s};function zr(r,e){if(!e.emailValid.get())return a("Hyperion_Checkout::checkout_incomplete_email");if(!e.shippingAddressValid.get())return a("Hyperion_Checkout::checkout_incomplete_shipping_address");if(!e.shippingMethodSelected.get()||!e.shippingReady.get())return a("Hyperion_Checkout::checkout_incomplete_shipping_method");if(!e.billingAddressValid.get()||!e.billingReady.get())return a("Hyperion_Checkout::checkout_incomplete_billing_address");if(!e.paymentMethodSelected.get()||!e.paymentMethodReady.get())return a("Hyperion_Checkout::checkout_incomplete_payment_method");if(!e.agreementsAccepted.get())return a("Hyperion_Checkout::checkout_incomplete_agreements");const t=r.minimumOrderError.get();return t!==null?t:r.totals.get()===null?a("Hyperion_Checkout::checkout_incomplete_totals"):null}class Ee extends m(_){constructor(){super(...arguments),this._selectors=wt(),this._preparing=!1,this._hint=null,this._onClick=async()=>{const e=u();if(!this._selectors.canPlaceOrder.get()){await this._revealMissing();return}const t=e.selectedPaymentMethod.get();if(!t||this._preparing)return;const n=q(t);if(n?.beforePlaceOrder){this._preparing=!0,e.globalError.set(null);try{const o=await n.beforePlaceOrder(),i=e.paymentMethodData.get();e.paymentMethodData.set({...i,[t]:o})}catch(o){e.globalError.set(o.message||a("Hyperion_Checkout::unexpected_error"));return}finally{this._preparing=!1}}if(n?.placeOrder){await this._placeThroughRenderer(n.placeOrder,n);return}if(await y().placeOrder()!==null){Fe(Wr(f().defaultSuccessPageUrl));return}n?.afterPlaceOrderFailed?.()}}createRenderRoot(){return this}willUpdate(){this._hint!==null&&this._selectors.canPlaceOrder.get()&&(this._hint=null)}render(){se.get();const e=u().selectedPaymentMethod.get();if(e&&q(e)?.ownsPlaceOrder?.())return p;const t=this._selectors.canPlaceOrder.get(),n=this._preparing||u().isPlacingOrder.get();return l`
            <hc-button variant="primary"
                       .label=${a(n?"Hyperion_Checkout::placing_order":"Hyperion_Checkout::place_order")}
                       .softDisabled=${!t}
                       .loading=${n}
                       @click=${this._onClick}></hc-button>
            ${this._hint!==null?l`<p class="mt-2 text-sm text-danger"
                          role="status"
                          tabindex="-1"
                          data-place-order-hint>${this._hint}</p>`:p}
        `}async _revealMissing(){const e=u();if(!this._selectors.emailValid.get()){const o=j(e.email.get());o&&e.fieldErrors.set({...e.fieldErrors.get(),email:a(o)})}Kt(),this._hint=zr(e,this._selectors),await this.updateComplete,await new Promise(o=>setTimeout(o,0)),((this.closest("checkout-app")??document).querySelector('[aria-invalid="true"]')??this.querySelector("[data-place-order-hint]"))?.focus()}async _placeThroughRenderer(e,t){const n=u();this._preparing=!0;let s=null;try{const o=await e();s=o===null?null:ct(o),o!==null&&s===null&&n.globalError.set(a("Hyperion_Checkout::unexpected_error"))}catch(o){n.globalError.set(o.message||a("Hyperion_Checkout::unexpected_error"))}if(s!==null){Fe(s);return}this._preparing=!1,t.afterPlaceOrderFailed?.()}}dt([b()],Ee.prototype,"_preparing");dt([b()],Ee.prototype,"_hint");customElements.get("place-order-button")||customElements.define("place-order-button",Ee);class Xr extends m(_){createRenderRoot(){return this}render(){return u().isPlacingOrder.get()?l`
            <div role="alert" aria-live="assertive"
                 class="fixed inset-0 z-50 bg-brand/60 flex items-center justify-center">
                <div class="bg-surface rounded-md p-6 shadow-lg max-w-sm text-center space-y-3">
                    <span class="inline-block w-10 h-10 rounded-full border-4 border-accent border-t-transparent animate-spin"></span>
                    <p class="text-sm font-medium text-brand">
                        ${a("Hyperion_Checkout::placing_order")}
                    </p>
                </div>
            </div>
        `:null}}customElements.get("loading-overlay")||customElements.define("loading-overlay",Xr);class Jr extends m(_){constructor(){super(...arguments),this._lastMessage=null}createRenderRoot(){return this}render(){const e=u(),t=e.globalError.get(),n=e.minimumOrderError.get();if(!t&&!n)return this._lastMessage=null,p;const s=t??n??"",o=s!==this._lastMessage;return this._lastMessage=s,o&&queueMicrotask(()=>{this.querySelector("[data-error-banner]")?.focus()}),l`
            <div role="alert"
                 aria-live="assertive"
                 tabindex="-1"
                 data-error-banner
                 class="rounded-md border border-danger/40 bg-danger/5 p-3 flex items-start gap-3 outline-none focus-visible:ring-2 focus-visible:ring-danger">
                <p class="flex-1 text-sm text-danger">${s}</p>
                ${t?l`<button type="button"
                                   class="text-xs text-danger hover:underline"
                                   @click=${()=>e.globalError.set(null)}>
                              ${a("Hyperion_Checkout::dismiss")}
                          </button>`:p}
            </div>
        `}}customElements.get("error-banner")||customElements.define("error-banner",Jr);class ut extends m(_){constructor(){super(...arguments),this._onLoginRequest=async()=>{const{inlineLogin:e}=await P(async()=>{const{inlineLogin:t}=await import("./login-action-pKt2nIsC.js");return{inlineLogin:t}},__vite__mapDeps([8,1,2]),import.meta.url);await e()}}createRenderRoot(){return this}render(){const e=u(),t=e.isVirtual.get(),n=e.customer.get()!==null;return l`
            <div class="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8 p-4">
                <main class="space-y-6" role="main">
                    <h1 class="text-2xl font-semibold text-brand">
                        ${a("Hyperion_Checkout::skeleton_heading")}
                    </h1>
                    <error-banner></error-banner>
                    <section aria-labelledby="hc-email-heading"
                             class="rounded-md border border-subtle bg-surface p-4 space-y-3">
                        <h2 id="hc-email-heading" class="text-lg font-semibold text-brand">
                            ${n?a("Hyperion_Checkout::signed_in_as"):a("Hyperion_Checkout::contact_heading")}
                        </h2>
                        ${n?l`<p class="text-sm text-muted">${e.email.get()}</p>`:l`<checkout-email @login-request=${this._onLoginRequest}></checkout-email>`}
                    </section>
                    ${t?null:l`
                              <section aria-labelledby="hc-shipping-heading"
                                       class="rounded-md border border-subtle bg-surface p-4 space-y-3">
                                  <h2 id="hc-shipping-heading" class="text-lg font-semibold text-brand">
                                      ${a("Hyperion_Checkout::shipping_heading")}
                                  </h2>
                                  <checkout-shipping></checkout-shipping>
                              </section>
                          `}
                    <checkout-gift-message></checkout-gift-message>
                    <section aria-labelledby="hc-payment-heading"
                             class="rounded-md border border-subtle bg-surface p-4 space-y-3">
                        <h2 id="hc-payment-heading" class="text-lg font-semibold text-brand">
                            ${a("Hyperion_Checkout::payment_heading")}
                        </h2>
                        <checkout-payment></checkout-payment>
                        <checkout-agreements></checkout-agreements>
                        <div class="pt-3 border-t border-subtle space-y-3">
                            <hc-recaptcha-badge></hc-recaptcha-badge>
                            <place-order-button></place-order-button>
                        </div>
                    </section>
                </main>
                <aside class="lg:sticky lg:top-4 lg:self-start">
                    <order-summary></order-summary>
                </aside>
            </div>
            <loading-overlay></loading-overlay>
        `}}customElements.get("checkout-app")||customElements.define("checkout-app",ut);const es=Object.freeze(Object.defineProperty({__proto__:null,CheckoutApp:ut},Symbol.toStringTag,{value:"Module"}));export{Yr as a,ct as b,Fe as c,es as d,m as e,mr as f,Zr as l,d as n,b as r};
//# sourceMappingURL=checkout-app-DW9Judp3.js.map
