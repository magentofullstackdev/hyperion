var h=Object.defineProperty;var d=(e,r,t)=>r in e?h(e,r,{enumerable:!0,configurable:!0,writable:!0,value:t}):e[r]=t;var o=(e,r,t)=>d(e,typeof r!="symbol"?r+"":r,t);import{i as p,a as c,A as u,b as s}from"./lit-element.CGWggwb8.js";const n={fromAttribute:e=>e!==null&&e!=="false"&&e!=="0",toAttribute:e=>e?"true":"false"};class a extends p{constructor(){super();o(this,"_pauseAutoplay",()=>{this._stopAutoplay()});o(this,"_resumeAutoplay",()=>{this.autoplay&&!this.matches(":hover")&&!this.matches(":focus-within")&&this._startAutoplay()});this.autoplay=!1,this.autoplayInterval=5e3,this.showArrows=!0,this.showDots=!1,this.loop=!0,this.fade=!1,this.prevLabel="Previous slide",this.nextLabel="Next slide",this.dotLabel="Go to slide",this._currentIndex=0,this._slideCount=0,this._autoplayTimer=null,this._pointerStartX=null}connectedCallback(){super.connectedCallback(),this._readPageBuilderSettings(),this.autoplay&&this._startAutoplay(),this.addEventListener("mouseenter",this._pauseAutoplay),this.addEventListener("focusin",this._pauseAutoplay),this.addEventListener("mouseleave",this._resumeAutoplay),this.addEventListener("focusout",this._resumeAutoplay),this.addEventListener("pointerenter",this._stopAutoplay),this.addEventListener("pointerleave",this._restartAutoplay),this.addEventListener("focusin",this._stopAutoplay),this.addEventListener("focusout",this._restartAutoplay)}disconnectedCallback(){super.disconnectedCallback(),this._stopAutoplay(),this.removeEventListener("pointerenter",this._stopAutoplay),this.removeEventListener("pointerleave",this._restartAutoplay),this.removeEventListener("focusin",this._stopAutoplay),this.removeEventListener("focusout",this._restartAutoplay)}firstUpdated(){this.onSlotChange()}_readPageBuilderSettings(){const t=this.dataset;"autoplay"in t&&(this.autoplay=t.autoplay==="true"),Number(t.autoplaySpeed)>0&&(this.autoplayInterval=Number(t.autoplaySpeed)),"fade"in t&&(this.fade=t.fade==="true"),"infiniteLoop"in t&&(this.loop=t.infiniteLoop==="true"),"showArrows"in t&&(this.showArrows=t.showArrows==="true"),"showDots"in t&&(this.showDots=t.showDots==="true")}_startAutoplay(){this._autoplayTimer||typeof matchMedia=="function"&&matchMedia("(prefers-reduced-motion: reduce)").matches||(this._autoplayTimer=setInterval(()=>{if(!this.loop&&this._currentIndex>=this._slideCount-1){this._stopAutoplay();return}this.next()},this.autoplayInterval))}_stopAutoplay(){this._autoplayTimer&&(clearInterval(this._autoplayTimer),this._autoplayTimer=null)}_restartAutoplay(){this.autoplay&&this._startAutoplay()}onSlotChange(){this._slideCount=this.children.length,this._currentIndex>=this._slideCount&&this._slideCount>0&&(this._currentIndex=0),this._syncSlides()}_syncSlides(){Array.from(this.children).forEach((t,i)=>{const l=i===this._currentIndex;t.toggleAttribute("data-hyperion-active",l),t.toggleAttribute("inert",!l)})}goTo(t){if(!(!this._slideCount||t===this._currentIndex)){if(t<0||t>=this._slideCount){if(!this.loop)return;t=(t+this._slideCount)%this._slideCount}this._currentIndex=t,this._syncSlides(),this._emitChange()}}prev(){this.goTo(this._currentIndex-1)}next(){this.goTo(this._currentIndex+1)}_emitChange(){this.dispatchEvent(new CustomEvent("hyperion-slide-change",{bubbles:!0,composed:!0,detail:{index:this._currentIndex}}))}_onPointerDown(t){this._pointerStartX=t.clientX}_onPointerUp(t){if(this._pointerStartX===null)return;const i=t.clientX-this._pointerStartX;this._pointerStartX=null,!(Math.abs(i)<50)&&(i<0?this.next():this.prev())}_onPointerMove(t){this._pointerStartX!==null&&t.preventDefault()}_renderArrows(){if(!this.showArrows||this._slideCount<2)return u;const t=!this.loop&&this._currentIndex===0,i=!this.loop&&this._currentIndex===this._slideCount-1;return s`
            <button
                part="prev-button"
                type="button"
                aria-label="${this.prevLabel}"
                ?disabled=${t}
                @click=${this.prev}
            >&#8249;</button>
            <button
                part="next-button"
                type="button"
                aria-label="${this.nextLabel}"
                ?disabled=${i}
                @click=${this.next}
            >&#8250;</button>
        `}_renderDots(){return this._dotsVisible?Array.from({length:this._slideCount},(t,i)=>s`
            <button
                part="dot"
                type="button"
                aria-label="${this.dotLabel?`${this.dotLabel} ${i+1}`:i+1}"
                aria-current="${i===this._currentIndex?"true":"false"}"
                @click=${()=>this.goTo(i)}
            ></button>
        `):u}get _dotsVisible(){return this.showDots&&this._slideCount>1}render(){const t=this._currentIndex*100;return s`
            <div part="viewport">
                <div
                    part="track"
                    style="transform: translateX(-${t}%);"
                    @pointerdown=${this._onPointerDown}
                    @pointermove=${this._onPointerMove}
                    @pointerup=${this._onPointerUp}
                    @pointercancel=${()=>{this._pointerStartX=null}}
                >
                    <slot @slotchange=${this.onSlotChange}></slot>
                </div>
                ${this._renderArrows()}
            </div>
            <div part="dots" ?hidden=${!this._dotsVisible}>${this._renderDots()}</div>
        `}}o(a,"properties",{autoplay:{type:Boolean,reflect:!0},autoplayInterval:{type:Number,attribute:"autoplay-interval",reflect:!0},showArrows:{attribute:"show-arrows",converter:n},showDots:{attribute:"show-dots",converter:n},loop:{converter:n},fade:{type:Boolean,reflect:!0},prevLabel:{type:String,attribute:"prev-label"},nextLabel:{type:String,attribute:"next-label"},dotLabel:{type:String,attribute:"dot-label"},_currentIndex:{state:!0},_slideCount:{state:!0}}),o(a,"styles",c`
        :host {
            --slide-gap: 0px;
            --slide-transition-duration: 300ms;
            --slider-button-background: rgb(var(--color-surface-raised));
            --slider-button-color: rgb(var(--color-primary));
            --slider-button-focus-ring: rgb(var(--color-primary));
            --slider-dot-color: rgb(var(--color-subtle));
            --slider-dot-active-color: rgb(var(--color-primary));
            display: block;
            position: relative;
        }

        /* min-height set on the host (PageBuilder writes it there) has to
           reach the slides: each level hands it down. */
        [part="viewport"] {
            min-height: inherit;
            overflow: hidden;
            position: relative;
        }

        [part="track"] {
            display: flex;
            gap: var(--slide-gap);
            min-height: inherit;
            transition: transform var(--slide-transition-duration);
            will-change: transform;
        }

        slot {
            min-height: inherit;
        }

        ::slotted(*) {
            box-sizing: border-box;
            flex-shrink: 0;
            min-width: 100%;
            width: 100%;
        }

        :host([fade]) [part="track"] {
            display: grid;
            transform: none !important;
        }

        :host([fade]) ::slotted(*) {
            grid-area: 1 / 1;
            opacity: 0;
            transition: opacity var(--slide-transition-duration), visibility var(--slide-transition-duration);
            visibility: hidden;
        }

        :host([fade]) ::slotted([data-hyperion-active]) {
            opacity: 1;
            visibility: visible;
        }

        @media (prefers-reduced-motion: reduce) {
            :host {
                --slide-transition-duration: 0ms;
            }
        }

        [part="prev-button"],
        [part="next-button"] {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            background: var(--slider-button-background);
            color: var(--slider-button-color);
            border: none;
            cursor: pointer;
            padding: 0.5rem 0.75rem;
            font-size: 1.5rem;
            line-height: 1;
            z-index: 10;
        }

        [part="prev-button"]:disabled,
        [part="next-button"]:disabled {
            cursor: default;
            opacity: 0.35;
        }

        [part="prev-button"]:focus-visible,
        [part="next-button"]:focus-visible,
        [part="dot"]:focus-visible {
            outline: 2px solid var(--slider-button-focus-ring);
            outline-offset: 2px;
        }

        [part="prev-button"] { left: 0; }
        [part="next-button"] { right: 0; }

        [part="dots"] {
            display: flex;
            gap: 10px;
            justify-content: center;
            padding: 15px 0;
        }

        [part="dots"][hidden] {
            display: none;
        }

        [part="dot"] {
            background: var(--slider-dot-color);
            border: 0;
            border-radius: 9999px;
            cursor: pointer;
            height: 14px;
            padding: 0;
            width: 14px;
        }

        [part="dot"][aria-current="true"] {
            background: var(--slider-dot-active-color);
        }
    `);customElements.get("hyperion-slider")||customElements.define("hyperion-slider",a);export{a as HyperionSlider};
//# sourceMappingURL=hyperion-slider.Cud419Cs.js.map
