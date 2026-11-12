const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./payment-braintree-card-Bf7jTqib.js","./checkout-Cxs_U9o1.js","./checkout-BbXIsIxw.css","./quote-DK-4zgfG.js","./hosted-field-styles-COtbkv2G.js","./three-d-secure-B7foVYlt.js","./payment-braintree-paypal-SpdM1rPI.js","./line-items-DEcpzVNH.js","./payment-braintree-vault-j2HTQyP_.js","./payment-braintree-googlepay-BTM-hHBo.js","./checkout-gate-DErpuw5i.js","./payment-paypal-express-gHDlzvzq.js","./login-action-CI07Z5-S.js"])))=>i.map(i=>d[i]);
import{S as R,f as yt,u as vt,i as _,b as l,A as p,d as Le,a as $t,g as u,t as a,E as xt,c as b,e as kt,r as wt,p as Ct,h as St,j as Et,k as At,l as ie,m as v,n as q,o as je,_ as w,q as He,s as Pt,v as Ve,M as Ht,w as Rt}from"./checkout-Cxs_U9o1.js";/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Ot=Symbol("SignalWatcherBrand"),Mt=new FinalizationRegistry((({watcher:r,signal:e})=>{r.unwatch(e)})),Re=new WeakMap;function g(r){return r[Ot]===!0?(console.warn("SignalWatcher should not be applied to the same class more than once."),r):class extends r{constructor(){super(...arguments),this._$St=new R.State(0),this._$Si=!1,this._$So=!0,this._$Sh=new Set}_$Sl(){if(this._$Su!==void 0)return;this._$Sv=new R.Computed((()=>{this._$St.get(),super.performUpdate()}));const e=this._$Su=new R.subtle.Watcher((function(){const t=Re.get(this);t!==void 0&&(t._$Si===!1&&t.requestUpdate(),this.watch())}));Re.set(e,this),Mt.register(this,{watcher:e,signal:this._$Sv}),e.watch(this._$Sv)}_$Sp(){this._$Su!==void 0&&(this._$Su.unwatch(this._$Sv),this._$Sv=void 0,this._$Su=void 0)}performUpdate(){this.isUpdatePending&&(this._$Sl(),this._$Si=!0,this._$St.set(this._$St.get()+1),this._$Si=!1,this._$Sv.get())}update(e){try{this._$So?(this._$So=!1,super.update(e)):this._$Sh.forEach((t=>t.commit()))}finally{this.isUpdatePending=!1,this._$Sh.clear()}}requestUpdate(e,t,n){this._$So=!0,super.requestUpdate(e,t,n)}connectedCallback(){super.connectedCallback(),this.requestUpdate()}disconnectedCallback(){super.disconnectedCallback(),queueMicrotask((()=>{this.isConnected===!1&&this._$Sp()}))}_(e){this._$Sh.add(e);const t=this._$So;this.requestUpdate(),this._$So=t}m(e){this._$Sh.delete(e)}}}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Tt={CHILD:2},Ue=r=>(...e)=>({_$litDirective$:r,values:e});let We=class{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,t,n){this._$Ct=e,this._$AM=t,this._$Ci=n}_$AS(e,t){return this.update(e,t)}update(e,t){return this.render(...t)}};/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Bt={},qt=(r,e=Bt)=>r._$AH=e;/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */R.State;R.Computed;/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Ft={attribute:!0,type:String,converter:vt,reflect:!1,hasChanged:yt},Nt=(r=Ft,e,t)=>{const{kind:n,metadata:s}=t;let i=globalThis.litPropertyMetadata.get(s);if(i===void 0&&globalThis.litPropertyMetadata.set(s,i=new Map),n==="setter"&&((r=Object.create(r)).wrapped=!0),i.set(t.name,r),n==="accessor"){const{name:o}=t;return{set(c){const d=e.get.call(this);e.set.call(this,c),this.requestUpdate(o,d,r,!0,c)},init(c){return c!==void 0&&this.C(o,void 0,r,c),c}}}if(n==="setter"){const{name:o}=t;return function(c){const d=this[o];e.call(this,c),this.requestUpdate(o,d,r,!0,c)}}throw Error("Unsupported decorator location: "+n)};function h(r){return(e,t)=>typeof t=="object"?Nt(r,e,t):((n,s,i)=>{const o=s.hasOwnProperty(i);return s.constructor.createProperty(i,n),o?Object.getOwnPropertyDescriptor(s,i):void 0})(r,e,t)}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */function f(r){return h({...r,state:!0,attribute:!1})}const G=r=>r?/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r)?null:"Hyperion_Checkout::validation_email":"Hyperion_Checkout::validation_required";var It=Object.defineProperty,k=(r,e,t,n)=>{for(var s=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(s=o(e,t,s)||s);return s&&It(e,t,s),s};class $ extends _{constructor(){super(...arguments),this.label="",this.name="",this.value="",this.type="text",this.placeholder="",this.autocomplete="",this.required=!1,this.error="",this.warning="",this.inputmode=""}createRenderRoot(){return this}render(){const e=`hc-input-${this.name||Math.random().toString(36).slice(2)}`,t=[this.error?`${e}-err`:"",this.warning?`${e}-warn`:""].filter(Boolean).join(" ");return l`
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
        `}_onInput(e){const t=e.target;this.value=t.value,this.dispatchEvent(new CustomEvent("value-change",{detail:{value:t.value,name:this.name},bubbles:!0,composed:!0}))}_onBlur(){this.dispatchEvent(new CustomEvent("value-blur",{detail:{value:this.value,name:this.name},bubbles:!0,composed:!0}))}}k([h({type:String})],$.prototype,"label");k([h({type:String})],$.prototype,"name");k([h({type:String})],$.prototype,"value");k([h({type:String})],$.prototype,"type");k([h({type:String})],$.prototype,"placeholder");k([h({type:String})],$.prototype,"autocomplete");k([h({type:Boolean,reflect:!0})],$.prototype,"required");k([h({type:String})],$.prototype,"error");k([h({type:String})],$.prototype,"warning");k([h({type:String})],$.prototype,"inputmode");customElements.get("hc-text-input")||customElements.define("hc-text-input",$);var Dt=Object.defineProperty,N=(r,e,t,n)=>{for(var s=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(s=o(e,t,s)||s);return s&&Dt(e,t,s),s};class M extends _{constructor(){super(...arguments),this.variant="primary",this.disabled=!1,this.softDisabled=!1,this.loading=!1,this.type="button",this.label=""}createRenderRoot(){return this}render(){const e="inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:cursor-not-allowed",t={primary:"bg-accent text-on-accent hover:bg-accent/90",secondary:"bg-surface-raised text-brand border border-subtle hover:bg-subtle",ghost:"bg-transparent text-accent hover:underline"};return l`
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
        `}_onClick(e){(this.disabled||this.loading)&&(e.preventDefault(),e.stopPropagation())}}N([h({type:String})],M.prototype,"variant");N([h({type:Boolean})],M.prototype,"disabled");N([h({type:Boolean})],M.prototype,"softDisabled");N([h({type:Boolean})],M.prototype,"loading");N([h({type:String})],M.prototype,"type");N([h({type:String})],M.prototype,"label");customElements.get("hc-button")||customElements.define("hc-button",M);var Lt=Object.defineProperty,jt=Object.getOwnPropertyDescriptor,Ge=r=>{throw TypeError(r)},Vt=(r,e,t,n)=>{for(var s=jt(e,t),i=r.length-1,o;i>=0;i--)(o=r[i])&&(s=o(e,t,s)||s);return s&&Lt(e,t,s),s},ze=(r,e,t)=>e.has(r)||Ge("Cannot "+t),Ut=(r,e,t)=>(ze(r,e,"read from private field"),t?t.call(r):e.get(r)),Wt=(r,e,t)=>e.has(r)?Ge("Cannot add the same private member more than once"):e instanceof WeakSet?e.add(r):e.set(r,t),Gt=(r,e,t,n)=>(ze(r,e,"write to private field"),e.set(r,t),t),z;class Xe extends g(_){constructor(){super(...arguments),Wt(this,z,!1),this._checkAvailability=Le(e=>{if(G(e)!==null){this._checking=!1;return}this._checking=!0,$t({customerEmail:e}).then(t=>{u().emailExists.set(!t)}).catch(()=>{}).finally(()=>{this._checking=!1})},500)}get _checking(){return Ut(this,z)}set _checking(e){Gt(this,z,e)}createRenderRoot(){return this}render(){const e=u(),t=e.email.get(),n=e.emailExists.get(),s=e.loginError.get(),o=e.fieldErrors.get().email??"";return l`
            <div class="space-y-3">
                <hc-text-input
                    label=${a("Hyperion_Checkout::email_label")}
                    name="email"
                    type="email"
                    autocomplete="email"
                    inputmode="email"
                    .value=${t}
                    .required=${!0}
                    .error=${o}
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
        `}_onEmailInput(e){const t=u();t.email.set(e.detail.value);const n=G(e.detail.value),s={...t.fieldErrors.get()};n?s.email=a(n):delete s.email,t.fieldErrors.set(s),this._checkAvailability(e.detail.value)}_onEmailBlur(e){const t=u(),n=G(e.detail.value);if(n){const s={...t.fieldErrors.get()};s.email=a(n),t.fieldErrors.set(s)}}_onPasswordInput(e){const t=u();t.password.set(e.detail.value),t.loginError.get()&&t.loginError.set(null)}_onLoginClick(){this.dispatchEvent(new CustomEvent("login-request",{bubbles:!0,composed:!0}))}_onContinueAsGuestClick(){const e=u();e.emailExists.set(!1),e.password.set(""),e.loginError.set(null)}}z=new WeakMap;Vt([f()],Xe.prototype,"_checking");customElements.get("checkout-email")||customElements.define("checkout-email",Xe);/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */class ve extends We{constructor(e){if(super(e),this.it=p,e.type!==Tt.CHILD)throw Error(this.constructor.directiveName+"() can only be used in child bindings")}render(e){if(e===p||e==null)return this._t=void 0,this.it=e;if(e===xt)return e;if(typeof e!="string")throw Error(this.constructor.directiveName+"() called with a non-string value");if(e===this.it)return this._t;this.it=e;const t=[e];return t.raw=t,this._t={_$litType$:this.constructor.resultType,strings:t,values:[]}}}ve.directiveName="unsafeHTML",ve.resultType=1;const zt=Ue(ve),Xt=["p","br","strong","em","b","i","u","ul","ol","li","a","span","div","h1","h2","h3","h4","h5","h6"],Jt=["href","title","rel","target"],Kt=["http:","https:","mailto:","tel:"],Je=new Set(["script","style","template","noscript","iframe","object","embed","svg","math","textarea","title","head"]);function Ke(r){const e=new DOMParser().parseFromString(`<div>${r}</div>`,"text/html");return{doc:e,root:e.body.firstElementChild}}function Qt(r,e){try{return e.has(new URL(r,window.location.origin).protocol)}catch{return!1}}function Zt(r,e,t){for(const o of Array.from(r.attributes)){const c=o.name.toLowerCase();t.linkAttributes.has(c)&&e.setAttribute(c,o.value)}const n=e.getAttribute("href")??"";n&&!Qt(n.trim(),t.linkProtocols)&&e.removeAttribute("href");const s=e.getAttribute("target");s!==null&&s!=="_blank"&&e.removeAttribute("target");const i=e.getAttribute("href")??"";(/^https?:/i.test(i)||e.getAttribute("target")==="_blank")&&e.setAttribute("rel","noopener noreferrer")}function $e(r,e,t,n){e.childNodes.forEach(s=>{if(s.nodeType===3){t.appendChild(r.createTextNode(s.textContent??""));return}if(s.nodeType!==1)return;const i=s,o=i.tagName.toLowerCase();if(Je.has(o))return;if(!n.tags.has(o)){$e(r,i,t,n);return}const c=r.createElement(o);o==="a"&&Zt(i,c,n),$e(r,i,c,n),t.appendChild(c)})}function Yt(r,e={}){const{doc:t,root:n}=Ke(String(r??""));if(!n)return"";const s=t.createElement("div");return $e(t,n,s,{tags:new Set(e.tags??Xt),linkAttributes:new Set(e.linkAttributes??Jt),linkProtocols:new Set(e.linkProtocols??Kt)}),s.innerHTML}function er(r){const{doc:e,root:t}=Ke(String(r??""));return t?(t.querySelectorAll(Array.from(Je).join(",")).forEach(n=>n.remove()),t.querySelectorAll("br").forEach(n=>n.replaceWith(e.createTextNode(", "))),(t.textContent??"").replace(/\s+/g," ").replace(/ ,/g,",").trim()):""}function oe(r){return Yt(r)}const F=new R.State(0);function tr(){F.set(F.get()+1)}var rr=Object.defineProperty,T=(r,e,t,n)=>{for(var s=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(s=o(e,t,s)||s);return s&&rr(e,t,s),s};class E extends _{constructor(){super(...arguments),this.label="",this.name="",this.value="",this.options=[],this.required=!1,this.error="",this.placeholder=""}createRenderRoot(){return this}render(){const e=`hc-select-${this.name||Math.random().toString(36).slice(2)}`;return l`
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
        `}_onChange(e){const t=e.target;this.value=t.value,this.dispatchEvent(new CustomEvent("value-change",{detail:{value:t.value,name:this.name},bubbles:!0,composed:!0}))}}T([h({type:String})],E.prototype,"label");T([h({type:String})],E.prototype,"name");T([h({type:String})],E.prototype,"value");T([h({type:Array})],E.prototype,"options");T([h({type:Boolean,reflect:!0})],E.prototype,"required");T([h({type:String})],E.prototype,"error");T([h({type:String})],E.prototype,"placeholder");customElements.get("hc-select-input")||customElements.define("hc-select-input",E);var sr=Object.defineProperty,xe=(r,e,t,n)=>{for(var s=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(s=o(e,t,s)||s);return s&&sr(e,t,s),s};class le extends _{constructor(){super(...arguments),this.label="",this.name="",this.checked=!1}createRenderRoot(){return this}render(){const e=`hc-cb-${this.name||Math.random().toString(36).slice(2)}`;return l`
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
        `}_onChange(e){const t=e.target;this.checked=t.checked,this.dispatchEvent(new CustomEvent("value-change",{detail:{checked:t.checked,name:this.name},bubbles:!0,composed:!0}))}}xe([h({type:String})],le.prototype,"label");xe([h({type:String})],le.prototype,"name");xe([h({type:Boolean})],le.prototype,"checked");customElements.get("hc-checkbox")||customElements.define("hc-checkbox",le);var nr=Object.defineProperty,ir=Object.getOwnPropertyDescriptor,Qe=r=>{throw TypeError(r)},B=(r,e,t,n)=>{for(var s=n>1?void 0:n?ir(e,t):e,i=r.length-1,o;i>=0;i--)(o=r[i])&&(s=(n?o(e,t,s):o(s))||s);return n&&s&&nr(e,t,s),s},Ze=(r,e,t)=>e.has(r)||Qe("Cannot "+t),he=(r,e,t)=>(Ze(r,e,"read from private field"),t?t.call(r):e.get(r)),pe=(r,e,t)=>e.has(r)?Qe("Cannot add the same private member more than once"):e instanceof WeakSet?e.add(r):e.set(r,t),_e=(r,e,t,n)=>(Ze(r,e,"write to private field"),e.set(r,t),t),X,J,K;const me=Et;function or(){const r=b(),e=r.directoryData??r.countryData;if(!e||typeof e!="object")return[];const t=[];for(const[n,s]of Object.entries(e)){if(!s||typeof s!="object")continue;const i=s,o=typeof i.name=="string"?i.name:n;t.push({id:n,name:o,is_region_required:i.is_region_required===!0,is_region_visible:i.is_region_visible!==!1})}return t.sort((n,s)=>n.name.localeCompare(s.name)),t}function Oe(r){const t=b().directoryData;if(!t||typeof t!="object")return[];const n=t[r];if(!n||typeof n!="object")return[];const s=n,i=s.regions&&typeof s.regions=="object"?s.regions:s,o=[];for(const[c,d]of Object.entries(i)){if(!d||typeof d!="object")continue;const m=d,x=typeof m.name=="string"?m.name:null,P=typeof m.code=="string"?m.code:"";x&&o.push({id:c,code:P,name:x})}return o}class A extends g(_){constructor(){super(...arguments),this.mode="shipping",this.value=null,this.showSaveInAddressBook=!1,this.serverErrors={},pe(this,X,{}),pe(this,J,{}),pe(this,K,!1),this._validationBaseline=0}get _local(){return he(this,X)}set _local(e){_e(this,X,e)}get _touched(){return he(this,J)}set _touched(e){_e(this,J,e)}get _revealAll(){return he(this,K)}set _revealAll(e){_e(this,K,e)}createRenderRoot(){return this}willUpdate(e){e.has("value")&&this.value&&(this._local={...this.value}),(e.has("value")||e.has("showSaveInAddressBook"))&&this._initSaveInAddressBook(),!this._revealAll&&F.get()>this._validationBaseline&&(this._revealAll=!0)}connectedCallback(){super.connectedCallback(),this._validationBaseline=F.get(),this.value&&Object.keys(this._local).length===0&&(this._local={...this.value});let e=!1;if(!this._local.country_id){const t=b().defaultCountryId;this._local={...this._local,country_id:t},e=!0}this._initSaveInAddressBook()&&(e=!0),e&&this._emit()}_initSaveInAddressBook(){if(typeof this._local.save_in_address_book=="boolean")return!1;const e=this._local.id!=null&&this._local.id!=="";return this._local={...this._local,save_in_address_book:this.showSaveInAddressBook&&!e},!0}render(){const e=me(),t=or(),n=this._local.country_id??"",s=n?Oe(n):[],i=t.find(y=>y.id===n),o=kt(n,e),c=s.length>0,d=i?.is_region_required===!0||c,m=i?.is_region_visible!==!1,x=this._local.street??[],P=[];for(let y=0;y<e.streetLines;y++)P.push(x[y]??"");const C=wt();return l`
            <div class="space-y-3">
                ${this._renderNameField("prefix",C.prefix,"honorific-prefix")}
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
                ${this._renderNameField("middlename",C.middlename,"additional-name")}
                ${this._renderNameField("suffix",C.suffix,"honorific-suffix")}

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

                ${P.map((y,S)=>l`
                        <hc-text-input
                            label=${S===0?a("Hyperion_Checkout::street_label_primary"):a("Hyperion_Checkout::street_label_additional",{n:String(S+1)})}
                            name=${`street_${S}`}
                            autocomplete=${S===0?"address-line1":`address-line${S+1}`}
                            .value=${y}
                            .required=${S===0}
                            .error=${S===0?this._errorFor("street"):""}
                            @value-change=${this._onStreetChange}
                            @value-blur=${this._onBlur}
                            data-index=${S}
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
                    ${m?c?l`
                                  <hc-select-input
                                      label=${a("Hyperion_Checkout::region_label")}
                                      name="region_id"
                                      placeholder=${a("Hyperion_Checkout::region_placeholder")}
                                      .options=${s.map(y=>({value:y.id,label:y.name}))}
                                      .value=${this._local.region_id??""}
                                      .required=${d}
                                      .error=${this._errorFor("region_id",d)}
                                      @value-change=${this._onRegionSelectChange}
                                  ></hc-select-input>
                              `:l`
                                  <hc-text-input
                                      label=${a("Hyperion_Checkout::region_label")}
                                      name="region"
                                      autocomplete="address-level1"
                                      .value=${this._local.region??""}
                                      .required=${d}
                                      .error=${this._errorFor("region",d)}
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
                        .required=${o}
                        .error=${this._errorFor("postcode",o)}
                        .warning=${this._warningFor("postcode")}
                        @value-change=${this._onFieldChange}
                        @value-blur=${this._onBlur}
                    ></hc-text-input>
                    <hc-select-input
                        label=${a("Hyperion_Checkout::country_label")}
                        name="country_id"
                        .options=${t.map(y=>({value:y.id,label:y.name}))}
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
        `}_renderNameField(e,t,n){if(t.show==="no")return p;const s=t.show==="req",i=a(`Hyperion_Checkout::${e}_label`),o=this._local[e]??"",c=t.options??[];if(c.length>0){const d=c.includes(o)||o===""?c:[o,...c];return l`
                <div class="md:max-w-xs">
                    <hc-select-input
                        label=${i}
                        name=${e}
                        placeholder=${a("Hyperion_Checkout::name_option_placeholder")}
                        .options=${d.map(m=>({value:m,label:m}))}
                        .value=${o}
                        .required=${s}
                        .error=${this._errorFor(e,s)}
                        @value-change=${this._onNameSelectChange}
                    ></hc-select-input>
                </div>
            `}return l`
            <div class=${e==="middlename"?"":"md:max-w-xs"}>
                <hc-text-input
                    label=${i}
                    name=${e}
                    autocomplete=${n}
                    .value=${o}
                    .required=${s}
                    .error=${this._errorFor(e,s)}
                    @value-change=${this._onFieldChange}
                    @value-blur=${this._onBlur}
                ></hc-text-input>
            </div>
        `}_onNameSelectChange(e){this._touched={...this._touched,[e.detail.name]:!0},this._onFieldChange(e)}_errorFor(e,t=!1){const n=this.serverErrors[e];if(n)return n;if(!(this._revealAll||this._touched[e]===!0))return"";if(e==="street"){const o=this._local.street??[];return!o[0]||o[0].trim().length===0?a("Hyperion_Checkout::validation_required"):""}if(!t)return"";const i=this._local[e];return i==null?a("Hyperion_Checkout::validation_required"):typeof i=="string"&&i.trim().length===0?a("Hyperion_Checkout::validation_required"):""}_warningFor(e){if(e!=="postcode"||this.serverErrors[e]||!(this._revealAll||this._touched[e]===!0))return"";const n=Ct(this._local.postcode,this._local.country_id??"",me());return n===null?"":a("Hyperion_Checkout::validation_postcode",{example:n.examples.join(", ")})}_onFieldChange(e){this._local={...this._local,[e.detail.name]:e.detail.value},this._emit()}_onStreetChange(e){const n=e.target.getAttribute("data-index"),s=n?Number(n):0,i=[...this._local.street??[]];for(;i.length<s+1;)i.push("");i[s]=e.detail.value,this._local={...this._local,street:i},this._emit()}_onCountryChange(e){this._local={...this._local,country_id:e.detail.value,region_id:null,region:null},this._emit()}_onRegionSelectChange(e){const n=Oe(this._local.country_id??"").find(s=>s.id===e.detail.value);this._local={...this._local,region_id:e.detail.value,region:n?{region:n.name,region_code:n.code,region_id:Number(n.id)}:null},this._emit()}_onBlur(e){this._touched={...this._touched,[e.detail.name]:!0}}_onSaveToggle(e){this._local={...this._local,save_in_address_book:e.detail.checked},this._emit()}_emit(){this.dispatchEvent(new CustomEvent("address-change",{detail:this._local,bubbles:!0,composed:!0})),this.dispatchEvent(new CustomEvent("address-valid",{detail:this._isComplete(),bubbles:!0,composed:!0}))}_isComplete(){return St(this._local,me())}}X=new WeakMap;J=new WeakMap;K=new WeakMap;B([h({type:String})],A.prototype,"mode",2);B([h({type:Object})],A.prototype,"value",2);B([h({type:Boolean})],A.prototype,"showSaveInAddressBook",2);B([h({type:Object})],A.prototype,"serverErrors",2);B([f()],A.prototype,"_local",1);B([f()],A.prototype,"_touched",1);B([f()],A.prototype,"_revealAll",1);customElements.get("address-form")||customElements.define("address-form",A);var ar=Object.defineProperty,lr=(r,e,t,n)=>{for(var s=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(s=o(e,t,s)||s);return s&&ar(e,t,s),s};class Ye extends _{createRenderRoot(){return this}render(){const e=this.address,t=e.street.filter(s=>s.trim().length>0).join(", "),n=typeof e.region=="object"&&e.region?.region?e.region.region:"";return l`
            <div class="text-sm text-brand space-y-0.5">
                <p class="font-semibold">${At(e)}</p>
                ${e.company?l`<p class="text-muted">${e.company}</p>`:null}
                <p>${t}</p>
                <p>
                    ${[e.city,n,e.postcode].filter(Boolean).join(", ")}
                </p>
                <p>${e.country_id}</p>
                ${e.telephone?l`<p class="text-muted">${e.telephone}</p>`:null}
            </div>
        `}}lr([h({type:Object})],Ye.prototype,"address");customElements.get("address-card")||customElements.define("address-card",Ye);var cr=Object.defineProperty,dr=Object.getOwnPropertyDescriptor,et=r=>{throw TypeError(r)},tt=(r,e,t,n)=>{for(var s=n>1?void 0:n?dr(e,t):e,i=r.length-1,o;i>=0;i--)(o=r[i])&&(s=(n?o(e,t,s):o(s))||s);return n&&s&&cr(e,t,s),s},rt=(r,e,t)=>e.has(r)||et("Cannot "+t),ur=(r,e,t)=>(rt(r,e,"read from private field"),t?t.call(r):e.get(r)),hr=(r,e,t)=>e.has(r)?et("Cannot add the same private member more than once"):e instanceof WeakSet?e.add(r):e.set(r,t),pr=(r,e,t,n)=>(rt(r,e,"write to private field"),e.set(r,t),t),Q;class ke extends g(_){constructor(){super(...arguments),this.mode="shipping",hr(this,Q,!1),this._newAddressSeed=null,this._openNewForm=()=>{this._newAddressSeed=null,this._showNewForm=!0},this._closeNewForm=()=>{this._showNewForm=!1,this._newAddressSeed=null,this._clearSelection()}}get _showNewForm(){return ur(this,Q)}set _showNewForm(e){pr(this,Q,e)}createRenderRoot(){return this}render(){const e=u(),t=e.savedAddresses.get(),n=this.mode==="shipping"?e.selectedShippingAddressId.get():e.selectedBillingAddressId.get();return t.length===0?l`
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
        `}_currentAddress(){const e=u();return this.mode==="shipping"?e.shippingAddress.get():e.billingAddress.get()}_seedForNewAddress(){if(this._newAddressSeed===null){const t=u().customer.get(),n=this._currentAddress();this._newAddressSeed={country_id:b().defaultCountryId,street:[],city:"",firstname:t?.firstname??"",lastname:t?.lastname??"",telephone:n?.telephone??""}}return this._newAddressSeed}_selectSaved(e){const t=u();this._showNewForm=!1,this._newAddressSeed=null,this.mode==="shipping"?(t.selectedShippingAddressId.set(e.id??null),t.shippingAddress.set(e)):(t.selectedBillingAddressId.set(e.id??null),t.billingAddress.set(e)),this.dispatchEvent(new CustomEvent("saved-address-select",{detail:{address:e,mode:this.mode},bubbles:!0,composed:!0}))}_clearSelection(){const e=u();this.mode==="shipping"?(e.selectedShippingAddressId.set(null),e.shippingAddress.set(null)):(e.selectedBillingAddressId.set(null),e.billingAddress.set(null))}_onNewAddressChange(e){const t=u(),n={...e.detail};delete n.id,delete n.customer_id,this.mode==="shipping"?(t.selectedShippingAddressId.set(null),t.shippingAddress.set(n)):(t.selectedBillingAddressId.set(null),t.billingAddress.set(n))}}Q=new WeakMap;tt([h({type:String})],ke.prototype,"mode",2);tt([f()],ke.prototype,"_showNewForm",1);customElements.get("address-selector")||customElements.define("address-selector",ke);function O(r,e){const t=typeof r=="string"?Number(r):r;if(!Number.isFinite(t))return e.pattern.replace("%s","");const n=Math.max(0,e.requiredPrecision??e.precision??2),s=Math.abs(t).toFixed(n),[i,o=""]=s.split("."),c=e.groupLength>0?e.groupLength:3,d=(i??"0").split("").reverse(),m=[];for(let C=0;C<d.length;C+=c)m.push(d.slice(C,C+c).reverse().join(""));m.reverse();let x=m.join(e.groupSymbol);o.length>0&&(x=`${x}${e.decimalSymbol}${o}`);const P=e.pattern.replace("%s",x);return t<0?`-${P}`:P}var _r=Object.defineProperty,st=(r,e,t,n)=>{for(var s=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(s=o(e,t,s)||s);return s&&_r(e,t,s),s};class we extends _{constructor(){super(...arguments),this.selected=!1}createRenderRoot(){return this}render(){const e=this.method,t=b(),n=ie(),s=e.price_incl_tax??e.amount??0,i=e.price_excl_tax??e.amount??0,o=t.isDisplayShippingBothPrices&&s!==i?`${O(i,n)} (${a("Hyperion_Checkout::total_incl_tax",{title:O(s,n)})})`:O(t.isDisplayShippingPriceExclTax?i:s,n),c=`hc-ship-${e.carrier_code}-${e.method_code}`,d=e.available!==!1&&!!e.method_code,m=this.selected&&d;return l`
            <label for=${c}
                   class="flex items-start justify-between gap-3 rounded-md border p-3 ${d?"cursor-pointer":"cursor-not-allowed"} ${m?"border-accent bg-accent/5":"border-subtle hover:border-accent bg-surface"}">
                <span class="flex items-start gap-3">
                    <input
                        id=${c}
                        type="radio"
                        name="shipping_method"
                        class="mt-0.5 h-4 w-4 text-accent focus:ring-2 focus:ring-accent"
                        .checked=${m}
                        ?disabled=${!d}
                        @change=${this._onSelect}
                    />
                    <span>
                        <span class="block text-sm font-medium text-brand">
                            ${d?l`${e.carrier_title}${" "}-- ${e.method_title}`:e.carrier_title}
                        </span>
                        ${e.error_message?l`<span class="block text-xs text-danger mt-0.5">${e.error_message}</span>`:null}
                    </span>
                </span>
                ${d?l`<span class="text-sm font-semibold text-brand whitespace-nowrap">${o}</span>`:null}
            </label>
        `}_onSelect(){this.dispatchEvent(new CustomEvent("method-select",{detail:{carrier_code:this.method.carrier_code,method_code:this.method.method_code},bubbles:!0,composed:!0}))}}st([h({type:Object})],we.prototype,"method");st([h({type:Boolean})],we.prototype,"selected");customElements.get("shipping-method-row")||customElements.define("shipping-method-row",we);class mr extends g(_){createRenderRoot(){return this}render(){const e=u(),t=e.availableShippingMethods.get(),n=e.isLoadingShippingMethods.get(),s=e.selectedShippingMethod.get();return n&&t.length===0?l`<p class="text-sm text-muted" role="status" aria-live="polite">
                ${a("Hyperion_Checkout::shipping_calculating")}
            </p>`:t.length===0?l`<p class="text-sm text-muted">
                ${a("Hyperion_Checkout::shipping_waiting_for_address")}
            </p>`:l`
            <div role="radiogroup"
                 aria-label=${a("Hyperion_Checkout::shipping_method_aria")}
                 class="space-y-2">
                ${t.map(i=>l`
                    <shipping-method-row
                        .method=${i}
                        .selected=${s?.carrier_code===i.carrier_code&&s.method_code===i.method_code}
                        @method-select=${this._onSelect}
                    ></shipping-method-row>
                `)}
                ${n?l`<p class="text-xs text-muted">${a("Hyperion_Checkout::shipping_updating")}</p>`:p}
            </div>
        `}_onSelect(e){u().selectedShippingMethod.set(e.detail),v().saveShippingAndEstimateTotals()}}customElements.get("shipping-method-list")||customElements.define("shipping-method-list",mr);class gr extends g(_){constructor(){super(...arguments),this._openPolicy=()=>{const e=this.querySelector("dialog[data-hyperion-shipping-policy]");e&&(typeof e.showModal=="function"?e.showModal():e.setAttribute("open",""))},this._closePolicy=()=>{const e=this.querySelector("dialog[data-hyperion-shipping-policy]");e&&(typeof e.close=="function"?e.close():e.removeAttribute("open"))}}createRenderRoot(){return this}render(){const e=u();if(e.isVirtual.get())return null;const t=e.shippingAddress.get(),n=e.savedAddresses.get(),s=e.customer.get()!==null&&n.length>0;return l`
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
        `}_renderShippingPolicy(){const e=b().shippingPolicy;if(!e||!e.isEnabled)return p;const t=oe(e.shippingPolicyContent??"");return t.trim()===""?p:l`
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
                        <div class="text-sm text-brand space-y-2 max-h-[60vh] overflow-y-auto">${zt(t)}</div>
                        <div class="flex justify-end">
                            <hc-button variant="secondary"
                                       .label=${a("Hyperion_Checkout::shipping_policy_close")}
                                       @click=${this._closePolicy}></hc-button>
                        </div>
                    </div>
                </dialog>
            </div>
        `}_onAddressChange(e){u().shippingAddress.set(e.detail),v().scheduleShippingEstimate()}_onSavedPick(){v().estimateShippingNow()}}customElements.get("checkout-shipping")||customElements.define("checkout-shipping",gr);const Ce=new Map;function rs(r){Ce.set(r.code,r),je({code:r.code,component:"payment-vault",beforePlaceOrder:async()=>{const e=Se(r.code);if(!e)throw new Error(a("Hyperion_Checkout::vault_no_token_selected"));return(r.beforePlaceOrder??$r)(e)}})}function nt(r){return Ce.get(r)??null}function fr(r){const e=b().vault;return e&&typeof e=="object"&&r in e?!0:it().some(t=>t.code===r)}function it(r){const e=b().payment?.vault;if(!e||typeof e!="object")return[];const t=[];for(const[n,s]of Object.entries(e)){const i=s?.config;if(!i||typeof i!="object")continue;const o=typeof i.code=="string"?i.code:"",c=typeof i.publicHash=="string"?i.publicHash:"";if(!o||!c||r!==void 0&&o!==r)continue;const d=i.details;t.push({key:n,code:o,publicHash:c,nonceUrl:typeof i.nonceUrl=="string"?i.nonceUrl:null,details:d&&typeof d=="object"?d:{}})}return t}function ot(r){return Ce.has(r)?it(r):[]}function Se(r){const e=ot(r),t=u().paymentMethodData.get()[r]?.public_hash;return e.find(n=>n.publicHash===t)??e[0]??null}function br(r){const e=[],t=[];for(const n of r){if(fr(n.code)){for(const i of ot(n.code))e.push({method:n,token:i});continue}const s=q(n.code)?.isAvailable;s&&!s(n)||t.push({method:n,token:null})}return[...e,...t]}function yr(r,e){const t=u();t.paymentMethodData.set({...t.paymentMethodData.get(),[r]:{public_hash:e}}),t.selectedPaymentMethod.set(r)}async function vr(r){const e=d=>new Error(typeof d=="string"&&d?d:a("Hyperion_Checkout::vault_nonce_failed"));if(!r.nonceUrl)throw e();const t=new URL(r.nonceUrl,window.location.href);if(t.origin!==window.location.origin)throw e();t.searchParams.set("public_hash",r.publicHash);let n,s;try{n=await fetch(t.toString(),{method:"GET",credentials:"same-origin",headers:{Accept:"application/json","X-Requested-With":"XMLHttpRequest"}}),s=await n.json().catch(()=>null)}catch{throw e()}const i=s?.paymentMethodNonce;if(!n.ok||typeof i!="string"||!i)throw e(s?.message);const o=s?.details,c=o&&typeof o=="object"?o.bin:"";return{nonce:i,bin:typeof c=="string"?c:""}}async function $r(r){const{nonce:e}=await vr(r);return{public_hash:r.publicHash,payment_method_nonce:e}}const xr={braintree:()=>w(()=>import("./payment-braintree-card-Bf7jTqib.js"),__vite__mapDeps([0,1,2,3,4,5]),import.meta.url),braintree_paypal:()=>w(()=>import("./payment-braintree-paypal-SpdM1rPI.js"),__vite__mapDeps([6,1,2,3,7]),import.meta.url),braintree_cc_vault:()=>w(()=>import("./payment-braintree-vault-j2HTQyP_.js"),__vite__mapDeps([8,1,2,3,4,5]),import.meta.url),braintree_paypal_vault:()=>w(()=>import("./payment-braintree-vault-j2HTQyP_.js"),__vite__mapDeps([8,1,2,3,4,5]),import.meta.url),braintree_googlepay:()=>w(()=>import("./payment-braintree-googlepay-BTM-hHBo.js"),__vite__mapDeps([9,1,2,10,3,7,5]),import.meta.url),braintree_googlepay_vault:()=>w(()=>import("./payment-braintree-vault-j2HTQyP_.js"),__vite__mapDeps([8,1,2,3,4,5]),import.meta.url),paypal_express:()=>w(()=>import("./payment-paypal-express-gHDlzvzq.js"),__vite__mapDeps([11,1,2,10]),import.meta.url),payflow_express:()=>w(()=>import("./payment-paypal-express-gHDlzvzq.js"),__vite__mapDeps([11,1,2,10]),import.meta.url)},ae=new R.State(0),ge=new Set;function kr(r){for(const e of r){const t=xr[e];!t||ge.has(e)||(ge.add(e),t().then(()=>ae.set(ae.get()+1)).catch(n=>{ge.delete(e),console.error(`[hyperion-checkout] payment renderer for "${e}" failed to load`,n)}))}}var wr=Object.defineProperty,at=(r,e,t,n)=>{for(var s=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(s=o(e,t,s)||s);return s&&wr(e,t,s),s};const H="purchaseorder";function Me(){return String(u().paymentMethodData.get()[H]?.po_number??"").trim()}function Te(){return b().payment??{}}function j(r){return typeof r=="string"?r:""}class Ee extends g(_){constructor(){super(...arguments),this.code="",this._poTouched=!1,this._validationBaseline=0}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this._validationBaseline=F.get()}render(){const e=oe(j(Te().instructions?.[this.code]));return l`
            <div class="space-y-3">
                ${e?l`<div class="text-sm text-muted"
                                data-payment-instructions
                                .innerHTML=${e}></div>`:p}
                ${this.code==="checkmo"?this._renderCheckDetails():p}
                ${this.code===H?this._renderPoInput():p}
            </div>
        `}_renderCheckDetails(){const e=Te().checkmo??{},t=j(e.payableTo).trim(),n=oe(j(e.mailingAddress));return t===""&&n.trim()===""?p:l`
            <dl class="text-sm text-muted space-y-2" data-payment-check-details>
                ${t!==""?l`<div>
                              <dt class="font-medium text-brand">${a("Hyperion_Checkout::checkmo_payable_to")}</dt>
                              <dd data-payment-check-payable-to>${t}</dd>
                          </div>`:p}
                ${n.trim()!==""?l`<div>
                              <dt class="font-medium text-brand">${a("Hyperion_Checkout::checkmo_send_to")}</dt>
                              <dd data-payment-check-send-to .innerHTML=${n}></dd>
                          </div>`:p}
            </dl>
        `}_renderPoInput(){const t=u().paymentMethodData.get()[H]??{},n=j(t.po_number),i=(this._poTouched||F.get()>this._validationBaseline)&&n.trim()===""?a("Hyperion_Checkout::po_number_required"):"";return l`
            <hc-text-input
                label=${a("Hyperion_Checkout::po_number_label")}
                name="po_number"
                .value=${n}
                .required=${!0}
                .error=${i}
                @value-change=${this._onPoChange}
                @value-blur=${this._onPoBlur}
            ></hc-text-input>
        `}_onPoChange(e){const t=u(),n=t.paymentMethodData.get();t.paymentMethodData.set({...n,[H]:{...n[H]??{},po_number:e.detail.value}})}_onPoBlur(){this._poTouched=!0}}at([h({type:String})],Ee.prototype,"code");at([f()],Ee.prototype,"_poTouched");customElements.get("payment-offline")||customElements.define("payment-offline",Ee);function Cr(){for(const r of["checkmo","banktransfer","cashondelivery","free",H])je({code:r,component:"payment-offline",...r===H?{isReady:()=>Me()!=="",notReadyMessage:()=>a("Hyperion_Checkout::po_number_required"),beforePlaceOrder:async()=>{const e=Me();if(e==="")throw new Error(a("Hyperion_Checkout::po_number_required"));return{po_number:e}}}:{}})}Cr();var Sr=Object.defineProperty,Er=(r,e,t,n)=>{for(var s=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(s=o(e,t,s)||s);return s&&Sr(e,t,s),s};class lt extends _{constructor(){super(...arguments),this.code=""}createRenderRoot(){return this}render(){return l`
            <div role="alert"
                 class="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
                ${a("Hyperion_Checkout::payment_method_unavailable",{code:this.code})}
            </div>
        `}}Er([h({type:String})],lt.prototype,"code");customElements.get("payment-generic")||customElements.define("payment-generic",lt);/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Ar=Ue(class extends We{constructor(){super(...arguments),this.key=p}render(r,e){return this.key=r,e}update(r,[e,t]){return e!==this.key&&(qt(r),this.key=e),t}});var Pr=Object.defineProperty,Hr=(r,e,t,n)=>{for(var s=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(s=o(e,t,s)||s);return s&&Pr(e,t,s),s};class ct extends g(_){constructor(){super(...arguments),this.code=""}createRenderRoot(){return this}render(){const e=Se(this.code),t=e?nt(this.code)?.renderBody?.(e):null;return t?Ar(e?.publicHash,l`${t}`):p}}Hr([h({type:String})],ct.prototype,"code");customElements.get("payment-vault")||customElements.define("payment-vault",ct);var Rr=Object.defineProperty,ce=(r,e,t,n)=>{for(var s=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(s=o(e,t,s)||s);return s&&Rr(e,t,s),s};class D extends _{constructor(){super(...arguments),this.token=null,this.renderersVersion=0,this.selected=!1,this._body=null}createRenderRoot(){return this}render(){const e=this.method,t=q(e.code)!==null,n=He(e.code),s=this.token?`hc-pay-${this.token.key}`:`hc-pay-${e.code}`,i=this.token?nt(e.code)?.label(this.token)??e.title:e.title,o=!t&&!n;return l`
            <div class="rounded-md border ${this.selected?"border-accent bg-accent/5":"border-subtle bg-surface"} ${o?"opacity-60":""}">
                <label for=${s}
                       class="flex items-start gap-3 p-3 cursor-pointer ${o?"cursor-not-allowed":""}">
                    <input
                        id=${s}
                        type="radio"
                        name="payment_method"
                        class="mt-0.5 h-4 w-4 text-accent focus:ring-2 focus:ring-accent"
                        .checked=${this.selected}
                        ?disabled=${o}
                        @change=${this._onSelect}
                    />
                    <span class="text-sm">
                        <span class="font-medium text-brand">${i}</span>
                        ${o?l`<span class="block text-xs text-muted" data-payment-unsupported>
                                  ${a("Hyperion_Checkout::payment_method_unsupported_hint")}
                              </span>`:p}
                    </span>
                </label>
                ${this.selected?this._renderSelectedBody():this._dropBody()}
            </div>
        `}_renderSelectedBody(){const e=q(this.method.code),t=He(this.method.code);return e?l`<div class="px-3 pb-3">
                ${this._bodyElement(e.component,this.method.code)}
            </div>`:(this._body=null,t?null:l`<div class="px-3 pb-3">
            <payment-generic code=${this.method.code}></payment-generic>
        </div>`)}_bodyElement(e,t){const n=this._body;if(n&&n.localName===e&&n.getAttribute("code")===t)return n;const s=document.createElement(e);return s.setAttribute("code",t),this._body=s,s}_dropBody(){return this._body=null,null}_onSelect(){this.dispatchEvent(new CustomEvent("payment-select",{detail:{code:this.method.code,...this.token?{publicHash:this.token.publicHash}:{}},bubbles:!0,composed:!0}))}}ce([h({type:Object})],D.prototype,"method");ce([h({attribute:!1})],D.prototype,"token");ce([h({type:Number})],D.prototype,"renderersVersion");ce([h({type:Boolean})],D.prototype,"selected");customElements.get("payment-method-row")||customElements.define("payment-method-row",D);class Or extends g(_){createRenderRoot(){return this}render(){const e=u(),t=e.availablePaymentMethods.get();kr(t.map(o=>o.code));const n=ae.get(),s=br(t),i=e.selectedPaymentMethod.get();return s.length===0?l`<p class="text-sm text-muted" role="status" aria-live="polite">
                ${a("Hyperion_Checkout::payment_waiting_for_shipping")}
            </p>`:l`
            <div role="radiogroup"
                 aria-label=${a("Hyperion_Checkout::payment_method_aria")}
                 class="space-y-2">
                ${s.map(({method:o,token:c})=>l`
                    <payment-method-row
                        .method=${o}
                        .token=${c}
                        .renderersVersion=${n}
                        .selected=${i===o.code&&(c===null||Se(o.code)?.publicHash===c.publicHash)}
                        @payment-select=${this._onSelect}
                    ></payment-method-row>
                `)}
            </div>
        `}_onSelect(e){if(e.detail.publicHash){yr(e.detail.code,e.detail.publicHash);return}u().selectedPaymentMethod.set(e.detail.code)}}customElements.get("payment-method-list")||customElements.define("payment-method-list",Or);class Mr extends g(_){constructor(){super(...arguments),this._syncBilling=Le(()=>{v().syncBillingAddress()},500)}createRenderRoot(){return this}render(){const e=u(),t=e.isVirtual.get(),n=e.billingSameAsShipping.get(),s=e.billingAddress.get(),i=e.savedAddresses.get(),c=e.customer.get()!==null&&i.length>0?l`<address-selector mode="billing"
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
        `}_onToggle(e){u().billingSameAsShipping.set(e.detail.checked),v().invalidateBillingSync(),e.detail.checked||v().syncBillingAddress()}_onBillingChange(e){u().billingAddress.set(e.detail),v().invalidateBillingSync(),this._syncBilling()}_onSavedBillingPick(){v().invalidateBillingSync(),v().syncBillingAddress()}}customElements.get("checkout-payment")||customElements.define("checkout-payment",Mr);class Tr extends g(_){createRenderRoot(){return this}render(){const e=b().checkoutAgreements;if(!e||!e.isEnabled||!e.agreements)return p;const t=e.agreements.filter(s=>s.mode===Pt);if(t.length===0)return p;const n=new Set(u().acceptedAgreements.get());return l`
            <fieldset class="space-y-3 pt-3 border-t border-subtle"
                      aria-labelledby="hc-agreements-heading">
                <legend id="hc-agreements-heading" class="sr-only">
                    ${a("Hyperion_Checkout::agreements_heading")}
                </legend>
                ${t.map(s=>this._renderRow(s,n.has(s.agreementId)))}
            </fieldset>
        `}_renderRow(e,t){const n=`hc-agreement-${e.agreementId}`,s=`${n}-label`,i=`${n}-desc`,o=e.checkboxText||e.name||"";return l`
            <div class="space-y-2">
                <label for=${n} id=${s}
                       class="flex items-start gap-2 cursor-pointer text-sm text-brand">
                    <input
                        id=${n}
                        type="checkbox"
                        class="mt-0.5 h-4 w-4 rounded border-subtle text-accent focus:ring-2 focus:ring-accent"
                        .checked=${t}
                        aria-describedby=${i}
                        @change=${c=>this._onToggle(e.agreementId,c)}
                    />
                    <span>${o}</span>
                </label>
                ${e.content?l`<div id=${i}
                                class="text-xs text-muted pl-6 max-h-40 overflow-auto rounded border border-subtle bg-surface p-2"
                                .innerHTML=${oe(e.content)}></div>`:p}
            </div>
        `}_onToggle(e,t){const n=t.target.checked,s=u().acceptedAgreements,i=s.get();n?i.includes(e)||s.set([...i,e]):s.set(i.filter(o=>o!==e))}}customElements.get("checkout-agreements")||customElements.define("checkout-agreements",Tr);function dt(r,e){return e===null?`${r}/gift-message`:`${r}/gift-message/${encodeURIComponent(String(e))}`}function Br(r,e,t){return Ve(dt(`guest-carts/${encodeURIComponent(r)}`,e),{method:"POST",body:{giftMessage:t},auth:"guest"})}function qr(r,e){return Ve(dt("carts/mine",r),{method:"POST",body:{giftMessage:e},auth:"customer"})}var Fr=Object.defineProperty,Nr=Object.getOwnPropertyDescriptor,ut=r=>{throw TypeError(r)},de=(r,e,t,n)=>{for(var s=Nr(e,t),i=r.length-1,o;i>=0;i--)(o=r[i])&&(s=o(e,t,s)||s);return s&&Fr(e,t,s),s},ht=(r,e,t)=>e.has(r)||ut("Cannot "+t),V=(r,e,t)=>(ht(r,e,"read from private field"),t?t.call(r):e.get(r)),U=(r,e,t)=>e.has(r)?ut("Cannot add the same private member more than once"):e instanceof WeakSet?e.add(r):e.set(r,t),W=(r,e,t,n)=>(ht(r,e,"write to private field"),e.set(r,t),t),Z,Y,ee,te;const Be=2e3;function qe(r){return r===null?"order":String(r)}function Fe(r){return!r||r===!0?{sender:"",recipient:"",message:""}:{sender:typeof r.sender=="string"?r.sender:"",recipient:typeof r.recipient=="string"?r.recipient:"",message:typeof r.message=="string"?r.message:""}}function Ir(r,e){const t=r.isOrderLevelGiftOptionsEnabled===!0?Fe(r.giftMessage?.orderLevel):null,n=r.giftMessage?.itemLevel,s=n&&n!==!0?n:{},i=r.isItemLevelGiftOptionsEnabled===!0?e.filter(o=>o.is_virtual==="1"||o.is_virtual===1||o.is_virtual===!0?!1:s[String(o.item_id)]?.is_available!==!1).map(o=>({item:o,state:Fe(s[String(o.item_id)]?.message)})):[];return{order:t,items:i}}class L extends g(_){constructor(){super(...arguments),U(this,Z,!1),U(this,Y,{}),U(this,ee,{}),U(this,te,{}),this._save=async(e,t)=>{const n=qe(e),s=u(),i={sender:t.sender.trim(),recipient:t.recipient.trim(),message:t.message.trim().slice(0,Be)};this._busy={...this._busy,[n]:!0};try{s.isGuest.get()?await Br(s.maskedQuoteId.get()??"",e,i):await qr(e,i),this._notice={...this._notice,[n]:{tone:"success",text:i.message===""?a("Hyperion_Checkout::gift_removed"):a("Hyperion_Checkout::gift_saved")}}}catch(o){const c=o instanceof Ht?o.message:a("Hyperion_Checkout::gift_save_failed");this._notice={...this._notice,[n]:{tone:"error",text:c}}}finally{this._busy={...this._busy,[n]:!1}}}}get _open(){return V(this,Z)}set _open(e){W(this,Z,e)}get _forms(){return V(this,Y)}set _forms(e){W(this,Y,e)}get _busy(){return V(this,ee)}set _busy(e){W(this,ee,e)}get _notice(){return V(this,te)}set _notice(e){W(this,te,e)}createRenderRoot(){return this}render(){const e=b(),t=Ir(e,u().items.get());return t.order===null&&t.items.length===0?p:this._open?l`
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
            `}_renderForm(e,t,n){const s=qe(e),i=this._forms[s]??n,o=this._notice[s],c=(d,m)=>l`
            <hc-text-input
                label=${m}
                name=${`gift_${s}_${d}`}
                .value=${i[d]}
                @value-change=${x=>this._update(s,n,d,x.detail.value)}
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
                        maxlength=${String(Be)}
                        class="w-full rounded border border-subtle bg-surface px-3 py-2 text-sm text-brand focus:outline-none focus:ring-2 focus:ring-accent"
                        .value=${i.message}
                        @input=${d=>this._update(s,n,"message",d.target.value)}
                    ></textarea>
                </label>
                ${o?l`<p class=${o.tone==="error"?"text-sm text-error":"text-sm text-success"}
                              role="status" data-hyperion-gift-notice=${o.tone}>${o.text}</p>`:p}
                <div class="flex gap-2">
                    <hc-button variant="secondary"
                               .label=${a("Hyperion_Checkout::gift_save")}
                               .loading=${this._busy[s]===!0}
                               @click=${()=>this._save(e,i)}></hc-button>
                </div>
            </fieldset>
        `}_update(e,t,n,s){const i=this._forms[e]??t;if(this._forms={...this._forms,[e]:{...i,[n]:s}},this._notice[e]){const o={...this._notice};delete o[e],this._notice=o}}}Z=new WeakMap;Y=new WeakMap;ee=new WeakMap;te=new WeakMap;de([f()],L.prototype,"_open");de([f()],L.prototype,"_forms");de([f()],L.prototype,"_busy");de([f()],L.prototype,"_notice");customElements.get("checkout-gift-message")||customElements.define("checkout-gift-message",L);function Ne(r,e,t,n,s){return e==="both"?[{code:`${r.code}_excl`,label:s.exclTax(r.title),value:t,kind:"regular"},{code:`${r.code}_incl`,label:s.inclTax(r.title),value:n,kind:"regular"}]:[{code:r.code,label:r.title,value:e==="including"?n:t,kind:"regular"}]}function Dr(r,e){const t=Number(r.value);if(t===0&&!e.isZeroTaxDisplayed)return[];const n=[];if(e.isFullTaxSummaryDisplayed){const i=r.extension_attributes?.tax_grandtotal_details??[];for(const o of i)for(const c of o.rates??[]){const d=c.percent==null?"":` (${Number(c.percent)}%)`;n.push({code:"tax_rate",label:`${c.title??""}${d}`,value:Number(o.amount??0),kind:"detail"})}}return n.push({code:r.code,label:r.title,value:t,kind:"regular"}),n}function Lr(r,e,t){const n=[];for(const s of r.total_segments)switch(s.code){case"subtotal":n.push(...Ne(s,e.reviewTotalsDisplayMode,Number(r.subtotal),Number(r.subtotal_incl_tax),t));break;case"shipping":n.push(...Ne(s,e.reviewShippingDisplayMode,Number(r.shipping_amount),Number(r.shipping_incl_tax),t));break;case"tax":n.push(...Dr(s,e));break;case"grand_total":{const i=Number(s.value);e.includeTaxInGrandTotal?(n.push({code:"grand_total_excl",label:t.exclTax(s.title),value:i-Number(r.tax_amount),kind:"regular"}),n.push({code:s.code,label:t.inclTax(s.title),value:i,kind:"grand"})):n.push({code:s.code,label:s.title,value:i,kind:"grand"});break}default:n.push({code:s.code,label:s.title,value:Number(s.value),kind:"regular"})}return n}function jr(r,e,t){return r==="excluding"?e:t}function Vr(r,e=!1){const t=r.weee_tax_applied;if(t==null||t==="")return[];let n;try{n=typeof t=="string"?JSON.parse(t):t}catch{return[]}if(!Array.isArray(n))return[];const s=[];for(const i of n){if(!i||typeof i!="object")continue;const o=i,c=Number(e?o.amount_incl_tax??o.amount:o.amount),d=Number(e?o.row_amount_incl_tax??o.row_amount:o.row_amount);!Number.isFinite(d)||d<=0||s.push({title:typeof o.title=="string"&&o.title!==""?o.title:"FPT",amount:Number.isFinite(c)?c:0,rowAmount:d})}return s}var Ur=Object.defineProperty,Wr=(r,e,t,n)=>{for(var s=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(s=o(e,t,s)||s);return s&&Ur(e,t,s),s};class pt extends _{createRenderRoot(){return this}render(){const e=this.item,t=b(),n=e.thumbnail??this._imageFromConfig(t,String(e.item_id))??"",s=this._parseOptions(e.options),i=t.isWeeeEnabled?Vr(e,t.reviewItemPriceDisplayMode==="including"):[];return l`
            <li class="flex gap-3 py-2">
                ${n?l`<img src=${n} alt="" class="h-16 w-16 rounded border border-subtle object-cover bg-surface-raised" loading="lazy">`:l`<div class="h-16 w-16 rounded border border-subtle bg-surface-raised"></div>`}
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-brand truncate">${e.name}</p>
                    ${s.length>0?l`<ul class="text-xs text-muted space-y-0.5 mt-0.5">
                                ${s.map(o=>l`
                                    <li><span>${o.label}:</span> <span>${o.value}</span></li>
                                `)}
                            </ul>`:null}
                    ${i.length>0?l`<ul class="text-xs text-muted mt-0.5" data-hyperion-fpt>
                                ${i.map(o=>l`
                                    <li>${o.title}: ${O(o.rowAmount,ie())}</li>
                                `)}
                            </ul>`:null}
                    <p class="text-xs text-muted mt-1">${a("Hyperion_Checkout::qty_label")} ${String(e.qty)}</p>
                </div>
                <div class="text-sm font-semibold text-brand whitespace-nowrap">
                    ${O(this._rowTotal(e,t),ie())}
                </div>
            </li>
        `}_rowTotal(e,t){const n=Number(e.row_total),s=Number(e.row_total_incl_tax??e.row_total);return jr(t.reviewItemPriceDisplayMode,n,s)}_parseOptions(e){if(!e)return[];let t;if(typeof e=="string")try{const n=JSON.parse(e);t=Array.isArray(n)?n:[]}catch{return[]}else t=e;return t.map(n=>({label:String(n.label??""),value:er(String(n.value??""))}))}_imageFromConfig(e,t){const s=e.imageData;if(!s||typeof s!="object")return null;const i=s[t];if(!i||typeof i!="object")return null;const o=i.src;return typeof o=="string"?o:null}}Wr([h({type:Object})],pt.prototype,"item");customElements.get("summary-item")||customElements.define("summary-item",pt);class Gr extends g(_){createRenderRoot(){return this}render(){const t=u().totals.get();if(!t)return null;const n=ie(),s=Lr(t,b(),{exclTax:c=>a("Hyperion_Checkout::total_excl_tax",{title:c}),inclTax:c=>a("Hyperion_Checkout::total_incl_tax",{title:c})}),i=s.find(c=>c.kind==="grand"),o=i?`${i.label} ${O(i.value,n)}`:"";return l`
            <dl class="space-y-1.5">
                ${s.map(c=>{const d={grand:"flex items-center justify-between pt-2 mt-2 border-t border-subtle text-base font-bold text-brand",detail:"flex items-center justify-between text-xs text-muted",regular:"flex items-center justify-between text-sm text-brand"}[c.kind];return l`
                        <div class=${d} data-total=${c.code}>
                            <dt>${c.label}</dt>
                            <dd>${O(c.value,n)}</dd>
                        </div>
                    `})}
            </dl>
            <div role="status"
                 aria-live="polite"
                 class="sr-only">
                ${o}
            </div>
        `}}customElements.get("summary-totals")||customElements.define("summary-totals",Gr);var zr=Object.defineProperty,Xr=Object.getOwnPropertyDescriptor,_t=r=>{throw TypeError(r)},Ae=(r,e,t,n)=>{for(var s=Xr(e,t),i=r.length-1,o;i>=0;i--)(o=r[i])&&(s=o(e,t,s)||s);return s&&zr(e,t,s),s},mt=(r,e,t)=>e.has(r)||_t("Cannot "+t),fe=(r,e,t)=>(mt(r,e,"read from private field"),t?t.call(r):e.get(r)),be=(r,e,t)=>e.has(r)?_t("Cannot add the same private member more than once"):e instanceof WeakSet?e.add(r):e.set(r,t),ye=(r,e,t,n)=>(mt(r,e,"write to private field"),e.set(r,t),t),re,se,ne;class ue extends g(_){constructor(){super(...arguments),be(this,re,""),be(this,se,!1),be(this,ne,!1),this._apply=async()=>{this._busy=!0;try{await v().applyCoupon(this._draft.trim())&&(this._draft="",this._open=!1)}finally{this._busy=!1}},this._remove=async()=>{this._busy=!0;try{await v().removeCoupon()}finally{this._busy=!1}}}get _draft(){return fe(this,re)}set _draft(e){ye(this,re,e)}get _open(){return fe(this,se)}set _open(e){ye(this,se,e)}get _busy(){return fe(this,ne)}set _busy(e){ye(this,ne,e)}createRenderRoot(){return this}render(){const e=u(),t=e.appliedCoupon.get(),n=e.couponError.get();return t?l`
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
            `}}re=new WeakMap;se=new WeakMap;ne=new WeakMap;Ae([f()],ue.prototype,"_draft");Ae([f()],ue.prototype,"_open");Ae([f()],ue.prototype,"_busy");customElements.get("coupon-form")||customElements.define("coupon-form",ue);class Jr extends g(_){createRenderRoot(){return this}render(){const t=u().items.get();return l`
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
        `}}customElements.get("order-summary")||customElements.define("order-summary",Jr);function I(){return a("Hyperion_Checkout::checkout_updating")}function Ie(r,e,t={}){if(!e.emailValid.get())return a("Hyperion_Checkout::checkout_incomplete_email");if(!e.shippingAddressValid.get())return a("Hyperion_Checkout::checkout_incomplete_shipping_address");if(!e.shippingMethodSelected.get())return a("Hyperion_Checkout::checkout_incomplete_shipping_method");if(!e.billingAddressValid.get())return a("Hyperion_Checkout::checkout_incomplete_billing_address");if(!e.shippingReady.get())return r.isLoadingShippingMethods.get()||r.isSavingShipping.get()||r.isSavingBilling.get()?I():a("Hyperion_Checkout::checkout_incomplete_shipping_method");if(!e.billingReady.get())return r.isSavingBilling.get()?I():a("Hyperion_Checkout::checkout_incomplete_billing_address");if(r.isRefreshingTotals.get())return I();if(!e.paymentMethodSelected.get())return a("Hyperion_Checkout::checkout_incomplete_payment_method");if(!t.skipPaymentReady&&!e.paymentMethodReady.get()){const s=r.selectedPaymentMethod.get();return(s===null?null:q(s))?.notReadyMessage?.()??a("Hyperion_Checkout::checkout_incomplete_payment_method")}if(!e.agreementsAccepted.get())return a("Hyperion_Checkout::checkout_incomplete_agreements");const n=r.minimumOrderError.get();return n!==null?n:r.totals.get()===null?a("Hyperion_Checkout::checkout_incomplete_totals"):null}function De(r){window.location.assign(r)}function Kr(r,e="/checkout/onepage/success"){return gt(r)??e}function gt(r){try{const e=new URL(r,window.location.origin);return e.origin!==window.location.origin||e.protocol!=="http:"&&e.protocol!=="https:"?null:e.toString()}catch{return null}}var Qr=Object.defineProperty,ft=(r,e,t,n)=>{for(var s=void 0,i=r.length-1,o;i>=0;i--)(o=r[i])&&(s=o(e,t,s)||s);return s&&Qr(e,t,s),s};class Pe extends g(_){constructor(){super(...arguments),this._selectors=Rt(),this._preparing=!1,this._hint=null,this._onClick=async()=>{const e=u();if(this._preparing||e.isPlacingOrder.get()||e.orderPlaced.get())return;if(e.shippingDirty.get()||e.isLoadingShippingMethods.get()||e.isSavingShipping.get()||e.isSavingBilling.get()){this._preparing=!0;try{await v().settleShipping()}finally{this._preparing=!1}}if(!this._selectors.canPlaceOrder.get()){await this._revealMissing();return}const t=e.selectedPaymentMethod.get();if(!t)return;const n=q(t);if(n?.beforePlaceOrder){this._preparing=!0,e.globalError.set(null);try{const i=await n.beforePlaceOrder(),o=e.paymentMethodData.get();e.paymentMethodData.set({...o,[t]:i})}catch(i){e.globalError.set(i.message||a("Hyperion_Checkout::unexpected_error"));return}finally{this._preparing=!1}}if(n?.placeOrder){await this._placeThroughRenderer(n.placeOrder,n);return}if(await v().placeOrder()!==null){De(Kr(b().defaultSuccessPageUrl));return}n?.afterPlaceOrderFailed?.()}}createRenderRoot(){return this}willUpdate(){this._hint!==null&&(this._selectors.canPlaceOrder.get()?this._hint=null:this._hint===I()&&(this._hint=Ie(u(),this._selectors)))}render(){ae.get();const e=u().selectedPaymentMethod.get();if(e&&q(e)?.ownsPlaceOrder?.())return p;const t=this._selectors.canPlaceOrder.get(),n=this._preparing||u().isPlacingOrder.get();return l`
            <hc-button variant="primary"
                       .label=${a(n?"Hyperion_Checkout::placing_order":"Hyperion_Checkout::place_order")}
                       .softDisabled=${!t}
                       .loading=${n}
                       @click=${this._onClick}></hc-button>
            ${this._hint!==null?l`<p class="mt-2 text-sm text-danger"
                          role="status"
                          tabindex="-1"
                          data-place-order-hint>${this._hint}</p>`:p}
        `}async _revealMissing(){const e=u();if(!this._selectors.emailValid.get()){const i=G(e.email.get());i&&e.fieldErrors.set({...e.fieldErrors.get(),email:a(i)})}if(tr(),this._hint=Ie(e,this._selectors),this._hint===I())return;await this.updateComplete,await new Promise(i=>setTimeout(i,0)),((this.closest("checkout-app")??document).querySelector('[aria-invalid="true"]')??this.querySelector("[data-place-order-hint]"))?.focus()}async _placeThroughRenderer(e,t){const n=u();this._preparing=!0;let s=null;try{const i=await e();s=i===null?null:gt(i),i!==null&&s===null&&n.globalError.set(a("Hyperion_Checkout::unexpected_error"))}catch(i){n.globalError.set(i.message||a("Hyperion_Checkout::unexpected_error"))}if(s!==null){De(s);return}this._preparing=!1,t.afterPlaceOrderFailed?.()}}ft([f()],Pe.prototype,"_preparing");ft([f()],Pe.prototype,"_hint");customElements.get("place-order-button")||customElements.define("place-order-button",Pe);class Zr extends g(_){createRenderRoot(){return this}render(){return u().isPlacingOrder.get()?l`
            <div role="alert" aria-live="assertive"
                 class="fixed inset-0 z-50 bg-brand/60 flex items-center justify-center">
                <div class="bg-surface rounded-md p-6 shadow-lg max-w-sm text-center space-y-3">
                    <span class="inline-block w-10 h-10 rounded-full border-4 border-accent border-t-transparent animate-spin"></span>
                    <p class="text-sm font-medium text-brand">
                        ${a("Hyperion_Checkout::placing_order")}
                    </p>
                </div>
            </div>
        `:null}}customElements.get("loading-overlay")||customElements.define("loading-overlay",Zr);class Yr extends g(_){constructor(){super(...arguments),this._lastMessage=null}createRenderRoot(){return this}render(){const e=u(),t=e.globalError.get(),n=e.minimumOrderError.get();if(!t&&!n)return this._lastMessage=null,p;const s=t??n??"",i=s!==this._lastMessage;return this._lastMessage=s,i&&queueMicrotask(()=>{this.querySelector("[data-error-banner]")?.focus()}),l`
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
        `}}customElements.get("error-banner")||customElements.define("error-banner",Yr);class bt extends g(_){constructor(){super(...arguments),this._onLoginRequest=async()=>{const{inlineLogin:e}=await w(async()=>{const{inlineLogin:t}=await import("./login-action-CI07Z5-S.js");return{inlineLogin:t}},__vite__mapDeps([12,1,2]),import.meta.url);await e()}}createRenderRoot(){return this}render(){const e=u(),t=e.isVirtual.get(),n=e.customer.get()!==null;return l`
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
        `}}customElements.get("checkout-app")||customElements.define("checkout-app",bt);const ss=Object.freeze(Object.defineProperty({__proto__:null,CheckoutApp:bt},Symbol.toStringTag,{value:"Module"}));export{rs as a,tr as b,De as c,Kr as d,g as e,vr as f,gt as g,ss as h,h as n,Ie as p,f as r};
//# sourceMappingURL=checkout-app-D7qpjpyk.js.map
