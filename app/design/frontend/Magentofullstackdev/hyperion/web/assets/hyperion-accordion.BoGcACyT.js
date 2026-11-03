var b=Object.defineProperty;var g=(r,e,o)=>e in r?b(r,e,{enumerable:!0,configurable:!0,writable:!0,value:o}):r[e]=o;var a=(r,e,o)=>g(r,typeof e!="symbol"?e+"":e,o);import{i as d,a as l,b as h}from"./lit-element.CGWggwb8.js";let m=0;class c extends d{constructor(){super(),this.label="",this.open=!1,this._uid=`hacc-${++m}`}_toggle(){this.dispatchEvent(new CustomEvent("hyperion-accordion-item-toggle",{bubbles:!0,composed:!0,detail:{item:this}}))}_onKeyDown(e){switch(e.key){case"Enter":case" ":e.preventDefault(),this._toggle();break;case"ArrowDown":e.preventDefault(),this.dispatchEvent(new CustomEvent("hyperion-accordion-item-focus-next",{bubbles:!0,composed:!0,detail:{item:this,direction:1}}));break;case"ArrowUp":e.preventDefault(),this.dispatchEvent(new CustomEvent("hyperion-accordion-item-focus-next",{bubbles:!0,composed:!0,detail:{item:this,direction:-1}}));break}}focusHeader(){var e,o;(o=(e=this.shadowRoot)==null?void 0:e.querySelector('[part="header"]'))==null||o.focus()}render(){const e=this._uid;return h`
            <div part="item">
                <button
                    part="header"
                    role="button"
                    aria-expanded="${this.open}"
                    aria-controls="hacc-body-${e}"
                    id="hacc-trigger-${e}"
                    @click=${this._toggle}
                    @keydown=${this._onKeyDown}
                >
                    <span>${this.label}</span>
                    <span aria-hidden="true">${this.open?"−":"+"}</span>
                </button>
                <div
                    part="body"
                    role="region"
                    id="hacc-body-${e}"
                    aria-labelledby="hacc-trigger-${e}"
                    ?hidden=${!this.open}
                >
                    <slot></slot>
                </div>
            </div>
        `}}a(c,"properties",{label:{type:String},open:{type:Boolean,reflect:!0}}),a(c,"styles",l`
        :host {
            display: block;
        }

        [part="header"] {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            background: var(--accordion-header-background, rgb(var(--color-surface-raised)));
            color: var(--accordion-header-color, rgb(var(--color-secondary)));
            border: none;
            cursor: pointer;
            padding: var(--accordion-header-padding, 1rem);
            text-align: left;
        }

        [part="header"]:focus-visible {
            outline: 2px solid rgb(var(--color-primary));
            outline-offset: 2px;
        }

        [part="body"] {
            padding: var(--accordion-body-padding, 1rem);
        }

        [part="body"][hidden] {
            display: none;
        }

        [part="item"] {
            border-bottom: 1px solid var(--accordion-border-color, rgb(var(--color-subtle)));
        }
    `);customElements.get("hyperion-accordion-item")||customElements.define("hyperion-accordion-item",c);class s extends d{constructor(){super(),this.allowMultiple=!1,this._openItems=new Set,this._itemCount=0,this._onItemToggle=this._onItemToggle.bind(this),this._onItemFocusNext=this._onItemFocusNext.bind(this)}connectedCallback(){super.connectedCallback(),this.addEventListener("hyperion-accordion-item-toggle",this._onItemToggle),this.addEventListener("hyperion-accordion-item-focus-next",this._onItemFocusNext)}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("hyperion-accordion-item-toggle",this._onItemToggle),this.removeEventListener("hyperion-accordion-item-focus-next",this._onItemFocusNext)}_getItems(){return[...this.children].filter(e=>{var o;return((o=e.tagName)==null?void 0:o.toLowerCase())==="hyperion-accordion-item"})}_onSlotChange(){const e=this._getItems();this._itemCount=e.length,e.forEach(o=>{o.style.setProperty("--accordion-header-background","var(--accordion-header-background)"),o.style.setProperty("--accordion-header-color","var(--accordion-header-color)"),o.style.setProperty("--accordion-header-padding","var(--accordion-header-padding)"),o.style.setProperty("--accordion-body-padding","var(--accordion-body-padding)"),o.style.setProperty("--accordion-border-color","var(--accordion-border-color)")})}_onItemToggle(e){const o=e.detail.item,i=this._getItems(),t=i.indexOf(o);if(t===-1)return;const n=new Set(this._openItems);n.has(t)?(n.delete(t),o.open=!1):(this.allowMultiple||(n.clear(),i.forEach((p,u)=>{u!==t&&(p.open=!1)})),n.add(t),o.open=!0),this._openItems=n}_onItemFocusNext(e){const o=this._getItems(),i=o.indexOf(e.detail.item);if(i===-1)return;const t=i+e.detail.direction;t>=0&&t<o.length&&o[t].focusHeader()}render(){return h`
            <slot @slotchange=${this._onSlotChange}></slot>
        `}}a(s,"properties",{allowMultiple:{type:Boolean,attribute:"allow-multiple",reflect:!0},_openItems:{state:!0},_itemCount:{state:!0}}),a(s,"styles",l`
        :host {
            --accordion-background: rgb(var(--color-surface));
            --accordion-border-color: rgb(var(--color-subtle));
            --accordion-header-background: rgb(var(--color-surface-raised));
            --accordion-header-color: rgb(var(--color-secondary));
            --accordion-header-padding: 1rem;
            --accordion-body-padding: 1rem;
            display: block;
            background: var(--accordion-background);
            border: 1px solid var(--accordion-border-color);
        }
    `);customElements.get("hyperion-accordion")||customElements.define("hyperion-accordion",s);
//# sourceMappingURL=hyperion-accordion.BoGcACyT.js.map
