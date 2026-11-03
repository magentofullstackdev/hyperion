var u=Object.defineProperty;var d=(o,t,e)=>t in o?u(o,t,{enumerable:!0,configurable:!0,writable:!0,value:e}):o[t]=e;var i=(o,t,e)=>d(o,typeof t!="symbol"?t+"":t,e);import{i as m,b as h}from"./lit-element.CGWggwb8.js";const a="hyperion-confirm",l=class l extends m{constructor(){super();i(this,"_onCancel",e=>{var r;(r=e==null?void 0:e.preventDefault)==null||r.call(e),this._settle(!1)});i(this,"_onBackdropClick",e=>{e.target===e.currentTarget&&this._settle(!1)});this.confirmLabel="OK",this.cancelLabel="Cancel",this._message="",this._resolve=null}createRenderRoot(){return this}static instance(){let e=document.querySelector(a);return e||(e=document.createElement(a),document.body.appendChild(e)),e}static ask(e){return l.instance().ask(e)}ask(e){return this._resolve&&this._settle(!1),this._message=e,new Promise(r=>{this._resolve=r,this.updateComplete.then(()=>{var c;const s=this.querySelector("dialog");if(!s){this._settle(!1);return}s.open||s.showModal(),(c=s.querySelector("[data-hyperion-confirm-cancel]"))==null||c.focus()})})}_settle(e){const r=this._resolve;this._resolve=null;const s=this.querySelector("dialog");s&&s.open&&s.close(),r&&r(e)}render(){return h`
            <dialog class="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-subtle
                           bg-surface p-0 text-secondary shadow-xl backdrop:bg-black/50"
                    aria-labelledby="hyperion-confirm-message"
                    @cancel=${this._onCancel}
                    @click=${this._onBackdropClick}>
                <div class="p-6">
                    <p id="hyperion-confirm-message" class="text-base font-medium">${this._message}</p>
                    <div class="mt-6 flex justify-end gap-3">
                        <button type="button"
                                data-hyperion-confirm-cancel
                                class="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium
                                       bg-surface border border-subtle text-secondary
                                       hover:border-primary hover:text-primary transition-colors
                                       focus:outline-none focus:ring-2 focus:ring-primary"
                                @click=${()=>this._settle(!1)}>
                            ${this.cancelLabel}
                        </button>
                        <button type="button"
                                data-hyperion-confirm-ok
                                class="inline-flex items-center px-4 py-2 rounded-lg text-sm font-bold
                                       uppercase tracking-wider bg-primary text-on-primary shadow-sm
                                       hover:bg-primary-hover hover:shadow-md transition-all
                                       focus:outline-none focus:ring-2 focus:ring-primary"
                                @click=${()=>this._settle(!0)}>
                            ${this.confirmLabel}
                        </button>
                    </div>
                </div>
            </dialog>
        `}};i(l,"properties",{confirmLabel:{type:String,attribute:"confirm-label"},cancelLabel:{type:String,attribute:"cancel-label"},_message:{state:!0}});let n=l;customElements.get(a)||customElements.define(a,n);export{n as H};
//# sourceMappingURL=hyperion-confirm.CnXw50CA.js.map
