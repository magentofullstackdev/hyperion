var n=Object.defineProperty;var h=(i,e,t)=>e in i?n(i,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):i[e]=t;var s=(i,e,t)=>h(i,typeof e!="symbol"?e+"":e,t);import{i as a,a as l,b as u}from"./lit-element.CGWggwb8.js";const c=6e3,d=1e3;function f(i=document){for(const e of i.querySelectorAll("hyperion-notification:not([hidden])"))typeof e.dismiss=="function"?e.dismiss():e.setAttribute("hidden","")}class r extends a{constructor(){super();s(this,"_dismiss",()=>{this._clearTimer(),this._hovered=!1,this._focused=!1,this.setAttribute("hidden","")});this.autoClose=c,this.closeLabel="Dismiss notification",this._timer=null,this._remaining=0,this._startedAt=0,this._hovered=!1,this._focused=!1,this._onPointerEnter=()=>{this._hovered=!0,this._pauseTimer()},this._onPointerLeave=()=>{this._hovered=!1,this._resumeTimer()},this._onFocusIn=()=>{this._focused=!0,this._pauseTimer()},this._onFocusOut=t=>{const o=t.relatedTarget;o&&typeof this.contains=="function"&&this.contains(o)||(this._focused=!1,this._resumeTimer())}}connectedCallback(){super.connectedCallback(),this.addEventListener("pointerenter",this._onPointerEnter),this.addEventListener("pointerleave",this._onPointerLeave),this.addEventListener("focusin",this._onFocusIn),this.addEventListener("focusout",this._onFocusOut),this._startTimer(),this._hiddenObserver=new MutationObserver(()=>{this.hasAttribute("hidden")?this._clearTimer():(this._clearTimer(),this._startTimer())}),this._hiddenObserver.observe(this,{attributes:!0,attributeFilter:["hidden"]})}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("pointerenter",this._onPointerEnter),this.removeEventListener("pointerleave",this._onPointerLeave),this.removeEventListener("focusin",this._onFocusIn),this.removeEventListener("focusout",this._onFocusOut),this._clearTimer(),this._hiddenObserver&&(this._hiddenObserver.disconnect(),this._hiddenObserver=null)}updated(t){t.has("autoClose")&&(this._clearTimer(),this._startTimer())}_startTimer(){this.hasAttribute("hidden")||!this.autoClose||this.autoClose<=0||(this._remaining=this.autoClose,!(this._hovered||this._focused)&&this._schedule(this._remaining))}_schedule(t){this._startedAt=Date.now(),this._timer=setTimeout(()=>this._dismiss(),t)}_pauseTimer(){if(!this._timer)return;const t=Date.now()-this._startedAt;this._remaining=Math.max(this._remaining-t,d),clearTimeout(this._timer),this._timer=null}_resumeTimer(){this._timer||this._hovered||this._focused||this.hasAttribute("hidden")||!this.autoClose||this.autoClose<=0||this._schedule(this._remaining||this.autoClose)}_clearTimer(){this._timer&&(clearTimeout(this._timer),this._timer=null),this._remaining=0}dismiss(){this._dismiss()}render(){return u`
            <button
                type="button"
                class="close"
                aria-label="${this.closeLabel}"
                @click="${this._dismiss}">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
            <slot></slot>
        `}}s(r,"properties",{autoClose:{type:Number,attribute:"auto-close"},closeLabel:{type:String,attribute:"close-label"}}),s(r,"styles",l`
        :host {
            display: block;
            position: relative;
        }
        :host([hidden]) {
            display: none;
        }
        .close {
            position: absolute;
            top: 0.375rem;
            right: 0.5rem;
            width: 1.5rem;
            height: 1.5rem;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            background: transparent;
            border: 0;
            border-radius: 9999px;
            color: inherit;
            cursor: pointer;
            opacity: 0.75;
            transition: opacity 150ms ease-in-out, background-color 150ms ease-in-out;
        }
        .close:hover {
            opacity: 1;
            background-color: rgba(255, 255, 255, 0.12);
        }
        .close:focus-visible {
            opacity: 1;
            outline: 2px solid currentColor;
            outline-offset: 2px;
        }
        .close svg {
            width: 1rem;
            height: 1rem;
            stroke: currentColor;
            fill: none;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
        }
    `);customElements.get("hyperion-notification")||customElements.define("hyperion-notification",r);export{f as d};
//# sourceMappingURL=hyperion-notification.BA06YLDb.js.map
