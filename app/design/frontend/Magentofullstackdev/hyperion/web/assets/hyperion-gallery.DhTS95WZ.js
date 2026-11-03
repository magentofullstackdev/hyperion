const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./photoswipe.DSulWsr7.css"])))=>i.map(i=>d[i]);
var k=Object.defineProperty;var L=(i,t,e)=>t in i?k(i,t,{enumerable:!0,configurable:!0,writable:!0,value:e}):i[t]=e;var f=(i,t,e)=>L(i,typeof t!="symbol"?t+"":t,e);import{i as E,a as B,b as h}from"./lit-element.CGWggwb8.js";const z="modulepreload",I=function(i,t){return new URL(i,t).href},S={},y=function(t,e,o){let n=Promise.resolve();if(e&&e.length>0){let s=function(l){return Promise.all(l.map(u=>Promise.resolve(u).then(p=>({status:"fulfilled",value:p}),p=>({status:"rejected",reason:p}))))};const a=document.getElementsByTagName("link"),c=document.querySelector("meta[property=csp-nonce]"),b=(c==null?void 0:c.nonce)||(c==null?void 0:c.getAttribute("nonce"));n=s(e.map(l=>{if(l=I(l,o),l in S)return;S[l]=!0;const u=l.endsWith(".css"),p=u?'[rel="stylesheet"]':"";if(!!o)for(let m=a.length-1;m>=0;m--){const g=a[m];if(g.href===l&&(!u||g.rel==="stylesheet"))return}else if(document.querySelector(`link[href="${l}"]${p}`))return;const d=document.createElement("link");if(d.rel=u?"stylesheet":z,u||(d.as="script"),d.crossOrigin="",d.href=l,b&&d.setAttribute("nonce",b),document.head.appendChild(d),u)return new Promise((m,g)=>{d.addEventListener("load",m),d.addEventListener("error",()=>g(new Error(`Unable to preload CSS for ${l}`)))})}))}function r(s){const a=new Event("vite:preloadError",{cancelable:!0});if(a.payload=s,window.dispatchEvent(a),!a.defaultPrevented)throw s}return n.then(s=>{for(const a of s||[])a.status==="rejected"&&r(a.reason);return t().catch(r)})},C=/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/,T=/vimeo\.com\/(?:video\/)?(\d+)/;function W(i){const t=String(i||""),e=t.match(C);if(e)return{provider:"youtube",id:e[1]};const o=t.match(T);return o?{provider:"vimeo",id:o[1]}:null}function U(i,t={}){const e=W(i);if(!e)return null;const{autoplay:o=!1,loop:n=!1,background:r=!1}=t;if(e.provider==="youtube"){const a=new URLSearchParams({rel:"0",playsinline:"1",modestbranding:"1"});return(o||r)&&a.set("autoplay","1"),r&&(a.set("mute","1"),a.set("controls","0"),a.set("disablekb","1")),n&&(a.set("loop","1"),a.set("playlist",e.id)),`https://www.youtube-nocookie.com/embed/${e.id}?${a}`}const s=new URLSearchParams({dnt:"1"});return(o||r)&&s.set("autoplay","1"),r&&(s.set("background","1"),s.set("muted","1")),s.set("loop",n?"1":"0"),`https://player.vimeo.com/video/${e.id}?${s}`}const $=2.5,R=40;let _=null,v=null;function P(i){return new Promise(t=>{const e=new Image;e.onload=()=>t(e.naturalWidth>0),e.onerror=()=>t(!1),e.src=i})}function M(){return _||(_=P("data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==")),_}function O(){return v||(v=P("data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAAAEQAABAAEAAAAAARYAAQAAABgAAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAMAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACBtZGF0EgAKCBgABogQEDQgMgkQAAAAB8dSLfI=")),v}async function j(i){const t=i.full||i.img||"";return i.fullAvif&&await O()?i.fullAvif:i.fullWebp&&await M()?i.fullWebp:t}function Y(){const i=document.documentElement;if(i.hasAttribute("data-hyperion-pswp-theme"))return;i.setAttribute("data-hyperion-pswp-theme","true");const t=document.createElement("style");t.setAttribute("data-hyperion","pswp-theme"),t.textContent=`
        .pswp {
            --pswp-bg: #ffffff;
            --pswp-icon-color: #1f2937;
            --pswp-icon-color-secondary: #ffffff;
            --pswp-icon-stroke-color: #ffffff;
            --pswp-icon-stroke-width: 2;
            --pswp-placeholder-bg: #f4f4f5;
            --pswp-error-text-color: #1f2937;
            --pswp-root-z-index: 100000;
        }
        .pswp__bg {
            background: #ffffff;
        }
        .pswp__counter,
        .pswp__error-msg {
            color: #1f2937;
            text-shadow: none;
        }
        .pswp__button {
            color: #1f2937;
        }
        .pswp__button:hover,
        .pswp__button:focus-visible {
            color: rgb(var(--color-primary, 37 99 235));
        }
    `,document.head.appendChild(t)}function G(i){if(!i||typeof i!="object")return null;const t=i.full||i.url||i.img||i.thumb||"",e=i.img||i.url||i.full||i.thumb||"",o=i.thumb||i.img||i.url||i.full||"";return e?{thumb:o,img:e,full:t,thumbWebp:(i.thumbWebp||"").toString(),imgWebp:(i.imgWebp||"").toString(),fullWebp:(i.fullWebp||"").toString(),thumbAvif:(i.thumbAvif||"").toString(),imgAvif:(i.imgAvif||"").toString(),fullAvif:(i.fullAvif||"").toString(),caption:(i.caption||i.label||"").toString(),isMain:!!i.isMain,position:Number.isFinite(+i.position)?+i.position:0,type:i.videoUrl&&String(i.type||"").includes("video")?"video":"image",videoUrl:(i.videoUrl||"").toString(),videoTitle:(i.videoTitle||i.caption||"").toString()}:null}function w(i){if(!i)return[];if(Array.isArray(i))return i.map(G).filter(Boolean);if(typeof i=="string"){const t=i.trim();if(!t)return[];try{const e=JSON.parse(t);return w(e)}catch{return[]}}return[]}class x extends E{constructor(){super(),this.images="",this.alt="",this.zoomScale=$,this.galleryLabel="Product image gallery",this.expandLabel="Open fullscreen",this.playLabel="Play video",this.closeLabel="Close",this.imageLabel="Image %1",this.videoLabel="Video %1",this._swipe=null,this._swiped=!1,this._base=[],this._current=[],this._activeIndex=0,this._zoomActive=!1,this._originX=50,this._originY=50,this._lightboxBusy=!1,this._lightboxPromise=null,this._onGalleryUpdate=this._onGalleryUpdate.bind(this)}connectedCallback(){super.connectedCallback(),document.addEventListener("hyperion:gallery-update",this._onGalleryUpdate)}disconnectedCallback(){super.disconnectedCallback(),document.removeEventListener("hyperion:gallery-update",this._onGalleryUpdate)}willUpdate(t){if(t.has("images")){const e=w(this.images);this._base=e,this._current=e,this._activeIndex=e.length?Math.min(this._activeIndex,e.length-1):0}}_onGalleryUpdate(t){const e=(t==null?void 0:t.detail)||{},o=w(e.images);if(this._videoPlaying=!1,o.length>0){this._current=o,this._activeIndex=0;return}this._current=this._base,this._activeIndex=0}_onThumbClick(t){var e;t<0||t>=this._current.length||(this._activeIndex=t,this._zoomActive=!1,this._videoPlaying=((e=this._current[t])==null?void 0:e.type)==="video")}_playVideo(t){var e;t==null||t.stopPropagation(),((e=this._activeImage())==null?void 0:e.type)==="video"&&(this._videoPlaying=!0)}_renderVideoStage(t){const e=this._videoPlaying?U(t.videoUrl,{autoplay:!0}):null;return e?h`
                <div part="video" data-provider="${e.includes("vimeo")?"vimeo":"youtube"}">
                    <iframe part="video-frame"
                            src="${e}"
                            title="${t.videoTitle||t.caption||this.alt||"Product video"}"
                            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                            allowfullscreen
                            loading="lazy"
                            referrerpolicy="strict-origin-when-cross-origin"></iframe>
                </div>`:h`
            <div part="video" data-poster>
                <img part="main-image" src="${t.img||""}" alt="${t.caption||this.alt||""}" loading="eager">
                <button type="button" part="play-button" aria-label="${this.playLabel}" @click=${this._playVideo}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
                </button>
            </div>`}_activeImage(){return this._current[this._activeIndex]||null}_positionLabel(t,e){const o=String(t||"");return o.includes("%1")?o.replace("%1",String(e)):`${o} ${e}`.trim()}_onSwipeStart(t){t.pointerType!=="mouse"&&(this._swipe={id:t.pointerId,x:t.clientX,y:t.clientY})}_onSwipeCancel(){this._swipe=null}_onSwipeEnd(t){const e=this._swipe;if(this._swipe=null,!e||e.id!==t.pointerId||this._current.length<2)return;const o=t.clientX-e.x,n=t.clientY-e.y;if(Math.abs(o)<R||Math.abs(o)<=Math.abs(n))return;this._swiped=!0;const r=this._current.length;this._onThumbClick((this._activeIndex+(o<0?1:r-1))%r)}_onPointerEnter(t){t.pointerType!=="touch"&&(this._zoomActive=!0,this._updateOrigin(t))}_updateOrigin(t){if(!this._zoomActive)return;const e=t.currentTarget.getBoundingClientRect(),o=(t.clientX-e.left)/e.width*100,n=(t.clientY-e.top)/e.height*100;this._originX=Math.max(0,Math.min(100,o)),this._originY=Math.max(0,Math.min(100,n))}_onPointerLeave(){this._zoomActive=!1}async _openLightbox(t){var o;if(t&&t.preventDefault(),this._swiped){this._swiped=!1;return}if(this._lightboxBusy)return;const e=this._current;if(e.length){this._lightboxBusy=!0;try{const{PhotoSwipeLightbox:n}=await this._loadPhotoSwipe(),r=(o=this.shadowRoot)==null?void 0:o.querySelector('[part="main-image"]'),s=r!=null&&r.naturalWidth&&(r!=null&&r.naturalHeight)?{w:r.naturalWidth,h:r.naturalHeight}:{w:1600,h:1600},a=await Promise.all(e.map(u=>j(u))),c=await Promise.all(a.map(u=>this._probeImage(u,s))),b=e.map((u,p)=>({src:a[p],alt:u.caption||this.alt||"",width:c[p].w,height:c[p].h})),l=new n({dataSource:b,pswpModule:()=>y(()=>import("./photoswipe.esm.D2Nf-uDI.js"),[],import.meta.url),showHideAnimationType:"fade",bgOpacity:.92,closeTitle:this.closeLabel,zoomTitle:"Zoom",arrowPrevTitle:"Previous image",arrowNextTitle:"Next image"});l.on("uiRegister",()=>{var u,p,A;(A=(p=(u=l.pswp)==null?void 0:u.ui)==null?void 0:p.registerElement)==null||A.call(p,{name:"download-button",ariaLabel:"Download image",order:8,isButton:!1,tagName:"div"})}),l.on("close",()=>{l.destroy()}),l.init(),l.loadAndOpen(this._activeIndex)}catch(n){console.error("hyperion-gallery: lightbox failed to load",n)}finally{this._lightboxBusy=!1}}}_probeImage(t,e){if(!t)return Promise.resolve(e);if(this._probeCache||(this._probeCache=new Map),this._probeCache.has(t))return this._probeCache.get(t);const o=new Promise(n=>{const r=new Image;r.onload=()=>n({w:r.naturalWidth,h:r.naturalHeight}),r.onerror=()=>n(e),r.src=t});return this._probeCache.set(t,o),o}_loadPhotoSwipe(){return this._lightboxPromise||(this._lightboxPromise=Promise.all([y(()=>import("./photoswipe-lightbox.esm.4VpeJUsy.js"),[],import.meta.url),y(()=>Promise.resolve({}),__vite__mapDeps([0]),import.meta.url)]).then(([t])=>(Y(),{PhotoSwipeLightbox:t.default}))),this._lightboxPromise}_renderMainStage(t,e,o){return h`
            <div part="main"
                 @pointerenter=${this._onPointerEnter}
                 @pointermove=${this._updateOrigin}
                 @pointerleave=${this._onPointerLeave}
                 @pointerdown=${this._onSwipeStart}
                 @pointerup=${this._onSwipeEnd}
                 @pointercancel=${this._onSwipeCancel}
                 @click=${this._openLightbox}>
                <picture>
                    ${t!=null&&t.imgAvif?h`<source type="image/avif" srcset="${t.imgAvif}">`:""}
                    ${t!=null&&t.imgWebp?h`<source type="image/webp" srcset="${t.imgWebp}">`:""}
                    <img part="main-image"
                         src="${(t==null?void 0:t.img)||""}"
                         alt="${(t==null?void 0:t.caption)||this.alt||""}"
                         loading="eager"
                         fetchpriority="high"
                         itemprop="image">
                </picture>
                <div part="zoom-overlay"
                     data-active="${String(this._zoomActive)}"
                     style="background-image:${o};
                            background-size: calc(${e} * 100%);
                            background-position: ${this._originX}% ${this._originY}%;"
                     aria-hidden="true"></div>
                <button type="button"
                        part="expand-button"
                        aria-label="${this.expandLabel}"
                        @click=${this._openLightbox}
                        @pointerenter=${n=>n.stopPropagation()}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <polyline points="9 21 3 21 3 15"></polyline>
                        <line x1="21" y1="3" x2="14" y2="10"></line>
                        <line x1="3" y1="21" x2="10" y2="14"></line>
                    </svg>
                </button>
            </div>
        `}render(){if(!this._current.length)return h`<slot></slot>`;const t=this._activeImage(),e=this.zoomScale||$,o=t?`url(${t.full||t.img})`:"none",n=(t==null?void 0:t.type)==="video";return h`
            ${n?this._renderVideoStage(t):this._renderMainStage(t,e,o)}
            ${this._current.length>1?h`
                    <div part="thumbs"
                         role="group"
                         aria-label="${this.galleryLabel}">
                        ${this._current.map((r,s)=>h`
                            <button type="button"
                                    part="thumb"
                                    data-type="${r.type}"
                                    aria-current="${s===this._activeIndex?"true":"false"}"
                                    aria-label="${r.type==="video"?r.videoTitle||this._positionLabel(this.videoLabel,s+1):r.caption||this._positionLabel(this.imageLabel,s+1)}"
                                    @click=${()=>this._onThumbClick(s)}>
                                ${r.type==="video"?h`<span part="thumb-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>`:""}
                                <picture>
                                    ${r.thumbAvif?h`<source type="image/avif" srcset="${r.thumbAvif}">`:""}
                                    ${r.thumbWebp?h`<source type="image/webp" srcset="${r.thumbWebp}">`:""}
                                    <img src="${r.thumb||r.img}"
                                         alt=""
                                         loading="lazy"
                                         decoding="async">
                                </picture>
                            </button>
                        `)}
                    </div>
                `:""}
        `}}f(x,"properties",{images:{type:String},alt:{type:String},zoomScale:{type:Number,attribute:"zoom-scale",reflect:!0},galleryLabel:{type:String,attribute:"gallery-label"},expandLabel:{type:String,attribute:"expand-label"},playLabel:{type:String,attribute:"play-label"},closeLabel:{type:String,attribute:"close-label"},imageLabel:{type:String,attribute:"image-label"},videoLabel:{type:String,attribute:"video-label"},_base:{state:!0},_current:{state:!0},_activeIndex:{state:!0},_zoomActive:{state:!0},_originX:{state:!0},_originY:{state:!0},_lightboxBusy:{state:!0},_videoPlaying:{state:!0}}),f(x,"styles",B`
        :host {
            --hg-radius: 1rem;
            --hg-thumb-size: 5rem;
            --hg-zoom-scale: 2.5;
            --hg-border: rgb(var(--color-subtle));
            --hg-border-active: rgb(var(--color-primary));
            --hg-surface-raised: rgb(var(--color-surface-raised));
            display: block;
        }

        [part="main"] {
            position: relative;
            aspect-ratio: 1 / 1;
            background: var(--hg-surface-raised);
            border-radius: var(--hg-radius);
            overflow: hidden;
            cursor: zoom-in;
            /* Horizontal drags are the swipe, vertical ones the page scroll. */
            touch-action: pan-y;
        }

        [part="main-image"] {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: contain;
            transition: transform 150ms ease-out;
            user-select: none;
        }

        [part="zoom-overlay"] {
            position: absolute;
            inset: 0;
            background-repeat: no-repeat;
            pointer-events: none;
            opacity: 0;
            transition: opacity 120ms ease-in-out;
        }

        [part="zoom-overlay"][data-active="true"] {
            opacity: 1;
        }

        /* Only show hover-zoom on fine-pointer devices. Touch users get
           the lightbox instead (cleaner finger-friendly interaction). */
        @media (any-pointer: coarse) {
            [part="zoom-overlay"] {
                display: none !important;
            }
            [part="main"] {
                cursor: default;
            }
        }

        [part="expand-button"] {
            position: absolute;
            bottom: 0.75rem;
            right: 0.75rem;
            width: 2.25rem;
            height: 2.25rem;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            background: rgb(var(--color-surface) / 0.9);
            color: rgb(var(--color-secondary));
            border: 1px solid var(--hg-border);
            border-radius: 9999px;
            cursor: pointer;
            box-shadow: 0 1px 3px rgb(0 0 0 / 0.1);
            transition: background-color 150ms, color 150ms, transform 150ms;
        }

        [part="expand-button"]:hover,
        [part="expand-button"]:focus-visible {
            background: rgb(var(--color-surface));
            color: rgb(var(--color-primary));
            outline: none;
            transform: scale(1.05);
        }

        [part="expand-button"] svg {
            width: 1rem;
            height: 1rem;
            stroke: currentColor;
            fill: none;
            stroke-width: 2;
            stroke-linecap: round;
            stroke-linejoin: round;
        }

        [part="thumbs"] {
            display: flex;
            gap: 0.75rem;
            overflow-x: auto;
            padding: 0.5rem 0;
            scroll-behavior: smooth;
        }

        [part="video"] {
            position: relative;
            width: 100%;
            aspect-ratio: 16 / 9;
            overflow: hidden;
            border-radius: 0.75rem;
            background: #000;
        }
        [part="video-frame"] {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            border: 0;
        }
        [part="video"][data-poster] img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        [part="play-button"],
        [part="thumb-play"] {
            position: absolute;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 9999px;
            background: rgb(0 0 0 / 0.6);
            color: #fff;
            border: 0;
        }
        [part="play-button"] {
            top: 50%;
            left: 50%;
            width: 4rem;
            height: 4rem;
            transform: translate(-50%, -50%);
            cursor: pointer;
        }
        [part="play-button"]:focus-visible {
            outline: 2px solid #fff;
            outline-offset: 2px;
        }
        [part="play-button"] svg,
        [part="thumb-play"] svg {
            width: 55%;
            height: 55%;
            fill: currentColor;
        }
        [part="thumb-play"] {
            top: 50%;
            left: 50%;
            width: 1.75rem;
            height: 1.75rem;
            transform: translate(-50%, -50%);
            pointer-events: none;
            z-index: 1;
        }
        [part="thumb"] {
            flex: 0 0 var(--hg-thumb-size);
            width: var(--hg-thumb-size);
            height: var(--hg-thumb-size);
            padding: 0;
            background: var(--hg-surface-raised);
            border: 2px solid transparent;
            border-radius: 0.5rem;
            overflow: hidden;
            cursor: pointer;
            transition: border-color 150ms ease-in-out;
        }

        [part="thumb"]:hover,
        [part="thumb"]:focus-visible {
            border-color: rgba(var(--color-primary), 0.4);
            outline: none;
        }

        [part="thumb"][aria-current="true"] {
            border-color: var(--hg-border-active);
        }

        [part="thumb"] img {
            display: block;
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        /* The document's _motion.css never reaches this shadow root: under
           reduced motion the thumbnail strip jumps and the transitions of
           this sheet (image zoom, zoom overlay, expand button, thumb border)
           are cut to a near-zero duration (never none: transitionend
           must keep firing). This block is the LAST rule of the sheet on
           purpose: a later transition shorthand on the same part would
           win over the duration set here. */
        @media (prefers-reduced-motion: reduce) {
            [part="thumbs"] {
                scroll-behavior: auto;
            }
            [part="main-image"],
            [part="zoom-overlay"],
            [part="expand-button"],
            [part="thumb"] {
                transition-duration: 0.01ms;
            }
        }
    `);customElements.get("hyperion-gallery")||customElements.define("hyperion-gallery",x);export{y as _,U as v};
//# sourceMappingURL=hyperion-gallery.DhTS95WZ.js.map
