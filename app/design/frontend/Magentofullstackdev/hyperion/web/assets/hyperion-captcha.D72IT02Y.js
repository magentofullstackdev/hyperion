var l=Object.defineProperty;var p=(a,e,t)=>e in a?l(a,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):a[e]=t;var h=(a,e,t)=>p(a,typeof e!="symbol"?e+"":e,t);import{A as s,b as o}from"./lit-element.CGWggwb8.js";import{H as f}from"./HyperionLightElement.CshfoQhS.js";const m="hyperion:captcha-change",b="hyperion:captcha-refresh-error",g={root:"",label:"",requiredMark:"",row:"",image:"",reload:"",input:"",caseNote:"",error:""},y="[data-hyperion-captcha-image]",_="[data-hyperion-captcha-input]",v="[data-hyperion-captcha-reload]",S="[data-hyperion-captcha-error]";let $=0;function E(a,e){return(a.getAttribute("aria-describedby")??"").split(/\s+/).filter(t=>t&&t!==e)}const n=class n extends f{constructor(){super(),this._adopted=null,this._generation=0,this._uid=`hyperion-captcha-${++$}`,this.formId="",this.refreshUrl="",this.imageSrc="",this.imageWidth=0,this.imageHeight=0,this.caseSensitive=!1,this.required=!1,this.name="",this.label="Please type the letters and numbers below",this.reloadLabel="Reload captcha",this.caseNote="The code is case sensitive.",this.error="",this._onInput=this._onInput.bind(this),this._onClick=this._onClick.bind(this)}get value(){var e;return((e=this._input())==null?void 0:e.value)??""}connectedCallback(){this._adopted===null&&(this._adopted=this._image()!==null&&this._input()!==null),super.connectedCallback(),this.addEventListener("input",this._onInput),this.addEventListener("click",this._onClick)}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("input",this._onInput),this.removeEventListener("click",this._onClick)}focus(e){const t=this._input();if(t){t.focus(e);return}super.focus(e)}clear(){const e=this._input();!e||e.value===""||(e.value="",this._emitChange())}async refresh(){if(!this.refreshUrl||!this.formId)return!1;const e=++this._generation;this._setBusy(!0);try{const t=await fetch(this.refreshUrl,{method:"POST",credentials:"same-origin",headers:{"X-Requested-With":"XMLHttpRequest",Accept:"application/json"},body:new URLSearchParams({formId:this.formId})});if(!t.ok)throw new Error(`CAPTCHA refresh answered ${t.status}`);const r=await t.json(),i=typeof(r==null?void 0:r.imgSrc)=="string"?r.imgSrc:"";if(e!==this._generation)return!1;if(!i)throw new Error("CAPTCHA refresh answered no image");return this._applyImage(i),this.clear(),!0}catch{return e!==this._generation||this.dispatchEvent(new CustomEvent(b,{detail:{formId:this.formId},bubbles:!0,composed:!0})),!1}finally{e===this._generation&&this._setBusy(!1)}}render(){if(this._adopted)return s;const e=this.constructor.classes,t=`${this._uid}-input`,r=`${this._uid}-note`,i=`${this._uid}-error`,u=[this.caseSensitive?r:"",this.error?i:""].filter(Boolean).join(" ");return o`
            <div class=${e.root}>
                <label for=${t} class=${e.label}>
                    ${this.label}
                    ${this.required?o`<span aria-hidden="true" class=${e.requiredMark}>*</span>`:s}
                </label>
                <div class=${e.row}>
                    <img
                        data-hyperion-captcha-image
                        class=${e.image}
                        src=${this.imageSrc||s}
                        width=${this.imageWidth||s}
                        height=${this.imageHeight||s}
                        alt=${this.label}
                    />
                    <button type="button" data-hyperion-captcha-reload class=${e.reload}>
                        ${this.reloadLabel}
                    </button>
                </div>
                <input
                    type="text"
                    id=${t}
                    data-hyperion-captcha-input
                    name=${this.name||`captcha[${this.formId}]`}
                    class=${e.input}
                    autocomplete="off"
                    autocapitalize="off"
                    spellcheck="false"
                    ?required=${this.required}
                    aria-invalid=${this.error?"true":s}
                    aria-describedby=${u||s}
                />
                ${this.caseSensitive?o`<p id=${r} class=${e.caseNote}>${this.caseNote}</p>`:s}
                ${this.error?o`<p id=${i} data-hyperion-captcha-error class=${e.error}>${this.error}</p>`:s}
            </div>
        `}firstUpdated(e){var t;(t=this._image())!=null&&t.getAttribute("src")||this.refresh()}updated(e){this._adopted&&(e.has("imageSrc")&&this.imageSrc&&this._applyImage(this.imageSrc),e.has("error")&&this._syncAdoptedError())}_image(){return this.querySelector(y)}_input(){return this.querySelector(_)??this.querySelector('input[type="text"]')}_reload(){return this.querySelector(v)}_applyImage(e){var t;if(this._adopted){(t=this._image())==null||t.setAttribute("src",e);return}this.imageSrc=e}_setBusy(e){const t=this._reload();t&&(e?t.setAttribute("aria-disabled","true"):t.removeAttribute("aria-disabled"))}_syncAdoptedError(){const e=this._input();if(!e)return;const t=`${this._uid}-error`;let r=this.querySelector(S);if(!r&&this.error&&(r=document.createElement("p"),r.id=t,r.setAttribute("data-hyperion-captcha-error",""),r.className=this.constructor.classes.error,e.insertAdjacentElement("afterend",r)),!r)return;r.id||(r.id=t),r.textContent=this.error,r.hidden=!this.error;const i=E(e,r.id);this.error?(i.push(r.id),e.setAttribute("aria-invalid","true")):e.removeAttribute("aria-invalid"),i.length?e.setAttribute("aria-describedby",i.join(" ")):e.removeAttribute("aria-describedby")}_emitChange(){this.dispatchEvent(new CustomEvent(m,{detail:{formId:this.formId,value:this.value},bubbles:!0,composed:!0}))}_onInput(e){e.target===this._input()&&this._emitChange()}_onClick(e){const t=this._reload();!t||!(e.target instanceof Node)||!t.contains(e.target)||(e.preventDefault(),t.getAttribute("aria-disabled")!=="true"&&this.refresh())}};n.properties={formId:{type:String,attribute:"form-id"},refreshUrl:{type:String,attribute:"refresh-url"},imageSrc:{type:String,attribute:"image-src"},imageWidth:{type:Number,attribute:"image-width"},imageHeight:{type:Number,attribute:"image-height"},caseSensitive:{type:Boolean,attribute:"case-sensitive"},required:{type:Boolean},name:{type:String},label:{type:String},reloadLabel:{type:String,attribute:"reload-label"},caseNote:{type:String,attribute:"case-note"},error:{type:String}},n.classes=g;let c=n;class d extends c{}h(d,"classes",{root:"space-y-2",label:"block text-sm font-medium text-secondary",requiredMark:"text-error",row:"flex flex-wrap items-center gap-3",image:"rounded border border-subtle bg-surface-raised",reload:"text-sm font-medium text-primary hover:text-primary-hover underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-primary rounded aria-disabled:opacity-60 aria-disabled:cursor-wait",input:"w-full px-4 py-2.5 border border-subtle rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none text-sm",caseNote:"text-xs text-muted",error:"text-sm text-error"});customElements.get("hyperion-captcha")||customElements.define("hyperion-captcha",d);export{d as HyperionCaptcha};
//# sourceMappingURL=hyperion-captcha.D72IT02Y.js.map
