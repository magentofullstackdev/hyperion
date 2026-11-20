import{e as $,i as x,t as k,v as g,o as w,s as T,r as A}from"./checkout-app-B6LQaPKQ.js";import{E as C,e as E,i as H,b as S,d as I,A as c,a as p,p as O,h as M,t as l,c as d}from"./checkout-bfdIjziR.js";/**
 * @license
 * Copyright 2018 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const f="important",R=" !"+f,P=$(class extends x{constructor(s){if(super(s),s.type!==k.ATTRIBUTE||s.name!=="style"||s.strings?.length>2)throw Error("The `styleMap` directive must be used in the `style` attribute and must be the only part in the attribute.")}render(s){return Object.keys(s).reduce((e,t)=>{const r=s[t];return r==null?e:e+`${t=t.includes("-")?t:t.replace(/(?:^(webkit|moz|ms|o)|)(?=[A-Z])/g,"-$&").toLowerCase()}:${r};`},"")}update(s,[e]){const{style:t}=s.element;if(this.ft===void 0)return this.ft=new Set(Object.keys(e)),this.render(e);for(const r of this.ft)e[r]==null&&(this.ft.delete(r),r.includes("-")?t.removeProperty(r):t[r]=null);for(const r in e){const n=e[r];if(n!=null){this.ft.add(r);const a=typeof n=="string"&&n.endsWith(R);r.includes("-")||a?t.setProperty(r,a?n.slice(0,-11):n,a?f:""):t[r]=n}}return C}});var q=Object.defineProperty,B=Object.getOwnPropertyDescriptor,m=s=>{throw TypeError(s)},L=(s,e,t,r)=>{for(var n=B(e,t),a=s.length-1,i;a>=0;a--)(i=s[a])&&(n=i(e,t,n)||n);return n&&q(e,t,n),n},_=(s,e,t)=>e.has(s)||m("Cannot "+t),N=(s,e,t)=>(_(s,e,"read from private field"),t?t.call(s):e.get(s)),D=(s,e,t)=>e.has(s)?m("Cannot add the same private member more than once"):e instanceof WeakSet?e.add(s):e.set(s,t),U=(s,e,t,r)=>(_(s,e,"write to private field"),e.set(s,t),t),u;const G="60vh";function W(s){const e=typeof s=="number"?String(s):typeof s=="string"?s.trim():"",t=/^(\d+(?:\.\d+)?)(px|em|rem|vh|%)?$/.exec(e);return!t||Number(t[1])<=0?G:`${t[1]}${t[2]??"px"}`}class v extends E(H){constructor(){super(...arguments),D(this,u,!1),this._validationBaseline=0}get _reveal(){return N(this,u)}set _reveal(e){U(this,u,e)}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this._validationBaseline=g.get()}willUpdate(){!this._reveal&&g.get()>this._validationBaseline&&(this._reveal=!0)}_manualAgreements(){const e=S().checkoutAgreements;return!e||!e.isEnabled||!e.agreements?[]:e.agreements.filter(t=>t.mode===I)}updated(){const e=this._manualAgreements().length===0;this.toggleAttribute("hidden",e),this.classList.toggle("hc-host",!e)}render(){const e=this._manualAgreements();if(e.length===0)return c;const t=p(),r=new Set(t.acceptedAgreements.get()),n=this._reveal&&O(t,M())==="agreements";return d`
            <fieldset class="pt-3 border-t border-subtle"
                      aria-labelledby="hc-agreements-heading">
                <legend id="hc-agreements-heading" class="sr-only">
                    ${l("Hyperion_Checkout::agreements_heading")}
                </legend>
                ${e.map(a=>this._renderRow(a,r.has(a.agreementId),n))}
            </fieldset>
        `}_renderRow(e,t,r){const n=`hc-agreement-${e.agreementId}`,a=`${n}-msg`,i=`${n}-heading`,h=e.checkboxText||e.name||"",b=e.name||h,o=r&&!t;return d`
            <div data-hyperion-agreement=${String(e.agreementId)}>
                <div class="flex flex-wrap items-start gap-x-3 gap-y-1">
                    <label for=${n}
                           class="flex items-start gap-2 cursor-pointer text-sm text-brand">
                        <input
                            id=${n}
                            type="checkbox"
                            class="mt-0.5 h-4 w-4 rounded ${o?"border-danger":"border-subtle"} text-accent focus:ring-2 focus:ring-accent"
                            .checked=${t}
                            required
                            aria-required="true"
                            aria-invalid=${o?"true":"false"}
                            aria-describedby=${w(o?a:void 0)}
                            @change=${y=>this._onToggle(e.agreementId,y)}
                        />
                        <span>${h} <span aria-hidden="true" class="text-danger">*</span></span>
                    </label>
                    ${e.content?d`
                              <button type="button"
                                      class="text-sm font-medium text-accent underline underline-offset-2 hover:no-underline focus:outline-none focus:ring-2 focus:ring-accent"
                                      aria-haspopup="dialog"
                                      data-hyperion-agreement-open
                                      @click=${()=>this._openTerms(e.agreementId)}>
                                  ${l("Hyperion_Checkout::agreements_read")}
                              </button>
                          `:c}
                </div>
                <p id=${a} class="hc-field-message pl-6 text-danger">
                    ${o?l("Hyperion_Checkout::agreements_required"):c}
                </p>
                ${e.content?d`
                          <dialog class="w-full max-w-lg rounded-xl border border-subtle bg-surface p-0 text-brand shadow-lg backdrop:bg-black/40"
                                  aria-labelledby=${i}
                                  data-hyperion-agreement-dialog=${String(e.agreementId)}>
                              <div class="p-4 space-y-3">
                                  <h3 id=${i} class="text-base font-semibold text-brand">${b}</h3>
                                  <div class="text-sm text-brand space-y-2 overflow-y-auto"
                                       style=${P({maxHeight:W(e.contentHeight)})}
                                       data-hyperion-agreement-content
                                       .innerHTML=${T(e.content)}></div>
                                  <div class="flex justify-end">
                                      <hc-button variant="secondary"
                                                 .label=${l("Hyperion_Checkout::agreements_close")}
                                                 @click=${()=>this._closeTerms(e.agreementId)}></hc-button>
                                  </div>
                              </div>
                          </dialog>
                      `:c}
            </div>
        `}_dialog(e){return this.querySelector(`dialog[data-hyperion-agreement-dialog="${e}"]`)}_openTerms(e){const t=this._dialog(e);t&&(typeof t.showModal=="function"?t.showModal():t.setAttribute("open",""))}_closeTerms(e){const t=this._dialog(e);t&&(typeof t.close=="function"?t.close():t.removeAttribute("open"))}_onToggle(e,t){const r=t.target.checked,n=p().acceptedAgreements,a=n.get();r?a.includes(e)||n.set([...a,e]):n.set(a.filter(i=>i!==e))}}u=new WeakMap;L([A()],v.prototype,"_reveal");customElements.get("checkout-agreements")||customElements.define("checkout-agreements",v);export{v as CheckoutAgreements,W as agreementContentHeight};
//# sourceMappingURL=checkout-agreements-Dd855GKp.js.map
