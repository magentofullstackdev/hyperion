import{i as c,A as s,c as n}from"./checkout-bfdIjziR.js";class h extends c{createRenderRoot(){return this}}const d="hyperion:captcha-change",l="hyperion:captcha-refresh-error",u={root:"",label:"",requiredMark:"",row:"",image:"",reload:"",input:"",caseNote:"",error:""},p="[data-hyperion-captcha-image]",m="[data-hyperion-captcha-input]",f="[data-hyperion-captcha-reload]",b="[data-hyperion-captcha-error]";let g=0;function _(a,e){return(a.getAttribute("aria-describedby")??"").split(/\s+/).filter(t=>t&&t!==e)}class y extends h{constructor(){super(),this._adopted=null,this._generation=0,this._uid=`hyperion-captcha-${++g}`,this.formId="",this.refreshUrl="",this.imageSrc="",this.imageWidth=0,this.imageHeight=0,this.caseSensitive=!1,this.required=!1,this.name="",this.label="Please type the letters and numbers below",this.reloadLabel="Reload captcha",this.caseNote="The code is case sensitive.",this.error="",this._onInput=this._onInput.bind(this),this._onClick=this._onClick.bind(this)}static{this.properties={formId:{type:String,attribute:"form-id"},refreshUrl:{type:String,attribute:"refresh-url"},imageSrc:{type:String,attribute:"image-src"},imageWidth:{type:Number,attribute:"image-width"},imageHeight:{type:Number,attribute:"image-height"},caseSensitive:{type:Boolean,attribute:"case-sensitive"},required:{type:Boolean},name:{type:String},label:{type:String},reloadLabel:{type:String,attribute:"reload-label"},caseNote:{type:String,attribute:"case-note"},error:{type:String}}}static{this.classes=u}get value(){return this._input()?.value??""}connectedCallback(){this._adopted===null&&(this._adopted=this._image()!==null&&this._input()!==null),super.connectedCallback(),this.addEventListener("input",this._onInput),this.addEventListener("click",this._onClick)}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("input",this._onInput),this.removeEventListener("click",this._onClick)}focus(e){const t=this._input();if(t){t.focus(e);return}super.focus(e)}clear(){const e=this._input();!e||e.value===""||(e.value="",this._emitChange())}async refresh(){if(!this.refreshUrl||!this.formId)return!1;const e=++this._generation;this._setBusy(!0);try{const t=await fetch(this.refreshUrl,{method:"POST",credentials:"same-origin",headers:{"X-Requested-With":"XMLHttpRequest",Accept:"application/json"},body:new URLSearchParams({formId:this.formId})});if(!t.ok)throw new Error(`CAPTCHA refresh answered ${t.status}`);const r=await t.json(),i=typeof r?.imgSrc=="string"?r.imgSrc:"";if(e!==this._generation)return!1;if(!i)throw new Error("CAPTCHA refresh answered no image");return this._applyImage(i),this.clear(),!0}catch{return e!==this._generation||this.dispatchEvent(new CustomEvent(l,{detail:{formId:this.formId},bubbles:!0,composed:!0})),!1}finally{e===this._generation&&this._setBusy(!1)}}render(){if(this._adopted)return s;const e=this.constructor.classes,t=`${this._uid}-input`,r=`${this._uid}-note`,i=`${this._uid}-error`,o=[this.caseSensitive?r:"",this.error?i:""].filter(Boolean).join(" ");return n`
            <div class=${e.root}>
                <label for=${t} class=${e.label}>
                    ${this.label}
                    ${this.required?n`<span aria-hidden="true" class=${e.requiredMark}>*</span>`:s}
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
                    aria-describedby=${o||s}
                />
                ${this.caseSensitive?n`<p id=${r} class=${e.caseNote}>${this.caseNote}</p>`:s}
                ${this.error?n`<p id=${i} data-hyperion-captcha-error class=${e.error}>${this.error}</p>`:s}
            </div>
        `}firstUpdated(e){this._image()?.getAttribute("src")||this.refresh()}updated(e){this._adopted&&(e.has("imageSrc")&&this.imageSrc&&this._applyImage(this.imageSrc),e.has("error")&&this._syncAdoptedError())}_image(){return this.querySelector(p)}_input(){return this.querySelector(m)??this.querySelector('input[type="text"]')}_reload(){return this.querySelector(f)}_applyImage(e){if(this._adopted){this._image()?.setAttribute("src",e);return}this.imageSrc=e}_setBusy(e){const t=this._reload();t&&(e?t.setAttribute("aria-disabled","true"):t.removeAttribute("aria-disabled"))}_syncAdoptedError(){const e=this._input();if(!e)return;const t=`${this._uid}-error`;let r=this.querySelector(b);if(!r&&this.error&&(r=document.createElement("p"),r.id=t,r.setAttribute("data-hyperion-captcha-error",""),r.className=this.constructor.classes.error,e.insertAdjacentElement("afterend",r)),!r)return;r.id||(r.id=t),r.textContent=this.error,r.hidden=!this.error;const i=_(e,r.id);this.error?(i.push(r.id),e.setAttribute("aria-invalid","true")):e.removeAttribute("aria-invalid"),i.length?e.setAttribute("aria-describedby",i.join(" ")):e.removeAttribute("aria-describedby")}_emitChange(){this.dispatchEvent(new CustomEvent(d,{detail:{formId:this.formId,value:this.value},bubbles:!0,composed:!0}))}_onInput(e){e.target===this._input()&&this._emitChange()}_onClick(e){const t=this._reload();!t||!(e.target instanceof Node)||!t.contains(e.target)||(e.preventDefault(),t.getAttribute("aria-disabled")!=="true"&&this.refresh())}}class E extends y{static{this.classes={root:"block",label:"block text-sm font-medium text-brand",requiredMark:"text-danger",row:"mt-1 flex flex-wrap items-center gap-3",image:"block rounded border border-subtle bg-surface",reload:"rounded text-sm font-medium text-accent underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-accent aria-disabled:cursor-wait aria-disabled:opacity-60",input:"mt-2 block w-full rounded-md border border-subtle bg-surface px-3 py-2 text-brand placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent",caseNote:"mt-1 text-xs text-muted",error:"mt-1 text-sm text-danger"}}}customElements.get("hc-captcha")||customElements.define("hc-captcha",E);export{d as CAPTCHA_CHANGE_EVENT,l as CAPTCHA_REFRESH_ERROR_EVENT,E as CaptchaField};
//# sourceMappingURL=captcha-field-BXlyYVKs.js.map
