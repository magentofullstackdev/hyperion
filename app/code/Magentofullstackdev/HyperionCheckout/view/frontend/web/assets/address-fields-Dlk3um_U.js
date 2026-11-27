import{A as d,b as c,f as q}from"./checkout-app-CCQ4A2FR.js";import{p as A,ak as C,R as b,g as F,t as u,q as v}from"./checkout-C9dXtvMq.js";const S=new Set(["text","tel","email","date","select","checkbox"]),O=/^[a-z][a-z0-9_]*$/;let m=null,p=[];function h(){const t=A()?.hyperion?.addressFields;return t===m||(m=t,p=(Array.isArray(t)?t:[]).filter(e=>e!==null&&typeof e=="object"&&typeof e.code=="string"&&O.test(e.code)&&S.has(e.type)&&(e.target==="custom_attributes"||e.target==="extension_attributes")&&Array.isArray(e.forms)).map((e,r)=>({field:{...e,label:typeof e.label=="string"&&e.label!==""?e.label:e.code,options:Array.isArray(e.options)?e.options:[],countries:Array.isArray(e.countries)?e.countries:[]},index:r})).sort((e,r)=>(Number(e.field.sortOrder)||0)-(Number(r.field.sortOrder)||0)||e.index-r.index).map(({field:e})=>e)),p}function $(t,e){const r=e??"";return h().filter(n=>n.forms.some(o=>t.includes(o))&&(n.countries.length===0||n.countries.includes(r)))}function y(){try{return F()}catch{return null}}function P(t){return t!==null&&!t.isVirtual.get()&&b(t)}function g(t){return t==="billing"?["billing"]:P(y())?["shipping","billing"]:["shipping"]}function w(t,e){if(e!==void 0)return g(e);const r=y();return r===null?["shipping","billing"]:t===r.billingAddress.get()&&(r.isVirtual.get()||!b(r))?["billing"]:g("shipping")}function l(t,e){return e.target==="extension_attributes"?t.extension_attributes?.[e.code]:t.custom_attributes?.find(r=>r?.attribute_code===e.code)?.value}function x(t,e,r){if(e.target==="extension_attributes")return{...t,extension_attributes:{...t.extension_attributes??{},[e.code]:r}};const n=typeof r=="boolean"?r?"1":"0":r,o=(t.custom_attributes??[]).filter(i=>i?.attribute_code!==e.code);return o.push({attribute_code:e.code,value:n}),{...t,custom_attributes:o}}function _(t){return t===!0||t===1||t==="1"||t==="true"}function f(t){return typeof t=="string"?t:typeof t=="number"?String(t):Array.isArray(t)?t.map(String).join(","):""}function k(t,e){if(t.type==="checkbox")return t.required&&!_(e)?"required":null;const r=f(e).trim();return r===""?t.required?"required":null:typeof t.maxLength=="number"&&t.maxLength>0&&r.length>t.maxLength?"length":typeof t.pattern=="string"&&t.pattern!==""&&!C(t.pattern,r)||t.type==="select"&&t.options.length>0&&!t.options.some(n=>n.value===r)?"format":null}function D(t,e){return h().length===0?[]:$(w(t,e),t.country_id).filter(r=>k(r,l(t,r))!==null).map(r=>r.code)}function H(t,e){return t==="required"?u("Hyperion_Checkout::validation_required"):t==="length"?u("Hyperion_Checkout::validation_field_length",{max:String(e.maxLength??"")}):t==="format"?u("Hyperion_Checkout::validation_field_format"):""}function L(t,e,r){const n=q(t.idPrefix,e.code),o=r||e.hint||"",i=`${n}-msg`;return c`
        <div class="hc-field" data-address-field=${e.code}>
            <label for=${n} class="inline-flex items-center gap-2 cursor-pointer select-none">
                <input id=${n}
                       type="checkbox"
                       name=${e.code}
                       class="h-4 w-4 rounded border-subtle text-accent focus:ring-2 focus:ring-accent"
                       .checked=${_(l(t.address,e))}
                       aria-required=${e.required?"true":"false"}
                       aria-invalid=${r?"true":"false"}
                       aria-describedby=${o?i:d}
                       @change=${s=>{t.touch(e.code),t.change(x(t.address,e,s.target.checked))}} />
                <span class="text-sm text-brand">
                    ${e.label}
                    ${e.required?c`<span aria-hidden="true" class="text-danger">*</span>`:d}
                </span>
            </label>
            <p id=${i} class="hc-field-message ${r?"text-danger":"text-muted"}">${o}</p>
        </div>
    `}function V(t,e){const r=t.isTouched(e.code)?k(e,l(t.address,e)):null,n=H(r,e);if(e.type==="checkbox")return L(t,e,n);const o=a=>{e.type==="select"&&t.touch(e.code),t.change(x(t.address,e,a.detail.value))},i=()=>t.touch(e.code),s=f(l(t.address,e));return e.type==="select"?c`
            <hc-select-input
                data-address-field=${e.code}
                label=${e.label}
                name=${e.code}
                id-prefix=${t.idPrefix}
                autocomplete=${e.autocomplete??""}
                placeholder=${u("Hyperion_Checkout::name_option_placeholder")}
                .options=${e.options.map(a=>({value:a.value,label:a.label}))}
                .value=${s}
                .required=${e.required}
                .error=${n}
                @value-change=${o}
                @value-blur=${i}
            ></hc-select-input>
        `:c`
        <hc-text-input
            data-address-field=${e.code}
            label=${e.label}
            name=${e.code}
            type=${e.type}
            id-prefix=${t.idPrefix}
            autocomplete=${e.autocomplete??""}
            inputmode=${e.type==="tel"?"tel":e.type==="email"?"email":""}
            .noSpellcheck=${!0}
            .value=${s}
            .required=${e.required}
            .error=${n}
            .hint=${e.hint??""}
            @value-change=${o}
            @value-blur=${i}
        ></hc-text-input>
    `}function I(t){const e=$(g(t.mode),t.address.country_id);return e.length===0?d:e.map(r=>V(t,r))}v.set({missing:D,render:I});export{h as declaredFields,l as declaredValue,k as fieldProblem,$ as fieldsFor,g as formsOfMode,D as missingDeclaredFields,I as renderDeclaredFields,x as withDeclaredValue};
//# sourceMappingURL=address-fields-Dlk3um_U.js.map
