var p=Object.defineProperty;var d=(r,i,t)=>i in r?p(r,i,{enumerable:!0,configurable:!0,writable:!0,value:t}):r[i]=t;var o=(r,i,t)=>d(r,typeof i!="symbol"?i+"":i,t);import{i as v,a as b,A as h,b as l}from"./lit-element.CGWggwb8.js";import{s,p as m}from"./reduced-motion.CWGrg7Zw.js";const n={fromAttribute:r=>r!==null&&r!=="false"&&r!=="0",toAttribute:r=>r?"true":"false"};class u extends v{constructor(){super();o(this,"_pauseAutoplay",()=>{this._stopAutoplay()});o(this,"_resumeAutoplay",()=>{this.autoplay&&!this.matches(":hover")&&!this.matches(":focus-within")&&this._startAutoplay()});this.autoplay=!1,this.autoplayInterval=4e3,this.showArrows=!0,this.showDots=!1,this.loop=!0,this.prevLabel="Previous slide",this.nextLabel="Next slide",this.dotLabel="Go to page",this._pageCount=1,this._currentPage=0,this._autoplayTimer=null,this._resizeObserver=null}connectedCallback(){super.connectedCallback(),this._readPageBuilderSettings(),this.autoplay&&this._startAutoplay(),this.addEventListener("mouseenter",this._pauseAutoplay),this.addEventListener("focusin",this._pauseAutoplay),this.addEventListener("mouseleave",this._resumeAutoplay),this.addEventListener("focusout",this._resumeAutoplay),this.addEventListener("pointerenter",this._stopAutoplay),this.addEventListener("pointerleave",this._restartAutoplay),this.addEventListener("focusin",this._stopAutoplay),this.addEventListener("focusout",this._restartAutoplay)}disconnectedCallback(){var t;super.disconnectedCallback(),this._stopAutoplay(),(t=this._resizeObserver)==null||t.disconnect(),this._resizeObserver=null,this.removeEventListener("pointerenter",this._stopAutoplay),this.removeEventListener("pointerleave",this._restartAutoplay),this.removeEventListener("focusin",this._stopAutoplay),this.removeEventListener("focusout",this._restartAutoplay)}firstUpdated(){typeof ResizeObserver=="function"&&this._track&&(this._resizeObserver=new ResizeObserver(()=>this._measure()),this._resizeObserver.observe(this._track)),this._measure()}_readPageBuilderSettings(){const e=(this.closest('[data-content-type="products"]')??this).dataset;"autoplay"in e&&(this.autoplay=e.autoplay==="true"),Number(e.autoplaySpeed)>0&&(this.autoplayInterval=Number(e.autoplaySpeed)),"infiniteLoop"in e&&(this.loop=e.infiniteLoop==="true"),"showArrows"in e&&(this.showArrows=e.showArrows==="true"),"showDots"in e&&(this.showDots=e.showDots==="true"),e.carouselMode==="continuous"&&(this.loop=!0,e.centerPadding&&this.style.setProperty("--carousel-center-padding",e.centerPadding))}_measure(){const t=this._track;!t||!t.clientWidth||(this._pageCount=Math.max(1,Math.ceil((t.scrollWidth-1)/t.clientWidth)),this._onScroll())}_onScroll(){const t=this._track;if(!t||!t.clientWidth)return;const e=t.scrollWidth-t.clientWidth;this._currentPage=t.scrollLeft>=e-1?this._pageCount-1:Math.round(t.scrollLeft/t.clientWidth)}_goToPage(t){const e=this._track;e&&e.scrollTo({left:t*e.clientWidth,behavior:s()})}get _track(){var t;return(t=this.shadowRoot)==null?void 0:t.querySelector('[part="track"]')}_startAutoplay(){this._autoplayTimer||m()||(this._autoplayTimer=setInterval(()=>{const t=this._track;if(!t)return;const e=this._itemWidth(),a=t.scrollWidth-t.clientWidth;if(t.scrollLeft>=a-1){if(!this.loop){this._stopAutoplay();return}t.scrollLeft=0}else t.scrollBy({left:e,behavior:s()})},this.autoplayInterval))}_stopAutoplay(){this._autoplayTimer&&(clearInterval(this._autoplayTimer),this._autoplayTimer=null)}_restartAutoplay(){this.autoplay&&this._startAutoplay()}_itemWidth(){var a,c;const t=this._track,e=((a=t==null?void 0:t.querySelector("slot"))==null?void 0:a.assignedElements())??[];return e.length>1?e[1].getBoundingClientRect().left-e[0].getBoundingClientRect().left:((c=e[0])==null?void 0:c.getBoundingClientRect().width)||(t==null?void 0:t.clientWidth)||200}_prev(){const t=this._track;if(t){if(t.scrollLeft<=1){this.loop&&t.scrollTo({left:t.scrollWidth,behavior:s()});return}t.scrollBy({left:-t.clientWidth,behavior:s()})}}_next(){const t=this._track;if(t){if(t.scrollLeft>=t.scrollWidth-t.clientWidth-1){this.loop&&t.scrollTo({left:0,behavior:s()});return}t.scrollBy({left:t.clientWidth,behavior:s()})}}_renderArrows(){return this.showArrows?l`
            <button
                part="prev-button"
                type="button"
                aria-label="${this.prevLabel}"
                @click=${this._prev}
            >&#8249;</button>
            <button
                part="next-button"
                type="button"
                aria-label="${this.nextLabel}"
                @click=${this._next}
            >&#8250;</button>
        `:h}_renderDots(){return this._dotsVisible?Array.from({length:this._pageCount},(t,e)=>l`
            <button
                part="dot"
                type="button"
                aria-label="${this.dotLabel?`${this.dotLabel} ${e+1}`:e+1}"
                aria-current="${e===this._currentPage?"true":"false"}"
                @click=${()=>this._goToPage(e)}
            ></button>
        `):h}get _dotsVisible(){return this.showDots&&this._pageCount>1}render(){return l`
            <div part="viewport">
                <div part="track" @scroll=${this._onScroll}>
                    <slot @slotchange=${this._measure}></slot>
                </div>
                ${this._renderArrows()}
            </div>
            <div part="dots" ?hidden=${!this._dotsVisible}>${this._renderDots()}</div>
        `}}o(u,"properties",{autoplay:{type:Boolean,reflect:!0},autoplayInterval:{type:Number,attribute:"autoplay-interval",reflect:!0},showArrows:{attribute:"show-arrows",converter:n},showDots:{attribute:"show-dots",converter:n},loop:{converter:n},prevLabel:{type:String,attribute:"prev-label"},nextLabel:{type:String,attribute:"next-label"},dotLabel:{type:String,attribute:"dot-label"},_pageCount:{state:!0},_currentPage:{state:!0}}),o(u,"styles",b`
        :host {
            /* Items per viewport size -- overridable per-instance with
               style="--items-base: 1; --items-md: 4;" if a usage
               needs a different ramp. The CSS-var approach keeps the
               component declarative without growing the JS API
               surface (no extra attributes, no Lit re-renders on
               viewport change). */
            --items-base: 2; /* < 640 px */
            --items-sm: 3; /* >= 640 px (Tailwind sm) */
            --items-lg: 4; /* >= 1024 px (Tailwind lg) */
            --items-xl: 5; /* >= 1280 px (Tailwind xl) -- max */

            --carousel-gap: 16px;
            --carousel-button-background: rgb(var(--color-surface-raised));
            --carousel-button-color: rgb(var(--color-primary));
            --carousel-dot-color: rgb(var(--color-subtle));
            --carousel-dot-active-color: rgb(var(--color-primary));
            --carousel-center-padding: 0px;

            /* Active items-per-view, set by media queries below. The
               width formula divides the available track width minus
               the inter-item gaps by the count. Resulting item width
               adjusts smoothly to the viewport. */
            --items-per-view: var(--items-base);

            display: block;
            position: relative;
        }

        @media (min-width: 640px) {
            :host { --items-per-view: var(--items-sm); }
        }
        @media (min-width: 1024px) {
            :host { --items-per-view: var(--items-lg); }
        }
        @media (min-width: 1280px) {
            :host { --items-per-view: var(--items-xl); }
        }

        /* position: relative makes the track the containing block of
           absolutely positioned descendants (sr-only labels in the cards);
           otherwise they are laid out against the host, escape the scroll
           clipping and widen the whole page. */
        [part="track"] {
            position: relative;
            display: flex;
            gap: var(--carousel-gap);
            overflow-x: auto;
            padding-inline: var(--carousel-center-padding);
            scroll-behavior: smooth;
            scroll-padding-inline: var(--carousel-center-padding);
            scroll-snap-type: x mandatory;
            scrollbar-width: none; /* Firefox */
        }

        [part="track"]::-webkit-scrollbar {
            display: none;
        }

        /* The document's _motion.css never reaches this shadow root: the
           track jumps instead of gliding when the visitor asked for reduced
           motion (the JS scroll calls read the same preference). */
        @media (prefers-reduced-motion: reduce) {
            [part="track"] {
                scroll-behavior: auto;
            }
        }

        ::slotted(*) {
            /* (track width - total gaps) / items-per-view. The
               (n - 1) gap count makes the math correct regardless
               of how many items the slot ends up with. */
            width: calc(
                (100% - var(--carousel-gap) * (var(--items-per-view) - 1))
                / var(--items-per-view)
            );
            flex-shrink: 0;
            scroll-snap-align: start;
        }

        [part="viewport"] {
            position: relative;
        }

        [part="prev-button"],
        [part="next-button"] {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            background: var(--carousel-button-background);
            color: var(--carousel-button-color);
            border: none;
            cursor: pointer;
            padding: 0.5rem 0.75rem;
            font-size: 1.5rem;
            line-height: 1;
            z-index: 10;
        }

        [part="prev-button"]:focus-visible,
        [part="next-button"]:focus-visible,
        [part="dot"]:focus-visible {
            outline: 2px solid var(--carousel-button-color);
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
            background: var(--carousel-dot-color);
            border: 0;
            border-radius: 9999px;
            cursor: pointer;
            height: 14px;
            padding: 0;
            width: 14px;
        }

        [part="dot"][aria-current="true"] {
            background: var(--carousel-dot-active-color);
        }
    `);customElements.get("hyperion-carousel")||customElements.define("hyperion-carousel",u);export{u as HyperionCarousel};
//# sourceMappingURL=hyperion-carousel.CgvNX2Gv.js.map
