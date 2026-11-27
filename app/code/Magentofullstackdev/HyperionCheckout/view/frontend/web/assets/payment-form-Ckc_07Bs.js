import{i as c,A as p,b as i,r as l}from"./checkout-app-CCQ4A2FR.js";import{ak as m}from"./checkout-C9dXtvMq.js";var d=Object.defineProperty,h=(a,e,t,n)=>{for(var r=void 0,s=a.length-1,u;s>=0;s--)(u=a[s])&&(r=u(e,t,r)||r);return r&&d(e,t,r),r};function _(a){const e=a.fields;return Array.isArray(e)?e.filter(t=>!!t&&typeof t.name=="string"&&t.name!==""):[]}class o extends c{constructor(){super(...arguments),this.options={},this.config={},this.token=null,this._values={},this._touched=new Set}static{this.hyperionApi="1"}createRenderRoot(){return this}connectedCallback(){super.connectedCallback(),this.dispatchEvent(new CustomEvent("hyperion-payment:ready",{bubbles:!0,composed:!0,detail:{}})),this._reported=void 0,this._report()}_fields(){return _(this.options)}_errorOf(e){const t=(this._values[e.name]??"").trim();return t===""?e.required?e.target==="po_number"?this.context.t("Enter the purchase order number."):this.context.t("This is a required field."):"":e.pattern&&!m(e.pattern,t)?this.context.t("Enter a valid {label}.",{label:e.label}):""}_firstError(){for(const e of this._fields()){const t=this._errorOf(e);if(t!=="")return t}return null}_report(){const e=this._firstError();e!==this._reported&&(this._reported=e,this.dispatchEvent(e===null?new CustomEvent("hyperion-payment:valid",{bubbles:!0,composed:!0,detail:{}}):new CustomEvent("hyperion-payment:invalid",{bubbles:!0,composed:!0,detail:{message:e}})))}render(){const e=this._fields();return e.length===0?p:i`
            <div class="space-y-3" data-payment-form>
                ${e.map(t=>this._renderField(t))}
            </div>
        `}_renderField(e){const t=this._values[e.name]??"",n=this._touched.has(e.name)?this._errorOf(e):"";return e.type==="select"?i`<hc-select-input
                label=${e.label}
                name=${e.name}
                .value=${t}
                .options=${e.options.map(r=>({value:r.value,label:r.label}))}
                .required=${e.required}
                .error=${n}
                @value-change=${this._onChange}
                @value-blur=${this._onBlur}
            ></hc-select-input>`:i`<hc-text-input
            label=${e.label}
            name=${e.name}
            type=${e.type==="tel"||e.type==="date"?e.type:"text"}
            .value=${t}
            .required=${e.required}
            .error=${n}
            @value-change=${this._onChange}
            @value-blur=${this._onBlur}
        ></hc-text-input>`}_onChange(e){e.stopPropagation(),this._values={...this._values,[e.detail.name]:String(e.detail.value??"")},this._report()}_onBlur(e){const t=e.detail?.name??e.target?.name??"";t!==""&&(this._touched=new Set([...this._touched,t]))}async validate(){return this._touched=new Set(this._fields().map(t=>t.name)),this._report(),await this.updateComplete,this.querySelector('[aria-invalid="true"]')?.focus(),this._firstError()===null}getPaymentData(){const e=this._firstError();if(e!==null)throw new Error(e);let t;const n={};for(const r of this._fields()){const s=(this._values[r.name]??"").trim();r.target==="po_number"?t=s:s!==""&&(n[r.name]=s)}return{...t!==void 0?{po_number:t}:{},...Object.keys(n).length>0?{additional_data:n}:{}}}}h([l()],o.prototype,"_values");h([l()],o.prototype,"_touched");customElements.get("hc-payment-form")||customElements.define("hc-payment-form",o);export{o as PaymentForm};
//# sourceMappingURL=payment-form-Ckc_07Bs.js.map
