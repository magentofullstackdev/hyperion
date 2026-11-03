var v=Object.defineProperty;var g=(r,t,a)=>t in r?v(r,t,{enumerable:!0,configurable:!0,writable:!0,value:a}):r[t]=a;var i=(r,t,a)=>g(r,typeof t!="symbol"?t+"":t,a);import{i as p,a as u,b as l,A as m}from"./lit-element.CGWggwb8.js";class h extends p{constructor(){super(),this.label="",this.active=!1}render(){return l`<slot></slot>`}}i(h,"properties",{label:{type:String},active:{type:Boolean,reflect:!0}}),i(h,"styles",u`
        :host {
            display: block;
        }
        :host(:not([active])) {
            display: none;
        }
    `);customElements.get("hyperion-tab")||customElements.define("hyperion-tab",h);let f=0;class d extends p{constructor(){super(),this.tablistLabel="",this._activeIndex=0,this._tabs=[],this._uid=`htabs-${++f}`}connectedCallback(){super.connectedCallback(),this._onHashChange=()=>this._revealHashTarget(),window.addEventListener("hashchange",this._onHashChange)}disconnectedCallback(){super.disconnectedCallback(),window.removeEventListener("hashchange",this._onHashChange)}onSlotChange(){const t=[...this.children].filter(a=>{var e;return((e=a.tagName)==null?void 0:e.toLowerCase())==="hyperion-tab"});this._tabs=t,this._applyActiveState(this._activeIndex),this._revealHashTarget()}_revealHashTarget(){const t=decodeURIComponent(window.location.hash.slice(1));if(!t)return;const a=document.getElementById(t),e=a?this._tabs.findIndex(s=>s.contains(a)):-1;e!==-1&&(e!==this._activeIndex&&this.activate(e),this.updateComplete.then(()=>a.scrollIntoView({block:"start"})))}activate(t){this._activeIndex=t,this._applyActiveState(t),this.dispatchEvent(new CustomEvent("hyperion-tabs-change",{bubbles:!0,composed:!0,detail:{index:t}}))}_applyActiveState(t){this._tabs.forEach((a,e)=>{e===t?a.setAttribute("active",""):a.removeAttribute("active")}),this.updateComplete.then(()=>{var e;(((e=this.shadowRoot)==null?void 0:e.querySelectorAll('[part="tab"]'))??[]).forEach((s,o)=>{s.setAttribute("tabindex",o===this._activeIndex?"0":"-1"),s.setAttribute("aria-selected",String(o===this._activeIndex))})})}onKeyDown(t){var s,o;const a=this._tabs.length;if(!a)return;let e=this._activeIndex;switch(t.key){case"ArrowRight":t.preventDefault(),e=(this._activeIndex+1)%a;break;case"ArrowLeft":t.preventDefault(),e=(this._activeIndex-1+a)%a;break;case"Home":t.preventDefault(),e=0;break;case"End":t.preventDefault(),e=a-1;break;case"Enter":case" ":{t.preventDefault();const n=(s=this.shadowRoot)==null?void 0:s.activeElement,b=[...((o=this.shadowRoot)==null?void 0:o.querySelectorAll('[part="tab"]'))??[]].indexOf(n);b!==-1&&this.activate(b);return}default:return}this.activate(e),this.updateComplete.then(()=>{var n,c;(c=(n=this.shadowRoot)==null?void 0:n.querySelectorAll('[part="tab"]')[e])==null||c.focus()})}render(){const t=this._uid;return l`
            <div
                part="tab-list"
                role="tablist"
                aria-label="${this.tablistLabel||m}"
                @keydown=${this.onKeyDown}
            >
                ${this._tabs.map((a,e)=>l`
                    <button
                        part="tab"
                        role="tab"
                        id="hyperion-tab-${e}-${t}"
                        aria-selected="${e===this._activeIndex}"
                        aria-controls="hyperion-panel-${t}"
                        tabindex="${e===this._activeIndex?"0":"-1"}"
                        @click=${()=>this.activate(e)}
                    >${a.label}</button>
                `)}
            </div>
            <div
                part="panel"
                role="tabpanel"
                id="hyperion-panel-${t}"
                aria-labelledby="hyperion-tab-${this._activeIndex}-${t}"
            >
                <slot @slotchange=${this.onSlotChange}></slot>
            </div>
        `}}i(d,"properties",{tablistLabel:{type:String,attribute:"tablist-label"},_activeIndex:{state:!0},_tabs:{state:!0}}),i(d,"styles",u`
        :host {
            --tabs-background: rgb(var(--color-surface));
            --tabs-border-color: rgb(var(--color-subtle));
            --tabs-active-color: rgb(var(--color-primary));
            --tabs-text-color: rgb(var(--color-secondary));
            --tabs-header-padding: 0.75rem 1rem;
            display: block;
        }

        [part="tab-list"] {
            display: flex;
            border-bottom: 1px solid var(--tabs-border-color);
            background: var(--tabs-background);
        }

        [part="tab"] {
            background: transparent;
            border: none;
            border-bottom: 2px solid transparent;
            color: var(--tabs-text-color);
            cursor: pointer;
            padding: var(--tabs-header-padding);
            margin-bottom: -1px;
            /* The page's font, not the UA button font: the server rendered strip
               skeleton (product/view.phtml) must measure the same (CLS). */
            font: inherit;
            line-height: 1.5;
        }

        [part="tab"][aria-selected="true"] {
            color: var(--tabs-active-color);
            border-bottom-color: var(--tabs-active-color);
        }

        [part="tab"]:focus-visible {
            outline: 2px solid var(--tabs-active-color);
            outline-offset: 2px;
        }

        [part="panel"] {
            padding: 1rem 0;
        }
    `);customElements.get("hyperion-tabs")||customElements.define("hyperion-tabs",d);
//# sourceMappingURL=hyperion-tabs.CqyAccEO.js.map
