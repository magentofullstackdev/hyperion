var c=Object.defineProperty;var h=(r,e,t)=>e in r?c(r,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):r[e]=t;var s=(r,e,t)=>h(r,typeof e!="symbol"?e+"":e,t);import{i as u,a as g,A as o,b}from"./lit-element.CGWggwb8.js";import{l as m,f,u as d,t as w}from"./scroll-lock.Ok7HH6hu.js";import{dismissAllNotifications as _}from"./hyperion-notification.DUupAMp4.js";class a extends u{constructor(){super(),this.label="",this.menuLabel="",this.placement="inline",this._open=!1,this._onOutsideClick=this._onOutsideClick.bind(this)}connectedCallback(){super.connectedCallback(),document.addEventListener("click",this._onOutsideClick)}disconnectedCallback(){super.disconnectedCallback(),document.removeEventListener("click",this._onOutsideClick),this._open&&this._isDrawer()&&d()}updated(e){var t;e.has("_open")&&((t=this.querySelector('[slot="trigger"]'))==null||t.setAttribute("aria-expanded",String(this._open)),this._open?(this.setAttribute("open",""),this._isDrawer()&&(m(),_(),requestAnimationFrame(()=>{var n;const i=(n=this.shadowRoot)==null?void 0:n.querySelector('[part="panel"]');i&&this._open&&f(i,{avoidTextEntry:!0})}))):(this.removeAttribute("open"),this._isDrawer()&&e.get("_open")===!0&&d()))}_opener(){var e;return this.querySelector('[slot="trigger"]')??((e=this.shadowRoot)==null?void 0:e.querySelector('[part="trigger"]'))}_isDrawer(){return this.placement==="drawer"}_toggle(){this._open=!this._open,this._emitToggle()}_close(){var e;this._open&&(this._open=!1,this._emitToggle(),(e=this._opener())==null||e.focus({preventScroll:!0}))}_emitToggle(){this.dispatchEvent(new CustomEvent("hyperion-dropdown-toggle",{bubbles:!0,composed:!0,detail:{open:this._open}}))}_onOutsideClick(e){this._open&&(e.composedPath().includes(this)||(this._open=!1,this._emitToggle()))}_onBackdropClick(){this._close()}_onTriggerKey(e){switch(e.key){case"Enter":case" ":e.preventDefault(),this._toggle(),this._open&&!this._isDrawer()&&this.updateComplete.then(()=>this._focusFirstItem());break;case"ArrowDown":e.preventDefault(),this._open||(this._open=!0,this._emitToggle()),this.updateComplete.then(()=>this._focusFirstItem());break;case"Escape":this._close();break}}_onPanelKey(e){if(e.key==="Tab"&&this._isDrawer()&&this._open){w(e,e.currentTarget);return}switch(e.key){case"Escape":this._close();break;case"ArrowDown":e.preventDefault(),this._focusNextItem(1);break;case"ArrowUp":e.preventDefault(),this._focusNextItem(-1);break}}_getMenuItems(){const e=this.shadowRoot.querySelector("slot:not([name])");return e?e.assignedElements({flatten:!0}).flatMap(t=>t.matches('[role="menuitem"], a, button')?[t]:[...t.querySelectorAll('[role="menuitem"], a, button')]):[]}_focusFirstItem(){var t;(t=this._getMenuItems()[0])==null||t.focus({preventScroll:!0})}_focusNextItem(e){var l;const t=this._getMenuItems();if(!t.length)return;const i=document.activeElement,p=(t.indexOf(i)+e+t.length)%t.length;(l=t[p])==null||l.focus({preventScroll:!0})}render(){const e=this._isDrawer();return b`
            <slot name="trigger" @click=${this._toggle} @keydown=${this._onTriggerKey}></slot>
            <button
                part="trigger"
                aria-haspopup="${e?"dialog":o}"
                aria-expanded="${this._open}"
                @click=${this._toggle}
                @keydown=${this._onTriggerKey}
                ?hidden=${this.querySelector('[slot="trigger"]')!==null}
            >
                <slot name="trigger-icon"></slot>
                <span>${this.label}</span>
            </button>
            <div
                part="backdrop"
                aria-hidden="${!this._open}"
                @click=${this._onBackdropClick}
            ></div>
            <div
                part="panel"
                role="${e?"dialog":o}"
                aria-modal="${e?"true":o}"
                aria-label="${e?this.menuLabel||o:o}"
                aria-hidden="${!this._open}"
                ?hidden=${!this._open}
                ?inert=${!this._open}
                @keydown=${this._onPanelKey}
            >
                <slot></slot>
            </div>
        `}}s(a,"properties",{label:{type:String,reflect:!0},menuLabel:{type:String,attribute:"menu-label",reflect:!0},placement:{type:String,reflect:!0},_open:{state:!0}}),s(a,"styles",g`
        :host {
            --dropdown-background: rgb(var(--color-surface));
            --dropdown-surface-raised: rgb(var(--color-surface-raised));
            --dropdown-border-radius: 0.25rem;
            --dropdown-border-color: rgb(var(--color-subtle));
            --dropdown-text-color: rgb(var(--color-secondary));
            --dropdown-focus-ring-color: rgb(var(--color-primary));
            --drawer-width: 20rem;
            --drawer-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
            --backdrop-color: rgba(0, 0, 0, 0.5);
            --transition-duration: 0.3s;
            display: inline-block;
            position: relative;
        }

        [part="trigger"] {
            display: inline-flex;
            align-items: center;
            gap: 0.375rem;
            background: transparent;
            border: none;
            color: var(--dropdown-text-color);
            cursor: pointer;
            padding: 0.5rem 0.75rem;
            border-radius: var(--dropdown-border-radius);
        }

        [part="trigger"]:focus-visible {
            outline: 2px solid var(--dropdown-focus-ring-color);
            outline-offset: 2px;
        }

        /* A slotted trigger replaces the built-in button: the hidden
           attribute must win over the inline-flex above, or the empty
           button keeps its padding (24px) next to the slotted one. */
        [part="trigger"][hidden] {
            display: none;
        }

        /* Inline (default) placement -- unchanged legacy behavior. */
        [part="panel"] {
            position: absolute;
            top: calc(100% + 4px);
            left: 0;
            min-width: 100%;
            background: var(--dropdown-background);
            border: 1px solid var(--dropdown-border-color);
            border-radius: var(--dropdown-border-radius);
            z-index: 100;
            padding: 0.25rem 0;
        }

        [part="panel"][hidden] {
            display: none;
        }

        [part="backdrop"] {
            display: none;
        }

        /* Drawer placement -- fixed off-canvas sidebar from the right edge.
           Other placements (bottom-end, bottom-start, ...) keep the default
           popover styling above (absolute below the trigger). */
        :host([placement="drawer"]) {
            position: static;
        }

        :host([placement="drawer"]) [part="backdrop"] {
            display: block;
            position: fixed;
            inset: 0;
            background: var(--backdrop-color);
            opacity: 0;
            visibility: hidden;
            transition: opacity var(--transition-duration) ease, visibility var(--transition-duration) ease;
            z-index: 9998;
        }

        :host([placement="drawer"][open]) [part="backdrop"] {
            opacity: 1;
            visibility: visible;
        }

        :host([placement="drawer"]) [part="panel"] {
            position: fixed;
            top: 0;
            right: 0;
            bottom: 0;
            left: auto;
            /* 100% of the viewport minus the scrollbar: a viewport unit
               includes the scrollbar and, with the root's stable gutter,
               overflows the page by its width. */
            width: 100%;
            max-width: var(--drawer-width);
            min-width: auto;
            background: var(--dropdown-background);
            border: none;
            border-radius: 0;
            box-shadow: var(--drawer-shadow);
            padding: 0;
            transform: translateX(100%);
            /* Hidden while closed: the panel sits just past the right edge and
               its shadow would otherwise shade the page along that edge.
               visibility flips at the end of the closing slide (this rule's
               transition) and at once when opening (the open rule's 0s
               transition): the first control is focused in the same frame
               the drawer opens, and a hidden element cannot take the focus. */
            visibility: hidden;
            transition: transform var(--transition-duration) ease, visibility var(--transition-duration) ease;
            z-index: 9999;
            overflow-y: auto;
        }

        :host([placement="drawer"]) [part="panel"][hidden] {
            display: flex;
        }

        :host([placement="drawer"][open]) [part="panel"] {
            transform: translateX(0);
            visibility: visible;
            transition: transform var(--transition-duration) ease, visibility 0s;
        }

        /* Anchor the panel to the right edge of the trigger for bottom-end. */
        :host([placement="bottom-end"]) [part="panel"] {
            left: auto;
            right: 0;
        }

        @media (prefers-reduced-motion: reduce) {
            [part="panel"], [part="backdrop"] { transition: none; }
        }
    `);customElements.get("hyperion-dropdown")||customElements.define("hyperion-dropdown",a);export{a as HyperionDropdown};
//# sourceMappingURL=hyperion-dropdown.CBJB3TSh.js.map
