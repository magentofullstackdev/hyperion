import{e as c,i as d,A as l,b as a,l as p}from"./checkout-app-CCQ4A2FR.js";import{g as n,t as r}from"./checkout-C9dXtvMq.js";class m extends c(d){constructor(){super(...arguments),this._keepOpen=e=>{e.preventDefault()}}createRenderRoot(){return this}render(){const e=n();return e.sessionExpired.get()?a`
            <dialog class="w-full max-w-md rounded-md border border-subtle bg-surface p-0 text-brand shadow-lg backdrop:bg-black/40"
                    aria-labelledby="hc-session-expired-message"
                    data-session-expired
                    @cancel=${this._keepOpen}>
                <div class="p-4 space-y-3">
                    <p id="hc-session-expired-message" class="text-sm">
                        ${r("Hyperion_Checkout::error_session_expired")}
                    </p>
                    ${e.orderOutcome.get()==="unknown"?a`<p class="text-sm text-danger" data-session-expired-order>
                                   ${r("Hyperion_Checkout::order_outcome_unknown")}
                               </p>`:l}
                    <a href=${p()}
                       data-session-expired-login
                       class="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent/90">
                        ${r("Hyperion_Checkout::sign_in_again")}
                    </a>
                </div>
            </dialog>
        `:l}updated(){const e=this.querySelector("dialog[data-session-expired]");!e||e.open||(typeof e.showModal=="function"?e.showModal():e.setAttribute("open",""))}}customElements.get("hc-session-expired")||customElements.define("hc-session-expired",m);const h=400,_="HC-SESSION-EXPIRED";class f extends c(d){constructor(){super(...arguments),this._slow=!1,this._slowTimer=null,this._shown=!1,this._inerted=new Set,this._focusBefore=null}createRenderRoot(){return this}disconnectedCallback(){super.disconnectedCallback(),this._stopSlowTimer(),this._release(),this._shown=!1}_visible(){const e=n(),t=e.orderOutcome.get(),s=e.orderStep.get();return t==="placed"||s==="submitting"||s==="confirming"?!0:s==="preparing"?this._slow:e.isPlacingOrder.get()&&t==="none"}_text(){const e=n(),t=e.orderNumber.get();return e.orderOutcome.get()==="placed"&&t!==null?r("Hyperion_Checkout::order_received_number",{number:t}):e.orderStep.get()==="confirming"?r("Hyperion_Checkout::order_confirming"):r("Hyperion_Checkout::placing_order")}render(){return this._visible()?a`
            <div role="status"
                 data-loading-overlay
                 class="fixed inset-0 z-50 bg-brand/60 flex items-center justify-center">
                <div class="bg-surface rounded-md p-6 shadow-lg max-w-sm text-center space-y-3">
                    <span class="inline-block w-10 h-10 rounded-full border-4 border-accent border-t-transparent animate-spin"
                          aria-hidden="true"></span>
                    <p class="text-sm font-medium text-brand">${this._text()}</p>
                </div>
            </div>
        `:l}updated(){const e=n().orderStep.get()==="preparing";e&&!this._slow&&this._slowTimer===null?this._slowTimer=setTimeout(()=>{this._slowTimer=null,this._slow=!0,this.requestUpdate()},h):!e&&(this._slow||this._slowTimer!==null)&&(this._stopSlowTimer(),this._slow=!1);const t=this._visible();t!==this._shown&&(this._shown=t,t?this._cover():this._release())}_stopSlowTimer(){this._slowTimer!==null&&clearTimeout(this._slowTimer),this._slowTimer=null}_cover(){const e=document.activeElement;this._focusBefore=e instanceof HTMLElement&&e!==document.body?e:null;const t=this.closest("checkout-app");let s=this;for(;s.parentElement!==null;){const o=s.parentElement;for(const i of Array.from(o.children))i===s||i.tagName===_||i.hasAttribute("inert")||(i.setAttribute("inert",""),this._inerted.add(i));if(t===null||o===t)break;s=o}}_release(){for(const t of this._inerted)t.removeAttribute("inert");this._inerted.clear();const e=this._focusBefore;this._focusBefore=null,e!==null&&e.isConnected&&(document.activeElement===null||document.activeElement===document.body)&&e.focus({preventScroll:!0})}}customElements.get("loading-overlay")||customElements.define("loading-overlay",f);export{f as LoadingOverlay,h as OVERLAY_PREPARE_DELAY_MS};
//# sourceMappingURL=loading-overlay-CBtZ3XFV.js.map
