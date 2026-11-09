import{b as d}from"./checkout-LkzN5NMc.js";const a="#1f2937",l="#6b7280",c="#dc2626",u="mt-1 block h-[42px] w-full rounded-md border bg-surface px-3";function i(){return d`
        <span class="hidden text-muted" data-probe="muted"></span>
        <span class="hidden text-danger" data-probe="danger"></span>
    `}function m(e){const o=getComputedStyle(e),t=(n,s)=>{const r=e.querySelector(`[data-probe="${n}"]`);return(r?getComputedStyle(r).color:"")||s};return{input:{"font-size":"16px","font-family":o.fontFamily||"system-ui, sans-serif",color:o.color||a},"::placeholder":{color:t("muted",l)},".invalid":{color:t("danger",c)}}}export{u as H,i as h,m as r};
//# sourceMappingURL=hosted-field-styles-DXtnWLJ_.js.map
