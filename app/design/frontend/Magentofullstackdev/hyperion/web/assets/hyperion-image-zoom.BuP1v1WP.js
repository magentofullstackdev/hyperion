var n=Object.defineProperty;var c=(i,t,e)=>t in i?n(i,t,{enumerable:!0,configurable:!0,writable:!0,value:e}):i[t]=e;var r=(i,t,e)=>c(i,typeof t!="symbol"?t+"":t,e);import{i as l,a as h,b as g}from"./lit-element.CGWggwb8.js";class a extends l{constructor(){super(),this.zoomScale=2.5,this._active=!1,this._originX=50,this._originY=50}_getImg(){return this.querySelector("img")}activate(t){const e=this._getImg();if(!e)return;const o=e.currentSrc||e.src;o&&(this.style.setProperty("--_zoom-bg",`url(${o})`),this._active=!0,this.updateOrigin(t))}updateOrigin(t){if(!this._active)return;const e=this.getBoundingClientRect(),o=(t.clientX-e.left)/e.width*100,s=(t.clientY-e.top)/e.height*100;this._originX=Math.max(0,Math.min(100,o)),this._originY=Math.max(0,Math.min(100,s))}deactivate(){this._active=!1}render(){const t=this.zoomScale??2.5;return g`
            <div
                part="image"
                @pointerenter=${this.activate}
                @pointermove=${this.updateOrigin}
                @pointerleave=${this.deactivate}
            >
                <slot></slot>
            </div>
            <div
                part="zoom-overlay"
                ?hidden=${!this._active}
                style="
                    background-image: var(--_zoom-bg);
                    background-size: calc(${t} * 100%);
                    background-position: ${this._originX}% ${this._originY}%;
                "
                aria-hidden="true"
            ></div>
        `}}r(a,"properties",{zoomScale:{type:Number,attribute:"zoom-scale",reflect:!0},_active:{state:!0},_originX:{state:!0},_originY:{state:!0}}),r(a,"styles",h`
        :host {
            --zoom-scale: 2.5;
            --zoom-overlay-background: rgb(var(--color-surface));
            display: inline-block;
            position: relative;
            overflow: hidden;
            cursor: zoom-in;
        }

        [part="image"] {
            display: block;
            width: 100%;
            height: 100%;
        }

        [part="zoom-overlay"] {
            position: absolute;
            inset: 0;
            background-repeat: no-repeat;
            pointer-events: none;
        }

        [part="zoom-overlay"][hidden] {
            display: none;
        }
    `);customElements.get("hyperion-image-zoom")||customElements.define("hyperion-image-zoom",a);
//# sourceMappingURL=hyperion-image-zoom.BuP1v1WP.js.map
