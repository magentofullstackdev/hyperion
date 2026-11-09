var g=Object.defineProperty;var m=(p,t,e)=>t in p?g(p,t,{enumerable:!0,configurable:!0,writable:!0,value:e}):p[t]=e;var d=(p,t,e)=>m(p,typeof t!="symbol"?t+"":t,e);import{i as f,a as b,b as c}from"./lit-element.CGWggwb8.js";const _="1",y="2",w="3";class h extends f{constructor(){super(),this.config="",this.galleryTarget="",this.formId="",this.priceCurrencyFormat="$%s",this.priceTarget="",this.stockTarget="",this.compact=!1,this._parsedConfig=null,this._selected={},this._currentProductId=null}connectedCallback(){super.connectedCallback(),this._parseConfig()}updated(t){t.has("config")&&this._parseConfig()}_parseConfig(){if(!this.config){this._parsedConfig=null;return}try{const t=JSON.parse(this.config);this._parsedConfig=t&&typeof t=="object"?t:null}catch{this._parsedConfig=null}this._applyDefaultValues()}_applyDefaultValues(){var r;const t=(r=this._parsedConfig)==null?void 0:r.defaultValues;if(!t||typeof t!="object"||Object.keys(this._selected).length)return;let e=!1;for(const s of this._getAttributes()){const i=t[String(s.id)];i==null||i===""||this._isOptionAvailable(s.id,i)&&(this._selected={...this._selected,[String(s.id)]:String(i)},e=!0)}e&&this._commitSelection()}_getAttributes(){const t=this._parsedConfig;return!t||!t.attributes?[]:Object.values(t.attributes).sort((e,r)=>Number(e.position??0)-Number(r.position??0))}_getSwatchMeta(t,e){var r,s,i;return((i=(s=(r=this._parsedConfig)==null?void 0:r.swatches)==null?void 0:s[String(t)])==null?void 0:i[String(e)])??null}_getOption(t,e){var s,i;const r=(i=(s=this._parsedConfig)==null?void 0:s.attributes)==null?void 0:i[String(t)];return r?r.options.find(a=>String(a.id)===String(e))??null:null}_getCompatibleProductIds(t=null){const e=this._parsedConfig;if(!e||!e.attributes)return[];let r=null;for(const[s,i]of Object.entries(this._selected)){if(t!==null&&String(s)===String(t))continue;const a=this._getOption(s,i);if(!a)continue;const n=new Set((a.products??[]).map(String));r=r===null?n:new Set([...r].filter(o=>n.has(o)))}if(r===null){r=new Set;for(const s of Object.values(e.attributes))for(const i of s.options)for(const a of i.products??[])r.add(String(a))}return[...r]}_isOptionAvailable(t,e){const r=this._getOption(t,e);if(!r||!(r.products??[]).length)return!1;const s=new Set(this._getCompatibleProductIds(t));return(r.products??[]).some(i=>s.has(String(i)))}_resolveUniqueProduct(){const t=this._getCompatibleProductIds();return t.length===1?t[0]:null}_getFinalPriceAmount(t){var s,i,a,n;if(!t)return null;const e=(i=(s=this._parsedConfig)==null?void 0:s.optionPrices)==null?void 0:i[String(t)];if(!e)return null;const r=((a=e.finalPrice)==null?void 0:a.amount)??((n=e.basePrice)==null?void 0:n.amount)??null;return r==null?null:Number(r)}_getOldPriceAmount(t){var a,n,o;if(!t)return null;const e=(n=(a=this._parsedConfig)==null?void 0:a.optionPrices)==null?void 0:n[String(t)];if(!e)return null;const r=(o=e.oldPrice)==null?void 0:o.amount;if(r==null)return null;const s=Number(r),i=this._getFinalPriceAmount(t);return i==null||!(s>i)?null:s}_formatPrice(t){var r;if(t==null)return"";const e=((r=this._parsedConfig)==null?void 0:r.currencyFormat)||this.priceCurrencyFormat||"$%s";return String(e).replace("%s",t.toFixed(2))}_buildPriceHtml(t){const e=this._getFinalPriceAmount(t);if(e==null)return"";const r=this._getOldPriceAmount(t),s=this._escape(this._formatPrice(e));if(r==null)return`<span class="font-bold text-secondary">${s}</span>`;const i=this._escape(this._formatPrice(r));return`<span class="font-bold text-secondary">${s}</span> <span class="line-through font-bold text-secondary">${i}</span>`}_escape(t){return String(t).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}_getMainImage(t){var r,s;if(!t)return null;const e=((s=(r=this._parsedConfig)==null?void 0:r.images)==null?void 0:s[String(t)])??[];return e.length?e.find(i=>i.isMain)??e[0]:null}_getImagesForProduct(t){var r,s;if(!t)return[];const e=((s=(r=this._parsedConfig)==null?void 0:r.images)==null?void 0:s[String(t)])??[];return e.length?e.map(i=>({thumb:i.thumb||i.img||i.full||"",img:i.img||i.full||i.thumb||"",full:i.full||i.img||i.thumb||"",caption:String(i.caption??i.label??""),isMain:!!i.isMain,position:Number.isFinite(+i.position)?+i.position:0})):[]}_resolveImageProduct(){if(this._currentProductId)return this._currentProductId;const t=this._getCompatibleProductIds();return t.length===1?t[0]:t[0]??null}_selectOption(t,e){this._isOptionAvailable(t,e)&&(this._selected={...this._selected,[String(t)]:String(e)},this._commitSelection())}_commitSelection(){this._currentProductId=this._resolveUniqueProduct(),this._syncHiddenInputs(),this._syncGallery(),this._dispatchGalleryUpdate(),this._syncLightDomPrice(),this._syncStockNotice(),this._emitChange()}_dispatchGalleryUpdate(){const t=this._resolveImageProduct(),e=this._getImagesForProduct(t),r={productId:t?Number(t):null,images:e};document.dispatchEvent(new CustomEvent("hyperion:gallery-update",{bubbles:!0,composed:!0,detail:r}))}_syncHiddenInputs(){const t=this.formId?document.getElementById(this.formId):document;if(t)for(const[e,r]of Object.entries(this._selected)){const s=`input[name="super_attribute[${e}]"]`,i=t.querySelector(s);i&&(i.value=String(r))}}_syncGallery(){var s,i;const t=this.galleryTarget?document.querySelector(this.galleryTarget):(s=this.closest("article"))==null?void 0:s.querySelector("[data-tile-image]");if(!t)return;const e=this._getMainImage(this._currentProductId||this._resolveImageProduct());if(!e)return;const r=e.img||e.full||e.thumb;r&&(((i=t.parentElement)==null?void 0:i.tagName)==="PICTURE"&&t.parentElement.querySelectorAll("source").forEach(a=>a.remove()),t.src=r,t.removeAttribute("srcset")),(e.caption||e.label)&&(t.alt=e.caption||e.label)}_getMsrp(t){var i,a,n,o,l,u;if(!t)return null;const e=(a=(i=this._parsedConfig)==null?void 0:i.msrp)==null?void 0:a[String(t)];if(!e)return null;const r=(u=(l=(o=(n=this._parsedConfig)==null?void 0:n.optionPrices)==null?void 0:o[String(t)])==null?void 0:l.msrpPrice)==null?void 0:u.amount;return{amount:r==null?null:Number(r),gesture:!!e.gesture,message:String(e.message||"")}}_syncLightDomPrice(){if(!this.priceTarget)return;const t=this._getFinalPriceAmount(this._currentProductId);if(t==null)return;const e=document.querySelector(this.priceTarget);if(!e)return;const r=this._getMsrp(this._currentProductId);if(r){this._syncMapPrice(e,r,t);return}const s=Array.from(e.querySelectorAll("meta[itemprop]")),i=e.querySelector('[itemprop="offers"][itemscope]'),a=(i==null?void 0:i.getAttribute("itemtype"))||"";if(e.innerHTML=this._buildPriceHtml(this._currentProductId),!s.length)return;let n=e;i&&(n=document.createElement("span"),n.setAttribute("itemprop","offers"),n.setAttribute("itemscope",""),a&&n.setAttribute("itemtype",a),e.appendChild(n)),s.forEach(o=>{o.getAttribute("itemprop")==="price"&&o.setAttribute("content",String(t)),n.appendChild(o)})}_syncMapPrice(t,e,r){const s=e.amount==null?"":this._formatPrice(e.amount),i=this._formatPrice(r),a=t.querySelector("[data-hyperion-msrp]");if(a){const l=a.querySelector(".map-old-price .price")??a.querySelector(".map-old-price");l&&s&&(l.textContent=s),a.querySelectorAll("hyperion-msrp-popup").forEach(u=>{typeof u.setActualPriceHtml=="function"&&u.setActualPriceHtml(`<span class="price">${this._escape(i)}</span>`)});return}const n=s?`<span class="old-price map-old-price line-through font-bold text-muted">${this._escape(s)}</span> `:"",o=this._escape(e.message||(e.gesture?this._label("clickForPrice","Click for price"):""));t.innerHTML=`<div data-hyperion-msrp="${e.gesture?"gesture":"message"}">${n}<span class="msrp-message text-sm text-secondary">${o}</span></div>`}_label(t,e){var s,i;const r=(i=(s=this._parsedConfig)==null?void 0:s.labels)==null?void 0:i[t];return typeof r=="string"&&r!==""?r:e}_getStockNotice(t){var e,r;return t?String(((r=(e=this._parsedConfig)==null?void 0:e.stockNotices)==null?void 0:r[String(t)])??""):""}_syncStockNotice(){if(!this.stockTarget)return;const t=document.querySelector(this.stockTarget);if(!t)return;const e=this._getStockNotice(this._currentProductId);t.textContent=e,t.hidden=e===""}_emitChange(){var s,i;const t=this._currentProductId,e=this._getFinalPriceAmount(t),r=t?String(((i=(s=this._parsedConfig)==null?void 0:s.skus)==null?void 0:i[String(t)])??""):"";this.dispatchEvent(new CustomEvent("hyperion-swatch-change",{bubbles:!0,composed:!0,detail:{superAttributes:{...this._selected},price:e,sku:r,productId:t?Number(t):null,image:this._getMainImage(t),stockNotice:this._getStockNotice(t)}}))}render(){const t=this._getAttributes();if(!t.length)return c`<slot></slot>`;let e="";if(!this.priceTarget){const r=this._getFinalPriceAmount(this._currentProductId),s=this._getOldPriceAmount(this._currentProductId);r!=null&&s!=null?e=c`
                    <p part="price-display" aria-live="polite">
                        <span class="final">${this._formatPrice(r)}</span>
                        <span class="old" aria-label="${this._label("regularPrice","Regular Price")}">${this._formatPrice(s)}</span>
                    </p>
                `:r!=null&&(e=c`<p part="price-display" aria-live="polite">${this._formatPrice(r)}</p>`)}return c`
            <div part="swatch-list">
                ${t.map(r=>this._renderAttributeGroup(r))}
                ${e}
            </div>
        `}_renderAttributeGroup(t){const e=String(t.id),r=this._selected[e],s=r?t.options.find(i=>String(i.id)===String(r)):null;return c`
            <fieldset part="attribute-group" role="radiogroup" aria-label="${t.label||""}">
                <legend part="attribute-label">
                    <span>${t.label||""}</span>
                    ${s?c`<span class="selected-option">${s.label}</span>`:""}
                </legend>
                <div part="options">
                    ${t.options.map(i=>this._renderSwatchOption(t,i))}
                </div>
            </fieldset>
        `}_renderSwatchOption(t,e){const r=this._isOptionAvailable(t.id,e.id),s=String(this._selected[String(t.id)])===String(e.id),i=this._getSwatchMeta(t.id,e.id),a=i?String(i.type??""):"",n=i?i.value??"":"";let o;if(a===_&&n)o=c`
                <span class="color-chip" style="background-color: ${n}" aria-hidden="true"></span>
                <span class="sr-only">${e.label||""}</span>
            `;else if(a===y&&n){const l=n.startsWith("http")||n.startsWith("/")?n:`/media/attribute/swatch${n.startsWith("/")?"":"/"}${n}`;o=c`
                <span class="color-chip" style="background-image: url('${l}')" aria-hidden="true"></span>
                <span class="sr-only">${e.label||""}</span>
            `}else a===w&&n?o=c`<span>${n}</span>`:o=c`<span>${e.label||""}</span>`;return c`
            <button
                type="button"
                part="swatch-item"
                role="radio"
                aria-checked="${s}"
                aria-label="${e.label||""}"
                title="${e.label||""}"
                data-available="${r}"
                data-attribute-id="${t.id}"
                data-option-id="${e.id}"
                data-swatch-type="${a}"
                ?disabled=${!r}
                @click=${()=>this._selectOption(t.id,e.id)}>
                ${o}
            </button>
        `}}d(h,"properties",{config:{type:String},galleryTarget:{type:String,attribute:"gallery-target"},formId:{type:String,attribute:"form-id"},priceCurrencyFormat:{type:String,attribute:"price-currency-format"},priceTarget:{type:String,attribute:"price-target"},stockTarget:{type:String,attribute:"stock-target"},compact:{type:Boolean,reflect:!0},_parsedConfig:{state:!0},_selected:{state:!0},_currentProductId:{state:!0}}),d(h,"styles",b`
        :host {
            --swatch-size: 2rem;
            --swatch-border-radius: 0.25rem;
            --swatch-selected-border-color: rgb(var(--color-primary));
            --swatch-border-color: rgb(var(--color-subtle));
            --swatch-text-color: rgb(var(--color-secondary));
            --swatch-focus-ring-color: rgb(var(--color-primary));
            --swatch-unavailable-opacity: 0.4;
            display: block;
        }

        [part="swatch-list"] {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }

        /* Compact PLP-tile mode: pull the attribute groups in tight and
           drop the row-level gap -- tiles only show chip rows so the
           between-group spacing is unnecessary. */
        :host([compact]) [part="swatch-list"] {
            gap: 0.375rem;
        }

        [part="attribute-group"] {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            border: none;
            padding: 0;
            margin: 0;
        }

        :host([compact]) [part="attribute-group"] {
            gap: 0;
        }

        [part="attribute-label"] {
            font-weight: 600;
            font-size: 0.875rem;
            color: var(--swatch-text-color);
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        [part="attribute-label"] .selected-option {
            font-weight: 400;
            opacity: 0.7;
        }

        /* Hide legends and the in-component price in compact PLP mode so the
           tile only shows the chip rows; the price is delivered into the
           external price-target element on the tile instead. */
        :host([compact]) [part="attribute-label"],
        :host([compact]) [part="price-display"] {
            display: none;
        }

        [part="options"] {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
        }

        [part="swatch-item"] {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: var(--swatch-size);
            height: var(--swatch-size);
            padding: 0 0.75rem;
            background: transparent;
            border: 1px solid var(--swatch-border-color);
            border-radius: var(--swatch-border-radius);
            color: var(--swatch-text-color);
            cursor: pointer;
            font: inherit;
            font-size: 0.875rem;
            transition: border-color 150ms ease-in-out;
        }

        [part="swatch-item"][aria-checked="true"] {
            border-color: var(--swatch-selected-border-color);
            border-width: 2px;
            padding: 0 calc(0.75rem - 1px);
        }

        /* Color / image swatches drop the outer button border so only the
           circular chip is visible. Textual (size) swatches keep their
           button border (the XS/S/M/L/XL boxes stay bordered). Selected state is carried by a
           ring on the chip itself instead of a 2px border on the button,
           so the chip row stays on a single visual line. */
        [part="swatch-item"][data-swatch-type="1"],
        [part="swatch-item"][data-swatch-type="2"] {
            border: 0;
            padding: 0;
            min-width: 0;
            background: transparent;
        }

        [part="swatch-item"][data-swatch-type="1"][aria-checked="true"],
        [part="swatch-item"][data-swatch-type="2"][aria-checked="true"] {
            border: 0;
            padding: 0;
        }

        [part="swatch-item"][data-swatch-type="1"][aria-checked="true"] .color-chip,
        [part="swatch-item"][data-swatch-type="2"][aria-checked="true"] .color-chip {
            box-shadow: 0 0 0 2px var(--swatch-selected-border-color);
        }

        [part="swatch-item"]:focus-visible {
            outline: 2px solid var(--swatch-focus-ring-color);
            outline-offset: 2px;
        }

        [part="swatch-item"][data-available="false"] {
            opacity: var(--swatch-unavailable-opacity);
            cursor: not-allowed;
            text-decoration: line-through;
        }

        [part="swatch-item"] .color-chip {
            display: inline-block;
            width: calc(var(--swatch-size) - 0.625rem);
            height: calc(var(--swatch-size) - 0.625rem);
            border-radius: 9999px;
            border: 1px solid var(--swatch-border-color);
            background-size: cover;
            background-position: center;
        }

        /* Shadow-DOM-local .sr-only -- Tailwind's utility does not penetrate. */
        .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
        }

        [part="price-display"] {
            font-weight: 700;
            font-size: 1.125rem;
            color: var(--swatch-text-color);
            margin: 0;
            display: inline-flex;
            align-items: baseline;
            gap: 0.5rem;
        }

        /* Unified price styling -- see _pricing.css.
           Final and old prices share size, weight, and color; only
           the strikethrough differentiates the old price. */
        [part="price-display"] .final,
        [part="price-display"] .old {
            font-weight: 700;
            font-size: inherit;
            color: inherit;
        }

        [part="price-display"] .old {
            text-decoration: line-through;
        }
    `);customElements.get("hyperion-swatches")||customElements.define("hyperion-swatches",h);export{h as HyperionSwatches};
//# sourceMappingURL=hyperion-swatches.CHlqrmwF.js.map
